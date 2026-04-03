import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react";
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
  pointerWithin,
  ClientRect,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { FileNode, CollectionStructure, FileInfo, ProjectInfo } from "../types";
import { createFile, fetchCollection, saveCollection } from "../api";
import {
  flatIds,
  removeNode,
  insertBefore,
  insertAfter,
  insertAsChild,
  reorder,
  findSiblingList,
  findParent,
  swapSiblings,
} from "../treeHelpers";
import { GAP, COL_W, TOP_SENTINEL } from "./SidebarConstants";
import { SortableItem } from "./SortableItem";
import { OrphanItem } from "./OrphanItem";
import ProjectChip from "./ProjectChip";

// ── Collision detection ───────────────────────────────────────────────────────
// Prefer the smallest (deepest/most-specific) droppable rect that contains the pointer.
// Falls back to closestCenter when no droppable contains the pointer.
function deepestPointerCollision(args: Parameters<typeof closestCenter>[0]) {
  const hits = pointerWithin(args);
  if (hits.length === 0) return closestCenter(args);
  if (hits.length === 1) return hits;
  return [...hits].sort((a, b) => {
    const ar = args.droppableRects.get(a.id as UniqueIdentifier) as ClientRect | undefined;
    const br = args.droppableRects.get(b.id as UniqueIdentifier) as ClientRect | undefined;
    if (!ar || !br) return 0;
    return ar.width * ar.height - br.width * br.height;
  }).slice(0, 1);
}

// ── TopSentinel ───────────────────────────────────────────────────────────────

