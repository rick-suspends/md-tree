import { useState, useEffect, useRef, RefObject, MutableRefObject } from "react";
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

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Tab button */}
      <div style={{ flexShrink: 0, paddingLeft: "100px" }}>
        <button
          onClick={() => setOrphansExpanded(e => !e)}
          style={{
            background: "#1a6fa8", border: "none", borderRadius: "4px 4px 0 0",
            padding: "5px 12px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px",
            fontSize: "13px", fontWeight: 500, color: "#fff", letterSpacing: "0.3px",
          }}
        >
          <span style={{ color: hasOrphans ? "#f90" : "#aaa", position: "relative", top: "-1.5px" }}>⚠</span>
          <span>Unlinked</span>
        </button>
      </div>
      {/* Content row: arrow column + orphan list */}
      {orphansExpanded && (
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Arrow column */}
          <div style={{ width: "100px", flexShrink: 0, position: "relative" }}>
            <div style={{ position: "absolute", top: 200, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
              <button
                ref={arrowBtnRef}
                onClick={() => { if (selectedOrphans.size > 0) onAddOrphansToCollection([...selectedOrphans]); }}
                title={selectedOrphans.size > 0 ? `Add ${selectedOrphans.size} to hierarchy` : "Select files to add"}
                style={{
                  background: selectedOrphans.size > 0 ? "#1a6fa8" : "#e0e0e0",
                  border: `1.5px solid ${selectedOrphans.size > 0 ? "#1a6fa8" : "#aaa"}`,
                  borderRadius: "4px", padding: "4px 9px",
                  cursor: selectedOrphans.size > 0 ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: selectedOrphans.size > 0 ? "#fff" : "#888",
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
          <div ref={orphanSectionRef} style={{ width: "360px", overflowY: "auto", minHeight: 0, padding: `${GAP}px 8px 8px 8px`, position: "relative", userSelect: "none" }}>
            <div style={{ padding: "4px 0 6px", borderBottom: "1px solid #d0e8f7", display: "flex", alignItems: "center", gap: "18px", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <div style={{ display: "flex", border: "1px solid #b3d9f7", borderRadius: "4px", overflow: "hidden" }}>
                {(([["recent", "Recent"], ["alpha", "A→Z"], ["custom", "Custom"]] as const)).map(([mode, label], i) => (
                  <button key={mode} onClick={() => setOrphanSort(mode)} style={{ padding: "2px 8px", border: "none", borderRight: i < 2 ? "1px solid #b3d9f7" : "none", cursor: "pointer", fontSize: "11px", background: orphanSort === mode ? "#1a6fa8" : "#e8f4fd", color: orphanSort === mode ? "#fff" : "#1a6fa8", display: "flex", alignItems: "center" }}>{mode === "alpha" ? <>A<span style={{ position: "relative", top: "-1px" }}>→</span>Z</> : label}</button>
                ))}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setCreatingFile(true); setNewFileName(""); setCreateError(""); setTimeout(() => inputRef.current?.focus(), 50); }}
                style={{ padding: "2px 6px", fontSize: "11px", background: "#e8f4fd", color: "#1a6fa8", border: "1px solid #b3d9f7", borderRadius: "4px", cursor: "pointer", whiteSpace: "nowrap" }}
              >Add File</button>
            </div>
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
