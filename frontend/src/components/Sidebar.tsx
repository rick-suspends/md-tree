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
import { FileNode, CollectionStructure, FileInfo, ProjectInfo } from "../types";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const isSelected = selectedPath === path;
  const label = titleMode ? title : path;

  const mi: CSSProperties = { padding: "7px 14px", fontSize: "13px", cursor: "pointer", color: "#1a1a1a", whiteSpace: "nowrap" };

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1, margin: `${GAP}px 0` }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <div
          style={{
            display: "inline-flex", alignItems: "stretch",
            width: "2.5in", overflow: "visible",
            background: isSelected ? "#ff8c00" : hovered ? "#fff5eb" : "#fff",
            border: "1.5px solid #ff8c00", borderRadius: "6px",
            cursor: "pointer", userSelect: "none",
          }}
          onClick={() => onSelect(path)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div
            {...attributes} {...listeners}
            onClick={(e) => { e.stopPropagation(); onSelect(path); }}
            style={{ cursor: "grab", display: "flex", alignItems: "center", padding: "10px 6px 10px 8px", flexShrink: 0, background: "#ff8c00", color: "#fff", fontSize: "16px", fontWeight: "bold", borderRadius: "4px 0 0 4px" }}
          >⠿</div>
          <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, gap: "2px", padding: "10px 6px 10px 3px" }}>
            <span style={{ fontSize: "15px", fontWeight: 500, fontStyle: "italic", color: isSelected ? "#fff" : "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={label}>
              {label}
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
              style={{ flexShrink: 0, cursor: "pointer", fontSize: "16px", fontWeight: "bold", color: isSelected ? "rgba(255,255,255,0.7)" : "#bbb", padding: "0 2px", lineHeight: 1 }}
            >⋮</span>
          </div>
        </div>
        {menuOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setMenuOpen(false)} />
            <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 100, background: "#fff", border: "1px solid #d0e8f7", borderRadius: "6px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "140px", overflow: "hidden" }}>
              <div style={mi} onClick={() => { onOpen(path); setMenuOpen(false); }} onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}>Edit</div>
              <div style={{ ...mi, color: "#c00" }} onClick={() => { onDelete(path); setMenuOpen(false); }} onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#fff5f5"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}>Delete</div>
            </div>
          </>
        )}
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
  onCreateChild: (parentPath: string, filename: string) => Promise<void>;
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
  overId: string | null;
  activeId: string | null;
  dragDeltaX: number;
  undoPath: string | null;
  onUndo: () => void;
  canUndo: boolean;
}

