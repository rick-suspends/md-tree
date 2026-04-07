import sys
import threading
import webbrowser
import time
import uvicorn
from main import app

PORT = 8002


def _open_browser():
    time.sleep(1.5)
    webbrowser.open(f"http://127.0.0.1:{PORT}")


if __name__ == "__main__":
    t = threading.Thread(target=_open_browser, daemon=True)
    t.start()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
