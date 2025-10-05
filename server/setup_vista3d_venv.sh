#!/bin/bash

# Alternative VISTA3D Setup Script for VolView (Virtual Environment Approach)
# This script sets up the backend server for VISTA3D whole-body segmentation

set -e  # Exit on any error

echo "🚀 Setting up VolView VISTA3D Server (Virtual Environment)..."

# Check Python version
python_version=$(python3 --version 2>&1 | grep -o '[0-9]\+\.[0-9]\+')
echo "📋 Python version: $python_version"

# Check if Python version is 3.8 or higher using Python itself
if ! python3 -c "import sys; exit(0 if sys.version_info >= (3, 8) else 1)" 2>/dev/null; then
    echo "❌ Error: Python 3.8+ required, found $python_version"
    exit 1
fi

echo "✅ Python version check passed"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "🔧 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip

# Install dependencies directly
echo "📦 Installing Python dependencies..."
pip install "monai[all]>=1.3.0" \
           "torch>=2.0.0" \
           "torchvision>=0.15.0" \
           "nibabel>=5.0.0" \
           "fastapi>=0.104.0" \
           "uvicorn[standard]>=0.22.0" \
           "python-multipart>=0.0.6" \
           "pydantic>=2.0.0" \
           "itk>=5.3.0" \
           "numpy>=1.24.1" \
           "aiohttp==3.9.2"

# Download VISTA3D bundle
echo "🧠 Downloading VISTA3D model bundle..."
if [ ! -d "bundles/vista3d" ]; then
    mkdir -p bundles
    python -m monai.bundle download "vista3d" --bundle_dir "bundles/"
    echo "✅ VISTA3D bundle downloaded successfully"
else
    echo "ℹ️  VISTA3D bundle already exists"
fi

# Check GPU availability
echo "🖥️  Checking GPU availability..."
python -c "
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
source venv/bin/activate
echo "🚀 Starting VolView VISTA3D Server..."
python vista3d_server.py --host 0.0.0.0 --port 8000
EOF

chmod +x start_server.sh

# Create test script
echo "📝 Creating test script..."
cat > test_server.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
echo "🧪 Testing VISTA3D Server..."
python -c "
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
echo "📚 For more information, see: VISTA3D_SETUP.md"