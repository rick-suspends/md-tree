import json
import re
import yaml
from pathlib import Path
from models import FileNode, CollectionStructure


def parse_mkdocs_nav(yaml_text: str, existing_files: set[str]) -> tuple[CollectionStructure, list[str]]:
    data = yaml.safe_load(yaml_text)
    if isinstance(data, dict) and "nav" in data:
        nav = data["nav"]
    elif isinstance(data, list):
        nav = data
    else:
        raise ValueError("Expected a YAML list or a document with a 'nav' key")

    warnings = []
    nodes = _parse_mkdocs_items(nav, existing_files, warnings, 0)
    return CollectionStructure(root=nodes), warnings


def _parse_mkdocs_items(items: list, existing_files: set[str], warnings: list[str], order_start: int) -> list[FileNode]:
    nodes = []
    order = order_start
    for item in items:
        if isinstance(item, str):
            path = item
            title = item.rsplit("/", 1)[-1].replace(".md", "").replace("-", " ").title()
            if path not in existing_files:
                warnings.append(f"File not found: {path}")
            nodes.append(FileNode(path=path, title=title, order=order, children=[]))
            order += 1
        elif isinstance(item, dict):
            for title, value in item.items():
                if isinstance(value, str):
                    path = value
                    if path not in existing_files:
                        warnings.append(f"File not found: {path}")
                    nodes.append(FileNode(path=path, title=title, order=order, children=[]))
                    order += 1
                elif isinstance(value, list):
                    section_path = None
                    remaining = value
                    if value:
                        first = value[0]
                        if isinstance(first, str):
                            section_path = first
                            remaining = value[1:]
                        elif isinstance(first, dict):
                            for k, v in first.items():
                                if isinstance(v, str):
                                    section_path = v
                                    remaining = value[1:]
                                    break
                    children = _parse_mkdocs_items(remaining, existing_files, warnings, 0)
                    if section_path is not None:
                        if section_path not in existing_files:
                            warnings.append(f"File not found: {section_path}")
                        nodes.append(FileNode(path=section_path, title=title, order=order, children=children))
                        order += 1
                    else:
                        for child in children:
                            child.order = order
                            nodes.append(child)
                            order += 1
    return nodes


def parse_docusaurus_sidebar(js_text: str, existing_files: set[str]) -> tuple[CollectionStructure, list[str]]:
    text = js_text.strip()
    text = re.sub(r'^(module\.exports\s*=\s*|export\s+default\s+)', '', text)
    text = text.rstrip(';').strip()
    text = text.replace("'", '"')
    text = re.sub(r'(\w+)\s*:', r'"\1":', text)
    text = re.sub(r',\s*([}\]])', r'\1', text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Could not parse sidebar config: {e}")

    if isinstance(data, dict):
        items = list(data.values())[0] if data else []
    elif isinstance(data, list):
        items = data
    else:
        raise ValueError("Expected an object or array")

    warnings = []
    nodes = _parse_docusaurus_items(items, existing_files, warnings, 0)
    return CollectionStructure(root=nodes), warnings


def _parse_docusaurus_items(items: list, existing_files: set[str], warnings: list[str], order_start: int) -> list[FileNode]:
    nodes = []
    order = order_start
    for item in items:
        if isinstance(item, str):
            path = item + ".md"
            title = item.rsplit("/", 1)[-1].replace("-", " ").title()
            if path not in existing_files:
                warnings.append(f"File not found: {path}")
            nodes.append(FileNode(path=path, title=title, order=order, children=[]))
            order += 1
        elif isinstance(item, dict):
            item_type = item.get("type", "doc")
            if item_type == "link":
                continue
            if item_type == "doc":
                doc_id = item.get("id", "")
                path = doc_id + ".md"
                title = item.get("label", doc_id.rsplit("/", 1)[-1].replace("-", " ").title())
                if path not in existing_files:
                    warnings.append(f"File not found: {path}")
                nodes.append(FileNode(path=path, title=title, order=order, children=[]))
                order += 1
            elif item_type == "category":
                child_items = item.get("items", [])
                link = item.get("link")
                if isinstance(link, dict) and link.get("type") == "doc":
                    path = link.get("id", "") + ".md"
                    title = item.get("label", "")
                    if path not in existing_files:
                        warnings.append(f"File not found: {path}")
                    children = _parse_docusaurus_items(child_items, existing_files, warnings, 0)
                    nodes.append(FileNode(path=path, title=title, order=order, children=children))
                    order += 1
                else:
                    children = _parse_docusaurus_items(child_items, existing_files, warnings, 0)
                    for child in children:
                        child.order = order
                        nodes.append(child)
                        order += 1
    return nodes



def export_mkdocs_nav(collection: CollectionStructure) -> str:
    nav = _export_mkdocs_nodes(collection.root)
    return yaml.dump({"nav": nav}, allow_unicode=True, sort_keys=False, default_flow_style=False)


def _export_mkdocs_nodes(nodes: list[FileNode]) -> list:
    result = []
    for node in sorted(nodes, key=lambda n: n.order):
        if node.children:
            children = [{node.title: node.path}] + _export_mkdocs_nodes(node.children)
            result.append({node.title: children})
        else:
            result.append({node.title: node.path})
    return result


def export_docusaurus_sidebar(collection: CollectionStructure) -> str:
    items = _export_docusaurus_nodes(collection.root)
    obj = {"docs": items}
    formatted = json.dumps(obj, indent=2, ensure_ascii=False)
    return f"module.exports = {formatted};\n"


def _export_docusaurus_nodes(nodes: list[FileNode]) -> list:
    result = []
    for node in sorted(nodes, key=lambda n: n.order):
        doc_id = re.sub(r'\.md$', '', node.path)
        if node.children:
            result.append({
                "type": "category",
                "label": node.title,
                "link": {"type": "doc", "id": doc_id},
                "items": _export_docusaurus_nodes(node.children),
            })
        else:
            result.append({
                "type": "doc",
                "id": doc_id,
                "label": node.title,
            })
    return result
