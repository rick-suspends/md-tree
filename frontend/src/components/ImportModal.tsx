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

const FORMAT_HINTS: Record<string, string> = {
  mkdocs: "Path to your MkDocs project root (must contain mkdocs.yml)",
  docusaurus: "Path to your Docusaurus project root (must contain sidebars.js)",
};

const FORMAT_PLACEHOLDERS: Record<string, string> = {
  mkdocs: "/home/user/my-mkdocs-project",
  docusaurus: "/home/user/my-docusaurus-project",
};

export default function ImportModal({ format, project, onClose, onImported }: Props) {
  const [directory, setDirectory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ warnings: string[]; node_count: number } | null>(null);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleImport = async () => {
    if (!directory.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await importFromFormat(project, format, { directory: directory.trim() });
      setResult(res);
      if (res.warnings.length === 0) {
        onImported();
        onClose();
      }
    } catch (e: any) {
      setError(e.message ?? "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    onImported();
    onClose();
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}
      onClick={onClose}
    >
      <div
        style={{ width: "520px", background: "#fff", borderRadius: "8px", boxShadow: "0 8px 40px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e0e0e0", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: "15px", fontWeight: 600, flex: 1 }}>Import from {FORMAT_LABELS[format]}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#888", padding: "0 4px" }}>×</button>
        </div>

        <div style={{ padding: "20px" }}>
          <div style={{ fontSize: "13px", color: "#555", marginBottom: "10px" }}>{FORMAT_HINTS[format]}</div>
          <input
            autoFocus
            value={directory}
            onChange={(e) => { setDirectory(e.target.value); setError(""); setResult(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
            placeholder={FORMAT_PLACEHOLDERS[format]}
            style={{
              width: "100%", fontFamily: "monospace", fontSize: "13px",
              padding: "8px 10px", border: "1px solid #ccc", borderRadius: "4px",
              outline: "none", boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: "12px", color: "#999", marginTop: "8px" }}>
            This replaces the current project's document hierarchy. The markdown files are read in place — nothing is copied.
          </div>
          {error && <div style={{ color: "#d32f2f", fontSize: "13px", marginTop: "10px" }}>{error}</div>}
          {result && result.warnings.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#e65100", marginBottom: "4px" }}>
                Imported {result.node_count} nodes with {result.warnings.length} warning(s):
              </div>
              <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "12px", color: "#888" }}>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid #e0e0e0", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "6px 16px", fontSize: "13px", border: "1px solid #ccc", borderRadius: "4px", background: "#fff", cursor: "pointer" }}>Cancel</button>
          {result && result.warnings.length > 0 ? (
            <button onClick={handleConfirm} style={{ padding: "6px 16px", fontSize: "13px", border: "none", borderRadius: "4px", background: "#e65100", color: "#fff", cursor: "pointer" }}>Accept with warnings</button>
          ) : (
            <button onClick={handleImport} disabled={loading || !directory.trim()} style={{ padding: "6px 16px", fontSize: "13px", border: "none", borderRadius: "4px", background: directory.trim() ? "#1a6fa8" : "#ccc", color: "#fff", cursor: directory.trim() ? "pointer" : "default" }}>
              {loading ? "Importing..." : "Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