function TopSentinel({ isActive }: { isActive: boolean }) {
  const { setNodeRef } = useSortable({ id: TOP_SENTINEL });
  return (
    <div ref={setNodeRef} style={{ height: `${GAP}px`, marginTop: `-${GAP}px`, marginBottom: `-${GAP}px` }} />
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  collection: CollectionStructure;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  onOpen: (path: string) => void;
  onCollectionChange: (c: CollectionStructure, changedPath?: string) => void;
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
  const [orphansExpanded, setOrphansExpanded] = useState(true);
  const [orphanSort, setOrphanSort] = useState<"recent" | "alpha" | "custom">("recent");
  const [orphanOrder, setOrphanOrder] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(flatIds(collection.root)));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const prevMoveRef = useRef<{ overId: string | null; zone: string }>({ overId: null, zone: "" });
  const treeRef = useRef<HTMLDivElement>(null);
  const orphanInputRef = useRef<HTMLInputElement>(null);
  const [creatingOrphanFile, setCreatingOrphanFile] = useState(false);
  const [orphanNewFileName, setOrphanNewFileName] = useState("");
  const [orphanCreateError, setOrphanCreateError] = useState("");
  const [selectedOrphans, setSelectedOrphans] = useState<Set<string>>(new Set());
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const orphanSectionRef = useRef<HTMLDivElement>(null);
  const orphanChipRefs = useRef<Map<string, HTMLElement>>(new Map());
  const cursorOverZoneRef = useRef(false);
  useEffect(() => {
    setExpanded(prev => {
      const currentPaths = new Set(flatIds(collection.root));
      const next = new Set(prev);
      currentPaths.forEach(p => { if (!next.has(p)) next.add(p); });
      next.forEach(p => { if (!currentPaths.has(p)) next.delete(p); });
      return next;
    });
  }, [collection]);

  useEffect(() => { setSelectedOrphans(new Set()); setOrphanOrder([]); setOrphanSort("recent"); }, [currentProject]);

  // Keep orphanOrder in sync: preserve existing order, append new arrivals, drop removed
  useEffect(() => {
    setOrphanOrder(prev => {
      const paths = orphans.map(o => o.path);
      const kept = prev.filter(p => paths.includes(p));
      const added = paths.filter(p => !prev.includes(p));
      return [...kept, ...added];
    });
  }, [orphans]);

  const handleOrphanSelect = (path: string, ctrl: boolean) => {
    setSelectedOrphans(prev => {
      if (ctrl) { const next = new Set(prev); next.has(path) ? next.delete(path) : next.add(path); return next; }
      if (prev.size === 1 && prev.has(path)) return new Set<string>();
      return new Set([path]);
    });
  };

  const addOrphansToCollection = (paths: string[]) => {
    const newNodes: FileNode[] = paths.map(p => {
      const info = orphans.find(o => o.path === p)!;
      return { path: p, title: info.title, order: 0, children: [] };
    });
    onCollectionChange({ root: reorder([...collection.root, ...newNodes]) }, paths.length === 1 ? paths[0] : undefined);
    setSelectedOrphans(new Set());
    setTimeout(() => onRefresh(), 300);
  };

  const submitOrphanFile = async () => {
    let name = orphanNewFileName.trim();
    if (!name) return;
    if (!name.endsWith(".md")) name += ".md";
    if (/[/\\<>:"|?*]/.test(name.replace(/\.md$/, ""))) { setOrphanCreateError("Invalid filename characters"); return; }
    try {
      await createFile(currentProject, name);
      const fresh = await fetchCollection(currentProject);
      const [newRoot] = removeNode(fresh.root, name);
      await saveCollection(currentProject, { root: reorder(newRoot) });
      setCreatingOrphanFile(false); setOrphanNewFileName(""); setOrphanCreateError("");
      await onRefresh();
      onOpen(name);
    } catch (e: any) { setOrphanCreateError(e.message ?? "Error creating file"); }
  };

  const startRubberBand = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-orphan-chip], button, input')) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const onMove = (ev: MouseEvent) => {
      setRubberBand({ x1: startX, y1: startY, x2: ev.clientX, y2: ev.clientY });
      const selL = Math.min(ev.clientX, startX), selR = Math.max(ev.clientX, startX);
      const selT = Math.min(ev.clientY, startY), selB = Math.max(ev.clientY, startY);
      const next = new Set<string>();
      orphanChipRefs.current.forEach((el, p) => {
        const r = el.getBoundingClientRect();
        if (r.left < selR && r.right > selL && r.top < selB && r.bottom > selT) next.add(p);
      });
      setSelectedOrphans(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setRubberBand(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleRowMouseDown = (e: React.MouseEvent) => {
    if (treeRef.current?.contains(e.target as Node)) return;
    startRubberBand(e);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));

  const toggleExpand = (path: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });

  const handleDelete = async (path: string) => {
    if (!confirm(`Delete "${path}"? This cannot be undone.`)) return;
    await onDeleteFile(path);
  };

  const refocusTree = () => setTimeout(() => treeRef.current?.focus(), 0);

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
      refocusTree();
      return;
    }
    if (e.key === "ArrowLeft") {
      const parent = findParent(root, selectedPath);
      if (!parent) return;
      const [withoutNode, node] = removeNode(root, selectedPath);
      if (!node) return;
      onCollectionChange({ root: reorder(insertAfter(withoutNode, parent.path, node)) });
      refocusTree();
      return;
    }
    if (e.key === "ArrowUp") {
      const nr = swapSiblings(root, selectedPath, "up");
      if (nr !== root) { onCollectionChange({ root: reorder(nr) }); refocusTree(); return; }
      const parent = findParent(root, selectedPath);
      if (!parent) return;
      const [withoutNode, node] = removeNode(root, selectedPath);
      if (!node) return;
      onCollectionChange({ root: reorder(insertBefore(withoutNode, parent.path, node)) });
      refocusTree();
      return;
    }
    if (e.key === "ArrowDown") {
      const nr = swapSiblings(root, selectedPath, "down");
      if (nr !== root) { onCollectionChange({ root: reorder(nr) }); refocusTree(); return; }
      const parent = findParent(root, selectedPath);
      if (!parent) return;
      const [withoutNode, node] = removeNode(root, selectedPath);
      if (!node) return;
      onCollectionChange({ root: reorder(insertAfter(withoutNode, parent.path, node)) });
      refocusTree();
    }
  }, [selectedPath, collection, expanded, onCollectionChange, setExpanded]);

  function computeNewRoot(dragged: string, target: string, deltaX: number): FileNode[] | null {
    if (target === TOP_SENTINEL) {
      const isOrphan = orphans.some(o => o.path === dragged);
      const orphanInfo = isOrphan ? orphans.find(o => o.path === dragged) : null;
      const withoutDragged = isOrphan ? collection.root : removeNode(collection.root, dragged)[0];
      const draggedNode: FileNode | null = isOrphan && orphanInfo
        ? { path: orphanInfo.path, title: orphanInfo.title, order: 0, children: [] }
        : removeNode(collection.root, dragged)[1];
      if (!draggedNode) return null;
      return reorder([draggedNode, ...withoutDragged]);
    }
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
    if (!isOrphan) {
      const flatList = flatIds(collection.root);
      if (flatList.indexOf(dragged) > flatList.indexOf(target)) {
        return reorder(insertBefore(withoutDragged, target, draggedNode));
      }
    }
    return reorder(insertAfter(withoutDragged, target, draggedNode));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    setDragDeltaX(0);
    prevMoveRef.current = { overId: null, zone: "" };
    cursorOverZoneRef.current = false;
  }
  function handleDragMove(event: DragMoveEvent) {
    const newOverId = event.over?.id as string ?? null;
    const newZone = event.delta.x > 30 ? "nest" : event.delta.x < -30 ? "unnest" : "sibling";
    setOverId(newOverId);
    const prev = prevMoveRef.current;
    if (newOverId !== prev.overId || newZone !== prev.zone) {
      prevMoveRef.current = { overId: newOverId, zone: newZone };
      setDragDeltaX(event.delta.x);
    }
    if (orphanSectionRef.current) {
      const ptr = event.activatorEvent as PointerEvent;
      const cx = ptr.clientX + event.delta.x, cy = ptr.clientY + event.delta.y;
      const r = orphanSectionRef.current.getBoundingClientRect();
      cursorOverZoneRef.current = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    }
  }
  function handleDragOver(event: DragOverEvent) { setOverId(event.over?.id as string ?? null); }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    setActiveId(null); setOverId(null); setDragDeltaX(0);
    const droppedOnZone = cursorOverZoneRef.current;
    cursorOverZoneRef.current = false;
    const dragged = active.id as string;
    const isFromHierarchy = !orphans.some(o => o.path === dragged);
    if (isFromHierarchy && (droppedOnZone || (over && orphans.some(o => o.path === over.id as string)))) {
      const [newRoot] = removeNode(collection.root, dragged);
      onCollectionChange({ root: reorder(newRoot) }, dragged);
      setTimeout(() => onRefresh(), 300);
      return;
    }
    if (!over || active.id === over.id) return;
    const target = over.id as string;
    const wasOrphan = orphans.some(o => o.path === dragged);
    const targetIsOrphan = orphans.some(o => o.path === target);
    // Orphan-to-orphan reorder
    if (wasOrphan && targetIsOrphan) {
      setOrphanSort("custom");
      setOrphanOrder(prev => {
        const from = prev.indexOf(dragged);
        const to = prev.indexOf(target);
        if (from === -1 || to === -1) return prev;
        const next = [...prev];
        next.splice(from, 1);
        next.splice(to, 0, dragged);
        return next;
      });
      return;
    }
    const newNodes = computeNewRoot(dragged, target, delta.x);
    if (!newNodes) return;
    if (delta.x > 30) setExpanded(prev => { const s = new Set(prev); s.add(target); return s; });
    onCollectionChange({ root: newNodes }, dragged);
    if (wasOrphan) setTimeout(() => onRefresh(), 300);
  }

  const activeDepth = (() => {
    if (!activeId || orphans.some(o => o.path === activeId)) return 0;
    function find(nodes: FileNode[], d: number): number {
      for (const n of nodes) {
        if (n.path === activeId) return d;
        const r = find(n.children ?? [], d + 1);
        if (r > 0) return r;
      }
      return 0;
    }
    return find(collection.root, 1);
  })();

  const allIds = [TOP_SENTINEL, ...flatIds(collection.root), ...orphans.map(o => o.path)];

  const activeLabel = activeId ? (() => {
    const orphan = orphans.find(o => o.path === activeId);
    if (orphan) return titleMode ? orphan.title : orphan.path;
    const [, node] = removeNode(collection.root, activeId);
    return node ? (titleMode ? node.title : node.path) : activeId;
  })() : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#ffffff", marginLeft: "1in", marginRight: "1in" }}>

      <DndContext sensors={sensors} collisionDetection={deepestPointerCollision} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flex: 1, gap: "50px", minHeight: 0, overflow: "hidden" }} onMouseDown={handleRowMouseDown}>

            {/* Left: hierarchy */}
            <div ref={treeRef} style={{ overflowY: "auto", minHeight: 0, paddingTop: "8px", paddingBottom: "8px", outline: "none" }} tabIndex={0} onKeyDown={handleKeyDown}>

              {currentProject && (
                <ProjectChip
                  currentProject={currentProject}
                  currentProjectTitle={currentProjectTitle}
                  projects={projects}
                  titleMode={titleMode}
                  setTitleMode={setTitleMode}
                  onSwitchProject={onSwitchProject}
                  onCreateProject={onCreateProject}
                  onRenameProject={onRenameProject}
                  onOpenProjectMd={onOpenProjectMd}
                  onRefresh={onRefresh}
                  onCreateFile={onCreateFile}
                />
              )}

              <TopSentinel isActive={activeId !== null && overId === TOP_SENTINEL} />

              {collection.root.map((node, idx) => (
                <SortableItem
                  key={node.path}
                  node={node}
                  depth={1}
                  isLast={idx === collection.root.length - 1}
                  ancestors={[false]}
                  showTopIndicator={idx === 0 && activeId !== null && overId === TOP_SENTINEL}
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
                  activeLabel={activeLabel}
                  dragDeltaX={dragDeltaX}
                  undoPath={undoPath}
                  onUndo={onUndo}
                  canUndo={canUndo}
                  currentProject={currentProject}
                />
              ))}

              {collection.root.length === 0 && orphans.length === 0 && (
                <div style={{ color: "#aaa", padding: "16px", fontSize: "13px", textAlign: "center" }}>
                  No markdown files yet. Create one with + New file.
                </div>
              )}
            </div>

            {/* Right wrapper: tab button + (arrow column + orphan pane) */}
            {orphans.length > 0 && (
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
                {/* Tab button at top */}
                <div style={{ flexShrink: 0, paddingLeft: "100px" }}>
                  <button
                    onClick={() => setOrphansExpanded(e => !e)}
                    style={{
                      background: "#1a6fa8", border: "none", borderRadius: "4px 4px 0 0",
                      padding: "5px 12px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "6px",
                      fontSize: "12px", fontWeight: 500, color: "#fff",
                    }}
                  >
                    <span style={{ color: "#f90" }}>⚠</span>
                    <span>Orphans</span>
                    <span style={{ fontSize: "10px" }}>{orphansExpanded ? "▾" : "▸"}</span>
                  </button>
                </div>
                {/* Content row: arrow column + orphan pane */}
                {orphansExpanded && (
                  <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                    {/* Arrow column — between hierarchy and orphan pane */}
                    <div style={{ width: "100px", flexShrink: 0, position: "relative" }}>
                      <div style={{ position: "absolute", top: 200, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
                        <button
                          onClick={() => { if (selectedOrphans.size > 0) addOrphansToCollection([...selectedOrphans]); }}
                          title={selectedOrphans.size > 0 ? `Add ${selectedOrphans.size} to hierarchy` : "Select orphans to add"}
                          style={{
                            background: selectedOrphans.size > 0 ? "#1a6fa8" : "#e0e0e0",
                            border: `1.5px solid ${selectedOrphans.size > 0 ? "#1a6fa8" : "#aaa"}`,
                            borderRadius: "4px", padding: "7px 9px",
                            cursor: selectedOrphans.size > 0 ? "pointer" : "default",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: selectedOrphans.size > 0 ? "#fff" : "#888",
                          }}
                        >
                          <svg width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="21" y1="7" x2="1" y2="7"/>
                            <polyline points="7 1 1 7 7 13"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    {/* Orphan pane */}
                    <div ref={orphanSectionRef} style={{ width: "360px", overflowY: "auto", minHeight: 0, padding: `${GAP}px 8px 8px 8px`, position: "relative", userSelect: "none" }}>
                      <div style={{ padding: "4px 0 6px", borderBottom: "1px solid #d0e8f7", display: "flex", alignItems: "center", gap: "9px", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
                        <div style={{ display: "flex", border: "1px solid #b3d9f7", borderRadius: "4px", overflow: "hidden" }}>
                          {(([["recent", "Recent"], ["alpha", "A→Z"], ["custom", "Custom"]] as const)).map(([mode, label]) => (
                            <button key={mode} onClick={() => setOrphanSort(mode)} style={{ padding: "2px 8px", border: "none", cursor: "pointer", fontSize: "11px", background: orphanSort === mode ? "#1a6fa8" : "#e8f4fd", color: orphanSort === mode ? "#fff" : "#1a6fa8" }}>{label}</button>
                          ))}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setCreatingOrphanFile(true); setOrphanNewFileName(""); setOrphanCreateError(""); setTimeout(() => orphanInputRef.current?.focus(), 50); }}
                          style={{ padding: "2px 6px", fontSize: "11px", background: "#e8f4fd", color: "#1a6fa8", border: "1px solid #b3d9f7", borderRadius: "4px", cursor: "pointer", whiteSpace: "nowrap" }}
                        >Add File</button>
                      </div>
                      {creatingOrphanFile && (
                        <div style={{ marginBottom: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <input
                              ref={orphanInputRef}
                              value={orphanNewFileName}
                              onChange={(e) => { setOrphanNewFileName(e.target.value); setOrphanCreateError(""); }}
                              onKeyDown={(e) => { if (e.key === "Enter") submitOrphanFile(); if (e.key === "Escape") { setCreatingOrphanFile(false); setOrphanNewFileName(""); setOrphanCreateError(""); } }}
                              placeholder="filename.md"
                              style={{ padding: "4px 6px", background: "#fff", border: "1px solid #b3d9f7", borderRadius: "3px", color: "#1a1a1a", fontSize: "12px", outline: "none", width: "140px" }}
                            />
                            <button onClick={submitOrphanFile} style={{ padding: "4px 8px", background: "#3a7d44", border: "none", borderRadius: "3px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✓</button>
                            <button onClick={() => { setCreatingOrphanFile(false); setOrphanNewFileName(""); setOrphanCreateError(""); }} style={{ padding: "4px 8px", background: "#aaa", border: "none", borderRadius: "3px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✕</button>
                          </div>
                          {orphanCreateError && <div style={{ color: "#f66", fontSize: "11px" }}>{orphanCreateError}</div>}
                        </div>
                      )}
                      {(orphanSort === "alpha"
                        ? [...orphans].sort((a, b) => (titleMode ? a.title : a.path).localeCompare(titleMode ? b.title : b.path))
                        : orphanSort === "custom"
                        ? orphanOrder.flatMap(p => { const o = orphans.find(x => x.path === p); return o ? [o] : []; })
                        : orphans
                      ).map((o) => (
                        <OrphanItem
                          key={o.path} path={o.path} title={o.title} titleMode={titleMode}
                          isMultiSelected={selectedOrphans.has(o.path)}
                          onMultiSelect={handleOrphanSelect}
                          onAddToSelection={(path) => setSelectedOrphans(prev => { const next = new Set(prev); next.add(path); return next; })}
                          onOpen={onOpen} onDelete={handleDelete} onAddToHierarchy={(p) => addOrphansToCollection([p])} currentProject={currentProject}
                          setChipRef={(el) => { if (el) orphanChipRefs.current.set(o.path, el); else orphanChipRefs.current.delete(o.path); }}
                          activeId={activeId} undoPath={undoPath} onUndo={onUndo} canUndo={canUndo}
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
            )}

          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 150, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
          {activeId ? (
            <div style={{ marginLeft: activeDepth > 0 ? `${(activeDepth + 1) * COL_W}px` : 0 }}>
              <div style={{
                display: "inline-flex", alignItems: "center",
                width: "2.5in", borderRadius: "6px",
                border: "1.5px solid #1a6fa8", background: "#fff",
                boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
                opacity: 0.97, userSelect: "none",
                padding: "10px 10px 10px 12px",
              }}>
                <span style={{ fontSize: "15px", fontWeight: 500, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeLabel}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div style={{ padding: "6px 0", borderTop: "1px solid #d0e8f7", fontSize: "11px", color: "#bbb", lineHeight: 1.7 }}>
        ⠿ drag to reorder · drag <b style={{ color: "#aaa" }}>right</b> to nest · <b style={{ color: "#aaa" }}>left</b> to un-nest
      </div>
    </div>
  );
}
