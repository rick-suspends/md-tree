# .mdTree

[![Build Standalone](https://github.com/rick-does/md-tree/actions/workflows/standalone.yml/badge.svg)](https://github.com/rick-does/md-tree/actions/workflows/standalone.yml)
[![Docs](https://github.com/rick-does/md-tree/actions/workflows/docs.yml/badge.svg)](https://github.com/rick-does/md-tree/actions/workflows/docs.yml)
[![Release](https://img.shields.io/github/v/release/rick-does/md-tree)](https://github.com/rick-does/md-tree/releases/latest)

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

## Download

Download the latest standalone app from the [Releases page](https://github.com/rick-does/md-tree/releases) — no Python or Node.js required.

| Platform | File |
|----------|------|
| Windows | `md-tree-windows.zip` |
| Mac | `md-tree-macos.zip` |
| Linux | `md-tree-linux.zip` |

Unzip to get an `md-tree/` folder. Open it and double-click `mdtree.exe` (Windows) or `mdtree` (Mac/Linux). Your projects are stored in a `projects/` folder created automatically inside `md-tree/`.

**Mac note:** Right-click → Open the first time to bypass the unsigned app warning.

## Try it without downloading

A live demo runs at **[md-tree demo](https://container-service-2.gqceswqwzkchr.us-west-2.cs.amazonlightsail.com/)** — no install required. The demo resets nightly. Import and export are disabled in the demo.

## Documentation

Full documentation is available at **[rick-does.github.io/md-tree](https://rick-does.github.io/md-tree/)**.

## Run from source

Requires [Python 3.12+](https://www.python.org/downloads) and [Node.js LTS](https://nodejs.org).

**Windows:**
```bat
git clone https://github.com/rick-does/md-tree.git
cd md-tree
start.bat
```

**Mac / Linux / WSL:**
```bash
git clone https://github.com/rick-does/md-tree.git
cd md-tree
./start.sh
```

Then open `http://localhost:8002` in your browser.

## Tech stack

- **Backend:** Python, FastAPI
- **Frontend:** React, Vite, TypeScript
- **Editor:** CodeMirror 6
- **Drag and drop:** dnd-kit
- **Standalone:** PyInstaller, pywebview
