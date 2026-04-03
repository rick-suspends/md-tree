# .mdTree

A local markdown hierarchy manager for people who work with large collections of `.md` files.

If you've ever maintained a documentation site and found yourself hand-editing a YAML nav file, a `sidebars.js`, or a custom sidebar config every time you added, renamed, or reorganized a page — this tool is for you.

**.mdTree** gives you a visual, drag-and-drop interface for organizing markdown files into a hierarchy. The hierarchy is stored as a simple `tree.yaml` alongside your files, and can be exported directly to MkDocs or Docusaurus config format when you're ready to build your site.

## Features

- **Visual hierarchy management** — drag and drop files to reorder and nest them; use keyboard shortcuts for fine-grained control
- **Built-in editor with live preview** — edit markdown in a split pane with syntax highlighting and rendered preview side by side
- **Unlinked file detection** — files in your project folder that aren't in the hierarchy are surfaced automatically so nothing gets lost
- **MkDocs and Docusaurus import/export** — bring in an existing nav config or export your hierarchy when you're ready to publish
- **Multiple projects** — switch between doc sets without losing your place
- **Runs locally** — your files stay on your machine; no cloud, no accounts

## How it works

Files are organized within a project. Each project has a `markdowns/` folder for your `.md` files and a `tree.yaml` that records the hierarchy. You build and rearrange the tree in the UI; the YAML is maintained for you.

Files that exist in `markdowns/` but aren't placed in the hierarchy yet appear in the **Unlinked** pane. Drag them in, double-click them, or use the arrow key — they won't be forgotten.

## Getting started

**Requirements:** [Python 3.12+](https://www.python.org/downloads) and [Node.js LTS](https://nodejs.org) must be installed before running. The start script will handle everything else automatically — virtual environment setup, Python packages, and npm dependencies.

**Windows:**
```bat
git clone https://github.com/rick-suspends/md-tree.git
cd md-tree
start.bat
```

**Mac / Linux / WSL:**
```bash
git clone https://github.com/rick-suspends/md-tree.git
cd md-tree
./start.sh
```

Then open `http://localhost:8002` in your browser.

## Tech stack

- **Backend:** Python, FastAPI
- **Frontend:** React, Vite, TypeScript
- **Editor:** CodeMirror 6
- **Drag and drop:** dnd-kit
