import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from models import CollectionStructure, FileContent, ReorderRequest
from utils import (
    MARKDOWNS_DIR,
    ensure_markdowns_dir,
    get_all_md_files,
    get_orphans,
    load_collection,
    save_collection,
    sync_collection_with_files,
    md_to_html,
)

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

app = FastAPI(title="Markdown Collection Editor", version="1.0.0")

# CORS only needed in dev when frontend runs on a separate port
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def safe_path(rel_path: str) -> Path:
    """Resolve and validate that the path stays inside MARKDOWNS_DIR."""
    full = (MARKDOWNS_DIR / rel_path).resolve()
    if not str(full).startswith(str(MARKDOWNS_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Path traversal detected")
    return full


# ── Files ─────────────────────────────────────────────────────────────────────

@app.get("/api/files")
def list_files():
    """Return flat list of all markdown files with metadata."""
    ensure_markdowns_dir()
    return get_all_md_files()


@app.get("/api/markdown/{file_path:path}")
def get_markdown(file_path: str):
    """Return raw markdown content of a file."""
    path = safe_path(file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return {"path": file_path, "content": path.read_text(encoding="utf-8")}


@app.post("/api/markdown/{file_path:path}")
def create_markdown(file_path: str):
    """Create a new empty markdown file and add it to the collection."""
    path = safe_path(file_path)
    if path.exists():
        raise HTTPException(status_code=409, detail="File already exists")
    path.parent.mkdir(parents=True, exist_ok=True)
    title = path.stem.replace("-", " ").replace("_", " ").title()
    path.write_text(f"# {title}\n", encoding="utf-8")
    # Add to collection
    collection = load_collection()
    from models import FileNode
    collection.root.append(FileNode(path=file_path, title=title, order=len(collection.root), children=[]))
    save_collection(collection)
    return {"status": "ok", "path": file_path, "title": title}


@app.delete("/api/markdown/{file_path:path}")
def delete_markdown(file_path: str):
    """Delete a markdown file and remove it from the collection."""
    path = safe_path(file_path)
    if path.exists():
        path.unlink()
    # Remove from collection
    collection = load_collection()
    from utils import flatten_collection
    def remove_from_nodes(nodes):
        return [
            {**n.__dict__, "children": remove_from_nodes(n.children or [])}
            for n in nodes if n.path != file_path
        ]
    from models import FileNode
    def remove_recursive(nodes):
        result = []
        for n in nodes:
            if n.path == file_path:
                continue
            n.children = remove_recursive(n.children or [])
            result.append(n)
        return result
    collection.root = remove_recursive(collection.root)
    save_collection(collection)
    return {"status": "ok"}


@app.put("/api/markdown/{file_path:path}")
def save_markdown(file_path: str, body: FileContent):
    """Save updated markdown content to a file."""
    path = safe_path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.content, encoding="utf-8")


@app.post("/api/rename/{file_path:path}")
def rename_file(file_path: str, body: dict):
    """Rename a file and update all references in collection.yaml."""
    new_path = body.get("new_path", "").strip()
    if not new_path:
        raise HTTPException(status_code=400, detail="new_path is required")
    if not new_path.endswith(".md"):
        new_path += ".md"

    old = safe_path(file_path)
    new = safe_path(new_path)
    if not old.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if new.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists")

    old.rename(new)

    # Update path in collection.yaml (keep title/children intact)
    collection = load_collection()
    def rename_in_nodes(nodes):
        for n in nodes:
            if n.path == file_path:
                n.path = new_path
            rename_in_nodes(n.children or [])
    rename_in_nodes(collection.root)
    save_collection(collection)
    return {"status": "ok", "old_path": file_path, "new_path": new_path}
    return {"status": "ok", "path": file_path}


@app.get("/api/html/{file_path:path}", response_class=HTMLResponse)
def get_html(file_path: str):
    """Convert a markdown file to HTML and return it."""
    path = safe_path(file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    content = path.read_text(encoding="utf-8")
    html = md_to_html(content)
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           max-width: 860px; margin: 2rem auto; padding: 0 1rem;
           line-height: 1.7; color: #1a1a1a; }}
    pre {{ background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; }}
    code {{ background: #f4f4f4; padding: 0.1em 0.3em; border-radius: 3px; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border: 1px solid #ddd; padding: 0.5rem 1rem; }}
  </style>
</head>
<body>{html}</body>
</html>"""


# ── Collection ─────────────────────────────────────────────────────────────────

@app.get("/api/collection")
def get_collection():
    """Return the hierarchical collection structure, synced with disk."""
    collection = load_collection()
    collection = sync_collection_with_files(collection)
    return collection


@app.get("/api/orphans")
def list_orphans():
    """Return files on disk that are not in the collection hierarchy."""
    collection = load_collection()
    collection = sync_collection_with_files(collection)
    return get_orphans(collection)


@app.put("/api/collection")
def update_collection(body: ReorderRequest):
    """Persist an updated hierarchical collection."""
    save_collection(body.collection)
    return {"status": "ok"}


@app.get("/api/collection/yaml")
def get_collection_yaml():
    """Return the raw collection.yaml text."""
    from utils import COLLECTION_FILE
    import yaml as _yaml
    if not COLLECTION_FILE.exists():
        collection = load_collection()
        save_collection(collection)
    return {"content": COLLECTION_FILE.read_text(encoding="utf-8")}


@app.put("/api/collection/yaml")
def save_collection_yaml(body: dict):
    """Accept raw YAML text, validate it, and save."""
    import yaml as _yaml
    from utils import COLLECTION_FILE
    raw = body.get("content", "")
    try:
        data = _yaml.safe_load(raw)
        # Validate structure
        CollectionStructure(**data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")
    COLLECTION_FILE.write_text(raw, encoding="utf-8")
    return {"status": "ok"}


# ── Serve frontend ─────────────────────────────────────────────────────────────
# Mount static assets (JS/CSS chunks) — must come after all /api routes
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        """Catch-all: serve index.html for any non-API path (SPA routing)."""
        index = FRONTEND_DIST / "index.html"
        return FileResponse(str(index), headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
