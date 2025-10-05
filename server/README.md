# VolView Server

Visit the [VolView server documentation](../documentation/content/doc/server.md)
for more info on how to use the server.

## VISTA3D Analysis Server

For whole-body CT segmentation using MONAI's VISTA3D model:

1. **Setup**: See `VISTA3D_SETUP.md` for detailed instructions
2. **Quick start**: Run `./setup_vista3d.sh` to install dependencies with Poetry
3. **Start server**: Run `./start_server.sh` to launch the VISTA3D server
4. **Integration**: Connect VolView to `http://localhost:8000` for analysis

The VISTA3D server provides automatic whole-body segmentation of 130+ anatomical structures from CT scans.