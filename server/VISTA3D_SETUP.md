# VISTA3D Server Setup

This document describes how to set up the VISTA3D backend server for VolView using Poetry.

## Prerequisites

1. **Python 3.8+**: Ensure you have Python 3.8 or later installed
2. **Poetry**: Install Poetry for dependency management
   ```bash
   curl -sSL https://install.python-poetry.org | python3 -
   ```
3. **CUDA** (optional): For GPU acceleration, install CUDA toolkit

## Quick Setup

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Run the setup script:
   ```bash
   ./setup_vista3d.sh
   ```

3. Start the server:
   ```bash
   ./start_server.sh
   ```

## Manual Setup

If you prefer to set up manually:

1. Install dependencies:
   ```bash
   poetry install
   ```

2. Download the VISTA3D model:
   ```bash
   poetry run python -m monai.bundle download "vista3d" --bundle_dir "bundles/"
   ```

3. Start the server:
   ```bash
   poetry run python vista3d_server.py --host 0.0.0.0 --port 8000
   ```

## Dependencies

The server uses the following key dependencies (managed via `pyproject.toml`):

- **MONAI**: Medical imaging AI framework with VISTA3D bundle
- **PyTorch**: Deep learning framework
- **FastAPI**: Web framework for the REST API
- **nibabel**: Medical image I/O
- **ITK**: Image processing toolkit

## Testing

Test the server setup:
```bash
./test_server.sh
```

## Server Endpoints

- Health check: `GET http://localhost:8000/health`
- Model info: `GET http://localhost:8000/api/model_info`
- VISTA3D analysis: `POST http://localhost:8000/api/vista3d_analysis`

## VolView Integration

1. Start VolView: `npm run dev` (from the root directory)
2. Open the Analysis panel
3. Configure server connection to `http://localhost:8000`
4. Load a CT scan and run VISTA3D analysis

## Troubleshooting

### Common Issues

1. **Poetry not found**: Install Poetry using the official installer
2. **CUDA errors**: Install compatible CUDA toolkit or run on CPU
3. **Model download fails**: Check internet connection and disk space
4. **Port conflicts**: Change the port in `vista3d_server.py`

### GPU vs CPU

- **GPU**: Much faster inference (~10-30 seconds)
- **CPU**: Slower but works without special hardware (~2-5 minutes)

The server automatically detects and uses GPU if available.