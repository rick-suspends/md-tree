import { FileNode } from "./types";

export function getMaxDepth(nodes: FileNode[], depth = 0): number {
  if (!nodes.length) return depth;
  return Math.max(...nodes.map((n) =>
    n.children?.length ? getMaxDepth(n.children, depth + 1) : depth
  ));
}

// Returns the max (depth_indent + label_width) across all nodes, in pixels.
// depth * 16 for indent, label.length * 7.5 for ~13px monospace chars, + 80 for chrome (handle, arrow, trash)
export function getMaxLabelWidth(nodes: FileNode[], depth = 0): number {
  if (!nodes.length) return 0;
  return Math.max(...nodes.map((n) => {
    const own = depth * 16 + n.path.length * 7.5 + 80;
    const childMax = n.children?.length ? getMaxLabelWidth(n.children, depth + 1) : 0;
    return Math.max(own, childMax);
  }));
}

export function flatIds(nodes: FileNode[]): string[] {
  return nodes.flatMap((n) => [n.path, ...flatIds(n.children ?? [])]);
}

export function removeNode(nodes: FileNode[], path: string): [FileNode[], FileNode | null] {
  let removed: FileNode | null = null;
  const result = nodes
    .filter((n) => {
      if (n.path === path) { removed = n; return false; }
      return true;
    })
    .map((n) => {
      if (!removed && n.children?.length) {
        const [newChildren, r] = removeNode(n.children, path);
        if (r) { removed = r; return { ...n, children: newChildren }; }
      }
      return n;
    });
  return [result, removed];
}

export function insertAfter(nodes: FileNode[], afterPath: string, node: FileNode): FileNode[] {
  const idx = nodes.findIndex((n) => n.path === afterPath);
  if (idx !== -1) {
    const copy = [...nodes];
    copy.splice(idx + 1, 0, { ...node, order: idx + 1 });
    return copy.map((n, i) => ({ ...n, order: i }));
  }
  return nodes.map((n) => ({
    ...n,
    children: n.children ? insertAfter(n.children, afterPath, node) : n.children,
  }));
}

export function insertAsChild(nodes: FileNode[], parentPath: string, node: FileNode): FileNode[] {
  return nodes.map((n) => {
    if (n.path === parentPath) {
      const children = [...(n.children ?? []), { ...node, order: (n.children ?? []).length }];
      return { ...n, children };
    }
    if (n.children) return { ...n, children: insertAsChild(n.children, parentPath, node) };
    return n;
  });
}

export function reorder(nodes: FileNode[]): FileNode[] {
  return nodes.map((n, i) => ({
    ...n,
    order: i,
    children: n.children ? reorder(n.children) : [],
  }));
}

export function findSiblingList(
  nodes: FileNode[],
  path: string
): { list: FileNode[]; idx: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].path === path) return { list: nodes, idx: i };
    const found = findSiblingList(nodes[i].children ?? [], path);
    if (found) return found;
  }
  return null;
}

export function findParent(
  nodes: FileNode[],
  path: string,
  parent: FileNode | null = null
): FileNode | null {
  for (const n of nodes) {
    if (n.path === path) return parent;
    const p = findParent(n.children ?? [], path, n);
    if (p !== undefined) return p;
  }
  return undefined as any;
}

export function swapSiblings(nodes: FileNode[], path: string, dir: "up" | "down"): FileNode[] {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].path === path) {
      const j = dir === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= nodes.length) return nodes;
      const copy = [...nodes];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    }
    const prevChildren = nodes[i].children ?? [];
    const newChildren = swapSiblings(prevChildren, path, dir);
    if (newChildren !== prevChildren) {
      const copy = [...nodes];
      copy[i] = { ...nodes[i], children: newChildren };
      return copy;
    }
  }
  return nodes;
}
