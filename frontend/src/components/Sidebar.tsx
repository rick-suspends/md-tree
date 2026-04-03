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
import {
  flatIds,
  removeNode,
  insertBefore,
  insertAfter,
  insertAsChild,
  insertAsLastChild,
  reorder,
  findSiblingList,
  findParent,
  swapSiblings,
} from "../treeHelpers";
import { GAP, COL_W, TOP_SENTINEL } from "./SidebarConstants";
import { SortableItem } from "./SortableItem";
import OrphanPane from "./OrphanPane";
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
  onArchiveProject: (name: string) => Promise<void>;
  onRenameProject: (oldName: string, newName: string) => Promise<void>;
  onOpenProjectMd: () => void;
  onRefresh: () => Promise<void>;
  onImport: (format: "mkdocs" | "docusaurus") => void;
  onExport: (format: "mkdocs" | "docusaurus") => void;
}

export default function Sidebar({ collection, selectedPath, onSelect, onOpen, onCollectionChange, onCreateFile, onDeleteFile, onRenameFile, onCreateChildFile, onOpenYaml, yamlOpen, orphans, currentProject, currentProjectTitle, projects, onSwitchProject, onCreateProject, onDeleteProject, onArchiveProject, onRenameProject, onOpenProjectMd, onRefresh, onImport, onExport }: SidebarProps) {
  const [titleMode, setTitleMode] = useState(true);
  const [orphanSort, setOrphanSort] = useState<"recent" | "alpha" | "custom">("recent");
  const [orphanOrder, setOrphanOrder] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(flatIds(collection.root)));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const prevMoveRef = useRef<{ overId: string | null; zone: string }>({ overId: null, zone: "" });
  const treeRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const orphanArrowRef = useRef<HTMLButtonElement>(null);
  const [dpadTop, setDpadTop] = useState<number | null>(null);
  const [selectedOrphans, setSelectedOrphans] = useState<Set<string>>(new Set());
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const orphanSectionRef = useRef<HTMLDivElement>(null);
  const orphanChipRefs = useRef<Map<string, HTMLElement>>(new Map());
  const cursorOverZoneRef = useRef(false);

  // Document-level keydown for orphan up/down/left when orphans are selected
  useEffect(() => {
    if (selectedOrphans.size === 0 || selectedPath) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "ArrowLeft") return;
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      if (e.key === "ArrowLeft") {
        addOrphansToCollection([...selectedOrphans]);
        return;
      }
      if (selectedOrphans.size !== 1) return;
      const path = [...selectedOrphans][0];
      setOrphanSort("custom");
      setOrphanOrder(prev => {
        const list = prev.length ? prev : orphans.map(o => o.path);
        const idx = list.indexOf(path);
        if (idx === -1) return list;
        if (e.key === "ArrowUp" && idx === 0) return list;
        if (e.key === "ArrowDown" && idx === list.length - 1) return list;
        const next = [...list];
        const swap = e.key === "ArrowUp" ? idx - 1 : idx + 1;
        [next[idx], next[swap]] = [next[swap], next[idx]];
        return next;
      });
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedOrphans, selectedPath, orphans]);
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

  useEffect(() => {
    if (!orphanArrowRef.current || !sidebarRef.current) { setDpadTop(null); return; }
    const sidebarRect = sidebarRef.current.getBoundingClientRect();
    const btnRect = orphanArrowRef.current.getBoundingClientRect();
    setDpadTop(btnRect.top + btnRect.height / 2 - sidebarRect.top);
  }, [orphans, selectedPath]);

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
    onSelect(null);
    setSelectedOrphans(prev => {
      if (ctrl) { const next = new Set(prev); next.has(path) ? next.delete(path) : next.add(path); return next; }
      if (prev.size === 1 && prev.has(path)) return new Set<string>();
      return new Set([path]);
    });
  };

  // Clear orphan selection when a hierarchy item is selected
  const handleHierarchySelect = useCallback((path: string | null) => {
    if (path !== null) setSelectedOrphans(new Set());
    onSelect(path);
  }, [onSelect]);

  const addOrphansToCollection = (paths: string[]) => {
    const newNodes: FileNode[] = paths.map(p => {
      const info = orphans.find(o => o.path === p)!;
      return { path: p, title: info.title, order: 0, children: [] };
    });
    onCollectionChange({ root: reorder([...collection.root, ...newNodes]) });
    setSelectedOrphans(new Set());
    setTimeout(() => onRefresh(), 300);
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
    await onDeleteFile(path);
  };

  const refocusTree = () => setTimeout(() => treeRef.current?.focus(), 0);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (!selectedPath) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const root = collection.root;
    if (e.key === "ArrowRight") {
      const found = findSiblingList(root, selectedPath);
      if (!found || found.idx === 0) return;
      const [withoutNode, node] = removeNode(root, selectedPath);
      if (!node) return;
      const prevSibling = found.list[found.idx - 1];
      onCollectionChange({ root: reorder(insertAsLastChild(withoutNode, prevSibling.path, node)) });
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
      const parentSiblings = findSiblingList(root, parent.path);
      if (parentSiblings && parentSiblings.idx > 0) {
        const prevUncle = parentSiblings.list[parentSiblings.idx - 1];
        const [withoutNode, node] = removeNode(root, selectedPath);
        if (!node) return;
        onCollectionChange({ root: reorder(insertAsLastChild(withoutNode, prevUncle.path, node)) });
        setExpanded(prev => { const s = new Set(prev); s.add(prevUncle.path); return s; });
      } else {
        const [withoutNode, node] = removeNode(root, selectedPath);
        if (!node) return;
        onCollectionChange({ root: reorder(insertBefore(withoutNode, parent.path, node)) });
      }
      refocusTree();
      return;
    }
    if (e.key === "ArrowDown") {
      const nr = swapSiblings(root, selectedPath, "down");
      if (nr !== root) { onCollectionChange({ root: reorder(nr) }); refocusTree(); return; }
      const parent = findParent(root, selectedPath);
      if (!parent) return;
      const parentSiblings = findSiblingList(root, parent.path);
      if (parentSiblings && parentSiblings.idx < parentSiblings.list.length - 1) {
        const nextUncle = parentSiblings.list[parentSiblings.idx + 1];
        const [withoutNode, node] = removeNode(root, selectedPath);
        if (!node) return;
        onCollectionChange({ root: reorder(insertAsChild(withoutNode, nextUncle.path, node)) });
        setExpanded(prev => { const s = new Set(prev); s.add(nextUncle.path); return s; });
      } else {
        const [withoutNode, node] = removeNode(root, selectedPath);
        if (!node) return;
        onCollectionChange({ root: reorder(insertAfter(withoutNode, parent.path, node)) });
      }
      refocusTree();
    }
  }, [selectedPath, collection, expanded, onCollectionChange, setExpanded]);

  const fireArrow = useCallback((dir: string) => {
    handleKeyDown({ key: `Arrow${dir.charAt(0).toUpperCase() + dir.slice(1)}`, preventDefault: () => {}, target: { tagName: "DIV" } } as any);
    refocusTree();
  }, [handleKeyDown]);

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
  function pointerZoneDeltaX(activatorEvent: Event, deltaX: number, overRect: { left: number; width: number } | undefined): number {
    if (!overRect) return 0;
    const ptr = activatorEvent as PointerEvent;
    return (ptr.clientX + deltaX) > (overRect.left + overRect.width / 2) ? 100 : 0;
  }

  function handleDragMove(event: DragMoveEvent) {
    const newOverId = event.over?.id as string ?? null;
    const dx = pointerZoneDeltaX(event.activatorEvent, event.delta.x, event.over?.rect);
    const newZone = dx > 30 ? "nest" : "sibling";
    setOverId(newOverId);
    const prev = prevMoveRef.current;
    if (newOverId !== prev.overId || newZone !== prev.zone) {
      prevMoveRef.current = { overId: newOverId, zone: newZone };
      setDragDeltaX(dx);
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
      onCollectionChange({ root: reorder(newRoot) });
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
    const effectiveDx = pointerZoneDeltaX(event.activatorEvent, delta.x, over?.rect);
    const newNodes = computeNewRoot(dragged, target, effectiveDx);
    if (!newNodes) return;
    if (effectiveDx > 30) setExpanded(prev => { const s = new Set(prev); s.add(target); return s; });
    onCollectionChange({ root: newNodes });
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
    <div ref={sidebarRef} style={{ display: "flex", flexDirection: "column", height: "100%", background: "#ffffff", paddingLeft: "1in", marginRight: "1in", position: "relative" }}>

      {selectedPath && (
        <div style={{ position: "absolute", left: 0, top: dpadTop ?? 280, width: "1in", display: "flex", justifyContent: "center", zIndex: 5, transform: "translateY(-50%)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto auto auto" }}>
            <div />
            <button onClick={() => fireArrow("up")} title="Move up (↑)" style={{ background: "transparent", border: "1px solid #d0e8f7", cursor: "pointer", padding: "4px 6px", fontSize: "13px", color: "#1a6fa8", borderRadius: "4px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#e8f4fd"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>▲</button>
            <div />
            <button onClick={() => fireArrow("left")} title="Unnest (←)" style={{ background: "transparent", border: "1px solid #d0e8f7", cursor: "pointer", padding: "4px 5px", fontSize: "13px", color: "#1a6fa8", borderRadius: "4px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#e8f4fd"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>◀</button>
            <div style={{ width: "4px" }} />
            <button onClick={() => fireArrow("right")} title="Nest (→)" style={{ background: "transparent", border: "1px solid #d0e8f7", cursor: "pointer", padding: "4px 5px", fontSize: "13px", color: "#1a6fa8", borderRadius: "4px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#e8f4fd"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>▶</button>
            <div />
            <button onClick={() => fireArrow("down")} title="Move down (↓)" style={{ background: "transparent", border: "1px solid #d0e8f7", cursor: "pointer", padding: "4px 6px", fontSize: "13px", color: "#1a6fa8", borderRadius: "4px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#e8f4fd"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>▼</button>
            <div />
          </div>
        </div>
      )}

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
                  onArchiveProject={onArchiveProject}
                  onRenameProject={onRenameProject}
                  onOpenProjectMd={onOpenProjectMd}
                  onRefresh={onRefresh}
                  onCreateFile={onCreateFile}
                  onOpenYaml={onOpenYaml}
                  onImport={onImport}
                  onExport={onExport}
                />
              )}

              <TopSentinel isActive={activeId !== null && overId === TOP_SENTINEL} />

              {collection.root.map((node, idx) => (
                <SortableItem
                  key={node.path}
                  node={node}
                  depth={1}
                  isLast={idx === collection.root.length - 1}
                  ancestors={[]}
                  showTopIndicator={idx === 0 && activeId !== null && overId === TOP_SENTINEL}
                  selectedPath={selectedPath}
                  titleMode={titleMode}
                  onSelect={handleHierarchySelect}
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
                  currentProject={currentProject}
                />
              ))}

              {collection.root.length === 0 && orphans.length === 0 && (
                <div style={{ color: "#aaa", padding: "16px", fontSize: "13px", textAlign: "center" }}>
                  No markdown files yet. Create one with + New file.
                </div>
              )}
            </div>

            <OrphanPane
              orphans={orphans} titleMode={titleMode} activeId={activeId} currentProject={currentProject}
              selectedOrphans={selectedOrphans} onOrphanSelect={handleOrphanSelect}
              onAddToSelection={(path) => setSelectedOrphans(prev => { const next = new Set(prev); next.add(path); return next; })}
              orphanSort={orphanSort} setOrphanSort={setOrphanSort} orphanOrder={orphanOrder}
              rubberBand={rubberBand} orphanSectionRef={orphanSectionRef} orphanChipRefs={orphanChipRefs}
              onOpen={onOpen} onDelete={handleDelete} onAddOrphansToCollection={addOrphansToCollection} onRefresh={onRefresh}
              arrowBtnRef={orphanArrowRef}
            />

          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 150, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
          {activeId ? (
            <div style={{ marginLeft: activeDepth > 0 ? `${(activeDepth + 1) * COL_W}px` : 0 }}>
              <div style={{
                display: "inline-flex", alignItems: "center",
                width: "2.5in", borderRadius: "6px",
                border: "1.5px solid #1a6fa8",
                background: !orphans.some(o => o.path === activeId) ? "#e8f4fd" : "#fff",
                boxShadow: !orphans.some(o => o.path === activeId)
                  ? "inset 5px 0 0 0 #1a6fa8, 0 6px 20px rgba(0,0,0,0.22)"
                  : "0 6px 20px rgba(0,0,0,0.22)",
                opacity: 0.97, userSelect: "none",
                padding: "5px 10px 5px 12px", /* was 10px, then 7px */
              }}>
                <span style={{ fontSize: "15px", fontWeight: 500, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeLabel}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

    </div>
  );
}
