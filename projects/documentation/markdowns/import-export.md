# Import & Export

.mdTree can import a hierarchy from MkDocs or Docusaurus config files, and export back to those formats when you're ready to publish.

## Importing from MkDocs

1. Copy your `mkdocs.yml` into the project folder at `projects/{name}/mkdocs.yml`
2. Click **⋮** on the project chip, then **Import from... → MkDocs**

The hierarchy is built from the `nav:` section of your config. Category-only nodes (sections with no page of their own) are flattened — their children are promoted up one level.

## Importing from Docusaurus

1. Copy your `sidebars.js` (or `sidebars.ts`) into the project folder at `projects/{name}/sidebars.js`
2. Click **⋮** on the project chip, then **Import from... → Docusaurus**

If neither `sidebars.js` nor `sidebars.ts` is found, you will be prompted for the filename.

## Exporting to MkDocs

Click **⋮ → Export to... → MkDocs**. The exported `mkdocs.yml` is written to `projects/{name}/mkdocs.yml`. Copy it back to your MkDocs project to use it.

## Exporting to Docusaurus

Click **⋮ → Export to... → Docusaurus**. The exported `sidebars.js` is written to `projects/{name}/sidebars.js`. Copy it back to your Docusaurus project.

## Notes

- Import replaces the current hierarchy entirely
- Markdown files referenced in the imported config must already exist in `markdowns/` — import does not copy files
- Export reflects the current hierarchy at the time of export; run it again after any reorganization
