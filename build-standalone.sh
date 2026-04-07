#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> .mdTree Standalone Builder"
echo ""

command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js not found."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "ERROR: Python 3 not found."; exit 1; }

echo "==> Building frontend..."
cd "$ROOT/frontend"
[ ! -d "node_modules" ] && npm install
node node_modules/vite/bin/vite.js build

echo ""
echo "==> Setting up Python environment..."
cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    .venv/bin/pip install -q -r requirements.txt
fi
.venv/bin/pip install -q pyinstaller

echo ""
echo "==> Running PyInstaller..."
cd "$ROOT"
backend/.venv/bin/pyinstaller mdtree.spec --distpath standalone/dist --workpath standalone/build --noconfirm

echo ""
echo "==> Done. Output: standalone/dist/mdtree/"
echo "    Run ./mdtree to launch."
