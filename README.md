# VolView + MONAI AI Integration

![A screenshot of a sample VolView session](./docs/assets/VolView-Overview.jpg)

> **Note**: This is a forked version of [VolView](https://github.com/Kitware/VolView) with integrated MONAI AI models:
> - **VISTA3D**: Automated whole-body CT segmentation (127 anatomical structures)
> - **MAISI**: Synthetic CT image generation with paired segmentations (Clara Generate panel)

## Requirements

### Frontend
- Node.js 16.x or higher
- npm 8.x or higher

### Backend (VISTA3D + MAISI Servers)
- Python 3.9 - 3.13 (Python 3.14+ not yet supported by PyTorch dependencies)
- Poetry 1.2 or higher (for dependency management)
- CUDA 11.8+ (for GPU-accelerated inference with MONAI/PyTorch)
- NVIDIA GPU:
  - **VISTA3D**: 40GB+ GPU VRAM recommended (A100 or similar)
  - **MAISI**: **58-80GB GPU VRAM required** (A100 80GB, H100 80GB, or A100 40GB for smallest sizes only)
    - ⚠️ **Consumer GPUs (RTX 3090/4090 24GB) cannot run MAISI** due to hardcoded size constraints
    - Minimum valid size: 256×256×128 voxels requires ~58GB GPU VRAM
    - System RAM: 32GB+ recommended (in addition to GPU VRAM)

## Quick Start

### Frontend Development Server
```bash
# Install dependencies
npm install

# Start development server (http://localhost:8082)
npm run dev
```

### Backend Servers

Both VISTA3D and MAISI servers use Poetry for dependency management and share the same environment.

#### VISTA3D Server (Analysis Panel)
```bash
cd server

# One-time setup (installs all dependencies via Poetry)
./setup.sh

# Start VISTA3D server (http://localhost:8081)
./start_server.sh

# Or manually:
poetry run python vista3d_server.py
```

#### MAISI Server (Clara Generate Panel)
```bash
cd server

# One-time setup (if not already done)
./setup_maisi.sh

# IMPORTANT: MAISI requires A100 80GB or H100 80GB GPU (58GB+ VRAM)
# Consumer GPUs (RTX 3090/4090) cannot run MAISI

# Start MAISI server (http://localhost:8083)
poetry run python maisi_server.py
```

**Requirements**:
- GPU: A100 80GB, H100 80GB, or A100 40GB minimum
- GPU VRAM: 58-80GB (hardware requirement, not system RAM)
- First run downloads ~21GB bundle from Hugging Face (10-30 minutes, one-time)
- No NGC authentication required (uses Hugging Face mirror)

**Note**: Both servers can run simultaneously on different ports (8081 for VISTA3D, 8083 for MAISI).

## GPU Requirements (CRITICAL)

### MAISI GPU VRAM Requirements

**⚠️ MAISI requires minimum 58GB GPU VRAM** - This is a **hardware requirement**, not system RAM.

#### What is GPU VRAM?
- **GPU VRAM** (Video RAM): Dedicated memory on the GPU chip itself
- **System RAM**: Regular computer memory (DDR4/DDR5)
- MAISI's 58GB requirement is for **GPU VRAM only**

#### Memory Breakdown for Minimum Configuration (256×256×128)
- **GPU VRAM (~58GB):**
  - Diffusion model weights: ~30GB
  - Latent representations: ~12GB
  - Forward/backward buffers: ~10GB
  - Gradient storage: ~6GB
- **System RAM (~16GB):**
  - Python process: ~4GB
  - Bundle files cached: ~2GB
  - Output arrays: ~256MB
  - OS overhead: ~10GB

#### Compatible GPUs for MAISI
| GPU Model | VRAM | MAISI Support | Notes |
|-----------|------|---------------|-------|
| **NVIDIA A100 80GB** | 80GB | ✅ Full support | Recommended for all sizes |
| **NVIDIA H100 80GB** | 80GB | ✅ Full support | Best performance |
| **NVIDIA A100 40GB** | 40GB | ⚠️ Limited | Only smallest sizes (256×256×128) |
| RTX 4090 | 24GB | ❌ Cannot run | Insufficient VRAM |
| RTX 3090 | 24GB | ❌ Cannot run | Insufficient VRAM |
| RTX A6000 | 48GB | ❌ Cannot run | Insufficient VRAM |

#### Why Consumer GPUs Cannot Run MAISI
MAISI has **hardcoded size constraints** in its architecture:
- Valid XY dimensions: Must be square and one of [256, 384, 512]
- Valid Z dimensions: One of [128, 256, 384, 512, 640, 768]
- **Minimum size (256×256×128) requires ~58GB GPU VRAM**
- No gradient checkpointing or model quantization available
- Architecture limitation, not a software configuration issue

#### Cloud GPU Options
- **AWS**: p4d.24xlarge (8× A100 80GB) or p4de.24xlarge
- **Google Cloud**: a2-highgpu-1g (1× A100 40GB), a2-ultragpu-1g (1× A100 80GB)
- **Azure**: Standard_ND96asr_v4 (8× A100 40GB)
- **Lambda Labs**: A100 instances starting ~$1.10/hour
- **RunPod, Paperspace**: Various A100 configurations

#### VISTA3D Requirements (Less Restrictive)
- 40GB+ GPU VRAM recommended
- Can run on A100 40GB, A6000, or similar
- More flexible than MAISI

For detailed MAISI size constraints and valid configurations, see [server/MAISI_SIZE_CONSTRAINTS.md](./server/MAISI_SIZE_CONSTRAINTS.md).

## Features

### Core VolView Features
- 📊 **Medical Image Visualization**: View DICOM, NIfTI, NRRD, and other medical imaging formats
- 🎨 **Volume Rendering**: Interactive 3D visualization with customizable transfer functions
- 📐 **Measurements & Annotations**: Ruler, angle, and region-of-interest tools
- 🖌️ **Segmentation Tools**: Manual painting and editing capabilities
- 🎛️ **Multi-planar Views**: Axial, Coronal, Sagittal, and 3D views

### VISTA3D Integration (Analysis Panel)
- 🤖 **Automated Segmentation**: AI-powered segmentation of 127 anatomical structures
- 🎯 **Whole-body CT Analysis**: Process complete CT scans automatically
- ⚡ **GPU-Accelerated**: Fast inference using CUDA
- 📊 **Interactive Results**: Review and edit AI-generated segmentations
- 💾 **Export Capabilities**: Save segmentations in multiple formats

### MAISI Integration (Clara Generate Panel)
- 🎨 **Synthetic CT Generation**: Create realistic CT images from scratch
- 🏥 **Paired Segmentations**: Automatically generate anatomical masks
- 🎛️ **6 Built-in Presets**: Optimized for different quality/speed tradeoffs
- ⚙️ **Customizable Parameters**: Control image size, spacing, anatomy scale, and quality
- 💡 **Resource Warnings**: Smart GPU memory and time estimation with color-coded alerts
- 🔄 **Reproducible Results**: Seed-based generation for consistent outputs
- ⚠️ **High-End GPU Required**: Requires A100/H100 with 58-80GB GPU VRAM (consumer GPUs cannot run MAISI)

## Documentation

### User Guides
- **[VolView Documentation](./docs/)** - Complete VolView user manual
- **[VISTA3D Analysis Guide](./server/README.md)** - VISTA3D server setup and usage
- **[Clara Generate User Guide](./docs/clara_generate_user_guide.md)** - MAISI generation workflow
- **[Clara Generate Quick Reference](./docs/MAISI_QUICK_REFERENCE.md)** - Quick lookup guide

### Technical Documentation
- **[MAISI Server API](./server/README_MAISI.md)** - MAISI server endpoints and configuration
- **[MAISI Design Decisions](./docs/MAISI_DESIGN_DECISIONS.md)** - Architecture and design choices
- **[MAISI Implementation Summary](./docs/MAISI_IMPLEMENTATION_SUMMARY.md)** - Development overview
- **[Migration to Poetry](./MIGRATION_TO_POETRY.md)** - Poetry setup guide

### Cloud Deployment
- **[AWS EC2 Setup Guide](./docs/AWS_EC2_SETUP_GUIDE.md)** - Complete guide for provisioning A100 GPU instance on AWS
- **[AWS Quick Start Checklist](./docs/AWS_QUICK_START_CHECKLIST.md)** - Step-by-step checklist for AWS deployment
- **[AWS Cost Optimization](./docs/AWS_COST_OPTIMIZATION.md)** - Strategies to minimize cloud costs (70-93% savings)

## Architecture

```
VolView
├── Frontend (Vue 3 + Vuetify)
│   ├── Port 8082 (Development)
│   ├── Analysis Panel → VISTA3D Server
│   └── Clara Generate Panel → MAISI Server
│
├── VISTA3D Server (FastAPI + MONAI)
│   ├── Port 8081
│   ├── Automated CT Segmentation
│   └── 127 Anatomical Structures
│
└── MAISI Server (FastAPI + MONAI)
    ├── Port 8083
    ├── Synthetic CT Generation
    └── Paired Segmentation Masks
```

## Advanced Usage

### Running Both Servers Simultaneously

```bash
# Terminal 1: Start VISTA3D server
cd server
poetry run python vista3d_server.py

# Terminal 2: Start MAISI server
cd server
poetry run python maisi_server.py

# Terminal 3: Start VolView frontend
npm run dev
```

### Custom Server Ports

```bash
# VISTA3D on custom port
VISTA3D_PORT=9001 poetry run python vista3d_server.py

# MAISI on custom port
MAISI_SERVER_PORT=9003 poetry run python maisi_server.py
```

### Production Build

```bash
# Build frontend for production
npm run build

# Serve with nginx or other web server
# See docs/deploying_volview.md for details
```

## Troubleshooting

### Poetry Issues
```bash
# Install Poetry if not available
curl -sSL https://install.python-poetry.org | python3 -

# Add to PATH
export PATH="$HOME/.local/bin:$PATH"

# Update Poetry
poetry self update
```

### GPU/CUDA Issues
```bash
# Check CUDA availability
nvidia-smi

# Check PyTorch CUDA support
poetry run python -c "import torch; print(torch.cuda.is_available())"

# Check GPU VRAM (critical for MAISI)
nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits
# MAISI requires: 58000+ MB (58GB+)
# VISTA3D requires: 40000+ MB (40GB+)
```

### MAISI GPU Memory Errors
If you see errors like:
- `"CUDA out of memory"`
- `"Failed to evaluate ConfigExpression: check_input"`
- `"output_size[0] must be in [256,384,512]"`

**Causes:**
1. **Insufficient GPU VRAM** (< 58GB) - Most common
2. Invalid size configuration (not meeting MAISI's hardcoded constraints)
3. Other GPU processes consuming memory

**Solutions:**
1. **Verify GPU VRAM**: `nvidia-smi` - Must show 58GB+ total memory
2. **Clear GPU memory**: Close other GPU applications, restart server
3. **Use cloud GPU**: If local GPU < 58GB, MAISI cannot run locally
4. **Check size constraints**: See [server/MAISI_SIZE_CONSTRAINTS.md](./server/MAISI_SIZE_CONSTRAINTS.md)

### Server Connection Issues
- Verify server is running: `curl http://localhost:8081/api/health` (VISTA3D)
- Verify server is running: `curl http://localhost:8083/api/maisi_health` (MAISI)
- Check firewall settings
- Ensure no port conflicts

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

See [LICENSE](./LICENSE) file for details.

## Acknowledgments

- **[Kitware VolView](https://github.com/Kitware/VolView)** - Original VolView project
- **[MONAI](https://monai.io/)** - Medical Open Network for AI
- **[VISTA3D](https://github.com/Project-MONAI/VISTA)** - Versatile Imaging SegmenTation and Annotation
- **[MAISI](https://github.com/Project-MONAI/GenerativeModels)** - Medical AI for Synthetic Imaging

---

**Version**: 0.2.0 (with VISTA3D + MAISI integration)  
**Last Updated**: October 7, 2025

