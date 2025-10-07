# VolView + VISTA3D Integration

![A screenshot of a sample VolView session](./docs/assets/VolView-Overview.jpg)

> **Note**: This is a forked version of [VolView](https://github.com/Kitware/VolView) that integrates MONAI's VISTA3D model for automated whole-body CT segmentation with 127 anatomical structures.

## Quick Start

### Frontend Development Server
```bash
# Install dependencies
npm install

# Start development server (http://localhost:8082)
npm run dev
```

### Backend VISTA3D Server
```bash
# Navigate to server directory
cd server

# One-time setup (installs Poetry dependencies)
./setup.sh

# Start VISTA3D server (http://localhost:8081)
./start_server.sh
```

