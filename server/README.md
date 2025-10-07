# VolView Server

Visit the [VolView server documentation](../documentation/content/doc/server.md)
for more info on how to use the server.

## VISTA3D Analysis Server

For whole-body CT segmentation using MONAI's VISTA3D model with comprehensive debug storage:

### Quick Start
```bash
# One-time setup
./setup.sh

# Start server
./start_server.sh

# Or manually with Poetry
cd server
poetry install
poetry run python vista3d_server.py
```

### Key Features
- **127 Anatomical Structures** - Comprehensive whole-body segmentation
- **NRRD Debug Storage** - Medical imaging format output for ITK-SNAP/3D Slicer
- **Real-time Processing** - FastAPI server on `http://localhost:8081`
- **Poetry Dependency Management** - Modern Python dependency management with dev/prod separation

### Dependencies
All dependencies are managed via Poetry (`pyproject.toml`):
- **Production**: MONAI, PyTorch, FastAPI, ITK, python-socketio, nibabel, pynrrd
- **Development**: black, flake8, isort, mypy, pytest, pytest-asyncio, ipython

### Debug Output
Each analysis automatically saves:
- `.nrrd` files (8.2KB compressed) - ITK-SNAP compatible
- `.npy` files (1.1MB) - NumPy arrays for analysis
- `.json` files (2KB) - Processing metadata

The VISTA3D server provides automatic whole-body segmentation with comprehensive debug storage for medical software integration.