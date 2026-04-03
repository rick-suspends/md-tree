# Unlinked Files

The **Unlinked** pane shows files that exist in the project's `markdowns/` folder but are not yet part of the hierarchy. This happens when you add files directly to the folder, import a batch of files, or remove a file from the hierarchy without deleting it.

## The Unlinked chip

The blue **Unlinked** chip sits in the right column, parallel to the project chip. Click it to expand or collapse the pane. The triangle icon changes color:

- **Gray** — no unlinked files
- **Orange** — one or more files are waiting to be linked

The pane expands automatically when new unlinked files appear.

## Adding files to the hierarchy

There are three ways to move an unlinked file into the hierarchy:

1. **Drag** it from the Unlinked pane and drop it onto the hierarchy
2. **Double-click** it to add it at the top of the hierarchy
3. **Select** it (click once) and press the **←** arrow key

To select multiple files, hold Ctrl/Cmd while clicking. The ← key moves all selected files at once.

## Sorting unlinked files

Click **⋮** on the Unlinked chip to change the sort order:

- **Recent** — most recently modified first (default)
- **A→Z** — alphabetical by filename or title
- **Custom** — drag files within the pane to set your own order

Dragging a file within the Unlinked pane, or using the ↑/↓ arrow keys with a file selected, automatically switches to Custom sort.

## Creating a new file

Click **⋮** on the Unlinked chip and choose **＋ New file**. Type a filename and press Enter. The file is created in `markdowns/` and appears in the Unlinked pane, ready to be added to the hierarchy.

## Files in subdirectories

Files inside subdirectories of `markdowns/` are also surfaced in the Unlinked pane if they are not in the hierarchy. Files inside `markdowns/_archive/` are excluded.
