import { useState, useRef, useEffect, CSSProperties, KeyboardEvent } from "react";
import { ProjectInfo } from "../types";
import { GAP } from "./SidebarConstants";

export interface ProjectChipProps {
  currentProject: string;
  currentProjectTitle: string;
  projects: ProjectInfo[];
  titleMode: boolean;
  setTitleMode: (mode: boolean) => void;
  onSwitchProject: (name: string) => void;
  onCreateProject: (name: string) => Promise<void>;
  onArchiveProject: (name: string) => Promise<void>;
  onRenameProject: (oldName: string, newName: string) => Promise<void>;
  onOpenProjectMd: () => void;
  onRefresh: () => Promise<void>;
  onCreateFile: (filename: string) => Promise<void>;
  onOpenYaml: () => void;
  onImport: (format: "mkdocs" | "docusaurus") => void;
  onExport: (format: "mkdocs" | "docusaurus") => void;
}

export default function ProjectChip({ currentProject, currentProjectTitle, projects, titleMode, setTitleMode, onSwitchProject, onCreateProject, onArchiveProject, onRenameProject, onOpenProjectMd, onRefresh, onCreateFile, onOpenYaml, onImport, onExport }: ProjectChipProps) {
  const [renamingProject, setRenamingProject] = useState(false);
  const [renameProjectValue, setRenameProjectValue] = useState("");
  const [renameProjectError, setRenameProjectError] = useState("");
  const renameProjectInputRef = useRef<HTMLInputElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [projectSubmenuOpen, setProjectSubmenuOpen] = useState(false);
  const [importSubmenuOpen, setImportSubmenuOpen] = useState(false);
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const menuButtonRef = useRef<HTMLSpanElement>(null);

  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectError, setProjectError] = useState("");
  const projectInputRef = useRef<HTMLInputElement>(null);

  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [createError, setCreateError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const normalizeProjectName = (raw: string) =>
    raw.trim().replace(/\s+/g, "-").replace(/[/\\<>:"|?*\0]/g, "");

  const commitRenameProject = async () => {
    const name = normalizeProjectName(renameProjectValue);
    if (!name || name === "." || name === "..") { setRenameProjectError("Invalid name"); return; }
    if (name === currentProject) { setRenamingProject(false); return; }
    try {
      await onRenameProject(currentProject, name);
      setRenamingProject(false);
      setRenameProjectError("");
    } catch (e: any) { setRenameProjectError(e.message ?? "Error"); }
  };

  const cancelCreatingProject = () => { setCreatingProject(false); setNewProjectName(""); setProjectError(""); };
  const submitNewProject = async () => {
    const name = newProjectName.trim().replace(/\s+/g, "-").toLowerCase();
    if (!name) return;
    if (/[/\\<>:"|?*]/.test(name)) { setProjectError("Invalid name"); return; }
    try { await onCreateProject(name); cancelCreatingProject(); }
    catch (e: any) { setProjectError(e.message ?? "Error"); }
  };
  const handleProjectInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submitNewProject();
    if (e.key === "Escape") cancelCreatingProject();
  };

  const startCreating = () => { setCreatingFile(true); setNewFileName(""); setCreateError(""); setTimeout(() => inputRef.current?.focus(), 50); };
  const cancelCreating = () => { setCreatingFile(false); setNewFileName(""); setCreateError(""); };
  const submitNewFile = async () => {
    let name = newFileName.trim();
    if (!name) return;
    if (!name.endsWith(".md")) name += ".md";
    if (/[/\\<>:"|?*]/.test(name.replace(/\.md$/, ""))) { setCreateError("Invalid filename characters"); return; }
    try { await onCreateFile(name); cancelCreating(); }
    catch (e: any) { setCreateError(e.message ?? "Error creating file"); }
  };
  const handleInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submitNewFile();
    if (e.key === "Escape") cancelCreating();
  };


  const menuItem: CSSProperties = {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "7px 14px", fontSize: "13px", cursor: "pointer",
    color: "#1a1a1a", whiteSpace: "nowrap",
  };

  return (
    <div style={{ margin: `${GAP}px 0` }}>
      <div style={{
        display: "inline-flex", alignItems: "center",
        width: "2.5in",
        background: "#ff8c00", borderRadius: "6px",
        padding: "5px 8px 5px 12px", /* was 10px, then 7px */
        userSelect: "none",
      }}>
        {renamingProject ? (
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <input
              ref={renameProjectInputRef}
              value={renameProjectValue}
              autoFocus
              onChange={(e) => { setRenameProjectValue(e.target.value); setRenameProjectError(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.stopPropagation(); commitRenameProject(); }
                if (e.key === "Escape") { e.stopPropagation(); setRenamingProject(false); setRenameProjectError(""); }
              }}
              onBlur={commitRenameProject}
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#fff", border: "none", borderRadius: "4px", color: "#1a1a1a", fontSize: "13px", padding: "2px 5px", outline: "none", width: "100%" }}
            />
            {renameProjectError && <span style={{ color: "#fca", fontSize: "10px" }}>{renameProjectError}</span>}
          </div>
        ) : (
          <span
            style={{ fontSize: "15px", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, cursor: "text" }}
            title={titleMode ? currentProjectTitle : currentProject}
            onDoubleClick={() => { setRenameProjectValue(currentProject); setRenameProjectError(""); setRenamingProject(true); }}
          >
            {titleMode ? currentProjectTitle : currentProject}
          </span>
        )}
        <span ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
          <span
            ref={menuButtonRef}
            onClick={() => {
              if (!menuOpen && menuButtonRef.current) {
                const r = menuButtonRef.current.getBoundingClientRect();
                setMenuPos({ top: r.top + r.height / 2, left: r.left + r.width / 2 });
              }
              setMenuOpen(o => !o);
            }}
            title="Menu"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "4px", cursor: "pointer", fontSize: "18px", fontWeight: "bold", color: menuOpen ? "#fff" : "rgba(255,255,255,0.65)", background: menuOpen ? "rgba(255,255,255,0.2)" : "transparent" }}
            onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
          >⋮</span>

          {menuOpen && menuPos && (
            <div style={{
              position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 1000,
              background: "#fff", border: "1px solid #d0e8f7", borderRadius: "8px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "200px", overflow: "visible",
            }}>
              <div
                style={{ ...menuItem, justifyContent: "space-between", position: "relative" }}
                onMouseEnter={() => setProjectSubmenuOpen(true)}
                onMouseLeave={() => setProjectSubmenuOpen(false)}
              >
                <span>Projects</span>
                <span style={{ fontSize: "18px", color: "#999", lineHeight: 0 }}>▸</span>
                {projectSubmenuOpen && (
                  <div style={{
                    position: "absolute", left: "100%", top: 0, zIndex: 101,
                    background: "#fff", border: "1px solid #d0e8f7", borderRadius: "8px",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "160px", overflow: "hidden",
                  }}>
                    {projects.map(p => (
                      <div key={p.name}
                        style={{ ...menuItem, background: p.name === currentProject ? "#e8f4fd" : "transparent", color: p.name === currentProject ? "#1a6fa8" : "#1a1a1a", fontWeight: p.name === currentProject ? 600 : 400, justifyContent: "space-between", paddingRight: "8px" }}
                        onClick={() => { onSwitchProject(p.name); setMenuOpen(false); setProjectSubmenuOpen(false); }}
                        onMouseEnter={(e) => { if (p.name !== currentProject) (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                        onMouseLeave={(e) => { if (p.name !== currentProject) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                      >
                        <span>{p.name === currentProject && <span style={{ color: "#1a6fa8", fontSize: "11px", marginRight: "4px" }}>✓</span>}{titleMode ? p.title : p.name}</span>
                        <span
                          title="Archive project"
                          onClick={(e) => { e.stopPropagation(); onArchiveProject(p.name); setMenuOpen(false); setProjectSubmenuOpen(false); }}
                          style={{ color: "#555", fontSize: "18px", lineHeight: 1, padding: "2px 6px", borderRadius: "3px", cursor: "pointer", flexShrink: 0 }}
                          onMouseEnter={(e) => { e.stopPropagation(); (e.currentTarget as HTMLSpanElement).style.color = "#c0392b"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "#555"; }}
                        >🗑</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ ...menuItem }}
                onClick={() => { onOpenProjectMd(); setMenuOpen(false); }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >Info</div>

              <div style={{ ...menuItem }}
                onClick={() => { onOpenYaml(); setMenuOpen(false); }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >View YAML</div>

              <div
                style={{ ...menuItem, justifyContent: "space-between", position: "relative" }}
                onMouseEnter={() => setImportSubmenuOpen(true)}
                onMouseLeave={() => setImportSubmenuOpen(false)}
              >
                <span>Import from...</span>
                <span style={{ fontSize: "18px", color: "#999", lineHeight: 0 }}>▸</span>
                {importSubmenuOpen && (
                  <div style={{
                    position: "absolute", left: "100%", top: 0, zIndex: 101,
                    background: "#fff", border: "1px solid #d0e8f7", borderRadius: "8px",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "160px", overflow: "hidden",
                  }}>
                    {(["mkdocs", "docusaurus"] as const).map(fmt => (
                      <div key={fmt} style={{ ...menuItem }}
                        onClick={() => { onImport(fmt); setMenuOpen(false); setImportSubmenuOpen(false); }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                      >{fmt === "mkdocs" ? "MkDocs" : "Docusaurus"}</div>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{ ...menuItem, justifyContent: "space-between", position: "relative" }}
                onMouseEnter={() => setExportSubmenuOpen(true)}
                onMouseLeave={() => setExportSubmenuOpen(false)}
              >
                <span>Export to...</span>
                <span style={{ fontSize: "18px", color: "#999", lineHeight: 0 }}>▸</span>
                {exportSubmenuOpen && (
                  <div style={{
                    position: "absolute", left: "100%", top: 0, zIndex: 101,
                    background: "#fff", border: "1px solid #d0e8f7", borderRadius: "8px",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "160px", overflow: "hidden",
                  }}>
                    {(["mkdocs", "docusaurus"] as const).map(fmt => (
                      <div key={fmt} style={{ ...menuItem }}
                        onClick={() => { onExport(fmt); setMenuOpen(false); setExportSubmenuOpen(false); }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                      >{fmt === "mkdocs" ? "MkDocs" : "Docusaurus"}</div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ ...menuItem }}
                onClick={() => { onRefresh(); setMenuOpen(false); }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >Refresh project</div>

              <div style={{ height: "1px", background: "#e8f4fd", margin: "2px 0" }} />

              <div style={{ ...menuItem, color: "#1a6fa8" }}
                onClick={() => { setCreatingProject(true); setNewProjectName(""); setProjectError(""); setMenuOpen(false); setTimeout(() => projectInputRef.current?.focus(), 50); }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >＋ New project</div>

              <div style={{ ...menuItem, color: "#1a6fa8" }}
                onClick={() => { startCreating(); setMenuOpen(false); }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >＋ New file</div>

              <div style={{ height: "1px", background: "#e8f4fd", margin: "2px 0" }} />

              <div style={{ padding: "7px 14px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "#666" }}>Labels:</span>
                <div style={{ display: "flex", border: "1px solid #b3d9f7", borderRadius: "4px", overflow: "hidden" }}>
                  {([["Filename", false], ["Title", true]] as const).map(([label, mode]) => (
                    <button key={label} onClick={() => { setTitleMode(mode); setMenuOpen(false); }} style={{ padding: "3px 8px", border: "none", cursor: "pointer", fontSize: "12px", background: titleMode === mode ? "#1a6fa8" : "#e8f4fd", color: titleMode === mode ? "#fff" : "#1a6fa8" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </span>
      </div>

      {creatingProject && (
        <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            <input ref={projectInputRef} value={newProjectName} onChange={(e) => { setNewProjectName(e.target.value); setProjectError(""); }} onKeyDown={handleProjectInputKey} placeholder="project-name"
              style={{ padding: "4px 6px", background: "#fff", border: "1px solid #b3d9f7", borderRadius: "4px", color: "#1a1a1a", fontSize: "12px", outline: "none", width: "140px" }} />
            <button onClick={submitNewProject} style={{ padding: "4px 8px", background: "#3a7d44", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✓</button>
            <button onClick={cancelCreatingProject} style={{ padding: "4px 8px", background: "#aaa", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✕</button>
          </div>
          {projectError && <div style={{ color: "#f66", fontSize: "11px" }}>{projectError}</div>}
        </div>
      )}

      {creatingFile && (
        <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            <input ref={inputRef} value={newFileName} onChange={(e) => { setNewFileName(e.target.value); setCreateError(""); }} onKeyDown={handleInputKey} placeholder="filename.md"
              style={{ padding: "4px 6px", background: "#fff", border: "1px solid #b3d9f7", borderRadius: "4px", color: "#1a1a1a", fontSize: "12px", outline: "none", width: "140px" }} />
            <button onClick={submitNewFile} style={{ padding: "4px 8px", background: "#3a7d44", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✓</button>
            <button onClick={cancelCreating} style={{ padding: "4px 8px", background: "#aaa", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", cursor: "pointer" }}>✕</button>
          </div>
          {createError && <div style={{ color: "#f66", fontSize: "11px" }}>{createError}</div>}
        </div>
      )}
    </div>
  );
}
