import { useEffect, useRef } from "react";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, ViewUpdate, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, historyKeymap, history } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import { vim } from "@replit/codemirror-vim";

interface Props {
  value: string;
  onChange: (val: string) => void;
  language?: "markdown" | "yaml";
  viMode?: boolean;
  dark?: boolean;
  readOnly?: boolean;
}

export default function CodeEditor({ value, onChange, language = "markdown", viMode = true, dark = true, readOnly = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions: Extension[] = [
      history(),
      lineNumbers(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      EditorView.theme({
        "&": { height: "100%", fontSize: "14px" },
        ".cm-scroller": { overflow: "auto", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
      }),
    ];

    if (viMode) extensions.push(vim());
    if (dark) extensions.push(oneDark);
    if (language === "markdown") extensions.push(markdown());
    else extensions.push(yaml());
    if (readOnly) extensions.push(EditorState.readOnly.of(true));

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, viMode, dark, readOnly]);

  // Sync external value changes without re-creating the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
