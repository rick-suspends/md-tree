from pydantic import BaseModel
from typing import Optional


class FileNode(BaseModel):
    path: str
    title: str
    order: int
    children: Optional[list["FileNode"]] = []


FileNode.model_rebuild()


class CollectionStructure(BaseModel):
    root: list[FileNode]


class FileContent(BaseModel):
    path: str
    content: str
    title: Optional[str] = None


class ReorderRequest(BaseModel):
    collection: CollectionStructure


class ImportRequest(BaseModel):
    content: str = ""
    directory: Optional[str] = None
