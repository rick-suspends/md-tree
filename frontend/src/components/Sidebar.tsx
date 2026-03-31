import { useState, useEffect, CSSProperties, useRef, useCallback, KeyboardEvent } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragMoveEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileNode, CollectionStructure, FileInfo } from "../types";
import {
  flatIds,
  removeNode,
  insertAfter,
  insertAsChild,
  reorder,
  findSiblingList,
  findParent,
  swapSiblings,
} from "../treeHelpers";

// ── Icons ─────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

// ── Inline rename ─────────────────────────────────────────────────────────────

function RenameInput({ currentPath, onCommit, onCancel }: {
  currentPath: string;
  onCommit: (newName: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(currentPath);
  const ref = useRef<HTMLInputElement>(null);
  useState(() => { setTimeout(() => { ref.current?.select(); }, 30); });
  return (
    <input
      ref={ref}
      value={value}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.stopPropagation(); onCommit(value.trim()); }
        if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
      }}
      onBlur={() => onCommit(value.trim())}
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "#fff", border: "1px solid #ff8c00",
        borderRadius: "3px", color: "#1a1a1a", fontSize: "14px",
        padding: "1px 4px", outline: "none", minWidth: 0, width: "160px",
      }}
    />
  );
}

// ── ConnectorLines ────────────────────────────────────────────────────────────
// ancestors[i] = true means that ancestor level still has siblings below,
// so the vertical line should continue through this item.

const LINE = "#b3d9f7";
const COL_W = 30;    // px per depth level
const GAP   = 15;    // px — matches wrapper margin, used to bridge gaps between items

function ConnectorLines({ depth, ancestors, isLast }: { depth: number; ancestors: boolean[]; isLast: boolean }) {
  if (depth === 0) return null;
  return (
    <div style={{ display: "flex", flexShrink: 0, alignSelf: "stretch" }}>
      {/* One column per ancestor depth level */}
      {ancestors.map((hasMore, i) => (
        <div key={i} style={{ width: `${COL_W}px`, flexShrink: 0, position: "relative" }}>
          {hasMore && (
            <div style={{
              position: "absolute",
              left: `${COL_W / 2 - 1}px`,
              top: `-${GAP}px`,
              bottom: `-${GAP}px`,
              width: "1.5px",
              background: LINE,
            }} />
          )}
        </div>
      ))}
      {/* Connector column: elbow or T-junction */}
      <div style={{ width: `${COL_W}px`, flexShrink: 0, position: "relative" }}>
        {/* Vertical line — top half always drawn */}
        <div style={{
          position: "absolute", left: `${COL_W / 2 - 1}px`,
          top: `-${GAP}px`, bottom: "50%",
          width: "1.5px", background: LINE,
        }} />
        {/* Vertical line — bottom half only if not last sibling */}
        {!isLast && (
          <div style={{
            position: "absolute", left: `${COL_W / 2 - 1}px`,
            top: "50%", bottom: `-${GAP}px`,
            width: "1.5px", background: LINE,
          }} />
        )}
        {/* Horizontal arm */}
        <div style={{
          position: "absolute",
          left: `${COL_W / 2 - 1}px`,
          top: "calc(50% - 0.75px)",
          width: `${COL_W / 2 + 1}px`,
          height: "1.5px",
          background: LINE,
        }} />
      </div>
    </div>
  );
}

// ── Chip action icons (pencil + trash) ────────────────────────────────────────

function ChipActions({ path, isSelected, onOpen, onDelete }: {
  path: string;
  isSelected: boolean;
  onOpen: (p: string) => void;
  onDelete: (p: string) => void;
}) {
  const base: CSSProperties = {
    flexShrink: 0, display: "flex", alignItems: "center",
    borderRadius: "3px", cursor: "pointer",
    color: isSelected ? "rgba(255,255,255,0.7)" : "#aaa",
  };
  return (
    <>
      <span
        onClick={(e) => { e.stopPropagation(); onOpen(path); }}
        title="Edit file"
        style={base}
        onMouseEnter={(e) => (e.currentTarget.style.color = isSelected ? "#fff" : "#1a6fa8")}
        onMouseLeave={(e) => (e.currentTarget.style.color = isSelected ? "rgba(255,255,255,0.7)" : "#aaa")}
      >
        <PencilIcon />
      </span>
      <span
        onClick={(e) => { e.stopPropagation(); onDelete(path); }}
        title="Delete file"
        style={{ ...base, marginLeft: "5px" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = isSelected ? "#fff" : "#f66")}
        onMouseLeave={(e) => (e.currentTarget.style.color = isSelected ? "rgba(255,255,255,0.7)" : "#aaa")}
      >
        <TrashIcon />
      </span>
    </>
  );
}

