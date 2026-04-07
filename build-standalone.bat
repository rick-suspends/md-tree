@echo off
setlocal
set ROOT=%~dp0

echo ==> .mdTree Standalone Builder
echo.

where node >nul 2>&1
if errorlevel 1 ( echo ERROR: Node.js not found. & exit /b 1 )
where python >nul 2>&1
if errorlevel 1 ( echo ERROR: Python not found. & exit /b 1 )

echo ==> Building frontend...
cd "%ROOT%frontend"
if not exist "node_modules" ( npm install )
node node_modules/vite/bin/vite.js build
if errorlevel 1 ( echo ERROR: Frontend build failed. & exit /b 1 )

echo.
echo ==> Setting up Python environment...
cd "%ROOT%backend"
if not exist ".venv" (
    python -m venv .venv
    .venv\Scripts\pip install -q -r requirements.txt
)
.venv\Scripts\pip install -q pyinstaller

echo.
echo ==> Running PyInstaller...
cd "%ROOT%"
backend\.venv\Scripts\pyinstaller mdtree.spec --distpath dist --workpath build --noconfirm
if errorlevel 1 ( echo ERROR: PyInstaller failed. & exit /b 1 )

echo.
echo ==> Done. Output: dist\md-tree\
echo     Run mdtree.exe to launch.
