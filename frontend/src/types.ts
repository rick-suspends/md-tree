export interface FileNode {
  path: string;
  title: string;
  order: number;
  children?: FileNode[];
}

export interface CollectionStructure {
  root: FileNode[];
}

export interface FileInfo {
  path: string;
  title: string;
}
