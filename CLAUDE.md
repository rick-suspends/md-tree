# CLAUDE.md — .mdTree

## Working in This Codebase

### Build & Run
```bash
# Start the app (one command)
./start.sh

# Or manually:
cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8002

# After any frontend change, rebuild:
cd frontend && npm run build
```

### Rules
- **Always build after frontend changes** — FastAPI serves the built `frontend/dist/`; changes are not live until rebuilt
- **Never add comments or docstrings to code that wasn't changed**
- **Never add features beyond what was asked**
- **Don't create new files to document changes** — edit existing files or nothing
- **File paths in the API are always relative to `markdowns/`** — never absolute paths
- **After editing `main.py` or other backend files**, the uvicorn `--reload` flag picks up changes automatically
- Spaces in filenames must be replaced with hyphens — enforced in `handleRenameFile` in `App.tsx`
- All file path inputs must be validated through `safe_path()` in `main.py` to prevent path traversal

---

## What This Is

**.mdTree** (`md-tree` as the repo/package identifier) is a local web-based markdown editor whose
primary feature is a **visual drag-and-drop hierarchy editor** for organizing `.md` files into a
tree structure. The tree is stored in `collection.yaml` and is designed as a sidebar-driven table
of contents for documentation sets — particularly suited for MkDocs `nav:` management, but
intentionally tool-agnostic.

Built as a **portfolio/vibe-coding demonstration** of full-stack development with AI assistance.

---

## Problem It Solves

Managing a large documentation set's navigation structure by hand-editing YAML is painful:
- Reordering requires careful indentation edits
- Nesting/unnesting is error-prone
- Non-technical writers cannot do it at all

.mdTree makes the nav tree **visual and tactile**: drag to reorder, drag left/right to
nest/unnest, rename in-place, create and delete files — all reflected immediately in
`collection.yaml`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, uvicorn (port 8002) |
| Frontend | React 18, TypeScript, Vite 6 |
| Editor | CodeMirror 6 with `@replit/codemirror-vim` |
| Drag-drop | `@dnd-kit/core`, `@dnd-kit/sortable` |
| Markdown preview | `react-markdown`, `remark-gfm`, `rehype-highlight` |

---

## Project Structure

```
md-tree/
├── collection.yaml          # The hierarchy/nav tree (source of truth)
├── markdowns/               # All .md files live here (flat directory)
├── start.sh                 # Start script: activates venv + runs uvicorn
├── backend/
│   ├── main.py              # FastAPI app + all API endpoints
│   ├── models.py            # Pydantic models: FileNode, CollectionStructure
│   ├── utils.py             # File I/O, collection load/save, orphan detection
│   └── .venv/               # Python virtual environment
└── frontend/
    └── src/
        ├── App.tsx           # Root: tab state, collection state, all handlers
        ├── api.ts            # All fetch calls to backend API
        ├── types.ts          # FileNode, CollectionStructure, FileInfo types
        ├── treeHelpers.ts    # Pure tree manipulation: insert, remove, reorder, depth
        └── components/
            ├── Sidebar.tsx        # Drag-drop tree + orphans section
            ├── MarkdownEditor.tsx # Split/edit/preview editor with save
            ├── CodeEditor.tsx     # CodeMirror 6 wrapper (markdown + YAML)
            ├── YAMLEditor.tsx     # Full-screen YAML editor for collection.yaml
            └── YAMLModal.tsx      # (unused/legacy)
```

The frontend is built to `frontend/dist/` and served as static files by FastAPI, so there is
**one process, one port** in production.

---

## Data Model

### `collection.yaml`
```yaml
root:
  - path: intro.md
    title: Introduction
    order: 0
    children:
      - path: overview.md
        title: Overview
        order: 0
        children: []
  - path: guide.md
    title: Guide
    order: 1
    children: []
```

- `path` — filename relative to `markdowns/` (e.g. `intro.md`, never a full path)
- `title` — display name; auto-synced from the first `# H1` in the file on save
- `order` — integer; used when re-syncing from disk
- `children` — nested nodes (arbitrary depth)

