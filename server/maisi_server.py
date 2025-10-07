#!/usr/bin/env python3
"""
MAISI Server for VolView Integration
MONAI MAISI CT Generative implementation for synthetic CT generation
"""

import os
import sys
import json
import tempfile
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import logging
from datetime import datetime
import base64

# FastAPI imports
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# PyTorch and MONAI imports
import torch
import nibabel as nib

# Import VolView server transformation functions
sys.path.append(str(Path(__file__).parent / "volview_server"))
try:
    from volview_server.transformers import convert_itk_to_vtkjs_image
    VOLVIEW_TRANSFORMERS_AVAILABLE = True
    print("✅ VolView transformers loaded!")
except ImportError as e:
    print(f"⚠️ VolView transformers not available: {e}")
    VOLVIEW_TRANSFORMERS_AVAILABLE = False

# Import VTK.js helpers from vista3d_server.py
sys.path.append(str(Path(__file__).parent))
try:
    from vista3d_server import numpy_to_vtkjs_array, fix_vtkjs_binary_data
    print("✅ VTK.js serialization helpers loaded from vista3d_server!")
except ImportError as e:
    print(f"⚠️ VTK.js helpers not available: {e}")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# Pydantic Models for Request/Response
# ============================================================================

class MAISIGenerateRequest(BaseModel):
    """Request model for MAISI generation"""
    output_size: List[int] = [256, 256, 256]
    spacing: List[float] = [1.0, 1.0, 1.0]
    controllable_anatomy_size: Optional[List[float]] = []
    body_region: Optional[List[str]] = []
    anatomy_list: Optional[List[str]] = ["liver"]
    num_inference_steps: int = 1000
    seed: Optional[int] = 42

class ResourceEstimate(BaseModel):
    """Model for resource estimation"""
    output_size: List[int]
    spacing: List[float]
    num_inference_steps: int

# ============================================================================
# MAISI Server Class
# ============================================================================

