import { useState, useEffect, useRef, RefObject, MutableRefObject, CSSProperties } from "react";
import { FileInfo } from "../types";
import { GAP } from "./SidebarConstants";
import { OrphanItem } from "./OrphanItem";
import { createFile, fetchCollection, saveCollection } from "../api";
import { removeNode, reorder } from "../treeHelpers";

interface OrphanPaneProps {
  orphans: FileInfo[];
  titleMode: boolean;
  activeId: string | null;
  currentProject: string;
  selectedOrphans: Set<string>;
  onOrphanSelect: (path: string, ctrl: boolean) => void;
  onAddToSelection: (path: string) => void;
  orphanSort: "recent" | "alpha" | "custom";
  setOrphanSort: (sort: "recent" | "alpha" | "custom") => void;
  orphanOrder: string[];
  rubberBand: { x1: number; y1: number; x2: number; y2: number } | null;
  orphanSectionRef: RefObject<HTMLDivElement | null>;
  orphanChipRefs: MutableRefObject<Map<string, HTMLElement>>;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
  onAddOrphansToCollection: (paths: string[]) => void;
  onRefresh: () => Promise<void>;
  arrowBtnRef?: RefObject<HTMLButtonElement | null>;
}

export default function OrphanPane({
  orphans, titleMode, activeId, currentProject,
  selectedOrphans, onOrphanSelect, onAddToSelection,
  orphanSort, setOrphanSort, orphanOrder,
  rubberBand, orphanSectionRef, orphanChipRefs,
  onOpen, onDelete, onAddOrphansToCollection, onRefresh,
  arrowBtnRef,
}: OrphanPaneProps) {
  const hasOrphans = orphans.length > 0;
  const [orphansExpanded, setOrphansExpanded] = useState(false);
  const prevHadOrphans = useRef(false);
  useEffect(() => {
    if (hasOrphans && !prevHadOrphans.current) setOrphansExpanded(true);
    prevHadOrphans.current = hasOrphans;
  }, [hasOrphans]);

  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [createError, setCreateError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [sortSubmenuOpen, setSortSubmenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          menuButtonRef.current && !menuButtonRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setSortSubmenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const submitFile = async () => {
    let name = newFileName.trim();
    if (!name) return;
    if (!name.endsWith(".md")) name += ".md";
    if (/[/\\<>:"|?*]/.test(name.replace(/\.md$/, ""))) { setCreateError("Invalid filename characters"); return; }
    try {
      await createFile(currentProject, name);
      const fresh = await fetchCollection(currentProject);
      const [newRoot] = removeNode(fresh.root, name);
      await saveCollection(currentProject, { root: reorder(newRoot) });
      setCreatingFile(false); setNewFileName(""); setCreateError("");
      await onRefresh();
      onOpen(name);
    } catch (e: any) { setCreateError(e.message ?? "Error creating file"); }
  };

  const sortedOrphans = orphanSort === "alpha"
    ? [...orphans].sort((a, b) => (titleMode ? a.title : a.path).localeCompare(titleMode ? b.title : b.path))
    : orphanSort === "custom"
    ? orphanOrder.flatMap(p => { const o = orphans.find(x => x.path === p); return o ? [o] : []; })
    : orphans;

  const mi: CSSProperties = { padding: "7px 14px", fontSize: "13px", cursor: "pointer", color: "#1a1a1a", whiteSpace: "nowrap", display: "flex", alignItems: "center", justifyContent: "space-between" };

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, paddingTop: "8px" }}>
      {/* Chip header */}
      <div style={{ flexShrink: 0, paddingLeft: "100px", marginTop: `${GAP}px` }}>
        <div style={{
          display: "inline-flex", alignItems: "center",
          width: "2.5in",
          background: "#1a6fa8", borderRadius: "6px",
          padding: "5px 8px 5px 12px",
          userSelect: "none",
        }}>
          <span
            style={{ fontSize: "15px", fontWeight: 600, color: "#fff", flex: 1, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            onClick={() => setOrphansExpanded(e => !e)}
          >
            <span style={{ color: hasOrphans ? "#f90" : "rgba(255,255,255,0.45)", marginRight: "6px", fontSize: "13px", position: "relative", top: "-1px" }}>⚠</span>
            Unlinked
          </span>
          <span ref={menuButtonRef} style={{ position: "relative", flexShrink: 0 }}>
            <span
              onClick={() => {
                if (!menuOpen && menuButtonRef.current) {
                  const r = menuButtonRef.current.getBoundingClientRect();
                  setMenuPos({ top: r.top + r.height / 2, left: r.left + r.width / 2 });
                }
                setMenuOpen(o => !o);
              }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "4px", cursor: "pointer", fontSize: "18px", fontWeight: "bold", color: menuOpen ? "#fff" : "rgba(255,255,255,0.65)", background: menuOpen ? "rgba(255,255,255,0.2)" : "transparent" }}
              onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
            >⋮</span>
          </span>
        </div>
      </div>

      {menuOpen && menuPos && (
        <div ref={menuRef} style={{
          position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 1000,
          background: "#fff", border: "1px solid #d0e8f7", borderRadius: "8px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "170px", overflow: "visible",
        }}>
          <div
            style={{ ...mi, position: "relative" }}
            onMouseEnter={() => setSortSubmenuOpen(true)}
            onMouseLeave={() => setSortSubmenuOpen(false)}
          >
            <span>Sort by</span>
            <span style={{ fontSize: "18px", color: "#999", lineHeight: 0 }}>▸</span>
            {sortSubmenuOpen && (
              <div style={{
                position: "absolute", left: "100%", top: 0, zIndex: 1001,
                background: "#fff", border: "1px solid #d0e8f7", borderRadius: "8px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "120px", overflow: "hidden",
              }}>
                {([["recent", "Recent"], ["alpha", "A→Z"], ["custom", "Custom"]] as const).map(([mode, label]) => (
                  <div key={mode}
                    style={{ ...mi, justifyContent: "flex-start", background: orphanSort === mode ? "#e8f4fd" : "transparent", color: orphanSort === mode ? "#1a6fa8" : "#1a1a1a", fontWeight: orphanSort === mode ? 600 : 400 }}
                    onClick={() => { setOrphanSort(mode); setMenuOpen(false); setSortSubmenuOpen(false); }}
                    onMouseEnter={(e) => { if (orphanSort !== mode) (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = orphanSort === mode ? "#e8f4fd" : "transparent"; }}
                  >{label}</div>
                ))}
              </div>
            )}
          </div>
          <div style={{ borderTop: "1px solid #e8e8e8", margin: "2px 0" }} />
          <div
            style={{ ...mi, justifyContent: "flex-start", color: "#1a6fa8" }}
            onClick={() => { setMenuOpen(false); setCreatingFile(true); setNewFileName(""); setCreateError(""); setOrphansExpanded(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
          >＋ New file</div>
        </div>
      )}

      {/* Content row: arrow column + orphan list */}
      {orphansExpanded && (
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Arrow column */}
          <div style={{ width: "100px", flexShrink: 0, position: "relative" }}>
            <div style={{ position: "absolute", top: 200, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
              <button
                ref={arrowBtnRef}
                onClick={() => { if (selectedOrphans.size > 0 && hasOrphans) onAddOrphansToCollection([...selectedOrphans]); }}
                title={selectedOrphans.size > 0 && hasOrphans ? `Add ${selectedOrphans.size} to hierarchy` : "Select files to add"}
                style={{
                  background: selectedOrphans.size > 0 && hasOrphans ? "#1a6fa8" : "#e0e0e0",
                  border: `1.5px solid ${selectedOrphans.size > 0 && hasOrphans ? "#1a6fa8" : "#aaa"}`,
                  borderRadius: "4px", padding: "4px 9px",
                  cursor: selectedOrphans.size > 0 && hasOrphans ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: selectedOrphans.size > 0 && hasOrphans ? "#fff" : "#888",
                }}
              >
                <svg width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="21" y1="7" x2="1" y2="7"/>
                  <polyline points="6 3.5 1 7 6 10.5"/>
                </svg>
              </button>
            </div>
          </div>
          {/* Orphan list */}
          <div ref={orphanSectionRef} style={{ width: "360px", overflowY: "auto", minHeight: 0, padding: `6px 8px 8px 8px`, position: "relative", userSelect: "none" }}>
            {!hasOrphans && !creatingFile && (
              <div style={{ color: "#aaa", fontSize: "12px", padding: "8px 4px" }}>No unlinked files. Use ＋ New file to add one.</div>
            )}
            {creatingFile && (
              <div style={{ marginBottom: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
                <div style={{ display: "flex", gap: "4px" }}>
                  <input
                    ref={inputRef}
                    value={newFileName}
                    onChange={(e) => { setNewFileName(e.target.value); setCreateError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") submitFile(); if (e.key === "Escape") { setCreatingFile(false); setNewFileName(""); setCreateError(""); } }}
                    placeholder="filename.md"
                    style={{ padding: "4px 6px", background: "#fff", border: "1px solid #b3d9f7", borderRadius: "4px", color: "#1a1a1a", fontSize: "12px", outline: "none", width: "140px" }}
                  />
                  <button onClick={submitFile} style={{ padding: "4px 8px", background: "#3a7d44", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✓</button>
                  <button onClick={() => { setCreatingFile(false); setNewFileName(""); setCreateError(""); }} style={{ padding: "4px 8px", background: "#aaa", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✕</button>
                </div>
                {createError && <div style={{ color: "#f66", fontSize: "11px" }}>{createError}</div>}
              </div>
            )}
            {sortedOrphans.map((o) => (
              <OrphanItem
                key={o.path} path={o.path} title={o.title} titleMode={titleMode}
                isMultiSelected={selectedOrphans.has(o.path)}
                onMultiSelect={onOrphanSelect}
                onAddToSelection={onAddToSelection}
                onOpen={onOpen} onDelete={onDelete} onAddToHierarchy={(p) => onAddOrphansToCollection([p])} currentProject={currentProject}
                setChipRef={(el) => { if (el) orphanChipRefs.current.set(o.path, el); else orphanChipRefs.current.delete(o.path); }}
                activeId={activeId}
              />
            ))}
            {rubberBand && (
              <div style={{
                position: "fixed", pointerEvents: "none", zIndex: 50,
                left: Math.min(rubberBand.x1, rubberBand.x2),
                top: Math.min(rubberBand.y1, rubberBand.y2),
                width: Math.abs(rubberBand.x2 - rubberBand.x1),
                height: Math.abs(rubberBand.y2 - rubberBand.y1),
                border: "1px dashed #1a6fa8", background: "rgba(26,111,168,0.08)",
              }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
