import shutil
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from models import CollectionStructure, FileContent, FileNode, ReorderRequest, ImportRequest
from utils import (
    PROJECTS_DIR,
    safe_path,
    get_all_md_files,
    get_orphans,
    get_collection_file,
    get_project_md_file,
    load_collection,
    save_collection,
    sync_collection_with_files,
    flatten_collection,
    list_projects,
    create_project,
    migrate_legacy_data,
    md_to_html,
    load_project_config,
    save_project_config,
)

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

app = FastAPI(title="Markdown Collection Editor", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    migrate_legacy_data()


# ── Projects ───────────────────────────────────────────────────────────────────

@app.get("/api/projects")
def list_projects_endpoint():
    """Return list of all project names."""
    return list_projects()


@app.post("/api/projects/{project_name}")
def create_project_endpoint(project_name: str, body: Optional[dict] = Body(default=None)):
    """Create a new project directory, optionally pointing at an external markdowns directory."""
    project_dir = PROJECTS_DIR / project_name
    if project_dir.exists():
        raise HTTPException(status_code=409, detail="Project already exists")
    markdowns_dir = (body or {}).get("markdowns_dir")
    if markdowns_dir:
        p = Path(markdowns_dir)
        if not p.exists() or not p.is_dir():
            raise HTTPException(status_code=400, detail="Directory not found")
    create_project(project_name, markdowns_dir)
    return {"status": "ok", "name": project_name}


@app.post("/api/projects/{project_name}/rename")
def rename_project_endpoint(project_name: str, body: dict):
    """Rename a project directory."""
    new_name = body.get("new_name", "").strip()
    if not new_name or new_name in (".", "..") or "/" in new_name or "\0" in new_name:
        raise HTTPException(status_code=400, detail="Invalid project name")
    old_dir = PROJECTS_DIR / project_name
    new_dir = PROJECTS_DIR / new_name
    if not old_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    if new_dir.exists():
        raise HTTPException(status_code=409, detail="A project with that name already exists")
    old_dir.rename(new_dir)
    return {"status": "ok", "new_name": new_name}


@app.post("/api/projects/{project_name}/archive")
def archive_project_endpoint(project_name: str):
    """Move project to _archive instead of deleting it."""
    import time
    project_dir = PROJECTS_DIR / project_name
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    archive_dir = PROJECTS_DIR / "_archive"
    archive_dir.mkdir(exist_ok=True)
    dest = archive_dir / project_name
    if dest.exists():
        dest = archive_dir / f"{project_name}-{int(time.time())}"
    project_dir.rename(dest)
    return {"status": "ok"}


@app.delete("/api/projects/{project_name}")
def delete_project_endpoint(project_name: str):
    """Delete an entire project directory."""
    project_dir = PROJECTS_DIR / project_name
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    shutil.rmtree(str(project_dir))
    return {"status": "ok"}


@app.get("/api/projects/{project_name}/project-md")
def get_project_md(project_name: str):
    """Return the project.md content."""
    path = get_project_md_file(project_name)
    if not path.exists():
        return {"content": f"# {project_name}\n"}
    return {"content": path.read_text(encoding="utf-8")}


@app.put("/api/projects/{project_name}/project-md")
def save_project_md(project_name: str, body: FileContent):
    """Save project.md content."""
    path = get_project_md_file(project_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.content, encoding="utf-8")
    return {"status": "ok"}


# ── Project config ─────────────────────────────────────────────────────────────

@app.get("/api/projects/{project_name}/config")
def get_project_config_endpoint(project_name: str):
    return load_project_config(project_name)


@app.put("/api/projects/{project_name}/config")
def set_project_config_endpoint(project_name: str, body: dict):
    project_dir = PROJECTS_DIR / project_name
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    if "markdowns_dir" in body and body["markdowns_dir"]:
        p = Path(body["markdowns_dir"])
        if not p.exists() or not p.is_dir():
            raise HTTPException(status_code=400, detail="Directory not found")
        body["markdowns_dir"] = str(p.resolve())
    save_project_config(project_name, body)
    return {"status": "ok"}


# ── Files ──────────────────────────────────────────────────────────────────────

@app.get("/api/projects/{project_name}/files")
def list_files(project_name: str):
    return get_all_md_files(project_name)


@app.get("/api/projects/{project_name}/markdown/{file_path:path}")
def get_markdown(project_name: str, file_path: str):
    path = safe_path(project_name, file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return {"path": file_path, "content": path.read_text(encoding="utf-8")}


@app.post("/api/projects/{project_name}/markdown/{file_path:path}")
def create_markdown(project_name: str, file_path: str):
    path = safe_path(project_name, file_path)
    if path.exists():
        raise HTTPException(status_code=409, detail="File already exists")
    path.parent.mkdir(parents=True, exist_ok=True)
    title = path.stem.replace("-", " ").replace("_", " ").title()
    path.write_text(f"# {title}\n", encoding="utf-8")
    collection = load_collection(project_name)
    collection.root.append(FileNode(path=file_path, title=title, order=len(collection.root), children=[]))
    save_collection(project_name, collection)
    return {"status": "ok", "path": file_path, "title": title}


@app.put("/api/projects/{project_name}/markdown/{file_path:path}")
def save_markdown(project_name: str, file_path: str, body: FileContent):
    path = safe_path(project_name, file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.content, encoding="utf-8")
    return {"status": "ok"}


@app.delete("/api/projects/{project_name}/markdown/{file_path:path}")
def delete_markdown(project_name: str, file_path: str):
    path = safe_path(project_name, file_path)
    if path.exists():
        path.unlink()
    collection = load_collection(project_name)

    def remove_recursive(nodes):
        result = []
        for n in nodes:
            if n.path == file_path:
                continue
            n.children = remove_recursive(n.children or [])
            result.append(n)
        return result

    collection.root = remove_recursive(collection.root)
    save_collection(project_name, collection)
    return {"status": "ok"}


@app.post("/api/projects/{project_name}/rename/{file_path:path}")
def rename_file(project_name: str, file_path: str, body: dict):
    new_path = body.get("new_path", "").strip()
    if not new_path:
        raise HTTPException(status_code=400, detail="new_path is required")
    if not new_path.endswith(".md"):
        new_path += ".md"

    old = safe_path(project_name, file_path)
    new = safe_path(project_name, new_path)
    if not old.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if new.exists():
        raise HTTPException(status_code=409, detail="A file with that name already exists")

    old.rename(new)

    collection = load_collection(project_name)

    def rename_in_nodes(nodes):
        for n in nodes:
            if n.path == file_path:
                n.path = new_path
            rename_in_nodes(n.children or [])

    rename_in_nodes(collection.root)
    save_collection(project_name, collection)
    return {"status": "ok", "old_path": file_path, "new_path": new_path}


@app.get("/api/projects/{project_name}/html/{file_path:path}", response_class=HTMLResponse)
def get_html(project_name: str, file_path: str):
    path = safe_path(project_name, file_path)
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

@app.get("/api/projects/{project_name}/collection")
def get_collection(project_name: str):
    collection = load_collection(project_name)
    collection = sync_collection_with_files(project_name, collection)
    return collection


@app.get("/api/projects/{project_name}/orphans")
def list_orphans(project_name: str):
    collection = load_collection(project_name)
    collection = sync_collection_with_files(project_name, collection)
    return get_orphans(project_name, collection)


@app.put("/api/projects/{project_name}/collection")
def update_collection(project_name: str, body: ReorderRequest):
    save_collection(project_name, body.collection)
    return {"status": "ok"}


@app.get("/api/projects/{project_name}/collection/yaml")
def get_collection_yaml(project_name: str):
    collection_file = get_collection_file(project_name)
    if not collection_file.exists():
        save_collection(project_name, load_collection(project_name))
    return {"content": collection_file.read_text(encoding="utf-8")}


@app.put("/api/projects/{project_name}/collection/yaml")
def save_collection_yaml(project_name: str, body: dict):
    import yaml as _yaml
    collection_file = get_collection_file(project_name)
    raw = body.get("content", "")
    try:
        data = _yaml.safe_load(raw)
        CollectionStructure(**data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")
    collection_file.write_text(raw, encoding="utf-8")
    return {"status": "ok"}


# ── Import / Export ───────────────────────────────────────────────────────────

from converters import (
    parse_mkdocs_nav, parse_docusaurus_sidebar, export_mkdocs_nav, export_docusaurus_sidebar,
    read_mkdocs_project, read_docusaurus_project,
)


@app.post("/api/projects/{project_name}/import/mkdocs")
def import_mkdocs(project_name: str, req: ImportRequest):
    if req.directory:
        try:
            content, docs_dir = read_mkdocs_project(req.directory)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        save_project_config(project_name, {"markdowns_dir": str(docs_dir)})
    else:
        content = req.content
    existing = {f["path"] for f in get_all_md_files(project_name)}
    try:
        collection, warnings = parse_mkdocs_nav(content, existing)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_collection(project_name, collection)
    return {"status": "ok", "warnings": warnings, "node_count": len(flatten_collection(collection.root))}


@app.post("/api/projects/{project_name}/import/docusaurus")
def import_docusaurus(project_name: str, req: ImportRequest):
    if req.directory:
        try:
            content, docs_dir = read_docusaurus_project(req.directory)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        save_project_config(project_name, {"markdowns_dir": str(docs_dir)})
    else:
        content = req.content
    existing = {f["path"] for f in get_all_md_files(project_name)}
    try:
        collection, warnings = parse_docusaurus_sidebar(content, existing)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_collection(project_name, collection)
    return {"status": "ok", "warnings": warnings, "node_count": len(flatten_collection(collection.root))}


@app.get("/api/projects/{project_name}/export/mkdocs")
def export_mkdocs(project_name: str):
    collection = load_collection(project_name)
    sync_collection_with_files(project_name, collection)
    content = export_mkdocs_nav(collection)
    return {"content": content}


@app.get("/api/projects/{project_name}/export/docusaurus")
def export_docusaurus(project_name: str):
    collection = load_collection(project_name)
    sync_collection_with_files(project_name, collection)
    content = export_docusaurus_sidebar(collection)
    return {"content": content}


# ── Serve frontend ─────────────────────────────────────────────────────────────

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        index = FRONTEND_DIST / "index.html"
        return FileResponse(str(index), headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
