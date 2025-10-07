#!/bin/bash
# VolView VISTA3D Server Startup Script
# Starts the VISTA3D backend server using Poetry

set -e  # Exit on error

cd "$(dirname "$0")"

echo "🚀 Starting VolView VISTA3D Server..."
echo ""

# Check if .venv exists
if [ ! -d ".venv" ]; then
    echo "⚠️  Virtual environment not found!"
    echo "   Please run './setup.sh' first to install dependencies."
    exit 1
fi

# Check if vista3d_server.py exists
if [ ! -f "vista3d_server.py" ]; then
    echo "❌ Error: vista3d_server.py not found"
    echo "   Make sure you're running this script from the server/ directory"
    exit 1
fi

# Start the server
echo "📡 Starting FastAPI server on http://0.0.0.0:8081"
echo "   Press Ctrl+C to stop the server"
echo ""

.venv/bin/python vista3d_server.py
