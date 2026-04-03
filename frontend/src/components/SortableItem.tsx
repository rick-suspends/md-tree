import { useState, useEffect, useRef, CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileNode } from "../types";
import { fetchMarkdown } from "../api";
import { LINE, COL_W, GAP } from "./SidebarConstants";

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
        borderRadius: "4px", color: "#1a1a1a", fontSize: "14px",
        padding: "1px 4px", outline: "none", minWidth: 0, width: "160px",
      }}
    />
  );
}

// ── ConnectorLines ────────────────────────────────────────────────────────────

function ConnectorLines({ depth, ancestors, isLast }: { depth: number; ancestors: boolean[]; isLast: boolean }) {
  if (depth === 0) return null;
  return (
    <div style={{ display: "flex", flexShrink: 0, alignSelf: "stretch" }}>
      {ancestors.map((hasMore, i) => (
        <div key={i} style={{ width: `${COL_W}px`, flexShrink: 0, position: "relative" }}>
          {hasMore && (
            <div style={{
              position: "absolute", left: `${COL_W / 2}px`,
              top: `-${GAP}px`, bottom: `-${GAP}px`,
              width: 0, borderLeft: `1px solid ${LINE}`,
            }} />
          )}
        </div>
      ))}
      <div style={{ width: `${COL_W}px`, flexShrink: 0, position: "relative" }}>
        <div style={{
          position: "absolute", left: `${COL_W / 2}px`,
          top: `-${GAP}px`, bottom: isLast ? "50%" : `-${GAP}px`,
          width: 0, borderLeft: `1px solid ${LINE}`,
        }} />
        <div style={{
          position: "absolute", left: `${COL_W / 2}px`, top: "50%",
          width: `${COL_W / 2}px`, height: 0, borderTop: `1px solid ${LINE}`,
        }} />
      </div>
    </div>
  );
}

// ── SortableItem ──────────────────────────────────────────────────────────────

export interface ItemProps {
  node: FileNode;
  depth: number;
  isLast: boolean;
  ancestors: boolean[];
  selectedPath: string | null;
  titleMode: boolean;
  onSelect: (path: string | null) => void;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onCreateChild: (parentPath: string, filename: string) => Promise<void>;
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
  overId: string | null;
  activeId: string | null;
  activeLabel: string;
  dragDeltaX: number;
  showTopIndicator?: boolean;
  currentProject: string;
}

