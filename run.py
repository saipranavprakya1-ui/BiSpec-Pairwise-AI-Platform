"""
run.py
One-click application launcher for BiSpec Pairwise AI.
Starts the FastAPI server hosting both backend endpoints and frontend UI on http://127.0.0.1:8000.
"""

import sys
import os
import socket
import uvicorn
import webbrowser
from threading import Timer

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "10.214.45.176"

def open_browser():
    webbrowser.open("http://127.0.0.1:8000")

if __name__ == '__main__':
    project_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(project_dir, 'backend')
    sys.path.insert(0, backend_dir)

    local_ip = get_local_ip()

    print("=" * 70)
    print("Starting BiSpec Pairwise AI Unified Full-Stack Application...")
    print("Unified App (3D WebGL + ML Backend): http://127.0.0.1:8000")
    print(f"Network URL:                         http://{local_ip}:8000")
    print("Legacy Biotech Dashboard:            http://127.0.0.1:8000/legacy")
    print("Swagger API Docs:                    http://127.0.0.1:8000/docs")
    print("=" * 70)

    # Automatically open browser in 1.5 seconds
    Timer(1.5, open_browser).start()

    # Start Uvicorn server accessible across local network for mobile/QR access
    uvicorn.run("app:app", host="0.0.0.0", port=8000, app_dir=backend_dir, reload=False)
