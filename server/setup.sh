#!/bin/bash
# VolView VISTA3D Server Setup Script
# This script sets up the Python environment for the VISTA3D server

set -e  # Exit on error

cd "$(dirname "$0")"

echo "🔧 Setting up VolView VISTA3D Server..."
echo ""

# Check Python version
echo "📋 Checking Python version..."
PYTHON_VERSION=$(python3 --version 2>&1)
echo "   $PYTHON_VERSION"

if ! python3 -c 'import sys; exit(0 if sys.version_info >= (3, 8, 1) else 1)'; then
    echo "❌ Error: Python 3.8.1 or higher is required"
    exit 1
fi
echo "   ✅ Python version OK"
echo ""

# Check if Poetry is installed
echo "📋 Checking for Poetry..."
if ! command -v poetry &> /dev/null; then
    echo "   ⚠️  Poetry not found. Installing Poetry..."
    curl -sSL https://install.python-poetry.org | python3 -
    
    # Add Poetry to PATH for current session
    export PATH="$HOME/.local/bin:$PATH"
    
    echo "   ✅ Poetry installed successfully"
else
    POETRY_VERSION=$(poetry --version 2>&1)
    echo "   ✅ $POETRY_VERSION"
fi
echo ""

# Configure Poetry to create virtualenv in project directory
echo "📋 Configuring Poetry..."
poetry config virtualenvs.in-project true
echo "   ✅ Poetry configured to use .venv in project"
echo ""

# Install dependencies
echo "📦 Installing Python dependencies..."
echo "   This may take several minutes (downloading MONAI, PyTorch, etc.)..."
poetry install

echo ""
echo "✅ Verifying critical package installations..."

# Verify MONAI
if poetry run python -c "import monai; print('   ✅ MONAI:', monai.__version__)" 2>/dev/null; then
    :
else
    echo "   ❌ MONAI verification failed"
    exit 1
fi

# Verify python-socketio
if poetry run python -c "import socketio; print('   ✅ python-socketio:', socketio.__version__)" 2>/dev/null; then
    :
else
    echo "   ❌ python-socketio verification failed"
    exit 1
fi

# Verify FastAPI
if poetry run python -c "import fastapi; print('   ✅ FastAPI:', fastapi.__version__)" 2>/dev/null; then
    :
else
    echo "   ❌ FastAPI verification failed"
    exit 1
fi

# Verify ITK
if poetry run python -c "import itk; print('   ✅ ITK:', itk.Version.GetITKVersion())" 2>/dev/null; then
    :
else
    echo "   ❌ ITK verification failed"
    exit 1
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Start the VISTA3D server:"
echo "      ./start_server.sh"
echo ""
echo "   2. In a separate terminal, start the frontend:"
echo "      cd .. && npm run dev"
echo ""
echo "   3. Open http://localhost:8082 in your browser"
echo ""
