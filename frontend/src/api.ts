import { CollectionStructure, FileInfo, ProjectInfo } from "./types";

const BASE = "/api";

// ── Projects ──────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<ProjectInfo[]> {
  const r = await fetch(`${BASE}/projects`);
  if (!r.ok) throw new Error("Failed to fetch projects");
  return r.json();
}

export async function renameProject(name: string, newName: string): Promise<{ new_name: string }> {
  const r = await fetch(`${BASE}/projects/${name}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_name: newName }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to rename project");
  }
  return r.json();
}

export async function createProject(name: string, markdowns_dir?: string): Promise<void> {
  const r = await fetch(`${BASE}/projects/${name}`, {
    method: "POST",
    ...(markdowns_dir ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdowns_dir }) } : {}),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to create project");
  }
}


export async function deleteProject(name: string): Promise<void> {
  const r = await fetch(`${BASE}/projects/${name}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete project");
}

export async function archiveProject(name: string): Promise<void> {
  const r = await fetch(`${BASE}/projects/${name}/archive`, { method: "POST" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to archive project");
  }
}

export async function fetchProjectMd(project: string): Promise<string> {
  const r = await fetch(`${BASE}/projects/${project}/project-md`);
  if (!r.ok) throw new Error("Failed to fetch project.md");
  const data = await r.json();
  return data.content;
}

export async function saveProjectMd(project: string, content: string): Promise<void> {
  const r = await fetch(`${BASE}/projects/${project}/project-md`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "project.md", content }),
  });
  if (!r.ok) throw new Error("Failed to save project.md");
}

// ── Files ─────────────────────────────────────────────────────────────────────

export async function fetchFiles(project: string): Promise<FileInfo[]> {
  const r = await fetch(`${BASE}/projects/${project}/files`);
  if (!r.ok) throw new Error("Failed to fetch files");
  return r.json();
}

export async function fetchCollection(project: string): Promise<CollectionStructure> {
  const r = await fetch(`${BASE}/projects/${project}/collection`);
  if (!r.ok) throw new Error("Failed to fetch collection");
  return r.json();
}

export async function saveCollection(project: string, collection: CollectionStructure): Promise<void> {
  const r = await fetch(`${BASE}/projects/${project}/collection`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collection }),
  });
  if (!r.ok) throw new Error("Failed to save collection");
}

export async function fetchMarkdown(project: string, path: string): Promise<string> {
  const r = await fetch(`${BASE}/projects/${project}/markdown/${path}`);
  if (!r.ok) throw new Error("File not found");
  const data = await r.json();
  return data.content;
}

export async function saveMarkdown(project: string, path: string, content: string): Promise<void> {
  const r = await fetch(`${BASE}/projects/${project}/markdown/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!r.ok) throw new Error("Failed to save file");
}

export async function createFile(project: string, path: string): Promise<{ title: string }> {
  const r = await fetch(`${BASE}/projects/${project}/markdown/${path}`, { method: "POST" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to create file");
  }
  return r.json();
}

export async function deleteFile(project: string, path: string): Promise<void> {
  const r = await fetch(`${BASE}/projects/${project}/markdown/${path}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete file");
}

export async function renameFile(project: string, oldPath: string, newPath: string): Promise<{ new_path: string }> {
  const r = await fetch(`${BASE}/projects/${project}/rename/${oldPath}`, {
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

export async function fetchCollectionYaml(project: string): Promise<string> {
  const r = await fetch(`${BASE}/projects/${project}/collection/yaml`);
  if (!r.ok) throw new Error("Failed to fetch YAML");
  const data = await r.json();
  return data.content;
}

export async function saveCollectionYaml(project: string, content: string): Promise<void> {
  const r = await fetch(`${BASE}/projects/${project}/collection/yaml`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!r.ok) {
    const err = await r.json();
    throw new Error(err.detail || "Failed to save YAML");
  }
}

export async function fetchOrphans(project: string): Promise<FileInfo[]> {
  const r = await fetch(`${BASE}/projects/${project}/orphans`);
  if (!r.ok) throw new Error("Failed to fetch orphans");
  return r.json();
}

export async function importFromFormat(project: string, format: string, options: { content?: string; directory?: string }): Promise<{ warnings: string[]; node_count: number }> {
  const r = await fetch(`${BASE}/projects/${project}/import/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail ?? "Import failed");
  }
  return r.json();
}

export async function exportToFormat(project: string, format: string): Promise<string> {
  const r = await fetch(`${BASE}/projects/${project}/export/${format}`);
  if (!r.ok) throw new Error("Export failed");
  const data = await r.json();
  return data.content;
}
