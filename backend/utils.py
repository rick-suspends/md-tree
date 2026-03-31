import os
import re
import yaml
import frontmatter
import markdown as md
from pathlib import Path
from typing import Optional
from models import FileNode, CollectionStructure

MARKDOWNS_DIR = Path(__file__).parent.parent / "markdowns"
COLLECTION_FILE = Path(__file__).parent.parent / "collection.yaml"


def ensure_markdowns_dir():
    MARKDOWNS_DIR.mkdir(parents=True, exist_ok=True)


def get_h1_title(content: str) -> Optional[str]:
    """Extract the first H1 heading from markdown content."""
    match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    return match.group(1).strip() if match else None


def get_all_md_files() -> list[dict]:
    """Recursively scan the markdowns directory for .md files."""
    ensure_markdowns_dir()
    files = []
    for path in sorted(MARKDOWNS_DIR.rglob("*.md")):
        rel_path = str(path.relative_to(MARKDOWNS_DIR))
        try:
            post = frontmatter.load(str(path))
            content = post.content
            title = post.metadata.get("title") or get_h1_title(content) or path.stem
        except Exception:
            title = path.stem
        files.append({"path": rel_path, "title": title})
    return files


def load_collection() -> CollectionStructure:
    """Load collection.yaml, or build a default flat structure from files."""
    if COLLECTION_FILE.exists():
        try:
            with open(COLLECTION_FILE, "r") as f:
                data = yaml.safe_load(f)
            return CollectionStructure(**data)
        except Exception:
            pass
    # Build default structure from discovered files
    files = get_all_md_files()
    nodes = [FileNode(path=f["path"], title=f["title"], order=i) for i, f in enumerate(files)]
    return CollectionStructure(root=nodes)


def save_collection(collection: CollectionStructure):
    """Persist collection.yaml."""
    with open(COLLECTION_FILE, "w") as f:
        yaml.dump(collection.model_dump(), f, allow_unicode=True, sort_keys=False)


def flatten_collection(nodes: list[FileNode]) -> list[str]:
    """Return a flat list of all paths in the collection."""
    paths = []
    for node in nodes:
        paths.append(node.path)
        if node.children:
            paths.extend(flatten_collection(node.children))
    return paths


def sync_collection_with_files(collection: CollectionStructure) -> CollectionStructure:
    """
    Remove entries for files that no longer exist on disk, and refresh titles from files.
    Does NOT add new files — those appear as orphans instead.
    Saves the refreshed collection back to disk so titles are persisted.
    """
    disk_files = {f["path"]: f["title"] for f in get_all_md_files()}

    def prune_and_refresh(nodes: list[FileNode]) -> list[FileNode]:
        result = []
        for n in nodes:
            if n.path not in disk_files:
                continue
            n.title = disk_files[n.path]  # refresh title from file
            n.children = prune_and_refresh(n.children or [])
            result.append(n)
        return result

    collection.root = prune_and_refresh(collection.root)
    save_collection(collection)  # persist refreshed titles
    return collection


def get_orphans(collection: CollectionStructure) -> list[dict]:
    """Return files on disk that are not present anywhere in the collection."""
    disk_files = get_all_md_files()
    known = set(flatten_collection(collection.root))
    return [f for f in disk_files if f["path"] not in known]


def md_to_html(content: str) -> str:
    """Convert markdown content to HTML."""
    extensions = ["tables", "fenced_code", "codehilite", "toc", "nl2br"]
    return md.markdown(content, extensions=extensions)
