import os
import sys
import subprocess
import threading
import time

import requests
import uvicorn
import webview

PORT = 8002
ROOT = os.path.dirname(os.path.abspath(__file__))


def kill_port():
    subprocess.run(
        f"lsof -ti:{PORT} | xargs kill -9",
        shell=True, stderr=subprocess.DEVNULL
    )


def wait_for_server():
    for _ in range(40):
        try:
            requests.get(f"http://127.0.0.1:{PORT}/")
            return True
        except Exception:
            time.sleep(0.25)
    return False


def run_server():
    sys.path.insert(0, os.path.join(ROOT, "backend"))
    import main
    uvicorn.run(main.app, host="127.0.0.1", port=PORT, log_level="warning")


if __name__ == "__main__":
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--disable-gpu --no-sandbox"
    dist = os.path.join(ROOT, "frontend", "dist")
    if not os.path.isdir(dist):
        print("ERROR: frontend/dist/ not found. Run the build first:")
        print("  cd frontend && node node_modules/vite/bin/vite.js build")
        sys.exit(1)

    kill_port()

    t = threading.Thread(target=run_server, daemon=True)
    t.start()

    if not wait_for_server():
        print("ERROR: Server failed to start on port", PORT)
        sys.exit(1)

    webview.create_window(
        "mdTree",
        f"http://127.0.0.1:{PORT}",
        width=1600,
        height=1000,
        min_size=(900, 600),
    )
    webview.start()
