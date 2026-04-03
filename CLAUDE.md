# CLAUDE.md — .mdTree

## Build & Run
```bash
./start.sh

# Or manually:
cd frontend && node node_modules/vite/bin/vite.js build
cd backend && source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8002
# NOTE: npm run build / .bin/vite shim silently exits 0 without building on this machine
```

## Rules
- **Always build after frontend changes** — FastAPI serves `frontend/dist/`; changes aren't live until rebuilt
- **Never add comments or docstrings to code that wasn't changed**
- **Never add features beyond what was asked**
- **Don't create new files to document changes** — edit existing files or nothing
- **File paths in the API are always relative to the project's `markdowns_dir`** — never absolute
- All file path inputs must be validated through `safe_path()` in `main.py` to prevent path traversal
- Spaces in filenames must be replaced with hyphens — enforced in `handleRenameFile` in `App.tsx`

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
```

- `path` — filename relative to `markdowns/` (e.g. `intro.md`, never a full path)
- `title` — display name; auto-synced from first `# H1` on save
- `children` — nested nodes (arbitrary depth)

### `project.yaml` (per-project config)
Optional file at `projects/{name}/project.yaml`. Currently supports one key:
- `markdowns_dir` — absolute path to an external markdown directory. If absent, defaults to `projects/{name}/markdowns/`. Set automatically when importing from a MkDocs or Docusaurus project directory. `get_markdowns_dir()` in `utils.py` reads this.

### Orphans (labeled "Unlinked" in UI)
Files in the project's `markdowns_dir` not referenced in `collection.yaml`. Shown at the bottom of the sidebar; can be dragged into the hierarchy, double-clicked, or moved with the left-arrow key. All code variables use `orphan*` naming — only the UI label says "Unlinked".

---

## Drag-Drop (critical non-obvious details)

**Single `DndContext` + single `SortableContext`** — no nested SortableContexts; they cause conflicting transforms.

- Nested items (`depth > 1`) have transforms suppressed — they ride along inside their parent's transformed div; independent transforms cause double-shift and items vanish
- Dragged item: `opacity: 0`, transform suppressed — shown only via `DragOverlay`
- `handleDragMove` throttled via `prevMoveRef` — only re-renders when `overId` or zone changes, not every pixel
- Custom collision detection: `deepestPointerCollision` uses `pointerWithin` + smallest-rect preference — fixes 3-level case where parent rect swallows children

**Drop zone logic** (`dragDeltaX` = total horizontal movement from drag start):
- `> 30px` → **nest** as first child (ghost chip + connector lines at depth+1)
- `< -30px` → **unnest** to parent level (spacer at parent indentation)
- otherwise → **sibling** reorder (spacer at same indentation)

Spacer IS the drop indicator — no colored lines. Ghost chip only shown for nest action.

**Orphan ordering:** `orphanSort: "recent" | "alpha" | "custom"` in Sidebar; drag-to-reorder OR up/down arrow keys auto-switch to `"custom"`. Resets on project switch.

**Orphan keyboard shortcuts:** up/down arrow keys reorder a single selected orphan (switches to `"custom"` sort). Left-arrow key moves all selected orphans to the hierarchy. Both handled by a document-level keydown listener in Sidebar — only fires when `selectedOrphans.size > 0` and no hierarchy chip is selected.

---

## Key Design Decisions

- **Optimistic title sync** — H1 parsed from content on save and sidebar title updated immediately without a server round-trip
- **`key={...}` on MarkdownEditor** — forces full remount on file/project switch, cleanly resetting CodeMirror state
- **`handleCreateChildFile`** fetches fresh collection → `removeNode` → `insertAsChild` → `saveCollection` → `setCollection` directly — does NOT call `loadCollection` (would overwrite the local insert)
- **`insertAsChild` prepends** — new children added at top of list, not appended; ghost chip reflects this. `insertAsLastChild` appends (used by ArrowRight keyboard nesting)
- **Menu positioning**: Both ProjectChip and SortableItem menus use `position: fixed` + `getBoundingClientRect()` measured on click — escapes `overflow: hidden` clipping in the sidebar. Coordinates stored in `menuPos` state.
- **Menu close**: `document.addEventListener("mousedown")` in `useEffect` — no backdrop, so clicking another button closes the menu AND triggers that button in one click
- **Backend orphan sort**: `get_all_md_files` returns files by `st_mtime` descending — powers "Recent" mode
- **`minWidth: 0`** on split panes — prevents flex children from overflowing
- **`lineWrapping`** on CodeMirror — prevents horizontal overflow into preview pane
- **Overlay width**: `1119px` fixed; both editor and preview panes `flex: 0 0 559px`
- **Rename from editor toolbar**: double-click the filename in the editor top bar triggers inline rename (same `handleRenameFile` as sidebar chips). `onRename` prop not passed to project-md editor (path is fixed).
- **Import/Export adapters**: `backend/converters.py` has pure functions for MkDocs/Docusaurus ↔ collection.yaml conversion. Category-only nodes (no file) are flattened — children promoted to parent level. Import now accepts a `directory` path — reads `mkdocs.yml` or `sidebars.js` from disk and sets `markdowns_dir` on the project. Export generates config text for clipboard.
- **OrphanPane**: extracted from Sidebar into its own component. Drag-coupled state (`selectedOrphans`, `orphanOrder`, `orphanSort`, refs) stays in Sidebar; file creation and expand/collapse state lives in OrphanPane.
- **D-pad arrow buttons**: in left 1-inch margin, vertically aligned with orphan pane arrow via runtime `getBoundingClientRect()`. Appears when a hierarchy item is selected. Orphan chips use up/down/left arrow keys — handled via document-level keydown listener in Sidebar.
- **Mutual deselection**: selecting a hierarchy chip clears orphan selection (`handleHierarchySelect` wraps `onSelect`); selecting an orphan chip clears hierarchy selection via `onSelect(null)` in `handleOrphanSelect`.
- **YAML viewer**: read-only — opened from project chip menu "View YAML". Not editable.
- **Archive project**: trash icon on each project in the fly-out submenu. Moves `projects/{name}/` to `projects/_archive/{name}/` (timestamp suffix if name collision). `list_projects()` skips dirs starting with `_`. Real deletion is by hand in the filesystem.

---

## Known Issues / Dead Code

- `HierarchyView.tsx` — unused legacy component, safe to ignore
- `projects/` directory tracked in git (deliberate, for development testing)

---

## TODO

1. ~~**Import/Export**~~ — done: MkDocs and Docusaurus import by directory path; export to clipboard
2. ~~**Keyboard-only reorder**~~ — done: left/right nest/unnest, up/down cross-level movement; left-arrow moves orphans to hierarchy
3. ~~**Search/filter**~~ — dropped; low value for a hierarchy-focused tool
4. **Documentation project** — self-hosted docs as an mdTree project; users can read it in the app
