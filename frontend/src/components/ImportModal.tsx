import { useState, useEffect } from "react";
import { importFromFormat } from "../api";

interface Props {
  format: "mkdocs" | "docusaurus";
  project: string;
  onClose: () => void;
  onImported: () => void;
}

const FORMAT_LABELS: Record<string, string> = {
  mkdocs: "MkDocs",
  docusaurus: "Docusaurus",
};

export default function ImportModal({ format, project, onClose, onImported }: Props) {
  const [phase, setPhase] = useState<"loading" | "filename_prompt" | "warnings" | "error">("loading");
  const [filename, setFilename] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [nodeCount, setNodeCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    runImport();
  }, []);

  const runImport = async (fname?: string) => {
    setPhase("loading");
    setError("");
    try {
      const res = await importFromFormat(project, format, fname);
      if (res.warnings.length === 0) {
        onImported();
        onClose();
      } else {
        setWarnings(res.warnings);
        setNodeCount(res.node_count);
        setPhase("warnings");
      }
    } catch (e: any) {
      if (e.message === "sidebar_not_found") {
        setPhase("filename_prompt");
      } else {
        setError(e.message ?? "Import failed");
        setPhase("error");
      }
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}
      onClick={onClose}
    >
      <div
        style={{ width: "480px", background: "#fff", borderRadius: "8px", boxShadow: "0 8px 40px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e0e0e0", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: "15px", fontWeight: 600, flex: 1 }}>Import from {FORMAT_LABELS[format]}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#888", padding: "0 4px" }}>×</button>
        </div>

        <div style={{ padding: "20px" }}>
          {phase === "loading" && (
            <div style={{ color: "#888", fontSize: "13px" }}>Importing...</div>
          )}

          {phase === "filename_prompt" && (
            <>
              <div style={{ fontSize: "13px", color: "#555", marginBottom: "10px" }}>
                No <code>sidebars.js</code> or <code>sidebars.ts</code> found in the project root. Enter the sidebar filename:
              </div>
              <input
                autoFocus
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && filename.trim()) runImport(filename.trim()); }}
                placeholder="sidebars.js"
                style={{ width: "100%", fontFamily: "monospace", fontSize: "13px", padding: "8px 10px", border: "1px solid #ccc", borderRadius: "4px", outline: "none", boxSizing: "border-box" }}
              />
            </>
          )}

          {phase === "warnings" && (
            <>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#e65100", marginBottom: "8px" }}>
                Imported {nodeCount} nodes with {warnings.length} warning(s):
              </div>
              <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "12px", color: "#888" }}>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </>
          )}

          {phase === "error" && (
            <div style={{ color: "#d32f2f", fontSize: "13px" }}>{error}</div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid #e0e0e0", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "6px 16px", fontSize: "13px", border: "1px solid #ccc", borderRadius: "4px", background: "#fff", cursor: "pointer" }}>
            {phase === "warnings" ? "Close" : "Cancel"}
          </button>
          {phase === "filename_prompt" && (
            <button
              onClick={() => filename.trim() && runImport(filename.trim())}
              disabled={!filename.trim()}
              style={{ padding: "6px 16px", fontSize: "13px", border: "none", borderRadius: "4px", background: filename.trim() ? "#1a6fa8" : "#ccc", color: "#fff", cursor: filename.trim() ? "pointer" : "default" }}
            >
              Import
            </button>
          )}
          {phase === "warnings" && (
            <button onClick={() => { onImported(); onClose(); }} style={{ padding: "6px 16px", fontSize: "13px", border: "none", borderRadius: "4px", background: "#e65100", color: "#fff", cursor: "pointer" }}>
              Accept with warnings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
