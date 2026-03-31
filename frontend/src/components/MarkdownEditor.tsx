import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import CodeEditor from "./CodeEditor";
import { saveMarkdown } from "../api";

interface Props {
  path: string;
  content: string;
  savedContent?: string;
  onContentChange: (c: string) => void;
  viMode: boolean;
  onViModeChange: (v: boolean) => void;
  onSaved?: (path: string, content: string) => void;
}

export default function MarkdownEditor({ path, content, savedContent, onContentChange, viMode, onViModeChange, onSaved }: Props) {
  const [view, setView] = useState<"edit" | "preview" | "split">("split");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const savedContentRef = useRef(savedContent ?? content);
  const isDirty = content !== savedContentRef.current;

  // When a new file is loaded (path changes), reset dirty baseline
  useEffect(() => {
    savedContentRef.current = savedContent ?? content;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveMarkdown(path, content);
      savedContentRef.current = content;
      onSaved?.(path, content);
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) {
      setSaveMsg("Error saving");
    } finally {
      setSaving(false);
    }
  }, [path, content, onSaved]);

  // Ctrl+S / Cmd+S
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1a1a2e" }} onKeyDown={handleKeyDown}>
      {/* Toolbar — left | center | right three-column layout */}
      <div style={{ display: "flex", alignItems: "center", padding: "6px 12px", borderBottom: "1px solid #333", background: "#16213e", flexShrink: 0 }}>
        {/* Left: filename, vi, save */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
          <span style={{ color: "#888", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {path}
          </span>
          <label style={{ color: "#666", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", flexShrink: 0 }}>
            <input type="checkbox" checked={viMode} onChange={(e) => onViModeChange(e.target.checked)} />
            vi
          </label>
          <button onClick={handleSave} disabled={saving || !isDirty} style={{
            padding: "3px 12px", fontSize: "12px", border: "none", cursor: isDirty ? "pointer" : "default", borderRadius: "3px",
            background: isDirty ? "#3a7d44" : "#2a2a3a", color: isDirty ? "#fff" : "#555", flexShrink: 0,
            transition: "background 0.15s, color 0.15s",
          }}>
            {saving ? "..." : "Save"}
          </button>
          {saveMsg && <span style={{ color: "#5f9", fontSize: "12px", flexShrink: 0 }}>{saveMsg}</span>}
        </div>
        {/* Center: view buttons */}
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          {["edit", "split", "preview"].map((v) => (
            <button key={v} onClick={() => setView(v as any)} style={{
              padding: "3px 10px", fontSize: "12px", border: "none", cursor: "pointer", borderRadius: "3px",
              background: view === v ? "#6b8cff" : "#2d2d44", color: view === v ? "#fff" : "#aaa",
            }}>
              {v}
            </button>
          ))}
        </div>
        {/* Right: spacer to balance left */}
        <div style={{ flex: 1 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {(view === "edit" || view === "split") && (
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden", borderRight: view === "split" ? "1px solid #333" : "none" }}>
            <CodeEditor value={content} onChange={onContentChange} language="markdown" viMode={viMode} />
          </div>
        )}
        {(view === "preview" || view === "split") && (
          <div style={{
            flex: 1, minWidth: 0, overflowY: "auto", padding: "1.5rem 2rem",
            background: "#fafafa", color: "#1a1a1a", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            lineHeight: "1.7",
          }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {viMode && (
        <div style={{ padding: "3px 12px", background: "#111", color: "#555", fontSize: "11px", borderTop: "1px solid #222", flexShrink: 0 }}>
          vi mode — :w to save · i insert · Esc normal · gg/G to navigate
        </div>
      )}
    </div>
  );
}