// ── OrphanItem ────────────────────────────────────────────────────────────────

interface OrphanItemProps {
  path: string;
  title: string;
  titleMode: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
}

function OrphanItem({ path, title, titleMode, selectedPath, onSelect, onOpen, onDelete }: OrphanItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: path });
  const [hovered, setHovered] = useState(false);
  const isSelected = selectedPath === path;
  const label = titleMode ? title : path;

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1, margin: `${GAP}px 0` }}>
      <div
        style={{
          display: "inline-flex", alignItems: "stretch",
          width: "2.5in", overflow: "hidden",
          background: isSelected ? "#ff8c00" : hovered ? "#fff5eb" : "#fff",
          border: "1.5px solid #ff8c00", borderRadius: "6px",
          cursor: "pointer", userSelect: "none",
        }}
        onClick={() => onSelect(path)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Full-height grab zone */}
        <div
          {...attributes} {...listeners}
          onClick={(e) => { e.stopPropagation(); onSelect(path); }}
          style={{ cursor: "grab", display: "flex", alignItems: "center", padding: "10px 6px 10px 8px", flexShrink: 0, background: "#ff8c00", color: "#fff", fontSize: "11px", fontWeight: "bold", borderRadius: "4px 0 0 4px" }}
          title="Drag into hierarchy"
        >⠿</div>
        <div style={{ width: "1px", background: isSelected ? "rgba(255,255,255,0.3)" : "#e0e0e0", flexShrink: 0, margin: "10px 2px" }} />
        {/* Content */}
        <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, gap: "4px", padding: "10px 10px 10px 6px" }}>
          <span style={{ fontSize: "15px", fontWeight: 500, fontStyle: "italic", color: isSelected ? "#fff" : "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={label}>
            {label}
          </span>
          <ChipActions path={path} isSelected={isSelected} onOpen={onOpen} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}

// ── SortableItem ──────────────────────────────────────────────────────────────

interface ItemProps {
  node: FileNode;
  depth: number;
  isLast: boolean;
  ancestors: boolean[];
  selectedPath: string | null;
  titleMode: boolean;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
  overId: string | null;
  activeId: string | null;
  dragDeltaX: number;
}

function SortableItem({ node, depth, isLast, ancestors, selectedPath, titleMode, onSelect, onOpen, onDelete, onRename, expanded, toggleExpand, overId, activeId, dragDeltaX }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.path });
  const [renaming, setRenaming] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isExpanded = expanded.has(node.path);
  const hasChildren = (node.children ?? []).length > 0;
  const isSelected = selectedPath === node.path;
  const isOver = activeId !== null && overId === node.path && activeId !== node.path;
  const label = titleMode ? node.title : node.path;

  const dropAction = isOver
    ? dragDeltaX > 30 ? "nest" : dragDeltaX < -30 ? "unnest" : "sibling"
    : null;

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1, margin: `${GAP}px 0` }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {/* Tree connector lines */}
        <ConnectorLines depth={depth} ancestors={ancestors} isLast={isLast} />
        {/* Chip + drop indicators */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "inline-flex", alignItems: "stretch",
              width: "2.5in", overflow: "hidden",
              background: isSelected ? "#ff8c00" : hovered ? "#fff5eb" : "#fff",
              border: `1.5px solid ${dropAction === "nest" ? "#4caf50" : "#ff8c00"}`,
              borderRadius: "6px", cursor: "pointer", userSelect: "none",
              outline: dropAction === "nest" ? "2px solid #4caf5066" : "none",
              outlineOffset: "1px",
            }}
            onClick={() => onSelect(node.path)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {/* Full-height grab zone */}
            <div
              {...attributes} {...listeners}
              onClick={(e) => { e.stopPropagation(); onSelect(node.path); }}
              style={{ cursor: "grab", display: "flex", alignItems: "center", padding: "10px 6px 10px 8px", flexShrink: 0, background: "#ff8c00", color: "#fff", fontSize: "11px", fontWeight: "bold", borderRadius: "4px 0 0 4px" }}
              title="Drag to reorder"
            >⠿</div>
            {/* Separator */}
            <div style={{ width: "1px", background: isSelected ? "rgba(255,255,255,0.3)" : "#e0e0e0", flexShrink: 0, margin: "10px 2px" }} />
            {/* Content */}
            <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, gap: "4px", padding: "10px 10px 10px 6px" }}>
              {/* Expand toggle */}
              {hasChildren ? (
                <span
                  onClick={(e) => { e.stopPropagation(); toggleExpand(node.path); }}
                  style={{ color: isSelected ? "#fff" : "#aaa", fontSize: "11px", width: "12px", flexShrink: 0 }}
                >
                  {isExpanded ? "▾" : "▸"}
                </span>
              ) : (
                <span style={{ width: "12px", flexShrink: 0 }} />
              )}
              {/* Label or rename input */}
              {renaming ? (
                <RenameInput
                  currentPath={node.path}
                  onCommit={(newName) => { setRenaming(false); if (newName && newName !== node.path) onRename(node.path, newName); }}
                  onCancel={() => setRenaming(false)}
                />
              ) : (
                <span
                  style={{ fontSize: "15px", fontWeight: 500, color: isSelected ? "#fff" : "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
                  onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); }}
                  title={label}
                >
                  {label}
                </span>
              )}
              {dropAction === "nest" && (
                <span style={{ fontSize: "10px", color: "#4caf50", flexShrink: 0 }}>nest ▸</span>
              )}
              <ChipActions path={node.path} isSelected={isSelected} onOpen={onOpen} onDelete={onDelete} />
            </div>
          </div>
          {dropAction === "sibling" && <div style={{ height: "2px", background: "#6b8cff", borderRadius: "1px", margin: "0 4px" }} />}
          {dropAction === "unnest" && <div style={{ height: "2px", background: "#ff9800", borderRadius: "1px", margin: "0 4px" }} />}
        </div>
      </div>
      {/* Children */}
      {hasChildren && isExpanded && (
        <SortableContext items={flatIds(node.children ?? [])} strategy={verticalListSortingStrategy}>
          {(node.children ?? []).map((child, cidx) => (
            <SortableItem
              key={child.path}
              node={child}
              depth={depth + 1}
              isLast={cidx === (node.children ?? []).length - 1}
              ancestors={[...ancestors, !isLast]}
              selectedPath={selectedPath}
              titleMode={titleMode}
              onSelect={onSelect}
              onOpen={onOpen}
              onDelete={onDelete}
              onRename={onRename}
              expanded={expanded}
              toggleExpand={toggleExpand}
              overId={overId}
              activeId={activeId}
              dragDeltaX={dragDeltaX}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  collection: CollectionStructure;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
  onCollectionChange: (c: CollectionStructure) => void;
  onCreateFile: (filename: string) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onRenameFile: (oldPath: string, newName: string) => Promise<void>;
  onOpenYaml: () => void;
  yamlOpen: boolean;
  orphans: FileInfo[];
}

export default function Sidebar({ collection, selectedPath, onSelect, onOpen, onCollectionChange, onCreateFile, onDeleteFile, onRenameFile, onOpenYaml, yamlOpen, orphans }: SidebarProps) {
  const [titleMode, setTitleMode] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(flatIds(collection.root)));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [createError, setCreateError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setExpanded(prev => {
      const currentPaths = new Set(flatIds(collection.root));
      const next = new Set(prev);
      currentPaths.forEach(p => { if (!next.has(p)) next.add(p); });
      next.forEach(p => { if (!currentPaths.has(p)) next.delete(p); });
      return next;
    });
  }, [collection]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const toggleExpand = (path: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });

  const startCreating = () => { setCreatingFile(true); setNewFileName(""); setCreateError(""); setTimeout(() => inputRef.current?.focus(), 50); };
  const cancelCreating = () => { setCreatingFile(false); setNewFileName(""); setCreateError(""); };

  const submitNewFile = async () => {
    let name = newFileName.trim();
    if (!name) return;
    if (!name.endsWith(".md")) name += ".md";
    if (/[/\\<>:"|?*]/.test(name.replace(/\.md$/, ""))) { setCreateError("Invalid filename characters"); return; }
    try { await onCreateFile(name); cancelCreating(); }
    catch (e: any) { setCreateError(e.message ?? "Error creating file"); }
  };

  const handleInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submitNewFile();
    if (e.key === "Escape") cancelCreating();
  };

  const handleDelete = async (path: string) => {
    if (!confirm(`Delete "${path}"? This cannot be undone.`)) return;
    await onDeleteFile(path);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!selectedPath) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.preventDefault();
    const root = collection.root;
    if (e.key === "ArrowRight") {
      const found = findSiblingList(root, selectedPath);
      if (!found || found.idx === 0) return;
      const [withoutNode, node] = removeNode(root, selectedPath);
      if (!node) return;
      const prevSibling = found.list[found.idx - 1];
      onCollectionChange({ root: reorder(insertAsChild(withoutNode, prevSibling.path, node)) });
      setExpanded(prev => { const s = new Set(prev); s.add(prevSibling.path); return s; });
      return;
    }
    if (e.key === "ArrowLeft") {
      const parent = findParent(root, selectedPath);
      if (!parent) return;
      const [withoutNode, node] = removeNode(root, selectedPath);
      if (!node) return;
      onCollectionChange({ root: reorder(insertAfter(withoutNode, parent.path, node)) });
      return;
    }
    if (e.key === "ArrowUp") { const nr = swapSiblings(root, selectedPath, "up"); if (nr !== root) onCollectionChange({ root: reorder(nr) }); return; }
    if (e.key === "ArrowDown") { const nr = swapSiblings(root, selectedPath, "down"); if (nr !== root) onCollectionChange({ root: reorder(nr) }); }
  }, [selectedPath, collection, expanded, onCollectionChange, setExpanded]);

  function handleDragStart(event: DragStartEvent) { setActiveId(event.active.id as string); setDragDeltaX(0); }
  function handleDragMove(event: DragMoveEvent) { setOverId(event.over?.id as string ?? null); setDragDeltaX(event.delta.x); }
  function handleDragOver(event: DragOverEvent) { setOverId(event.over?.id as string ?? null); }
  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null); setOverId(null); setDragDeltaX(0);
    const { active, over, delta } = event;
    if (!over || active.id === over.id) return;
    const dragged = active.id as string;
    const target = over.id as string;
    const isOrphan = orphans.some(o => o.path === dragged);
    const orphanInfo = isOrphan ? orphans.find(o => o.path === dragged) : null;
    const getOrBuildNode = (): FileNode | null => {
      if (isOrphan && orphanInfo) return { path: orphanInfo.path, title: orphanInfo.title, order: 0, children: [] };
      const [, node] = removeNode(collection.root, dragged);
      return node;
    };
    const withoutDragged = isOrphan ? collection.root : removeNode(collection.root, dragged)[0];
    const draggedNode = getOrBuildNode();
    if (!draggedNode) return;
    if (orphans.some(o => o.path === target)) return;
    let newNodes: FileNode[];
    if (delta.x > 30) { newNodes = insertAsChild(withoutDragged, target, draggedNode); setExpanded(prev => { const s = new Set(prev); s.add(target); return s; }); }
    else if (delta.x < -30) { newNodes = [...withoutDragged, draggedNode]; }
    else { newNodes = insertAfter(withoutDragged, target, draggedNode); }
    onCollectionChange({ root: reorder(newNodes) });
  }

  const allIds = [...flatIds(collection.root), ...orphans.map(o => o.path)];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#ffffff", marginLeft: "1in", marginRight: "1in" }}>
      {/* Toolbar */}
      <div style={{ padding: "8px 0", borderBottom: "1px solid #d0e8f7", display: "flex", alignItems: "center", gap: "8px" }}>
        <button onClick={onOpenYaml} style={{ padding: "5px 10px", background: yamlOpen ? "#b3d9f7" : "#e8f4fd", border: `1px solid ${yamlOpen ? "#1a6fa8" : "#b3d9f7"}`, borderRadius: "4px", color: "#1a6fa8", fontSize: "12px", cursor: "pointer", flexShrink: 0 }}>
          {"{ }"} YAML
        </button>
        <div style={{ display: "flex", border: "1px solid #b3d9f7", borderRadius: "4px", overflow: "hidden", flexShrink: 0 }}>
          {([["Filename", false], ["Title", true]] as const).map(([label, mode]) => (
            <button key={label} onClick={() => setTitleMode(mode)} style={{ padding: "4px 9px", border: "none", cursor: "pointer", fontSize: "12px", background: titleMode === mode ? "#1a6fa8" : "#e8f4fd", color: titleMode === mode ? "#fff" : "#1a6fa8" }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {!creatingFile ? (
          <button onClick={startCreating} style={{ padding: "5px 13px", background: "#e8f4fd", border: "1px solid #b3d9f7", borderRadius: "4px", color: "#1a6fa8", fontSize: "12px", cursor: "pointer", flexShrink: 0 }}>
            + New file
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", gap: "4px" }}>
              <input ref={inputRef} value={newFileName} onChange={(e) => { setNewFileName(e.target.value); setCreateError(""); }} onKeyDown={handleInputKey} placeholder="filename.md"
                style={{ flex: 1, padding: "4px 6px", background: "#fff", border: "1px solid #b3d9f7", borderRadius: "3px", color: "#1a1a1a", fontSize: "12px", outline: "none" }} />
              <button onClick={submitNewFile} style={{ padding: "4px 8px", background: "#3a7d44", border: "none", borderRadius: "3px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✓</button>
              <button onClick={cancelCreating} style={{ padding: "4px 8px", background: "#aaa", border: "none", borderRadius: "3px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✕</button>
            </div>
            {createError && <div style={{ color: "#f66", fontSize: "11px", marginTop: "3px" }}>{createError}</div>}
          </div>
        )}
      </div>

      {/* File tree */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: "8px", paddingBottom: "8px", outline: "none" }} tabIndex={0} onKeyDown={handleKeyDown}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
            {collection.root.map((node, idx) => (
              <SortableItem
                key={node.path}
                node={node}
                depth={0}
                isLast={idx === collection.root.length - 1}
                ancestors={[]}
                selectedPath={selectedPath}
                titleMode={titleMode}
                onSelect={onSelect}
                onOpen={onOpen}
                onDelete={handleDelete}
                onRename={onRenameFile}
                expanded={expanded}
                toggleExpand={toggleExpand}
                overId={overId}
                activeId={activeId}
                dragDeltaX={dragDeltaX}
              />
            ))}

            {collection.root.length === 0 && orphans.length === 0 && (
              <div style={{ color: "#aaa", padding: "16px", fontSize: "13px", textAlign: "center" }}>
                No markdown files found in ./markdowns
              </div>
            )}

            {orphans.length > 0 && (
              <div style={{ marginTop: "12px" }}>
                <div style={{ padding: "8px 0 6px", fontSize: "11px", color: "#777", letterSpacing: "0.07em", textTransform: "uppercase", borderTop: "1px solid #d0e8f7", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "#f90", fontSize: "13px" }}>⚠</span> Orphans
                  <span style={{ color: "#aaa", fontSize: "10px", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>drag into hierarchy</span>
                </div>
                {orphans.map((o) => (
                  <OrphanItem key={o.path} path={o.path} title={o.title} titleMode={titleMode} selectedPath={selectedPath} onSelect={onSelect} onOpen={onOpen} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </SortableContext>
          <DragOverlay>
            {activeId ? (
              <div style={{ background: "#ff8c00", padding: "5px 12px", borderRadius: "6px", border: "1.5px solid #ff8c00", color: "#fff", fontSize: "15px", fontWeight: 500, opacity: 0.9 }}>
                {activeId}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Hint */}
      <div style={{ padding: "6px 0", borderTop: "1px solid #d0e8f7", fontSize: "11px", color: "#bbb", lineHeight: 1.7 }}>
        ⠿ drag to reorder · drag <b style={{ color: "#aaa" }}>right</b> to nest · <b style={{ color: "#aaa" }}>left</b> to un-nest
      </div>
    </div>
  );
}
