import sys
import shutil
import threading
import time
from pathlib import Path
import uvicorn
from main import app

PORT = 8003

# Paths
if getattr(sys, "frozen", False):
    BUNDLE_DIR = Path(sys._MEIPASS)
    PROJECTS_DIR = Path(sys.executable).parent / "projects"
else:
    BUNDLE_DIR = Path(__file__).parent.parent
    PROJECTS_DIR = Path(__file__).parent.parent / "projects"

BUNDLED_DOCS = BUNDLE_DIR / "projects" / "documentation"
USER_DOCS = PROJECTS_DIR / "documentation"


def _restore_documentation():
    if BUNDLED_DOCS.exists() and not USER_DOCS.exists():
        shutil.copytree(str(BUNDLED_DOCS), str(USER_DOCS))


def _start_server():
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")


if __name__ == "__main__":
    _restore_documentation()

    t = threading.Thread(target=_start_server, daemon=True)
    t.start()
    time.sleep(1.5)

    if sys.platform == "linux":
        # pywebview requires system GTK/Qt which can't be bundled on Linux
        print(f"mdTree running at http://127.0.0.1:{PORT}")
        print("Press Ctrl+C to stop.")
        t.join()  # keep process alive until user Ctrl+C's
    else:
        import webview
        window = webview.create_window(
            "mdTree",
            f"http://127.0.0.1:{PORT}",
            width=1400,
            height=900,
            min_size=(800, 600),
        )
        webview.start()