### Orphans
Files present in `./markdowns/` but **not** in `collection.yaml` are "orphans". They appear at the
bottom of the sidebar under a `⚠ Orphans` section with a drag handle and a `+` button to add them
to the root of the hierarchy.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/files` | List all `.md` files on disk |
| GET | `/api/markdown/{path}` | Get raw markdown content |
| POST | `/api/markdown/{path}` | Create new file (also adds to collection) |
| PUT | `/api/markdown/{path}` | Save markdown content |
| DELETE | `/api/markdown/{path}` | Delete file + remove from collection |
| POST | `/api/rename/{path}` | Rename file on disk + update all collection refs |
| GET | `/api/collection` | Get `collection.yaml` as structured JSON |
| PUT | `/api/collection` | Save collection structure |
| GET | `/api/collection/yaml` | Get `collection.yaml` as raw YAML string |
| PUT | `/api/collection/yaml` | Save raw YAML string to `collection.yaml` |
| GET | `/api/orphans` | List files not referenced in collection |

All file paths are validated against `MARKDOWNS_DIR` to prevent path traversal.

---

## Frontend Architecture

### State (App.tsx)
- `tabs: Tab[]` — open editor tabs; each tab: `{ path, content, savedContent }`
- `activeTabPath: string | null` — which tab is focused
- `collection: CollectionStructure` — the full nav tree (live state)
- `orphans: FileInfo[]` — files on disk not in collection
- `centerView: "editor" | "yaml" | null` — what's shown in the main area
- `viMode: boolean` — CodeMirror vim keybindings toggle

### Tab Persistence
Open tabs are persisted to `localStorage` under key `md-editor-tabs` as
`{ paths: string[], activePath: string | null }`. On startup, those files are fetched and
restored in order.

### Sidebar (Sidebar.tsx)
Single `DndContext` + single `SortableContext` containing all nodes (tree + orphans combined)
to allow drag between sections.

Drop indicator logic:
- `dragDeltaX > 30` → **nest** as child (green outline)
- `dragDeltaX < -30` → **unnest** to parent level (orange line)
- otherwise → **sibling** reorder (blue line)

All nodes start **expanded** by default. A `useEffect` syncs the `expanded` Set when the
collection changes (e.g. after rename, the new path is added to expanded automatically).

Sidebar width is computed as:
```
Math.max(240, depthWidth, labelWidth)
```
where `labelWidth = depth * 16 + charCount * 7.5 + 80` for the longest label.

### Rename (in-place, three locations)
Double-click to rename works in:
1. **Sidebar** — `SortableItem` label
2. **Tab bar** — tab label
3. **Editor toolbar** — filename span

All go through `handleRenameFile` in App.tsx which:
1. Normalizes: trims whitespace, replaces spaces with hyphens, appends `.md` if missing
2. Calls `POST /api/rename/{oldPath}` with `{ new_path }`
3. Updates path in all open tabs
4. Reloads collection (which re-syncs expanded state in sidebar)

### Close Tab Guard
Closing a tab with `content !== savedContent` shows `window.confirm` before closing.

---

## Key Design Decisions

- **Single port** — FastAPI serves the built frontend; no separate dev server in production
- **Flat file storage** — all `.md` files live directly in `markdowns/`; hierarchy is only in YAML
- **Optimistic title sync** — on save, H1 is parsed from content and the sidebar title is updated
  immediately without waiting for a server round-trip
- **`key={activeTab.path}` on MarkdownEditor** — forces full remount when switching tabs,
  cleanly resetting CodeMirror state
- **`lineWrapping`** on CodeMirror — prevents horizontal overflow into the preview pane in split mode
- **`minWidth: 0`** on split panes — prevents flex children from overflowing their bounds

---

## Development Workflow

```bash
# Start backend (from project root)
cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8002

# Build frontend (from project root)
cd frontend && npm run build

# Or use the start script
./start.sh
```

The backend auto-reloads on Python file changes. Frontend requires a rebuild (`npm run build`)
to see changes, or run `npm run dev` separately on a different port during development.

---

## Known Issues / Dead Code

- `HierarchyView.tsx` and `YAMLModal.tsx` — unused legacy components, safe to ignore
- Duplicate `return` statement at the end of `rename_file()` in `main.py` — dead code, harmless
- No authentication — intended for local single-user use only
- Tab labels in the tab bar are unconstrained width — very long filenames push other tabs off-screen
