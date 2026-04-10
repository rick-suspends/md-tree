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
- **File paths in the API are always relative to the project's `markdowns/` directory** — never absolute
- All file path inputs must be validated through `safe_path()` in `main.py` to prevent path traversal
- Spaces in filenames must be replaced with hyphens — enforced in `handleRenameFile` in `App.tsx`

---

## Data Model

### `tree.yaml`
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

### Project directory layout
```
projects/{name}/
  tree.yaml       # hierarchy
  project.md            # project title/notes
  markdowns/            # all markdown files
  mkdocs.yml            # optional: drop here before Import > MkDocs
  sidebars.js           # optional: drop here before Import > Docusaurus
```
`markdowns_dir` / `project.yaml` are gone — projects always use their local `markdowns/` folder.

### Orphans (labeled "Unlinked" in UI)
Files in `markdowns/` not referenced in `tree.yaml`. Shown in the orphan pane; can be dragged into the hierarchy, double-clicked, or moved with the left-arrow key. All code variables use `orphan*` naming — only the UI label says "Unlinked". The Unlinked chip is always visible; triangle is gray when no orphans, orange when there are.

### File archive
"Delete" from any file chip three-dot menu archives rather than truly deletes. Backend endpoint `POST /api/projects/{name}/archive-markdown/{file_path:path}` moves the file to `markdowns/_archive/` (timestamp suffix on name collision) and removes it from `tree.yaml`. `get_all_md_files` in `utils.py` skips any path under `_archive/`. No confirm dialog — archives immediately, shows `"${path}" is now archived` alert after.

---

## Drag-Drop (critical non-obvious details)

**Single `DndContext` + single `SortableContext`** — no nested SortableContexts; they cause conflicting transforms.

- Nested items (`depth > 1`) have transforms suppressed — they ride along inside their parent's transformed div; independent transforms cause double-shift and items vanish
- Dragged item: `opacity: 0`, transform suppressed — shown only via `DragOverlay`
- `handleDragMove` throttled via `prevMoveRef` — only re-renders when `overId` or zone changes, not every pixel
- Custom collision detection: `deepestPointerCollision` uses `pointerWithin` + smallest-rect preference — fixes 3-level case where parent rect swallows children

**Drop zone logic** — based on pointer position relative to the target chip, not drag delta:
- Pointer over **right half** of target chip → **nest** as first child (green border + ghost chip at depth+1)
- Pointer over **left half** of target chip → **sibling** reorder (spacer at same indentation)

`pointerZoneDeltaX()` in Sidebar computes this from `activatorEvent.clientX + delta.x` vs `over.rect` midpoint. Used in both `handleDragMove` (visual feedback) and `handleDragEnd` (actual drop). Spacer IS the drop indicator — no colored lines. Ghost chip only shown for nest action.

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
- **Import/Export adapters**: `backend/converters.py` has pure functions for MkDocs/Docusaurus ↔ tree.yaml conversion. Category-only nodes (no file) are flattened — children promoted to parent level. Sections with a page (bare path or `{title: path}` as first child) are imported as proper nested nodes. Import reads config file from `projects/{name}/` root (no dialog for MkDocs; Docusaurus prompts for filename only if `sidebars.js`/`sidebars.ts` not found). Export writes the file to `projects/{name}/` and shows the path — user copies it back to their MkDocs/Docusaurus project.
- **OrphanPane**: extracted from Sidebar into its own component. Drag-coupled state (`selectedOrphans`, `orphanOrder`, `orphanSort`, refs) stays in Sidebar; file creation and expand/collapse state lives in OrphanPane.
- **D-pad arrow buttons**: in left 1-inch margin, vertically aligned with orphan pane arrow via runtime `getBoundingClientRect()`. Appears when a hierarchy item is selected. Orphan chips use up/down/left arrow keys — handled via document-level keydown listener in Sidebar.
- **Mutual deselection**: selecting a hierarchy chip clears orphan selection (`handleHierarchySelect` wraps `onSelect`); selecting an orphan chip clears hierarchy selection via `onSelect(null)` in `handleOrphanSelect`.
- **YAML viewer**: read-only — opened from project chip menu "View YAML". Not editable.
- **Archive project**: trash icon on each project in the fly-out submenu. Moves `projects/{name}/` to `projects/_archive/{name}/` (timestamp suffix if name collision). `list_projects()` skips dirs starting with `_`. Real deletion is by hand in the filesystem.
- **Top bar**: 50px fixed height, `#1a6fa8` background, `padding: 0 1in` (matches sidebar margins). `.mdTree` bold white with orange "T" on left; "eau de markdown" italic white 13px on right. App root is now `display: flex, flexDirection: column`; sidebar takes remaining height via `flex: 1, minHeight: 0`.
- **Unlinked chip**: OrphanPane header is now a chip matching ProjectChip structure — blue (`#1a6fa8`), `borderRadius: 6px`, same padding/font/⋮ button. Clicking the label toggles expand/collapse (no chevron). Three-dot menu: Sort by (submenu: Recent / A→Z / Custom) → divider → ＋ New file. Sort controls and Add File button removed from the orphan list area. Chip positioned parallel to ProjectChip with identical top spacing (`paddingTop: 8px` on pane + `marginTop: ${GAP}px` on chip wrapper).
- **Hierarchy chip text color**: `#555` (was `#1a1a1a`) — matches orphan chip text weight/color.
- **OrphanItem ⋮ button**: now `position: absolute, right: 0, top: 0, bottom: 0, width: 36px` — matches SortableItem hit area exactly.