export function SortableItem({ node, depth, isLast, ancestors, selectedPath, titleMode, onSelect, onOpen, onDelete, onRename, onCreateChild, expanded, toggleExpand, overId, activeId, activeLabel, dragDeltaX, showTopIndicator, currentProject }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.path });
  const [renaming, setRenaming] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [childError, setChildError] = useState("");
  const childInputRef = useRef<HTMLInputElement>(null);
  const menuTriggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuTriggerRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (isDragging) onSelect(node.path);
  }, [isDragging]);

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

  const mi: CSSProperties = { padding: "7px 14px", fontSize: "13px", fontWeight: "normal", cursor: "pointer", color: "#1a1a1a", whiteSpace: "nowrap" };
  // Width of ConnectorLines area for this depth level
  const connectorWidth = (ancestors.length + 1) * COL_W;

  return (
    <div ref={setNodeRef} style={{ transform: (isDragging || depth > 1 || activeId !== null) ? undefined : CSS.Transform.toString(transform), transition: (isDragging || depth > 1 || activeId !== null) ? undefined : transition, margin: `${GAP}px 0` }}>
      {showTopIndicator && (
        <div style={{ height: "40px" }} />
      )}
      <div style={{ display: "flex", alignItems: "stretch", opacity: isDragging ? 0 : 1 }}>
        <ConnectorLines depth={depth} ancestors={ancestors} isLast={isLast} />
        <div style={{ minWidth: 0, position: "relative", zIndex: menuOpen ? 50 : undefined }}>
          <div
            {...attributes} {...listeners}
            style={{
              display: "inline-flex", alignItems: "stretch",
              width: "2.5in", overflow: "visible",
              background: isSelected && dropAction !== "nest" ? "#e8f4fd" : hovered ? "#f0f6ff" : "#fff",
              border: `1.5px solid ${dropAction === "nest" ? "#4caf50" : "#1a6fa8"}`,
              boxShadow: isSelected && dropAction !== "nest" ? "inset 5px 0 0 0 #1a6fa8" : "none",
              borderRadius: "6px", cursor: "pointer", userSelect: "none",
              outline: dropAction === "nest" ? "2px solid #4caf5066" : "none",
              outlineOffset: "1px",
            }}
            onClick={(e) => { if (e.altKey) { fetchMarkdown(currentProject, node.path).then(setPreviewContent).catch(() => {}); } else { onSelect(isSelected ? null : node.path); } }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setPreviewContent(null); }}
          >
            <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, gap: "2px", padding: "5px 36px 5px 12px" /* was 10px, then 7px */, position: "relative" }}>
              {hasChildren ? (
                <span onClick={(e) => { e.stopPropagation(); toggleExpand(node.path); }} style={{ width: "16px", flexShrink: 0, marginTop: "-5px", marginBottom: "-5px", marginRight: "3px", paddingTop: "5px", paddingBottom: "5px", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <svg width="9" height="13" viewBox="0 0 11 16" fill="none" stroke="#888" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}><polyline points="2,2 9,8 2,14"/></svg>
                </span>
              ) : (
                <span style={{ width: "16px", marginRight: "3px", flexShrink: 0 }} />
              )}
              {renaming ? (
                <RenameInput
                  currentPath={node.path}
                  onCommit={(newName) => { setRenaming(false); if (newName && newName !== node.path) onRename(node.path, newName); }}
                  onCancel={() => setRenaming(false)}
                />
              ) : (
                <span
                  style={{ fontSize: "15px", fontWeight: 500, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
                  onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); }}
                  title={label}
                >
                  {label}
                </span>
              )}
              {/* ⋮ trigger — menu rendered inside so top: 50%, left: 50% = top-left at button center */}
              <span
                ref={menuTriggerRef}
                onClick={(e) => { e.stopPropagation(); onSelect(node.path); if (!menuOpen && menuTriggerRef.current) { const r = menuTriggerRef.current.getBoundingClientRect(); setMenuPos({ top: r.top + r.height / 2, left: r.left + r.width / 2 }); } setMenuOpen(o => !o); }}
                style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "16px", fontWeight: "bold", color: "#bbb" }}
              >
                ⋮
                {menuOpen && (
                  <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", top: menuPos?.top ?? 0, left: menuPos?.left ?? 0, zIndex: 200, background: "#fff", border: "1px solid #d0e8f7", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "150px", overflow: "hidden" }}>
                    <div style={mi} onClick={() => { onOpen(node.path); setMenuOpen(false); }} onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}>Edit</div>
                    <div style={mi} onClick={() => { setAddingChild(true); setChildName(""); setChildError(""); setMenuOpen(false); setTimeout(() => childInputRef.current?.focus(), 50); }} onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}>Add sub-page</div>
                    <div style={{ ...mi, color: "#c00" }} onClick={() => { onDelete(node.path); setMenuOpen(false); }} onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#fff5f5"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}>Delete</div>
                  </div>
                )}
              </span>
            </div>
          </div>

          {previewContent && !isDragging && !renaming && (
            <div style={{
              position: "absolute", left: "calc(2.5in + 12px)", top: 0,
              zIndex: 200, width: "260px", pointerEvents: "none",
              background: "#fff", border: "1px solid #d0e8f7",
              borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.13)",
              padding: "8px 10px",
            }}>
              <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.path}</div>
              {previewContent.split("\n").filter(l => l.trim()).slice(0, 8).map((line, i) => (
                <div key={i} style={{ fontSize: "12px", color: "#333", fontFamily: "monospace", lineHeight: 1.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</div>
              ))}
            </div>
          )}

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
                  style={{ padding: "4px 6px", background: "#fff", border: "1px solid #b3d9f7", borderRadius: "4px", color: "#1a1a1a", fontSize: "12px", outline: "none", width: "140px" }}
                />
                <button onClick={submitChild} style={{ padding: "4px 8px", background: "#3a7d44", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✓</button>
                <button onClick={() => { setAddingChild(false); setChildName(""); setChildError(""); }} style={{ padding: "4px 8px", background: "#aaa", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✕</button>
              </div>
              {childError && <div style={{ color: "#f66", fontSize: "11px" }}>{childError}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Sibling/unnest: empty space the height of a chip, indented to chip position */}
      {(dropAction === "sibling" || dropAction === "unnest") && (
        <div style={{ height: "40px", marginLeft: `${connectorWidth}px`, marginTop: `${GAP}px` }} />
      )}

      {/* Nest: ghost chip with connector lines showing where the drop would land (top of children) */}
      {dropAction === "nest" && activeId && (
        <div style={{ display: "flex", alignItems: "center", marginTop: `${GAP}px`, opacity: 0.4 }}>
          <ConnectorLines
            depth={depth + 1}
            ancestors={[...ancestors, !isLast]}
            isLast={!(hasChildren && isExpanded)}
          />
          <div style={{
            display: "inline-flex", alignItems: "center",
            width: "2.5in", padding: "5px 12px", /* was 10px, then 7px */
            border: "1.5px solid #1a6fa8", borderRadius: "6px",
            background: "#e8f4fd",
          }}>
            <span style={{ width: "16px", marginRight: "3px", flexShrink: 0 }} />
            <span style={{ fontSize: "15px", fontWeight: 500, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {activeLabel}
            </span>
          </div>
        </div>
      )}

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
            activeLabel={activeLabel}
            dragDeltaX={dragDeltaX}
            currentProject={currentProject}
          />
        ))
      )}
    </div>
  );
}
