# Building Your Hierarchy

The hierarchy pane shows your files as a tree. Files can be nested to any depth. The structure is saved to `tree.yaml` automatically after every change.

## Adding a file

Click **⋮** on the project chip and choose **＋ New file**. The file is created in `markdowns/` and added to the top of the hierarchy.

To add a file as a child of an existing file, click **⋮** on that file chip and choose **Add sub-page**.

## Reordering with drag and drop

Drag any file chip by its label to move it. While dragging:

- Hover over the **left half** of a chip to place the dragged file as a sibling (same level)
- Hover over the **right half** of a chip to nest it as the first child of that file

A spacer shows where the file will land for sibling placement. A ghost chip shows the nesting depth for child placement.

## Reordering with the keyboard

Select a file chip by clicking it. The d-pad arrow buttons appear in the left margin:

| Key | Action |
|-----|--------|
| ↑ / ↓ | Move up or down within the current level, crossing into parent/child levels as needed |
| → | Nest under the file above (make it a child) |
| ← | Unnest (move up one level) |

## Renaming a file

Double-click a file chip label to rename it inline. Spaces are replaced with hyphens automatically. The file on disk is renamed to match.

## Deleting a file

Click **⋮** on a file chip and choose **Delete**. The file is moved to `markdowns/_archive/` rather than permanently deleted. To recover it, move it back to `markdowns/` by hand and refresh the project.

## Expanding and collapsing

Click the triangle next to any file that has children to expand or collapse it.