function SortableItem({ node, depth, isLast, ancestors, selectedPath, titleMode, onSelect, onOpen, onDelete, onRename, onCreateChild, expanded, toggleExpand, overId, activeId, dragDeltaX, undoPath, onUndo, canUndo }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.path });
  const [renaming, setRenaming] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [childError, setChildError] = useState("");
  const childInputRef = useRef<HTMLInputElement>(null);

  const isExpanded = expanded.has(node.path);
  const hasChildren = (node.children ?? []).length > 0;
  const isSelected = selectedPath === node.path;
  const isOver = activeId !== null && overId === node.path && activeId !== node.path;
  const label = titleMode ? node.title : node.path;

  const dropAction = isOver
    ? dragDeltaX > 30 ? "nest" : dragDeltaX < -30 ? "unnest" : "sibling"
    : null;

  const submitChild = async () => {
    let name = childName.trim();
    if (!name) return;
    if (!name.endsWith(".md")) name += ".md";
    if (/[/\\<>:"|?*]/.test(name.replace(/\.md$/, ""))) { setChildError("Invalid filename"); return; }
    try {
      await onCreateChild(node.path, name);
      setAddingChild(false);
      setChildName("");
      setChildError("");
    } catch (e: any) { setChildError(e.message ?? "Error"); }
  };

  const mi: CSSProperties = { padding: "7px 14px", fontSize: "13px", cursor: "pointer", color: "#1a1a1a", whiteSpace: "nowrap" };

  return (
    <div ref={setNodeRef} style={{ transform: (isDragging || depth > 1) ? undefined : CSS.Transform.toString(transform), transition: (isDragging || depth > 1) ? undefined : transition, opacity: isDragging ? 0 : 1, margin: `${GAP}px 0` }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <ConnectorLines depth={depth} ancestors={ancestors} isLast={isLast} />
        <div style={{ minWidth: 0, position: "relative" }}>
          <div
            style={{
              display: "inline-flex", alignItems: "stretch",
              width: "2.5in", overflow: "visible",
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
            {/* Grab zone */}
            <div
              {...attributes} {...listeners}
              onClick={(e) => { e.stopPropagation(); onSelect(node.path); }}
              style={{ cursor: "grab", display: "flex", alignItems: "center", padding: "10px 6px 10px 8px", flexShrink: 0, background: "#ff8c00", color: "#fff", fontSize: "16px", fontWeight: "bold", borderRadius: "4px 0 0 4px" }}
            >⠿</div>
            {/* Content */}
            <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, gap: "2px", padding: "10px 6px 10px 3px" }}>
              {hasChildren ? (
                <span onClick={(e) => { e.stopPropagation(); toggleExpand(node.path); }} style={{ color: isSelected ? "#fff" : "#aaa", fontSize: "11px", width: "6px", flexShrink: 0 }}>
                  {isExpanded ? "▾" : "▸"}
                </span>
              ) : (
                <span style={{ width: "6px", flexShrink: 0 }} />
              )}
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
              {dropAction === "nest" && <span style={{ fontSize: "10px", color: "#4caf50", flexShrink: 0 }}>nest ▸</span>}
              {canUndo && undoPath === node.path && (
                <span
                  onClick={(e) => { e.stopPropagation(); onUndo(); }}
                  title="Undo (Ctrl+Z)"
                  style={{ flexShrink: 0, cursor: "pointer", fontSize: "14px", color: isSelected ? "rgba(255,255,255,0.85)" : "#888", padding: "0 2px", lineHeight: 1 }}
                >↩</span>
              )}
              {/* ⋮ menu button */}
              <span
                onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
                style={{ flexShrink: 0, cursor: "pointer", fontSize: "16px", fontWeight: "bold", color: isSelected ? "rgba(255,255,255,0.7)" : "#bbb", padding: "0 2px", lineHeight: 1 }}
              >⋮</span>
            </div>
          </div>

          {/* Chip menu dropdown */}
          {menuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setMenuOpen(false)} />
              <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 100, background: "#fff", border: "1px solid #d0e8f7", borderRadius: "6px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "150px", overflow: "hidden" }}>
                <div style={mi} onClick={() => { onOpen(node.path); setMenuOpen(false); }} onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}>Edit</div>
                <div style={mi} onClick={() => { setAddingChild(true); setChildName(""); setChildError(""); setMenuOpen(false); setTimeout(() => childInputRef.current?.focus(), 50); }} onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}>Add sub-page</div>
                <div style={{ ...mi, color: "#c00" }} onClick={() => { onDelete(node.path); setMenuOpen(false); }} onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#fff5f5"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}>Delete</div>
              </div>
            </>
          )}

          {/* Add sub-page inline input */}
          {addingChild && (
            <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "3px" }}>
              <div style={{ display: "flex", gap: "4px" }}>
                <input
                  ref={childInputRef}
                  value={childName}
                  onChange={(e) => { setChildName(e.target.value); setChildError(""); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitChild();
                    if (e.key === "Escape") { setAddingChild(false); setChildName(""); setChildError(""); }
                  }}
                  placeholder="filename.md"
                  style={{ padding: "4px 6px", background: "#fff", border: "1px solid #b3d9f7", borderRadius: "3px", color: "#1a1a1a", fontSize: "12px", outline: "none", width: "140px" }}
                />
                <button onClick={submitChild} style={{ padding: "4px 8px", background: "#3a7d44", border: "none", borderRadius: "3px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✓</button>
                <button onClick={() => { setAddingChild(false); setChildName(""); setChildError(""); }} style={{ padding: "4px 8px", background: "#aaa", border: "none", borderRadius: "3px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✕</button>
              </div>
              {childError && <div style={{ color: "#f66", fontSize: "11px" }}>{childError}</div>}
            </div>
          )}

          {dropAction === "sibling" && <div style={{ height: "2px", background: "#6b8cff", borderRadius: "1px", margin: "0 4px" }} />}
          {dropAction === "unnest" && <div style={{ height: "2px", background: "#ff9800", borderRadius: "1px", margin: "0 4px" }} />}
        </div>
      </div>
      {/* Children */}
      {hasChildren && isExpanded && (
        (node.children ?? []).map((child, cidx) => (
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
            onCreateChild={onCreateChild}
            expanded={expanded}
            toggleExpand={toggleExpand}
            overId={overId}
            activeId={activeId}
            dragDeltaX={dragDeltaX}
            undoPath={undoPath}
            onUndo={onUndo}
            canUndo={canUndo}
          />
        ))
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
  onCreateChildFile: (parentPath: string, filename: string) => Promise<void>;
  onOpenYaml: () => void;
  yamlOpen: boolean;
  orphans: FileInfo[];
  currentProject: string;
  currentProjectTitle: string;
  projects: ProjectInfo[];
  onSwitchProject: (name: string) => void;
  onCreateProject: (name: string) => Promise<void>;
  onDeleteProject: (name: string) => Promise<void>;
  onRenameProject: (oldName: string, newName: string) => Promise<void>;
  onOpenProjectMd: () => void;
  onRefresh: () => Promise<void>;
  onUndo: () => void;
  canUndo: boolean;
  undoPath: string | null;
}

export default function Sidebar({ collection, selectedPath, onSelect, onOpen, onCollectionChange, onCreateFile, onDeleteFile, onRenameFile, onCreateChildFile, onOpenYaml, yamlOpen, orphans, currentProject, currentProjectTitle, projects, onSwitchProject, onCreateProject, onDeleteProject, onRenameProject, onOpenProjectMd, onRefresh, onUndo, canUndo, undoPath }: SidebarProps) {
  const [titleMode, setTitleMode] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(flatIds(collection.root)));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const prevMoveRef = useRef<{ overId: string | null; zone: string }>({ overId: null, zone: "" });
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

  function computeNewRoot(dragged: string, target: string, deltaX: number): FileNode[] | null {
    if (orphans.some(o => o.path === target)) return null;
    const isOrphan = orphans.some(o => o.path === dragged);
    const orphanInfo = isOrphan ? orphans.find(o => o.path === dragged) : null;
    const withoutDragged = isOrphan ? collection.root : removeNode(collection.root, dragged)[0];
    const draggedNode: FileNode | null = isOrphan && orphanInfo
      ? { path: orphanInfo.path, title: orphanInfo.title, order: 0, children: [] }
      : removeNode(collection.root, dragged)[1];
    if (!draggedNode) return null;
    if (deltaX > 30) return reorder(insertAsChild(withoutDragged, target, draggedNode));
    if (deltaX < -30) return reorder([...withoutDragged, draggedNode]);
    return reorder(insertAfter(withoutDragged, target, draggedNode));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    setDragDeltaX(0);
    prevMoveRef.current = { overId: null, zone: "" };
  }
  function handleDragMove(event: DragMoveEvent) {
    const newOverId = event.over?.id as string ?? null;
    const newZone = event.delta.x > 30 ? "nest" : event.delta.x < -30 ? "unnest" : "sibling";
    setOverId(newOverId);
    const prev = prevMoveRef.current;
    if (newOverId === prev.overId && newZone === prev.zone) return;
    prevMoveRef.current = { overId: newOverId, zone: newZone };
    setDragDeltaX(event.delta.x);
  }
  function handleDragOver(event: DragOverEvent) { setOverId(event.over?.id as string ?? null); }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    setActiveId(null); setOverId(null); setDragDeltaX(0);
    if (!over || active.id === over.id) return;
    const dragged = active.id as string;
    const target = over.id as string;
    const newNodes = computeNewRoot(dragged, target, delta.x);
    if (!newNodes) return;
    if (delta.x > 30) setExpanded(prev => { const s = new Set(prev); s.add(target); return s; });
    onCollectionChange({ root: newNodes }, dragged);
  }

  const allIds = [...flatIds(collection.root), ...orphans.map(o => o.path)];

  const activeLabel = activeId ? (() => {
    const orphan = orphans.find(o => o.path === activeId);
    if (orphan) return titleMode ? orphan.title : orphan.path;
    const [, node] = removeNode(collection.root, activeId);
    return node ? (titleMode ? node.title : node.path) : activeId;
  })() : "";

  // ── Project rename ────────────────────────────────────────────────────────
  const [renamingProject, setRenamingProject] = useState(false);
  const [renameProjectValue, setRenameProjectValue] = useState("");
  const [renameProjectError, setRenameProjectError] = useState("");
  const renameProjectInputRef = useRef<HTMLInputElement>(null);

  const normalizeProjectName = (raw: string) =>
    raw.trim().replace(/\s+/g, "-").replace(/[/\\<>:"|?*\0]/g, "");

  const commitRenameProject = async () => {
    const name = normalizeProjectName(renameProjectValue);
    if (!name || name === "." || name === "..") { setRenameProjectError("Invalid name"); return; }
    if (name === currentProject) { setRenamingProject(false); return; }
    try {
      await onRenameProject(currentProject, name);
      setRenamingProject(false);
      setRenameProjectError("");
    } catch (e: any) { setRenameProjectError(e.message ?? "Error"); }
  };

  // ── Three-dot menu ────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectSubmenuOpen, setProjectSubmenuOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectError, setProjectError] = useState("");
  const projectInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const cancelCreatingProject = () => { setCreatingProject(false); setNewProjectName(""); setProjectError(""); };
  const submitNewProject = async () => {
    const name = newProjectName.trim().replace(/\s+/g, "-").toLowerCase();
    if (!name) return;
    if (/[/\\<>:"|?*]/.test(name)) { setProjectError("Invalid name"); return; }
    try { await onCreateProject(name); cancelCreatingProject(); }
    catch (e: any) { setProjectError(e.message ?? "Error"); }
  };
  const handleProjectInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submitNewProject();
    if (e.key === "Escape") cancelCreatingProject();
  };

  const menuItem: CSSProperties = {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "7px 14px", fontSize: "13px", cursor: "pointer",
    color: "#1a1a1a", whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#ffffff", marginLeft: "1in", marginRight: "1in" }}>

      {/* File tree */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: "8px", paddingBottom: "8px", outline: "none" }} tabIndex={0} onKeyDown={handleKeyDown}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <SortableContext items={allIds} strategy={verticalListSortingStrategy}>

            {/* Project chip — always at top, non-draggable */}
            {currentProject && (
              <div style={{ margin: `${GAP}px 0` }}>
                {/* Chip */}
                <div style={{
                  display: "inline-flex", alignItems: "center",
                  width: "2.5in",
                  background: "#1a6fa8", borderRadius: "6px",
                  padding: "10px 8px 10px 12px",
                  userSelect: "none",
                }}>
                  {renamingProject ? (
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <input
                        ref={renameProjectInputRef}
                        value={renameProjectValue}
                        autoFocus
                        onChange={(e) => { setRenameProjectValue(e.target.value); setRenameProjectError(""); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.stopPropagation(); commitRenameProject(); }
                          if (e.key === "Escape") { e.stopPropagation(); setRenamingProject(false); setRenameProjectError(""); }
                        }}
                        onBlur={commitRenameProject}
                        onClick={(e) => e.stopPropagation()}
                        style={{ background: "#fff", border: "none", borderRadius: "3px", color: "#1a1a1a", fontSize: "13px", padding: "2px 5px", outline: "none", width: "100%" }}
                      />
                      {renameProjectError && <span style={{ color: "#fca", fontSize: "10px" }}>{renameProjectError}</span>}
                    </div>
                  ) : (
                    <span
                      style={{ fontSize: "15px", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, cursor: "text" }}
                      title={titleMode ? currentProjectTitle : currentProject}
                      onDoubleClick={() => { setRenameProjectValue(currentProject); setRenameProjectError(""); setRenamingProject(true); }}
                    >
                      {titleMode ? currentProjectTitle : currentProject}
                    </span>
                  )}
                  {/* ↻ refresh button */}
                  <span
                    onClick={onRefresh}
                    title="Refresh projects and files from disk"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "4px", cursor: "pointer", fontSize: "16px", color: "rgba(255,255,255,0.65)", flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
                  >↻</span>
                  {/* ⋮ button — position:relative so dropdown anchors to its center */}
                  <span ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
                    <span
                      onClick={() => setMenuOpen(o => !o)}
                      title="Menu"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "4px", cursor: "pointer", fontSize: "18px", fontWeight: "bold", color: menuOpen ? "#fff" : "rgba(255,255,255,0.65)", background: menuOpen ? "rgba(255,255,255,0.2)" : "transparent" }}
                      onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
                    >⋮</span>

                    {/* Dropdown — top-left corner at center of ⋮ button */}
                    {menuOpen && (
                      <div style={{
                        position: "absolute", top: "50%", left: "50%", zIndex: 100,
                        background: "#fff", border: "1px solid #d0e8f7", borderRadius: "6px",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "200px", overflow: "visible",
                      }}>
                        {/* Projects fly-out */}
                        <div
                          style={{ ...menuItem, justifyContent: "space-between", position: "relative" }}
                          onMouseEnter={() => setProjectSubmenuOpen(true)}
                          onMouseLeave={() => setProjectSubmenuOpen(false)}
                        >
                          <span>Projects</span>
                          <span style={{ fontSize: "11px", color: "#999" }}>▸</span>
                          {projectSubmenuOpen && (
                            <div style={{
                              position: "absolute", left: "100%", top: 0, zIndex: 101,
                              background: "#fff", border: "1px solid #d0e8f7", borderRadius: "6px",
                              boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "160px", overflow: "hidden",
                            }}>
                              {projects.map(p => (
                                <div key={p.name}
                                  style={{ ...menuItem, background: p.name === currentProject ? "#e8f4fd" : "transparent", color: p.name === currentProject ? "#1a6fa8" : "#1a1a1a", fontWeight: p.name === currentProject ? 600 : 400 }}
                                  onClick={() => { onSwitchProject(p.name); setMenuOpen(false); setProjectSubmenuOpen(false); }}
                                  onMouseEnter={(e) => { if (p.name !== currentProject) (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                                  onMouseLeave={(e) => { if (p.name !== currentProject) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                                >
                                  {p.name === currentProject && <span style={{ color: "#1a6fa8", fontSize: "11px", marginRight: "4px" }}>✓</span>}{titleMode ? p.title : p.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div style={{ ...menuItem }}
                          onClick={() => { onOpenProjectMd(); setMenuOpen(false); }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                        >Info</div>

                        <div style={{ height: "1px", background: "#e8f4fd", margin: "4px 0" }} />

                        {/* New project */}
                        <div style={{ ...menuItem, color: "#1a6fa8" }}
                          onClick={() => { setCreatingProject(true); setNewProjectName(""); setProjectError(""); setMenuOpen(false); setTimeout(() => projectInputRef.current?.focus(), 50); }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                        >＋ New project</div>

                        {/* New file */}
                        <div style={{ ...menuItem, color: "#1a6fa8" }}
                          onClick={() => { startCreating(); setMenuOpen(false); }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                        >＋ New file</div>

                        <div style={{ height: "1px", background: "#e8f4fd", margin: "4px 0" }} />

                        {/* Labels */}
                        <div style={{ padding: "4px 14px 10px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "12px", color: "#666" }}>Labels:</span>
                          <div style={{ display: "flex", border: "1px solid #b3d9f7", borderRadius: "4px", overflow: "hidden" }}>
                            {([["Filename", false], ["Title", true]] as const).map(([label, mode]) => (
                              <button key={label} onClick={() => { setTitleMode(mode); setMenuOpen(false); }} style={{ padding: "3px 8px", border: "none", cursor: "pointer", fontSize: "12px", background: titleMode === mode ? "#1a6fa8" : "#e8f4fd", color: titleMode === mode ? "#fff" : "#1a6fa8" }}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </span>
                </div>

                {/* Inline new-project input (shown below chip when creating) */}
                {creatingProject && (
                  <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <input ref={projectInputRef} value={newProjectName} onChange={(e) => { setNewProjectName(e.target.value); setProjectError(""); }} onKeyDown={handleProjectInputKey} placeholder="project-name"
                        style={{ padding: "4px 6px", background: "#fff", border: "1px solid #b3d9f7", borderRadius: "3px", color: "#1a1a1a", fontSize: "12px", outline: "none", width: "140px" }} />
                      <button onClick={submitNewProject} style={{ padding: "4px 8px", background: "#3a7d44", border: "none", borderRadius: "3px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✓</button>
                      <button onClick={cancelCreatingProject} style={{ padding: "4px 8px", background: "#aaa", border: "none", borderRadius: "3px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✕</button>
                    </div>
                    {projectError && <div style={{ color: "#f66", fontSize: "11px" }}>{projectError}</div>}
                  </div>
                )}

                {/* Inline new-file input */}
                {creatingFile && (
                  <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <input ref={inputRef} value={newFileName} onChange={(e) => { setNewFileName(e.target.value); setCreateError(""); }} onKeyDown={handleInputKey} placeholder="filename.md"
                        style={{ padding: "4px 6px", background: "#fff", border: "1px solid #b3d9f7", borderRadius: "3px", color: "#1a1a1a", fontSize: "12px", outline: "none", width: "140px" }} />
                      <button onClick={submitNewFile} style={{ padding: "4px 8px", background: "#3a7d44", border: "none", borderRadius: "3px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✓</button>
                      <button onClick={cancelCreating} style={{ padding: "4px 8px", background: "#aaa", border: "none", borderRadius: "3px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✕</button>
                    </div>
                    {createError && <div style={{ color: "#f66", fontSize: "11px" }}>{createError}</div>}
                  </div>
                )}
              </div>
            )}

            {collection.root.map((node, idx) => (
              <SortableItem
                key={node.path}
                node={node}
                depth={1}
                isLast={idx === collection.root.length - 1}
                ancestors={[false]}
                selectedPath={selectedPath}
                titleMode={titleMode}
                onSelect={onSelect}
                onOpen={onOpen}
                onDelete={handleDelete}
                onRename={onRenameFile}
                onCreateChild={onCreateChildFile}
                expanded={expanded}
                toggleExpand={toggleExpand}
                overId={overId}
                activeId={activeId}
                dragDeltaX={dragDeltaX}
                undoPath={undoPath}
                onUndo={onUndo}
                canUndo={canUndo}
              />
            ))}

            {collection.root.length === 0 && orphans.length === 0 && (
              <div style={{ color: "#aaa", padding: "16px", fontSize: "13px", textAlign: "center" }}>
                No markdown files yet. Create one with + New file.
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
          <DragOverlay dropAnimation={{ duration: 150, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
            {activeId ? (
              <div style={{
                display: "inline-flex", alignItems: "stretch",
                width: "2.5in", borderRadius: "6px",
                border: "1.5px solid #ff8c00", background: "#fff",
                boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
                opacity: 0.97, userSelect: "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", padding: "10px 6px 10px 8px", flexShrink: 0, background: "#ff8c00", color: "#fff", fontSize: "16px", fontWeight: "bold", borderRadius: "4px 0 0 4px", cursor: "grabbing" }}>⠿</div>
                <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, padding: "10px 6px 10px 3px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 500, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeLabel}</span>
                </div>
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