class MAISIServer:
    """MAISI CT Generative server for synthetic CT image generation"""
    
    def __init__(self):
        self.bundle = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.bundle_initialized = False
        logger.info(f"🎯 MAISIServer initialized with device: {self.device}")
        
    async def initialize(self):
        """Download and initialize MAISI bundle from Hugging Face"""
        try:
            from monai.bundle import download
            import os
            
            bundle_name = "maisi_ct_generative"
            bundle_dir = Path.home() / ".cache" / "monai"
            bundle_dir.mkdir(parents=True, exist_ok=True)
            
            # Check if bundle already exists (skip download)
            bundle_path = bundle_dir / bundle_name
            if bundle_path.exists():
                logger.info(f"✅ MAISI bundle found at {bundle_path}")
                self.bundle_path = str(bundle_path)
                self.bundle_initialized = True
                return
            
            logger.info(f"📦 Downloading MAISI bundle from Hugging Face to {bundle_dir}...")
            logger.info("   This is a one-time download (~21GB, may take 10-30 minutes)...")
            logger.info("   Source: huggingface.co/MONAI/maisi_ct_generative")
            
            # Download MAISI bundle from Hugging Face (no authentication required)
            # Using Hugging Face mirror instead of NGC for easier access
            self.bundle_path = download(
                name=bundle_name,
                source="huggingface_hub",
                repo="MONAI/maisi_ct_generative",
                bundle_dir=str(bundle_dir),
                progress=True
            )
            
            logger.info(f"✅ MAISI bundle downloaded successfully to {self.bundle_path}")
            self.bundle_initialized = True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize MAISI bundle: {e}")
            logger.error("   Possible causes:")
            logger.error("   1. Network connectivity issues")
            logger.error("   2. Insufficient disk space (~21GB required)")
            logger.error("   3. Hugging Face service temporarily unavailable")
            logger.error("   Bundle source: https://huggingface.co/MONAI/maisi_ct_generative")
            raise
    
    def get_system_resources(self) -> Dict:
        """Inspect available GPU memory and compute resources"""
        try:
            if torch.cuda.is_available():
                gpu_props = torch.cuda.get_device_properties(0)
                gpu_memory_total = gpu_props.total_memory / (1024**3)  # GB
                gpu_memory_allocated = torch.cuda.memory_allocated(0) / (1024**3)  # GB
                gpu_memory_free = gpu_memory_total - gpu_memory_allocated
                
                return {
                    "gpu_available": True,
                    "gpu_name": torch.cuda.get_device_name(0),
                    "gpu_memory_total_gb": round(gpu_memory_total, 2),
                    "gpu_memory_free_gb": round(gpu_memory_free, 2),
                    "gpu_memory_allocated_gb": round(gpu_memory_allocated, 2),
                    "cuda_version": torch.version.cuda
                }
            else:
                return {
                    "gpu_available": False,
                    "error": "No CUDA-capable GPU detected"
                }
        except Exception as e:
            logger.error(f"Error getting system resources: {e}")
            return {
                "gpu_available": False,
                "error": str(e)
            }
    
    def estimate_resources(self, params: Dict) -> Dict:
        """Estimate resource requirements and generation time"""
        output_size = params.get("output_size", [256, 256, 256])
        inference_steps = params.get("num_inference_steps", 1000)
        
        # Calculate volume size
        volume_size = output_size[0] * output_size[1] * output_size[2]
        
        # GPU memory estimate based on MAISI's valid sizes
        # Empirically derived from MAISI documentation and testing
        # MAISI only supports: XY from [256,384,512], Z from [128,256,384,512,640,768]
        xy_size = output_size[0]  # Assuming square XY (MAISI requirement)
        z_size = output_size[2]
        
        if xy_size == 256:
            if z_size <= 256:
                estimated_gpu_gb = 58     # 256x256x128 or 256x256x256
            else:
                estimated_gpu_gb = 65     # 256x256x384+
        elif xy_size == 384:
            if z_size <= 256:
                estimated_gpu_gb = 68     # 384x384x128-256
            else:
                estimated_gpu_gb = 75     # 384x384x384+
        else:  # xy_size == 512
            if z_size <= 256:
                estimated_gpu_gb = 75     # 512x512x128-256
            else:
                estimated_gpu_gb = 80     # 512x512x384+
        
        # Time estimate (adjusted for actual MAISI performance)
        # Base: 5-10 minutes for 1000 steps on A100 at 256^3
        base_time_per_1000_steps = 7.5  # minutes (mid-range estimate)
        estimated_minutes = (inference_steps / 1000) * base_time_per_1000_steps
        
        # Adjust for volume size
        size_multiplier = volume_size / (256**3)
        estimated_minutes *= (0.5 + 0.5 * size_multiplier)
        
        return {
            "estimated_gpu_memory_gb": estimated_gpu_gb,
            "estimated_time_minutes": round(estimated_minutes, 1),
            "volume_size": volume_size,
            "inference_steps": inference_steps,
            "output_dimensions": f"{output_size[0]}×{output_size[1]}×{output_size[2]}"
        }
    
    def validate_params(self, params: Dict) -> Dict:
        """Validate and normalize generation parameters per MAISI requirements"""
        errors = []
        
        output_size = params.get("output_size", [256, 256, 256])
        spacing = params.get("spacing", [1.0, 1.0, 1.0])
        
        # MAISI Requirement 1: XY dimensions must be equal
        if output_size[0] != output_size[1]:
            errors.append(f"X and Y dimensions must be equal (got {output_size[0]} != {output_size[1]})")
        
        # MAISI Requirement 2: XY dimension must be one of [256, 384, 512]
        valid_xy_sizes = [256, 384, 512]
        if output_size[0] not in valid_xy_sizes:
            errors.append(f"XY dimension must be one of {valid_xy_sizes} (got {output_size[0]})")
        
        # MAISI Requirement 3: Z dimension must be one of [128, 256, 384, 512, 640, 768]
        valid_z_sizes = [128, 256, 384, 512, 640, 768]
        if output_size[2] not in valid_z_sizes:
            errors.append(f"Z dimension must be one of {valid_z_sizes} (got {output_size[2]})")
        
        # MAISI Requirement 4: XY spacing must be equal
        if spacing[0] != spacing[1]:
            errors.append(f"X and Y spacing must be equal (got {spacing[0]} != {spacing[1]})")
        
        # MAISI Requirement 5: XY spacing must be 0.5-3.0mm
        if spacing[0] < 0.5 or spacing[0] > 3.0:
            errors.append(f"XY spacing must be between 0.5 and 3.0 mm (got {spacing[0]})")
        
        # MAISI Requirement 6: Z spacing must be 0.5-5.0mm
        if spacing[2] < 0.5 or spacing[2] > 5.0:
            errors.append(f"Z spacing must be between 0.5 and 5.0 mm (got {spacing[2]})")
        
        # Inference steps validation
        num_steps = params.get("num_inference_steps", 1000)
        if num_steps < 10 or num_steps > 2000:
            errors.append("Number of inference steps must be between 10 and 2000")
        
        if errors:
            raise ValueError(", ".join(errors))
        
        return params
    
    def generate(self, params: Dict) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generate synthetic CT image and segmentation using MAISI bundle
        
        Returns:
            Tuple of (generated_image, generated_segmentation) as numpy arrays
        """
        try:
            from monai.bundle import ConfigWorkflow
            import shutil
            
            logger.info("="*80)
            logger.info(f"🚀 MAISI GENERATION STARTED")
            logger.info("="*80)
            logger.info(f"📝 Input Parameters:")
            for key, value in params.items():
                logger.info(f"   {key}: {value}")
            logger.info("="*80)
            
            # Prepare MAISI configuration
            output_size = params.get("output_size", [256, 256, 256])
            spacing = params.get("spacing", [1.0, 1.0, 1.0])
            controllable_anatomy_size = params.get("controllable_anatomy_size", [])
            body_region = params.get("body_region", [])
            anatomy_list = params.get("anatomy_list", ["liver"])
            num_inference_steps = params.get("num_inference_steps", 1000)
            seed = params.get("seed", 42)
            
            logger.info(f"🎲 Setting random seed: {seed}")
            # Set random seed for reproducibility
            torch.manual_seed(seed)
            np.random.seed(seed)
            
            logger.info(f"📂 Bundle path: {self.bundle_path}")
            logger.info(f"📄 Loading MAISI workflow configuration...")
            
            # Load MAISI bundle workflow
            workflow = ConfigWorkflow(
                workflow_type="inference",
                config_file=str(Path(self.bundle_path) / "configs" / "inference.json"),
                logging_file=str(Path(self.bundle_path) / "configs" / "logging.conf"),
            )
            
            logger.info(f"✅ Workflow loaded successfully")
            
            # Create debug output directory (persistent for inspection)
            debug_dir = Path.home() / "maisi_debug_outputs"
            debug_dir.mkdir(parents=True, exist_ok=True)
            
            # Create timestamped subdirectory for this generation
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            current_debug_dir = debug_dir / f"generation_{timestamp}_seed{seed}"
            current_debug_dir.mkdir(parents=True, exist_ok=True)
            
            logger.info(f"📁 Debug output directory: {current_debug_dir}")
            
            # Override configuration with user parameters
            workflow.bundle_root = self.bundle_path
            workflow.output_dir = str(current_debug_dir)  # Use persistent debug directory
            
            logger.info(f"🔧 Configuring MAISI parameters:")
            logger.info(f"   output_size: {output_size}")
            logger.info(f"   spacing: {spacing}")
            logger.info(f"   body_region: {body_region}")
            logger.info(f"   anatomy_list: {anatomy_list}")
            logger.info(f"   controllable_anatomy_size: {controllable_anatomy_size}")
            logger.info(f"   num_inference_steps: {num_inference_steps}")
            logger.info(f"   num_samples: 1")
            logger.info(f"   quality_check: False")
            
            # Set generation parameters
            override_dict = {
                "output_size": output_size,
                "spacing": spacing,
                "controllable_anatomy_size": controllable_anatomy_size,
                "body_region": body_region,
                "anatomy_list": anatomy_list,
                "num_inference_steps": num_inference_steps,
                "seed": seed,
                "num_samples": 1,  # Always 1 in v1.0
                "quality_check": False,  # Disabled - allow all outputs
            }
            
            workflow.parser.update(override_dict)
            logger.info(f"✅ Parameters configured in workflow")
            
            estimated_time = self.estimate_resources(params)['estimated_time_minutes']
            logger.info("="*80)
            logger.info(f"⏳ RUNNING MAISI INFERENCE")
            logger.info(f"   Estimated time: ~{estimated_time:.1f} minutes")
            logger.info(f"   Output will be saved to: {current_debug_dir}")
            logger.info("="*80)
            
            # Run inference
            workflow.run()
            
            logger.info("="*80)
            logger.info(f"✅ MAISI inference completed!")
            logger.info("="*80)
            
            # Load generated outputs
            output_dir = Path(workflow.output_dir)
            logger.info(f"📂 Scanning output directory: {output_dir}")
            
            # List all files in output directory
            all_files = list(output_dir.glob("*"))
            logger.info(f"📋 Files found in output directory ({len(all_files)} total):")
            for f in all_files:
                logger.info(f"   - {f.name} ({f.stat().st_size / 1024 / 1024:.2f} MB)")
            
            # Find generated image and segmentation files
            image_files = list(output_dir.glob("*_image.nii.gz"))
            seg_files = list(output_dir.glob("*_seg.nii.gz"))
            
            logger.info(f"🔍 Image files found: {len(image_files)}")
            for f in image_files:
                logger.info(f"   - {f.name}")
            
            logger.info(f"🔍 Segmentation files found: {len(seg_files)}")
            for f in seg_files:
                logger.info(f"   - {f.name}")
            
            if not image_files or not seg_files:
                logger.error(f"❌ Required files not found!")
                logger.error(f"   Image files: {len(image_files)}")
                logger.error(f"   Segmentation files: {len(seg_files)}")
                raise RuntimeError(f"Generated files not found in {output_dir}")
            
            logger.info(f"📖 Loading image: {image_files[0].name}")
            # Load NIfTI files
            image_nii = nib.load(str(image_files[0]))
            logger.info(f"   Shape: {image_nii.shape}")
            logger.info(f"   Data type: {image_nii.get_data_dtype()}")
            logger.info(f"   Affine:\n{image_nii.affine}")
            
            logger.info(f"📖 Loading segmentation: {seg_files[0].name}")
            seg_nii = nib.load(str(seg_files[0]))
            logger.info(f"   Shape: {seg_nii.shape}")
            logger.info(f"   Data type: {seg_nii.get_data_dtype()}")
            
            # Convert to numpy arrays
            logger.info(f"🔄 Converting to numpy arrays...")
            generated_image = image_nii.get_fdata().astype(np.float32)
            generated_seg = seg_nii.get_fdata().astype(np.float32)
            
            logger.info(f"📊 Image statistics:")
            logger.info(f"   Min: {generated_image.min():.2f}")
            logger.info(f"   Max: {generated_image.max():.2f}")
            logger.info(f"   Mean: {generated_image.mean():.2f}")
            logger.info(f"   Std: {generated_image.std():.2f}")
            
            logger.info(f"📊 Segmentation statistics:")
            logger.info(f"   Unique labels: {np.unique(generated_seg)}")
            logger.info(f"   Label counts: {np.bincount(generated_seg.astype(int).flatten())}")
            
            # Save metadata to debug directory
            metadata_file = current_debug_dir / "generation_metadata.json"
            metadata = {
                "timestamp": timestamp,
                "parameters": params,
                "image_shape": list(generated_image.shape),
                "seg_shape": list(generated_seg.shape),
                "image_stats": {
                    "min": float(generated_image.min()),
                    "max": float(generated_image.max()),
                    "mean": float(generated_image.mean()),
                    "std": float(generated_image.std()),
                },
                "seg_unique_labels": [int(x) for x in np.unique(generated_seg)],
                "output_files": {
                    "image": str(image_files[0]),
                    "segmentation": str(seg_files[0]),
                },
                "debug_directory": str(current_debug_dir),
            }
            
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            logger.info(f"💾 Metadata saved to: {metadata_file}")
            logger.info("="*80)
            logger.info(f"✅ GENERATION COMPLETE!")
            logger.info(f"📁 Results saved in: {current_debug_dir}")
            logger.info(f"   - Image: {image_files[0].name}")
            logger.info(f"   - Segmentation: {seg_files[0].name}")
            logger.info(f"   - Metadata: generation_metadata.json")
            logger.info("="*80)
            
            return generated_image, generated_seg
            
        except Exception as e:
            logger.error("="*80)
            logger.error(f"❌ GENERATION FAILED!")
            logger.error(f"Error: {e}")
            logger.error(f"Error type: {type(e).__name__}")
            import traceback
            logger.error(f"Traceback:\n{traceback.format_exc()}")
            logger.error("="*80)
            raise
    
    def numpy_to_vtkjs_image(self, array: np.ndarray, spacing: List[float], origin: List[float] = None) -> Dict:
        """
        Convert numpy array to VTK.js ImageData format
        Reuses helpers from vista3d_server.py
        """
        if origin is None:
            origin = [0.0, 0.0, 0.0]
        
        # VTK.js expects dimensions in [x, y, z] order
        dimensions = list(array.shape[:3])
        
        # Flatten array to 1D (VTK.js format)
        flat_array = array.flatten(order='F')  # Fortran order for VTK compatibility
        
        # Convert to VTK.js data array using helper from vista3d_server
        scalar_array = numpy_to_vtkjs_array(flat_array, name="Scalars", ncomp=1)
        
        # Build VTK.js ImageData structure
        vtkjs_image = {
            "vtkClass": "vtkImageData",
            "spacing": spacing,
            "origin": origin,
            "dimensions": dimensions,
            "pointData": {
                "vtkClass": "vtkDataSetAttributes",
                "activeScalars": 0,
                "arrays": [scalar_array]
            }
        }
        
        # Fix any binary data issues
        vtkjs_image = fix_vtkjs_binary_data(vtkjs_image)
        
        return vtkjs_image

# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="MAISI Server",
    description="MONAI MAISI CT Generative server for VolView",
    version="1.0.0"
)

# CORS middleware for VolView frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global server instance
server = MAISIServer()

# ============================================================================
# API Endpoints
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize MAISI bundle on server startup"""
    logger.info("🚀 Starting MAISI Server...")
    try:
        await server.initialize()
        logger.info("✅ MAISI Server ready!")
    except Exception as e:
        logger.error(f"❌ Failed to start MAISI Server: {e}")

