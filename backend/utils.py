import re
import shutil
import yaml
import frontmatter
import markdown as md
from pathlib import Path
from typing import Optional
from models import FileNode, CollectionStructure

import sys as _sys
if getattr(_sys, "frozen", False):
    PROJECTS_DIR = Path(_sys.executable).parent / "projects"
else:
    PROJECTS_DIR = Path(__file__).parent.parent / "projects"

# ── Per-project path helpers ───────────────────────────────────────────────────

def get_markdowns_dir(project: str) -> Path:
    return PROJECTS_DIR / project / "markdowns"

def get_collection_file(project: str) -> Path:
    tree = PROJECTS_DIR / project / "tree.yaml"
    legacy = PROJECTS_DIR / project / "collection.yaml"
    if not tree.exists() and legacy.exists():
        legacy.rename(tree)
    return tree

def get_project_md_file(project: str) -> Path:
    return PROJECTS_DIR / project / "project.md"

def safe_path(project: str, rel_path: str) -> Path:
    """Resolve and validate that the path stays inside the project's markdowns dir."""
    from fastapi import HTTPException
    markdowns_dir = get_markdowns_dir(project)
    full = (markdowns_dir / rel_path).resolve()
    if not str(full).startswith(str(markdowns_dir.resolve())):
        raise HTTPException(status_code=400, detail="Path traversal detected")
    return full

# ── Project management ─────────────────────────────────────────────────────────

def list_projects() -> list[dict]:
    """List all projects with name and title (from project.md H1)."""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    result = []
    for p in sorted(PROJECTS_DIR.iterdir()):
        if not p.is_dir() or p.name.startswith("_"):
            continue
        title = p.name
        project_md = p / "project.md"
        if project_md.exists():
            try:
                h1 = get_h1_title(project_md.read_text(encoding="utf-8"))
                if h1:
                    title = h1
            except Exception:
                pass
        result.append({"name": p.name, "title": title})
    return result

def create_project(name: str):
    """Create a new project directory with empty collection.yaml and project.md."""
    project_dir = PROJECTS_DIR / name
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "markdowns").mkdir(exist_ok=True)
    collection_file = project_dir / "tree.yaml"
    if not collection_file.exists():
        with open(collection_file, "w") as f:
            yaml.dump({"root": []}, f, allow_unicode=True, sort_keys=False)
    project_md = project_dir / "project.md"
    if not project_md.exists():
        project_md.write_text(f"# {name}\n", encoding="utf-8")

def migrate_legacy_data():
    """
    One-time migration: if old-style markdowns/ and collection.yaml exist at repo root,
    move them into projects/default/.
    """
    repo_root = Path(__file__).parent.parent
    old_markdowns = repo_root / "markdowns"
    old_collection = repo_root / "collection.yaml"

    if not old_markdowns.exists():
        return  # Already migrated or nothing to migrate

    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    default_dir = PROJECTS_DIR / "default"
    default_dir.mkdir(exist_ok=True)

    # Move markdowns/
    dest_markdowns = default_dir / "markdowns"
    if not dest_markdowns.exists():
        shutil.move(str(old_markdowns), str(dest_markdowns))

    # Move collection.yaml
    dest_collection = default_dir / "tree.yaml"
    if old_collection.exists() and not dest_collection.exists():
        shutil.move(str(old_collection), str(dest_collection))

    # Create project.md if it doesn't exist
    project_md = default_dir / "project.md"
    if not project_md.exists():
        project_md.write_text("# Default Project\n", encoding="utf-8")

# ── File helpers ───────────────────────────────────────────────────────────────

def get_h1_title(content: str) -> Optional[str]:
    """Extract the first H1 heading from markdown content."""
    match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    return match.group(1).strip() if match else None


def get_all_md_files(project: str) -> list[dict]:
    """Recursively scan the project's markdowns directory for .md files."""
    markdowns_dir = get_markdowns_dir(project)
    markdowns_dir.mkdir(parents=True, exist_ok=True)
    files = []
    for path in sorted(markdowns_dir.rglob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True):
        rel_path = str(path.relative_to(markdowns_dir))
        if rel_path.startswith("_archive/") or "/_archive/" in rel_path:
            continue
        try:
            post = frontmatter.load(str(path))
            content = post.content
            title = post.metadata.get("title") or get_h1_title(content) or path.stem
        except Exception:
            title = path.stem
        files.append({"path": rel_path, "title": title})
    return files


def load_collection(project: str) -> CollectionStructure:
    """Load collection.yaml for a project, or build a default flat structure from files."""
    collection_file = get_collection_file(project)
    if collection_file.exists():
        try:
            with open(collection_file, "r") as f:
                data = yaml.safe_load(f)
            return CollectionStructure(**data)
        except Exception:
            pass
    # Build default structure from discovered files
    files = get_all_md_files(project)
    nodes = [FileNode(path=f["path"], title=f["title"], order=i) for i, f in enumerate(files)]
    return CollectionStructure(root=nodes)


def save_collection(project: str, collection: CollectionStructure):
    """Persist collection.yaml for a project."""
    collection_file = get_collection_file(project)
    collection_file.parent.mkdir(parents=True, exist_ok=True)
    with open(collection_file, "w") as f:
        yaml.dump(collection.model_dump(), f, allow_unicode=True, sort_keys=False)


def flatten_collection(nodes: list[FileNode]) -> list[str]:
    """Return a flat list of all paths in the collection."""
    paths = []
    for node in nodes:
        paths.append(node.path)
        if node.children:
            paths.extend(flatten_collection(node.children))
    return paths


def sync_collection_with_files(project: str, collection: CollectionStructure) -> CollectionStructure:
    """
    Remove entries for files that no longer exist on disk, and refresh titles from files.
    Does NOT add new files — those appear as orphans instead.
    Saves the refreshed collection back to disk so titles are persisted.
    """
    disk_files = {f["path"]: f["title"] for f in get_all_md_files(project)}

    def prune_and_refresh(nodes: list[FileNode]) -> list[FileNode]:
        result = []
        for n in nodes:
            if n.path not in disk_files:
                continue
            n.title = disk_files[n.path]
            n.children = prune_and_refresh(n.children or [])
            result.append(n)
        return result

    collection.root = prune_and_refresh(collection.root)
    save_collection(project, collection)
    return collection


def get_orphans(project: str, collection: CollectionStructure) -> list[dict]:
    """Return files on disk that are not present anywhere in the collection."""
    disk_files = get_all_md_files(project)
    known = set(flatten_collection(collection.root))
    return [f for f in disk_files if f["path"] not in known]


def md_to_html(content: str) -> str:
    """Convert markdown content to HTML."""
    extensions = ["tables", "fenced_code", "codehilite", "toc", "nl2br"]
    return md.markdown(content, extensions=extensions)
