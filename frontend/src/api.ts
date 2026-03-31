import { CollectionStructure, FileInfo } from "./types";

const BASE = "/api";

export async function fetchFiles(): Promise<FileInfo[]> {
  const r = await fetch(`${BASE}/files`);
  if (!r.ok) throw new Error("Failed to fetch files");
  return r.json();
}

export async function fetchCollection(): Promise<CollectionStructure> {
  const r = await fetch(`${BASE}/collection`);
  if (!r.ok) throw new Error("Failed to fetch collection");
  return r.json();
}

export async function saveCollection(collection: CollectionStructure): Promise<void> {
  const r = await fetch(`${BASE}/collection`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collection }),
  });
  if (!r.ok) throw new Error("Failed to save collection");
}

export async function fetchMarkdown(path: string): Promise<string> {
  const r = await fetch(`${BASE}/markdown/${path}`);
  if (!r.ok) throw new Error("File not found");
  const data = await r.json();
  return data.content;
}

export async function saveMarkdown(path: string, content: string): Promise<void> {
  const r = await fetch(`${BASE}/markdown/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!r.ok) throw new Error("Failed to save file");
}

export async function createFile(path: string): Promise<{ title: string }> {
  const r = await fetch(`${BASE}/markdown/${path}`, { method: "POST" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to create file");
  }
  return r.json();
}

export async function deleteFile(path: string): Promise<void> {
  const r = await fetch(`${BASE}/markdown/${path}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete file");
}

export async function renameFile(oldPath: string, newPath: string): Promise<{ new_path: string }> {
  const r = await fetch(`${BASE}/rename/${oldPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_path: newPath }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to rename file");
  }
  return r.json();
}

export async function fetchCollectionYaml(): Promise<string> {
  const r = await fetch(`${BASE}/collection/yaml`);
  if (!r.ok) throw new Error("Failed to fetch YAML");
  const data = await r.json();
  return data.content;
}

export async function saveCollectionYaml(content: string): Promise<void> {
  const r = await fetch(`${BASE}/collection/yaml`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!r.ok) {
    const err = await r.json();
    throw new Error(err.detail || "Failed to save YAML");
  }
}

export async function fetchOrphans(): Promise<FileInfo[]> {
  const r = await fetch(`${BASE}/orphans`);
  if (!r.ok) throw new Error("Failed to fetch orphans");
  return r.json();
}
