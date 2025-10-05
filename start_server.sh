#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
echo "🚀 Starting VolView VISTA3D Server..."
python vista3d_server.py --host 0.0.0.0 --port 8000
