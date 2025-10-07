#!/bin/bash
# MAISI Clara Generate - Quick Setup Script
# This script helps set up the MAISI server for the Clara Generate panel

set -e  # Exit on error

echo "🌟 MAISI Clara Generate - Setup Script"
echo "========================================"
echo ""

# Check Python version
echo "📋 Checking Python version..."
python_version=$(python3 --version 2>&1 | awk '{print $2}' | cut -d. -f1,2)
python_major=$(echo $python_version | cut -d. -f1)
python_minor=$(echo $python_version | cut -d. -f2)

if [ "$python_major" -lt 3 ] || ([ "$python_major" -eq 3 ] && [ "$python_minor" -lt 9 ]); then
    echo "❌ Error: Python 3.9+ required. Found: $python_version"
    exit 1
fi
echo "✅ Python $python_version detected"
echo ""

# Check CUDA
echo "📋 Checking CUDA availability..."
if command -v nvidia-smi &> /dev/null; then
    echo "✅ CUDA detected:"
    nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits | while read line; do
        echo "   GPU: $line"
    done
else
    echo "⚠️  Warning: nvidia-smi not found. MAISI requires CUDA-capable GPU."
    echo "   Generation will fail without proper GPU setup."
fi
echo ""

# Check if Poetry is installed
echo "� Checking Poetry installation..."
if ! command -v poetry &> /dev/null; then
    echo "❌ Poetry not found"
    echo "   Installing Poetry..."
    curl -sSL https://install.python-poetry.org | python3 -
    echo "✅ Poetry installed"
    echo ""
    echo "⚠️  Please add Poetry to your PATH and restart your shell:"
    echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo "Then re-run this script."
    exit 1
fi

POETRY_VERSION=$(poetry --version | awk '{print $3}')
echo "✅ Poetry $POETRY_VERSION detected"
echo ""

# Install dependencies with Poetry
echo "📥 Installing dependencies with Poetry (this may take a while)..."
poetry install --no-root

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Error installing dependencies"
    exit 1
fi
echo ""

# Check disk space for bundle
echo "💾 Checking disk space for MAISI bundle..."
cache_dir="$HOME/.cache/monai"
mkdir -p "$cache_dir"
available_space=$(df -BG "$cache_dir" | tail -1 | awk '{print $4}' | sed 's/G//')

if [ "$available_space" -lt 25 ]; then
    echo "⚠️  Warning: Low disk space. MAISI bundle requires ~21GB."
    echo "   Available: ${available_space}GB in $cache_dir"
    echo "   Consider freeing up space or changing MAISI_BUNDLE_CACHE location."
else
    echo "✅ Sufficient disk space available (${available_space}GB)"
fi
echo ""

# Summary
echo "=========================================="
echo "✅ MAISI Server Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Start the MAISI server:"
echo "   poetry run python maisi_server.py"
echo ""
echo "   Or activate the Poetry shell:"
echo "   poetry shell"
echo "   python maisi_server.py"
echo ""
echo "2. Verify server is running:"
echo "   curl http://localhost:8083/api/maisi_health"
echo ""
echo "3. Start VolView and navigate to Clara Generate panel"
echo ""
echo "Tips:"
echo "- First generation will download ~21GB MONAI bundle"
echo "- Use smaller presets (Head/Neck) for testing"
echo "- Check GPU memory before large generations"
echo ""
echo "Documentation:"
echo "- README_MAISI.md (server API docs)"
echo "- ../docs/clara_generate_user_guide.md (user guide)"
echo ""
echo "🚀 Ready to start server? Run:"
echo "   poetry run python maisi_server.py"
echo ""

