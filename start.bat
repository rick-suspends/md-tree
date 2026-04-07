@echo off
setlocal
set ROOT=%~dp0

echo ==> .mdTree
echo.

REM Check for Node.js / npm
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo.
    echo Please download and install the LTS version from:
    echo   https://nodejs.org
    echo.
    echo After installing, close this window and run start.bat again.
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found. Please reinstall Node.js from:
    echo   https://nodejs.org
    echo.
    echo After installing, close this window and run start.bat again.
    exit /b 1
)

REM Check for Python
where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH.
    echo.
    echo Please download and install Python 3.12 or later from:
    echo   https://www.python.org/downloads
    echo.
    echo During installation, check "Add Python to PATH".
    echo After installing, close this window and run start.bat again.
    exit /b 1
)

REM Build frontend
echo ==> Building frontend...
cd "%ROOT%frontend"
if not exist "node_modules" (
    echo     Installing npm packages...
    npm install
)
echo     Compiling...
node node_modules/vite/bin/vite.js build
if errorlevel 1 (
    echo ERROR: Frontend build failed.
    exit /b 1
)

REM Start backend
echo.
echo ==> Starting server on http://localhost:8002
echo     Press Ctrl+C to stop.
echo.
cd "%ROOT%backend"
if not exist ".venv" (
    echo     Creating Python environment...
    python -m venv .venv
    if errorlevel 1 (
        echo ERROR: Could not create Python virtual environment.
        echo Please ensure Python 3.12 or later is installed from:
        echo   https://www.python.org/downloads
        exit /b 1
    )
    echo     Installing Python packages...
    .venv\Scripts\pip install -q -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install Python dependencies.
        exit /b 1
    )
)

REM Free port 8002 if something is already using it
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8002 "') do (
    taskkill /f /pid %%a >nul 2>&1
)

.venv\Scripts\uvicorn main:app --reload --host 0.0.0.0 --port 8002
