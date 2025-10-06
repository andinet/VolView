#!/bin/bash
# VISTA3D Analysis Server Launcher
# Starts the MONAI-enabled VISTA3D server for VolView

cd "$(dirname "$0")/server"

echo "🚀 Starting VISTA3D Analysis Server..."
echo "📍 Server will run on: http://localhost:8082"
echo "🧠 MONAI-enabled with real medical AI analysis"
echo ""

# Start server with the configured Python environment
/home/local/KHQ/andinet.enquobahrie/s/VolView/venv/bin/python vista3d_server.py