@app.get("/api/maisi_health")
async def health_check():
    """Check if MAISI server is ready"""
    system_resources = server.get_system_resources()
    return {
        "status": "ready" if server.bundle_initialized else "initializing",
        "device": server.device,
        "bundle_initialized": server.bundle_initialized,
        "gpu_available": system_resources.get("gpu_available", False),
        "gpu_name": system_resources.get("gpu_name", "N/A"),
        "gpu_memory_free_gb": system_resources.get("gpu_memory_free_gb", 0),
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/maisi_estimate")
async def estimate_resources(request: ResourceEstimate):
    """Estimate resource requirements before generation"""
    try:
        params = request.dict()
        system_resources = server.get_system_resources()
        resource_estimate = server.estimate_resources(params)
        
        # Determine warning level
        warning_level = "safe"
        warnings = []
        
        if system_resources["gpu_available"]:
            free_memory = system_resources["gpu_memory_free_gb"]
            required_memory = resource_estimate["estimated_gpu_memory_gb"]
            
            if required_memory > free_memory * 0.95:
                warning_level = "critical"
                warnings.append({
                    "level": "error",
                    "message": f"Insufficient GPU memory: {required_memory:.1f} GB required, "
                              f"only {free_memory:.1f} GB available. Generation will likely fail."
                })
            elif required_memory > free_memory * 0.80:
                warning_level = "warning"
                warnings.append({
                    "level": "warning",
                    "message": f"Tight GPU memory: {required_memory:.1f} GB required, "
                              f"{free_memory:.1f} GB available. Close other GPU applications."
                })
            else:
                warning_level = "safe"
                warnings.append({
                    "level": "info",
                    "message": f"Resource check passed: {free_memory:.1f} GB GPU memory available."
                })
        else:
            warning_level = "critical"
            warnings.append({
                "level": "error",
                "message": "No GPU detected. MAISI requires CUDA-capable GPU with 58-80GB memory."
            })
        
        # Time warnings
        if resource_estimate["estimated_time_minutes"] > 15:
            warnings.append({
                "level": "warning",
                "message": f"Long generation time: ~{resource_estimate['estimated_time_minutes']:.1f} minutes. "
                          f"Consider reducing inference steps or output size."
            })
        
        return JSONResponse({
            "success": True,
            "system_resources": system_resources,
            "resource_estimate": resource_estimate,
            "warning_level": warning_level,
            "warnings": warnings
        })
        
    except Exception as e:
        logger.error(f"Resource estimation error: {e}")
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=500
        )

