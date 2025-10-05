#!/bin/bash

# VolView VISTA3D Server Setup Script
# This script sets up the backend server for VISTA3D whole-body segmentation

set -e  # Exit on any error

echo "🚀 Setting up VolView VISTA3D Server..."

# Check Python version
python_version=$(python3 --version 2>&1 | grep -o '[0-9]\+\.[0-9]\+')
echo "📋 Python version: $python_version"

# Check if Python version is 3.8 or higher using Python itself
if ! python3 -c "import sys; exit(0 if sys.version_info >= (3, 8) else 1)" 2>/dev/null; then
    echo "❌ Error: Python 3.8+ required, found $python_version"
    exit 1
fi

echo "✅ Python version check passed"

# Check if Poetry is installed
if ! command -v poetry &> /dev/null; then
    echo "❌ Poetry is not installed. Please install Poetry first:"
    echo "   curl -sSL https://install.python-poetry.org | python3 -"
    echo "   or visit https://python-poetry.org/docs/#installation"
    exit 1
fi

echo "✅ Poetry found: $(which poetry)"

# Install dependencies with Poetry
echo "📦 Installing Python dependencies with Poetry..."
# Try to set Python path explicitly for pyenv compatibility
export PATH="/usr/bin:$PATH"
poetry install --no-interaction

# Download VISTA3D bundle
echo "🧠 Downloading VISTA3D model bundle..."
if [ ! -d "bundles/vista3d" ]; then
    mkdir -p bundles
    poetry run python -m monai.bundle download "vista3d" --bundle_dir "bundles/"
    echo "✅ VISTA3D bundle downloaded successfully"
else
    echo "ℹ️  VISTA3D bundle already exists"
fi

# Check GPU availability
echo "🖥️  Checking GPU availability..."
poetry run python -c "
import torch
if torch.cuda.is_available():
    print(f'✅ GPU available: {torch.cuda.get_device_name(0)}')
    print(f'   CUDA version: {torch.version.cuda}')
else:
    print('⚠️  GPU not available, using CPU (will be slower)')
"

# Create startup script
echo "📝 Creating startup script..."
cat > start_server.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Starting VolView VISTA3D Server..."
poetry run python vista3d_server.py --host 0.0.0.0 --port 8000
EOF

chmod +x start_server.sh

# Create test script
echo "📝 Creating test script..."
cat > test_server.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "🧪 Testing VISTA3D Server..."
poetry run python -c "
import sys
sys.path.append('.')
import asyncio
from vista3d_server import analyzer

print('Model available:', analyzer.workflow is not None)
print('Device:', analyzer.device)
print('Label count:', len(analyzer.label_names))
print('✅ Server components loaded successfully')
"
EOF

chmod +x test_server.sh

echo ""
echo "✅ VolView VISTA3D Server setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Start the server: ./start_server.sh"
echo "   2. Test the server: ./test_server.sh"
echo "   3. Connect VolView to: http://localhost:8000"
echo ""
echo "🌐 Server endpoints:"
echo "   • Health check: http://localhost:8000/health"
echo "   • Model info: http://localhost:8000/api/model_info"
echo "   • Analysis: POST http://localhost:8000/api/vista3d_analysis"
echo ""
echo "📚 For more information, see: ../docs/vista3d-server-integration.md"