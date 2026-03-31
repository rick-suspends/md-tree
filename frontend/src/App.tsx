import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "./components/Sidebar";
import MarkdownEditor from "./components/MarkdownEditor";
import YAMLEditor from "./components/YAMLEditor";
import { fetchCollection, saveCollection, fetchMarkdown, fetchCollectionYaml, fetchOrphans, createFile, deleteFile, renameFile } from "./api";
import { CollectionStructure, FileInfo, FileNode } from "./types";

type OverlayType = "editor" | "yaml" | null;

export default function App() {
  const [collection, setCollection] = useState<CollectionStructure>({ root: [] });
  const [orphans, setOrphans] = useState<FileInfo[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [yamlContent, setYamlContent] = useState("");
  const [viMode, setViMode] = useState(true);
  const [overlayType, setOverlayType] = useState<OverlayType>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Stable ref so close guard can read current content without stale closure
  const editorContentRef = useRef(editorContent);
  const savedContentRef = useRef(savedContent);
  useEffect(() => { editorContentRef.current = editorContent; }, [editorContent]);
  useEffect(() => { savedContentRef.current = savedContent; }, [savedContent]);

  const loadCollection = useCallback(async () => {
    try {
      const [c, o] = await Promise.all([fetchCollection(), fetchOrphans()]);
      setCollection(c);
      setOrphans(o);
    } catch {
      setError("Failed to load collection");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCollection(); }, [loadCollection]);

  const handleHighlight = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  const handleSelect = useCallback(async (path: string) => {
    const text = await fetchMarkdown(path).catch(() => "# Error loading file");
    setSelectedPath(path);
    setEditorContent(text);
    setSavedContent(text);
    setOverlayType("editor");
  }, []);

  const handleCloseOverlay = useCallback(() => {
    if (overlayType === "editor" && editorContentRef.current !== savedContentRef.current) {
      if (!window.confirm(`"${selectedPath}" has unsaved changes.\n\nClose without saving?`)) return;
    }
    setOverlayType(null);
  }, [overlayType, selectedPath]);

  const handleOpenYaml = useCallback(async () => {
    try {
      const y = await fetchCollectionYaml();
      setYamlContent(y);
    } catch {}
    setOverlayType("yaml");
  }, []);

  const handleYamlSaved = useCallback(() => { loadCollection(); }, [loadCollection]);

  const handleFileSaved = useCallback((path: string, content: string) => {
    setSavedContent(content);
    const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (!h1) return;
    const updateTitle = (nodes: FileNode[]): FileNode[] =>
      nodes.map(n => n.path === path ? { ...n, title: h1 } : { ...n, children: updateTitle(n.children ?? []) });
    setCollection(prev => ({ root: updateTitle(prev.root) }));
  }, []);

  const handleCollectionChange = useCallback(async (c: CollectionStructure) => {
    setCollection(c);
    try {
      await saveCollection(c);
      const o = await fetchOrphans();
      setOrphans(o);
    } catch {}
  }, []);

  const handleCreateFile = useCallback(async (filename: string) => {
    await createFile(filename);
    await loadCollection();
    const initContent = `# ${filename.replace(/\.md$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase())}\n`;
    setSelectedPath(filename);
    setEditorContent(initContent);
    setSavedContent(initContent);
    setOverlayType("editor");
  }, [loadCollection]);

  const handleDeleteFile = useCallback(async (path: string) => {
    await deleteFile(path);
    if (selectedPath === path) {
      setOverlayType(null);
      setSelectedPath(null);
    }
    await loadCollection();
  }, [selectedPath, loadCollection]);

  const handleRenameFile = useCallback(async (oldPath: string, newName: string) => {
    let name = newName.trim().replace(/ /g, "-");
    if (!name.endsWith(".md")) name += ".md";
    const { new_path } = await renameFile(oldPath, name);
    if (selectedPath === oldPath) setSelectedPath(new_path);
    await loadCollection();
  }, [selectedPath, loadCollection]);

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
      {/* Full-width hierarchy tree */}
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
          onOpenYaml={handleOpenYaml}
          yamlOpen={overlayType === "yaml"}
          orphans={orphans}
        />
      </div>

      {/* Overlay panel */}
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
      </div>

      {error && (
        <div style={{ position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", background: "#c00", color: "#fff", padding: "8px 16px", borderRadius: "4px", fontSize: "13px" }}>
          {error}
        </div>
      )}
    </div>
  );
}
