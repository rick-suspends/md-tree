import { useState, useCallback, KeyboardEvent } from "react";
import CodeEditor from "./CodeEditor";
import { saveCollectionYaml } from "../api";

interface Props {
  yamlContent: string;
  onYamlChange: (v: string) => void;
  onSaved: () => void;
  viMode: boolean;
  readOnly?: boolean;
}

export default function YAMLEditor({ yamlContent, onYamlChange, onSaved, viMode, readOnly = false }: Props) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMsg("");
    try {
      await saveCollectionYaml(yamlContent);
      setMsg("Saved ✓");
      onSaved();
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) {
      setMsg(e.message ?? "Error");
    } finally {
      setSaving(false);
    }
  }, [yamlContent, onSaved]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1a1a2e" }} onKeyDown={handleKeyDown}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderBottom: "1px solid #333", background: "#16213e", flexShrink: 0 }}>
        <span style={{ color: "#888", fontSize: "14px", flex: 1 }}>
          tree.yaml{readOnly ? " — read-only view" : " — hierarchy structure"}
        </span>
        {!readOnly && (
          <>
            <button onClick={handleSave} disabled={saving} style={{
              padding: "3px 12px", fontSize: "12px", border: "none", cursor: "pointer", borderRadius: "3px",
              background: "#7a4f9e", color: "#fff",
            }}>
              {saving ? "..." : "Save"}
            </button>
            {msg && <span style={{ fontSize: "12px", color: msg.startsWith("Saved") ? "#5f9" : "#f66" }}>{msg}</span>}
          </>
        )}
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <CodeEditor value={yamlContent} onChange={readOnly ? () => {} : onYamlChange} language="yaml" viMode={viMode} readOnly={readOnly} />
      </div>
      {viMode && (
        <div style={{ padding: "3px 12px", background: "#111", color: "#555", fontSize: "11px", borderTop: "1px solid #222", flexShrink: 0 }}>
          vi mode — :w to save
        </div>
      )}
    </div>
  );
}
