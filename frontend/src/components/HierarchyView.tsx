import { useState, CSSProperties, useCallback, KeyboardEvent } from "react";
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
import { FileNode, CollectionStructure } from "../types";
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

// ── Node item ─────────────────────────────────────────────────────────────────

interface NodeItemProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  titleMode: boolean;
  onSelect: (path: string) => void;
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
  overId: string | null;
  activeId: string | null;
  dragDeltaX: number;
}

function NodeItem({
  node, depth, selectedPath, titleMode, onSelect,
  expanded, toggleExpand, overId, activeId, dragDeltaX,
}: NodeItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.path });

  const isExpanded = expanded.has(node.path);
  const hasChildren = (node.children ?? []).length > 0;
  const isSelected = selectedPath === node.path;
  const isOver = activeId !== null && overId === node.path && activeId !== node.path;
  const dropAction = isOver
    ? dragDeltaX > 30 ? "nest" : dragDeltaX < -30 ? "unnest" : "sibling"
    : null;

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const INDENT = 24;

  return (
    <div ref={setNodeRef} style={style}>
      {/* Guide lines for depth */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          paddingLeft: `${depth * INDENT + 12}px`,
          paddingRight: "12px",
          paddingTop: "6px",
          paddingBottom: "6px",
          cursor: "pointer",
          background: isSelected
            ? "#1e3a6e"
            : dropAction === "nest"
            ? "#1a3a1a"
            : "transparent",
          borderRadius: "6px",
          userSelect: "none",
          gap: "6px",
          outline: dropAction === "nest" ? "2px solid #4caf50" : "none",
          outlineOffset: "-2px",
          position: "relative",
          margin: "1px 4px",
        }}
        onClick={() => onSelect(node.path)}
      >
        {/* Depth guides */}
        {depth > 0 && Array.from({ length: depth }).map((_, di) => (
          <div
            key={di}
            style={{
              position: "absolute",
              left: `${di * INDENT + 20}px`,
              top: 0,
              bottom: 0,
              width: "1px",
              background: "#333",
            }}
          />
        ))}

        {/* Drag handle */}
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: "grab", color: "#555", fontSize: "14px", flexShrink: 0, zIndex: 1 }}
          title="Drag to reorder"
        >
          ⠿
        </span>

        {/* Expand toggle */}
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); toggleExpand(node.path); }}
            style={{ color: "#888", fontSize: "12px", width: "16px", flexShrink: 0, zIndex: 1 }}
          >
            {isExpanded ? "▾" : "▸"}
          </span>
        ) : (
          <span style={{ width: "16px", flexShrink: 0 }} />
        )}

        {/* File icon */}
        <span style={{ color: isSelected ? "#7eb8ff" : "#666", fontSize: "13px", flexShrink: 0 }}>
          {hasChildren ? "📁" : "📄"}
        </span>

        {/* Label */}
        <span
          style={{
            flex: 1,
            fontSize: "14px",
            color: isSelected ? "#e8f0ff" : "#ccc",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: isSelected ? 500 : 400,
          }}
        >
          {titleMode ? node.title : node.path}
        </span>

        {/* Nest indicator */}
        {dropAction === "nest" && (
          <span style={{ fontSize: "11px", color: "#4caf50", flexShrink: 0 }}>nest ▸</span>
        )}
      </div>

      {/* Sibling drop indicator */}
      {dropAction === "sibling" && (
        <div style={{ height: "2px", background: "#6b8cff", borderRadius: "1px", margin: `0 ${depth * INDENT + 16}px 0 ${depth * INDENT + 12}px` }} />
      )}
      {/* Unnest drop indicator */}
      {dropAction === "unnest" && (
        <div style={{ height: "2px", background: "#ff9800", borderRadius: "1px", margin: "0 8px 0 4px" }} />
      )}

      {/* Children */}
      {hasChildren && isExpanded && (
        <SortableContext items={flatIds(node.children ?? [])} strategy={verticalListSortingStrategy}>
          {(node.children ?? []).map((child) => (
            <NodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              titleMode={titleMode}
              onSelect={onSelect}
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

// ── HierarchyView ─────────────────────────────────────────────────────────────

interface HierarchyViewProps {
  collection: CollectionStructure;
  selectedPath: string | null;
  titleMode: boolean;
  onSelect: (path: string) => void;
  onCollectionChange: (c: CollectionStructure) => void;
}

export default function HierarchyView({
  collection, selectedPath, titleMode, onSelect, onCollectionChange,
}: HierarchyViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(
    // Start with all nodes expanded
    collection.root.flatMap(function getIds(n: FileNode): string[] {
      return [n.path, ...(n.children ?? []).flatMap(getIds)];
    })
  ));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragDeltaX, setDragDeltaX] = useState(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
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

    if (e.key === "ArrowUp") {
      const newRoot = swapSiblings(root, selectedPath, "up");
      if (newRoot !== root) onCollectionChange({ root: reorder(newRoot) });
      return;
    }

    if (e.key === "ArrowDown") {
      const newRoot = swapSiblings(root, selectedPath, "down");
      if (newRoot !== root) onCollectionChange({ root: reorder(newRoot) });
    }
  }, [selectedPath, collection, onCollectionChange]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    setDragDeltaX(0);
  }

  function handleDragMove(event: DragMoveEvent) {
    setOverId(event.over?.id as string ?? null);
    setDragDeltaX(event.delta.x);
  }

  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over?.id as string ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setOverId(null);
    setDragDeltaX(0);
    const { active, over, delta } = event;
    if (!over || active.id === over.id) return;

    const dragged = active.id as string;
    const target = over.id as string;
    const [withoutDragged, draggedNode] = removeNode(collection.root, dragged);
    if (!draggedNode) return;

    let newNodes: FileNode[];
    if (delta.x > 30) {
      newNodes = insertAsChild(withoutDragged, target, draggedNode);
      setExpanded(prev => { const s = new Set(prev); s.add(target); return s; });
    } else if (delta.x < -30) {
      newNodes = [...withoutDragged, draggedNode];
    } else {
      newNodes = insertAfter(withoutDragged, target, draggedNode);
    }
    onCollectionChange({ root: reorder(newNodes) });
  }

  const allIds = flatIds(collection.root);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#13131f" }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px 12px",
        borderBottom: "1px solid #2a2a3e",
        flexShrink: 0,
      }}>
        <div style={{ color: "#aaa", fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>
          Document Hierarchy
        </div>
        <div style={{ color: "#555", fontSize: "11px" }}>
          Click a file to open · Drag to reorder · Right/Left to nest/unnest
        </div>
      </div>

      {/* Tree */}
      <div
        style={{ flex: 1, overflowY: "auto", padding: "12px 8px", outline: "none" }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {collection.root.length === 0 ? (
          <div style={{ color: "#555", padding: "40px 20px", fontSize: "14px", textAlign: "center" }}>
            No markdown files found in <code style={{ color: "#888" }}>./markdowns</code>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
              {collection.root.map((node) => (
                <NodeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  titleMode={titleMode}
                  onSelect={onSelect}
                  expanded={expanded}
                  toggleExpand={toggleExpand}
                  overId={overId}
                  activeId={activeId}
                  dragDeltaX={dragDeltaX}
                />
              ))}
            </SortableContext>
            <DragOverlay>
              {activeId ? (
                <div style={{
                  background: "#2d2d44",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "14px",
                  opacity: 0.9,
                  border: "1px solid #4a4a6a",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                }}>
                  {titleMode
                    ? (function findTitle(nodes: FileNode[]): string {
                        for (const n of nodes) {
                          if (n.path === activeId) return n.title;
                          const t = findTitle(n.children ?? []);
                          if (t) return t;
                        }
                        return activeId;
                      })(collection.root)
                    : activeId}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Keyboard hint */}
      <div style={{
        padding: "8px 16px",
        borderTop: "1px solid #2a2a3e",
        fontSize: "11px",
        color: "#444",
        flexShrink: 0,
      }}>
        ↑ ↓ move · → nest · ← un-nest · drag ⠿ to restructure
      </div>
    </div>
  );
}