---

## Known Issues / Dead Code

- `HierarchyView.tsx` — unused legacy component, safe to ignore
- `projects/` directory tracked in git (deliberate, for development testing)

---

## Deployment

### GitHub Pages (docs)
- Workflow: `.github/workflows/docs.yml` — triggers on push to main when docs or mkdocs.yml change
- Copies `projects/documentation/markdowns/*.md` into `docs/`, then runs `mkdocs build`
- `docs/index.md` redirects to `/introduction/`
- Theme: Material for MkDocs, custom blue/orange palette via `docs/stylesheets/extra.css`
- Live at: https://rick-suspends.github.io/md-tree/

### Lightsail Container (demo)
- `Dockerfile`: multi-stage — Node builds frontend with `VITE_DEMO_MODE=1`, Python runtime with cron
- `VITE_DEMO_MODE=1` baked at build time; hides Import/Export menu items in `ProjectChip.tsx`
- `entrypoint.sh`: starts cron daemon (midnight project reset) then uvicorn on port 8002
- Pristine docs copy at `/app/projects-pristine/`; cron resets `/app/projects/documentation/` nightly
- Health check endpoint: `GET /health` → `{"status": "ok"}`
- Docker Hub image: `richardmallery/md-tree-demo:latest`
- Protocol: HTTP on 8002; Lightsail terminates HTTPS

### Docs update workflow
1. Edit docs in mdTree locally
2. Export to MkDocs if nav changed (⋮ → Export to... → MkDocs)
3. `git push` → GitHub Actions rebuilds Pages automatically
4. `docker build -t richardmallery/md-tree-demo . && docker push richardmallery/md-tree-demo:latest` → redeploy on Lightsail

---

## TODO

1. ~~**Import/Export**~~ — done
2. ~~**Keyboard-only reorder**~~ — done
3. ~~**Search/filter**~~ — dropped; low value for a hierarchy-focused tool
4. ~~**Documentation project**~~ — done: 8-page docs at `projects/documentation/`, published to GitHub Pages
5. ~~**GitHub Pages deployment**~~ — done: MkDocs Material, GitHub Actions workflow
6. ~~**Lightsail container demo**~~ — done: Docker image with demo mode, daily reset
7. ~~**Standalone Python executable**~~ — done
8. ~~**Docusaurus sidebar editor plugin**~~ — done: published as `docusaurus-plugin-sidebar-editor` at `rick-does/docusaurus-sidebar-editor`
9. ~~**Server mode for headless testing**~~ — done: `--server` / `--no-window` flag in `launcher.py` skips pywebview on any platform
10. ~~**GitHub Actions CI**~~ — done: `.github/workflows/ci.yml` matrix over ubuntu/macos/windows; polls `/health`, asserts `/api/projects`

## Strategic Notes

- The web app is kept — required for the Lightsail demo and for SSH/headless Linux use
- 2.0 features are deferred until portfolio breadth is established — the tree editing feature is the differentiator, not a full MD editor
- See `rick-does/portfolio` for overall portfolio strategy and priorities

---

## Version 2.0 Ideas — Full-Featured MD Editor/Viewer/Hierarchy Manager

The current tool leans into hierarchy management. A 2.0 would expand into a full markdown workspace.

**High value:**
- **Full-text search** — search across all files in the current project
- **Frontmatter display** — read YAML frontmatter, show tags/metadata in sidebar or panel
- **Internal link validation** — detect broken `[links](file.md)`, highlight after rename
- **Mermaid diagram rendering** — in the preview pane; very common in technical docs

**Medium value:**
- **Whole-collection export to single HTML/PDF** — render full doc set as one document
- **Word count / reading time** — per file, shown in sidebar chips

**Lower priority:**
- Dark mode
- Templates for new files
- Image management
