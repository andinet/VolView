#!/bin/bash
# Fresh installation script for VISTA3D server dependencies
# This ensures all dependencies including pynrrd are properly installed

set -e

echo "🔧 Setting up VISTA3D server dependencies..."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not found"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "../venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv ../venv
fi

# Activate virtual environment
source ../venv/bin/activate

# Upgrade pip
echo "⬆️ Upgrading pip..."
pip install --upgrade pip

# Install dependencies from requirements.txt
echo "📥 Installing dependencies from requirements.txt..."
pip install -r requirements.txt

# Verify key dependencies
echo "✅ Verifying installations..."
python -c "import monai; print(f'MONAI: {monai.__version__}')"
python -c "import torch; print(f'PyTorch: {torch.__version__}')"
python -c "import fastapi; print(f'FastAPI: {fastapi.__version__}')"
python -c "import nrrd; print(f'pynrrd: Available')"
python -c "import numpy; print(f'NumPy: {numpy.__version__}')"

echo "🎉 Installation complete!"
echo "📝 To start the server:"
echo "   cd /path/to/VolView"
echo "   ./venv/bin/python server/vista3d_server.py"