import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "./components/Sidebar";
import MarkdownEditor from "./components/MarkdownEditor";
import YAMLEditor from "./components/YAMLEditor";
import {
  listProjects, createProject, deleteProject, renameProject,
  fetchProjectMd, saveProjectMd,
  fetchCollection, saveCollection, fetchMarkdown, saveMarkdown, fetchCollectionYaml,
  fetchOrphans, createFile, deleteFile, renameFile,
} from "./api";
import { CollectionStructure, FileInfo, FileNode, ProjectInfo } from "./types";
import { insertAsChild, reorder, removeNode } from "./treeHelpers";

const LAST_PROJECT_KEY = "mdtree_project";

type OverlayType = "editor" | "yaml" | "project-md" | null;

export default function App() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionStructure>({ root: [] });
  const [orphans, setOrphans] = useState<FileInfo[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [yamlContent, setYamlContent] = useState("");
  const [projectMdContent, setProjectMdContent] = useState("");
  const [viMode, setViMode] = useState(true);
  const [overlayType, setOverlayType] = useState<OverlayType>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  type UndoEntry = { snapshot: CollectionStructure; movedPath: string | null };
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [undoPath, setUndoPath] = useState<string | null>(null);

  const editorContentRef = useRef(editorContent);
  const savedContentRef = useRef(savedContent);
  useEffect(() => { editorContentRef.current = editorContent; }, [editorContent]);
  useEffect(() => { savedContentRef.current = savedContent; }, [savedContent]);

  const loadCollection = useCallback(async (project: string) => {
    try {
      const [c, o] = await Promise.all([fetchCollection(project), fetchOrphans(project)]);
      setCollection(c);
      setOrphans(o);
    } catch {
      setError("Failed to load collection");
    }
  }, []);

  // Initial load: fetch projects, pick last used or first available
  useEffect(() => {
    (async () => {
      try {
        const ps = await listProjects();
        setProjects(ps);
        if (ps.length === 0) {
          setLoading(false);
          return;
        }
        const saved = localStorage.getItem(LAST_PROJECT_KEY);
        const project = (saved && ps.some(p => p.name === saved)) ? saved : ps[0].name;
        setCurrentProject(project);
        await loadCollection(project);
      } catch {
        setError("Failed to load projects");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCollection]);

  const handleSwitchProject = useCallback(async (name: string) => {
    setCurrentProject(name);
    localStorage.setItem(LAST_PROJECT_KEY, name);
    setSelectedPath(null);
    setOverlayType(null);
    setCollection({ root: [] });
    setOrphans([]);
    setUndoStack([]);
    setUndoPath(null);

    await loadCollection(name);
  }, [loadCollection]);

  const handleCreateProject = useCallback(async (name: string) => {
    await createProject(name);
    const ps = await listProjects();
    setProjects(ps);
    await handleSwitchProject(name);
  }, [handleSwitchProject]);

  const handleRenameProject = useCallback(async (oldName: string, newName: string) => {
    const { new_name } = await renameProject(oldName, newName);
    const ps = await listProjects();
    setProjects(ps);
    setCurrentProject(new_name);
    localStorage.setItem(LAST_PROJECT_KEY, new_name);
  }, []);

  const handleDeleteProject = useCallback(async (name: string) => {
    await deleteProject(name);
    const ps = await listProjects();
    setProjects(ps);
    if (ps.length > 0) {
      await handleSwitchProject(ps[0].name);
    } else {
      setCurrentProject(null);
      setCollection({ root: [] });
      setOrphans([]);
      setOverlayType(null);
    }
  }, [handleSwitchProject]);

  const handleHighlight = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  const handleSelect = useCallback(async (path: string) => {
    if (!currentProject) return;
    const text = await fetchMarkdown(currentProject, path).catch(() => "# Error loading file");
    setSelectedPath(path);
    setEditorContent(text);
    setSavedContent(text);
    setOverlayType("editor");
  }, [currentProject]);

  const handleCloseOverlay = useCallback(() => {
    if (overlayType === "editor" && editorContentRef.current !== savedContentRef.current) {
      if (!window.confirm(`"${selectedPath}" has unsaved changes.\n\nClose without saving?`)) return;
    }
    setOverlayType(null);
  }, [overlayType, selectedPath]);

  const handleOpenYaml = useCallback(async () => {
    if (!currentProject) return;
    try {
      const y = await fetchCollectionYaml(currentProject);
      setYamlContent(y);
    } catch {}
    setOverlayType("yaml");
  }, [currentProject]);

  const handleOpenProjectMd = useCallback(async () => {
    if (!currentProject) return;
    try {
      const text = await fetchProjectMd(currentProject);
      setProjectMdContent(text);
    } catch {}
    setOverlayType("project-md");
  }, [currentProject]);

  const handleYamlSaved = useCallback(() => {
    if (currentProject) loadCollection(currentProject);
  }, [currentProject, loadCollection]);

  const handleFileSaved = useCallback((path: string, content: string) => {
    setSavedContent(content);
    const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (!h1) return;
    const updateTitle = (nodes: FileNode[]): FileNode[] =>
      nodes.map(n => n.path === path ? { ...n, title: h1 } : { ...n, children: updateTitle(n.children ?? []) });
    setCollection(prev => ({ root: updateTitle(prev.root) }));
  }, []);

  const handleCollectionChange = useCallback(async (c: CollectionStructure, changedPath?: string) => {
    if (!currentProject) return;
    setUndoStack(prev => [...prev.slice(-19), { snapshot: collection, movedPath: changedPath ?? null }]);
    setUndoPath(changedPath ?? null);
    setCollection(c);
    try {
      await saveCollection(currentProject, c);
      const o = await fetchOrphans(currentProject);
      setOrphans(o);
    } catch {}
  }, [currentProject, collection]);

  const handleUndo = useCallback(async () => {
    if (!currentProject || undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    const newStack = undoStack.slice(0, -1);
    setUndoStack(newStack);
    setUndoPath(newStack.length > 0 ? newStack[newStack.length - 1].movedPath : null);
    setCollection(entry.snapshot);
    try {
      await saveCollection(currentProject, prev);
      const o = await fetchOrphans(currentProject);
      setOrphans(o);
    } catch {}
  }, [currentProject, undoStack]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleUndo]);

  const handleCreateFile = useCallback(async (filename: string) => {
    if (!currentProject) return;
    await createFile(currentProject, filename);
    await loadCollection(currentProject);
    const initContent = `# ${filename.replace(/\.md$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase())}\n`;
    setSelectedPath(filename);
    setEditorContent(initContent);
    setSavedContent(initContent);
    setOverlayType("editor");
  }, [currentProject, loadCollection]);

  const handleDeleteFile = useCallback(async (path: string) => {
    if (!currentProject) return;
    await deleteFile(currentProject, path);
    if (selectedPath === path) {
      setOverlayType(null);
      setSelectedPath(null);
    }
    await loadCollection(currentProject);
  }, [currentProject, selectedPath, loadCollection]);

  const handleCreateChildFile = useCallback(async (parentPath: string, filename: string) => {
    if (!currentProject) return;
    await createFile(currentProject, filename);
    setCollection(prev => {
      const [withoutNew, newNode] = removeNode(
        [...prev.root, { path: filename, title: filename.replace(/\.md$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()), order: 0, children: [] }],
        filename
      );
      if (!newNode) return prev;
      return { root: reorder(insertAsChild(withoutNew, parentPath, newNode)) };
    });
    await loadCollection(currentProject);
    const initContent = `# ${filename.replace(/\.md$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase())}\n`;
    setSelectedPath(filename);
    setEditorContent(initContent);
    setSavedContent(initContent);
    setOverlayType("editor");
  }, [currentProject, loadCollection]);

  const handleRenameFile = useCallback(async (oldPath: string, newName: string) => {
    if (!currentProject) return;
    let name = newName.trim().replace(/ /g, "-");
    if (!name.endsWith(".md")) name += ".md";
    const { new_path } = await renameFile(currentProject, oldPath, name);
    if (selectedPath === oldPath) setSelectedPath(new_path);
    await loadCollection(currentProject);
  }, [currentProject, selectedPath, loadCollection]);

  const handleRefresh = useCallback(async () => {
    if (!currentProject) return;
    const ps = await listProjects();
    setProjects(ps);
    await loadCollection(currentProject);
  }, [currentProject, loadCollection]);

  const overlayOpen = overlayType !== null;

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#fff", color: "#999" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw", overflow: "hidden", background: "#ffffff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ width: "100%", height: "100%" }}>
        <Sidebar
          collection={collection}
          selectedPath={selectedPath}
          onSelect={handleHighlight}
          onOpen={handleSelect}
          onCollectionChange={handleCollectionChange}
          onCreateFile={handleCreateFile}
          onDeleteFile={handleDeleteFile}
          onRenameFile={handleRenameFile}
          onCreateChildFile={handleCreateChildFile}
          onOpenYaml={handleOpenYaml}
          yamlOpen={overlayType === "yaml"}
          orphans={orphans}
          currentProject={currentProject ?? ""}
          currentProjectTitle={projects.find(p => p.name === currentProject)?.title ?? currentProject ?? ""}
          projects={projects}
          onSwitchProject={handleSwitchProject}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          onOpenProjectMd={handleOpenProjectMd}
          onRefresh={handleRefresh}
          onUndo={handleUndo}
          canUndo={undoStack.length > 0}
          undoPath={undoPath}
        />
      </div>

      <div className={`overlay-panel${overlayOpen ? " overlay-panel--open" : ""}`}>
        <span className="overlay-close-btn" onClick={handleCloseOverlay}>✕</span>
        {overlayType === "editor" && selectedPath && (
          <MarkdownEditor
            key={selectedPath}
            path={selectedPath}
            content={editorContent}
            savedContent={savedContent}
            onContentChange={setEditorContent}
            viMode={viMode}
            onViModeChange={setViMode}
            onSaved={handleFileSaved}
            onSave={async (path, content) => {
              if (!currentProject) return;
              await saveMarkdown(currentProject, path, content);
            }}
          />
        )}
        {overlayType === "yaml" && (
          <YAMLEditor
            yamlContent={yamlContent}
            onYamlChange={setYamlContent}
            onSaved={handleYamlSaved}
            viMode={viMode}
            readOnly
          />
        )}
        {overlayType === "project-md" && currentProject && (
          <MarkdownEditor
            key={`project-md-${currentProject}`}
            path={`${currentProject}/project.md`}
            content={projectMdContent}
            savedContent={projectMdContent}
            onContentChange={setProjectMdContent}
            viMode={viMode}
            onViModeChange={setViMode}
            onSave={async (_path, content) => {
              await saveProjectMd(currentProject, content);
            }}
          />
        )}
      </div>

      {error && (
        <div style={{ position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", background: "#c00", color: "#fff", padding: "8px 16px", borderRadius: "4px", fontSize: "13px" }}>
          {error}
        </div>
      )}
    </div>
  );
}
