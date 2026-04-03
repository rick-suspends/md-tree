import { useState, useEffect, useCallback } from "react";
import YAMLEditor from "./YAMLEditor";
import { fetchCollectionYaml } from "../api";

interface Props {
  viMode: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function YAMLModal({ viMode, onClose, onSaved }: Props) {
  const [yamlContent, setYamlContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCollectionYaml()
      .then(setYamlContent)
      .finally(() => setLoading(false));
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSaved = useCallback(() => {
    onSaved();
    onClose();
  }, [onSaved, onClose]);

  return (
    /* Backdrop */
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        style={{
          width: "80vw",
          height: "80vh",
          background: "#1a1a2e",
          borderRadius: "8px",
          border: "1px solid #3a3a5a",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid #333",
          background: "#101020",
          flexShrink: 0,
          gap: "10px",
        }}>
          <span style={{ color: "#ccc", fontSize: "13px", flex: 1, fontWeight: 500 }}>
            Edit YAML — tree.yaml
          </span>
          <span style={{ color: "#666", fontSize: "11px" }}>Ctrl+S to save · Esc to close</span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              fontSize: "18px",
              cursor: "pointer",
              lineHeight: 1,
              padding: "0 4px",
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Editor body */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {loading ? (
            <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#666" }}>
              Loading...
            </div>
          ) : (
            <YAMLEditor
              yamlContent={yamlContent}
              onYamlChange={setYamlContent}
              onSaved={handleSaved}
              viMode={viMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}
