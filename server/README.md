# VolView Server

Visit the [VolView server documentation](../documentation/content/doc/server.md)
for more info on how to use the server.

## VISTA3D Analysis Server

For whole-body CT segmentation using MONAI's VISTA3D model with comprehensive debug storage:

### Quick Start
```bash
# Fresh installation
./setup_fresh_install.sh

# Test dependencies
python test_dependencies.py

# Start server
source ../venv/bin/activate
python vista3d_server.py
```

### Key Features
- **58 Anatomical Structures** - Comprehensive body segmentation
- **NRRD Debug Storage** - Medical imaging format output for ITK-SNAP/3D Slicer
- **Real-time Processing** - FastAPI server on `http://localhost:8081`
- **Dependency Management** - Complete `requirements.txt` for reproducible builds

### Dependencies
All dependencies are captured in `requirements.txt` including:
- MONAI 1.5.1 (medical AI framework)
- PyTorch 2.8.0 (deep learning)
- FastAPI 0.118.0 (web framework)
- pynrrd 1.1.3 (NRRD format support)

### Debug Output
Each analysis automatically saves:
- `.nrrd` files (8.2KB compressed) - ITK-SNAP compatible
- `.npy` files (1.1MB) - NumPy arrays for analysis
- `.json` files (2KB) - Processing metadata

The VISTA3D server provides automatic whole-body segmentation with comprehensive debug storage for medical software integration.