# Introduction

**.mdTree** is a local tool for managing large collections of markdown files. It gives you a visual, drag-and-drop interface for organizing files into a hierarchy — so you never have to hand-edit a YAML nav file or sidebar config again.

## The problem

If you maintain a documentation site built with a static site generator — MkDocs, Docusaurus, Jekyll, or similar — you know the friction. Every time you add a page, rename a file, or reorganize a section, you have to open a config file and edit it by hand. With dozens of files this is tedious. With hundreds, it becomes a real source of errors.

## What .mdTree does

.mdTree keeps your markdown files in a project folder and maintains the hierarchy in a `tree.yaml` file alongside them. You interact with the hierarchy visually: drag files to reorder them, nest them under parents, and promote orphaned files into the tree. The YAML is always up to date; you never touch it directly.

When you're ready to publish, .mdTree can export your hierarchy directly to MkDocs or Docusaurus config format.

## How this documentation works

This documentation is itself an .mdTree project. You're reading it inside the app. Use the hierarchy on the left to navigate between pages, and the editor to open any file for reading or editing.
