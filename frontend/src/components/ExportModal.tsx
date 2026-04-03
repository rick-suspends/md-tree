import { useState, useEffect } from "react";
import { exportToFormat } from "../api";

interface Props {
  format: "mkdocs" | "docusaurus";
  project: string;
  onClose: () => void;
}

const FORMAT_LABELS: Record<string, string> = {
  mkdocs: "MkDocs (mkdocs.yml)",
  docusaurus: "Docusaurus (sidebars.js)",
};

const FORMAT_FILES: Record<string, string> = {
  mkdocs: "mkdocs.yml",
  docusaurus: "sidebars.js",
};

export default function ExportModal({ format, project, onClose }: Props) {
  const [result, setResult] = useState<{ file_path: string; markdowns_path: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    exportToFormat(project, format)
      .then(setResult)
      .catch((e) => setError(e.message ?? "Export failed"));
  }, [project, format]);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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
          <span style={{ fontSize: "15px", fontWeight: 600, flex: 1 }}>Export to {FORMAT_LABELS[format]}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#888", padding: "0 4px" }}>×</button>
        </div>

        <div style={{ padding: "20px" }}>
          {!result && !error && (
            <div style={{ color: "#888", fontSize: "13px" }}>Exporting...</div>
          )}
          {error && (
            <div style={{ color: "#d32f2f", fontSize: "13px" }}>{error}</div>
          )}
          {result && (
            <div style={{ fontSize: "13px", color: "#333", lineHeight: "1.7" }}>
              <div style={{ marginBottom: "12px" }}>
                <strong>{FORMAT_FILES[format]}</strong> has been written to your project. Move these back to your {format === "mkdocs" ? "MkDocs" : "Docusaurus"} project:
              </div>
              <div style={{ background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: "4px", padding: "10px 12px", fontFamily: "monospace", fontSize: "12px" }}>
                <div style={{ marginBottom: "4px" }}>{result.file_path}</div>
                <div>{result.markdowns_path}</div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid #e0e0e0", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "6px 16px", fontSize: "13px", border: "1px solid #ccc", borderRadius: "4px", background: "#fff", cursor: "pointer" }}>Close</button>
        </div>
      </div>
    </div>
  );
}
