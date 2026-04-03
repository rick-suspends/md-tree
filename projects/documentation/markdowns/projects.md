# Managing Projects

A project is a self-contained set of markdown files with its own hierarchy. You can have as many projects as you like and switch between them freely.

## The project chip

The orange chip at the top of the hierarchy pane is the project chip. It shows the current project name. Click the **⋮** icon on it to open the project menu.

## Creating a project

1. Click **⋮** on the project chip
2. Click **Projects**, then **＋ New project**
3. Type a name and press Enter

Project names use hyphens instead of spaces. The display title comes from the `# H1` heading in the project's `project.md` file.

## Switching projects

1. Click **⋮** on the project chip
2. Click **Projects**
3. Click any project in the list

## Renaming a project

Double-click the project chip label to rename it inline, or use **⋮ → Projects → rename** from the menu.

## Project notes

Each project has a `project.md` file for notes, a description, or anything else you want to keep alongside the files. Open it with **⋮ → Info**.

## Archiving a project

Projects are never permanently deleted from the UI. Instead, archiving moves the entire project folder to `projects/_archive/`. To archive:

1. Click **⋮** on the project chip
2. Click **Projects**
3. Click the trash icon next to the project you want to archive

To permanently delete a project, remove its folder from `projects/_archive/` by hand.

## Viewing the hierarchy file

To see the raw `tree.yaml` for the current project, click **⋮ → View YAML**. This is a read-only view.