@app.post("/api/maisi_generate")
async def generate_ct(request: MAISIGenerateRequest):
    """
    Generate synthetic CT image with paired segmentation
    
    Request body:
    {
        "output_size": [256, 256, 256],
        "spacing": [1.0, 1.0, 1.0],
        "controllable_anatomy_size": [],
        "body_region": [],
        "anatomy_list": ["liver"],
        "num_inference_steps": 1000,
        "seed": 42
    }
    """
    try:
        logger.info("\n" + "="*80)
        logger.info("🌐 RECEIVED GENERATION REQUEST")
        logger.info("="*80)
        
        params = request.dict()
        
        logger.info("📥 Request parameters:")
        for key, value in params.items():
            logger.info(f"   {key}: {value}")
        
        logger.info("\n🔍 Checking system resources...")
        # Check system resources
        system_resources = server.get_system_resources()
        logger.info(f"💻 GPU: {system_resources.get('gpu_name', 'N/A')}")
        logger.info(f"🎮 GPU Memory: {system_resources.get('gpu_memory_free_gb', 0):.1f} GB free / {system_resources.get('gpu_memory_total_gb', 0):.1f} GB total")
        
        resource_estimate = server.estimate_resources(params)
        logger.info(f"📊 Estimated requirements: {resource_estimate['estimated_gpu_memory_gb']:.1f} GB GPU, ~{resource_estimate['estimated_time_minutes']:.1f} min")
        
        # Collect warnings but don't block generation
        warnings = []
        if system_resources["gpu_available"]:
            if resource_estimate["estimated_gpu_memory_gb"] > system_resources["gpu_memory_free_gb"]:
                warning_msg = (
                    f"⚠️ Warning: Estimated GPU memory ({resource_estimate['estimated_gpu_memory_gb']:.1f} GB) "
                    f"exceeds available ({system_resources['gpu_memory_free_gb']:.1f} GB). "
                    f"Generation may fail or be slow."
                )
                warnings.append(warning_msg)
                logger.warning(warning_msg)
        else:
            warning_msg = "⚠️ Warning: No GPU detected. Generation will be extremely slow or may fail."
            warnings.append(warning_msg)
            logger.warning(warning_msg)
        
        logger.info("\n✅ Validating parameters...")
        # Validate parameters
        params = server.validate_params(params)
        logger.info("✅ Parameters validated successfully")
        
        logger.info("\n🎨 Starting generation process...")
        # Generate image + segmentation (quality checks disabled)
        generated_image, generated_seg = server.generate(params)
        
        logger.info("\n🔄 Converting to VTK.js format...")
        # Convert to VTK.js format
        spacing = params["spacing"]
        logger.info(f"   Converting image {generated_image.shape} with spacing {spacing}...")
        vtkjs_image = server.numpy_to_vtkjs_image(generated_image, spacing)
        logger.info(f"   ✅ Image converted")
        
        logger.info(f"   Converting segmentation {generated_seg.shape} with spacing {spacing}...")
        vtkjs_seg = server.numpy_to_vtkjs_image(generated_seg, spacing)
        logger.info(f"   ✅ Segmentation converted")
        
        response_data = {
            "success": True,
            "image": vtkjs_image,
            "segmentation": vtkjs_seg,
            "metadata": {
                "output_size": params["output_size"],
                "spacing": params["spacing"],
                "controllable_anatomy_size": params.get("controllable_anatomy_size"),
                "body_region": params.get("body_region"),
                "anatomy_list": params.get("anatomy_list"),
                "seed": params.get("seed"),
                "num_inference_steps": params.get("num_inference_steps"),
                "timestamp": datetime.now().isoformat()
            },
            "warnings": warnings,
            "resource_estimate": resource_estimate
        }
        
        logger.info("="*80)
        logger.info("✅ GENERATION REQUEST COMPLETED SUCCESSFULLY")
        logger.info(f"📤 Returning response with image and segmentation data")
        logger.info("="*80 + "\n")
        
        return JSONResponse(response_data)
        
    except ValueError as e:
        logger.error("="*80)
        logger.error(f"❌ VALIDATION ERROR")
        logger.error(f"Error: {e}")
        logger.error("="*80 + "\n")
        return JSONResponse(
            {"success": False, "error": f"Validation error: {str(e)}"},
            status_code=400
        )
    except Exception as e:
        logger.error("="*80)
        logger.error(f"❌ GENERATION REQUEST FAILED")
        logger.error(f"Error: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        logger.error("="*80 + "\n")
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=500
        )

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "MAISI Server",
        "version": "1.0.0",
        "status": "ready" if server.bundle_initialized else "initializing",
        "endpoints": {
            "health": "/api/maisi_health",
            "estimate": "/api/maisi_estimate",
            "generate": "/api/maisi_generate"
        }
    }

# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("MAISI_SERVER_PORT", 8083))
    
    logger.info(f"🌟 Starting MAISI Server on port {port}...")
    logger.info(f"📋 API Documentation available at http://localhost:{port}/docs")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
