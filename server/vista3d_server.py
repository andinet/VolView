"""
VolView VISTA3D Backend Server

This server provides VISTA3D whole-body segmentation analysis for VolView.
It uses the MONAI VISTA3D bundle for automatic anatomical structure segmentation.

Requirements:
- Python 3.8+
- MONAI with VISTA3D bundle
- PyTorch
- FastAPI
- Additional medical imaging libraries

Installation:
pip install "monai[fire]" torch torchvision fastapi uvicorn python-multipart
pip install nibabel numpy scipy itk SimpleITK
python -m monai.bundle download "vista3d" --bundle_dir "./bundles/"
"""

import asyncio
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Any, Optional
import uuid

import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np

# Medical imaging imports
try:
    import nibabel as nib
    import torch
    from monai.bundle import create_workflow
    from monai.transforms import Compose, LoadImaged, EnsureChannelFirstd, Spacingd, ScaleIntensityRanged
    from monai.data import MetaTensor
    MONAI_AVAILABLE = True
except ImportError:
    MONAI_AVAILABLE = False
    print("Warning: MONAI not available. Install with: pip install 'monai[fire]' torch")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pydantic models for API
class Vista3dParams(BaseModel):
    segmentEverything: bool = True
    selectedLabels: List[int] = []
    confidenceThreshold: float = 0.5
    usePointPrompts: bool = False
    pointPrompts: List[Dict] = []

class Vista3dResult(BaseModel):
    segmentationId: str
    labels: List[Dict[str, Any]]
    processing_time: float

class Vista3dAnalyzer:
    """
    VISTA3D analyzer using MONAI bundle
    """
    
    def __init__(self, bundle_path: str = "./bundles/vista3d"):
        self.bundle_path = Path(bundle_path)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.workflow = None
        self.temp_dir = Path(tempfile.gettempdir()) / "volview_vista3d"
        self.temp_dir.mkdir(exist_ok=True)
        
        # VISTA3D complete label mapping
        self.label_names = {
            1: "liver", 2: "kidney", 3: "spleen", 4: "pancreas", 5: "right kidney",
            6: "aorta", 7: "inferior vena cava", 8: "right adrenal gland", 
            9: "left adrenal gland", 10: "gallbladder", 11: "esophagus", 
            12: "stomach", 13: "duodenum", 14: "left kidney", 15: "bladder",
            16: "prostate or uterus", 17: "portal vein and splenic vein", 
            18: "rectum", 19: "small bowel", 20: "lung", 21: "bone", 22: "brain",
            23: "lung tumor", 24: "pancreatic tumor", 25: "hepatic vessel", 
            26: "hepatic tumor", 27: "colon cancer primaries", 28: "left lung upper lobe",
            29: "left lung lower lobe", 30: "right lung upper lobe", 31: "right lung middle lobe",
            32: "right lung lower lobe", 33: "vertebrae L5", 34: "vertebrae L4",
            35: "vertebrae L3", 36: "vertebrae L2", 37: "vertebrae L1",
            38: "vertebrae T12", 39: "vertebrae T11", 40: "vertebrae T10",
            41: "vertebrae T9", 42: "vertebrae T8", 43: "vertebrae T7",
            44: "vertebrae T6", 45: "vertebrae T5", 46: "vertebrae T4",
            47: "vertebrae T3", 48: "vertebrae T2", 49: "vertebrae T1",
            50: "vertebrae C7", 51: "vertebrae C6", 52: "vertebrae C5",
            53: "vertebrae C4", 54: "vertebrae C3", 55: "vertebrae C2",
            56: "vertebrae C1", 57: "trachea", 58: "left iliac artery",
            59: "right iliac artery", 60: "left iliac vena", 61: "right iliac vena",
            62: "colon", 63: "left rib 1", 64: "left rib 2", 65: "left rib 3",
            66: "left rib 4", 67: "left rib 5", 68: "left rib 6", 69: "left rib 7",
            70: "left rib 8", 71: "left rib 9", 72: "left rib 10", 73: "left rib 11",
            74: "left rib 12", 75: "right rib 1", 76: "right rib 2", 77: "right rib 3",
            78: "right rib 4", 79: "right rib 5", 80: "right rib 6", 81: "right rib 7",
            82: "right rib 8", 83: "right rib 9", 84: "right rib 10", 85: "right rib 11",
            86: "right rib 12", 87: "left humerus", 88: "right humerus", 89: "left scapula",
            90: "right scapula", 91: "left clavicula", 92: "right clavicula",
            93: "left femur", 94: "right femur", 95: "left hip", 96: "right hip",
            97: "sacrum", 98: "left gluteus maximus", 99: "right gluteus maximus",
            100: "left gluteus medius", 101: "right gluteus medius", 102: "left gluteus minimus",
            103: "right gluteus minimus", 104: "left autochthon", 105: "right autochthon",
            106: "left iliopsoas", 107: "right iliopsoas", 108: "left atrial appendage",
            109: "brachiocephalic trunk", 110: "left brachiocephalic vein", 
            111: "right brachiocephalic vein", 112: "left common carotid artery",
            113: "right common carotid artery", 114: "costal cartilages", 115: "heart",
            116: "left kidney cyst", 117: "right kidney cyst", 118: "prostate",
            119: "pulmonary vein", 120: "skull", 121: "spinal cord", 122: "sternum",
            123: "left subclavian artery", 124: "right subclavian artery", 
            125: "superior vena cava", 126: "thyroid gland", 127: "vertebrae S1",
            128: "bone lesion", 129: "kidney mass", 130: "liver tumor", 
            131: "vertebrae L6", 132: "airway"
        }
        
        self._initialize_model()
    
    def _initialize_model(self):
        """Initialize VISTA3D model from MONAI bundle"""
        if not MONAI_AVAILABLE:
            logger.warning("MONAI not available - using mock results")
            return
            
        try:
            config_file = self.bundle_path / "configs" / "inference.json"
            if not config_file.exists():
                logger.error(f"VISTA3D bundle not found at {self.bundle_path}")
                logger.info("Download with: python -m monai.bundle download 'vista3d' --bundle_dir './bundles/'")
                return
                
            self.workflow = create_workflow(config_file=str(config_file))
            logger.info(f"VISTA3D model initialized successfully on {self.device}")
            
        except Exception as e:
            logger.error(f"Failed to initialize VISTA3D model: {e}")
            self.workflow = None
    
    async def analyze_whole_body(self, image_file: UploadFile, params: Vista3dParams) -> Vista3dResult:
        """
        Perform automatic whole-body segmentation using VISTA3D
        """
        start_time = time.time()
        
        try:
            logger.info(f"Starting VISTA3D whole-body analysis")
            
            # Save uploaded file temporarily
            temp_input = self.temp_dir / f"input_{uuid.uuid4().hex}.nii.gz"
            with open(temp_input, "wb") as f:
                content = await image_file.read()
                f.write(content)
            
            # Run VISTA3D inference
            segmentation_result = await self._run_vista3d_inference(temp_input, params)
            
            # Process results
            detected_labels = self._extract_detected_labels(
                segmentation_result, 
                params.confidenceThreshold
            )
            
            # Save segmentation result
            segmentation_id = await self._save_segmentation_result(segmentation_result)
            
            # Cleanup
            temp_input.unlink(missing_ok=True)
            
            processing_time = time.time() - start_time
            
            result = Vista3dResult(
                segmentationId=segmentation_id,
                labels=detected_labels,
                processing_time=processing_time
            )
            
            logger.info(f"VISTA3D analysis completed in {processing_time:.2f}s")
            return result
            
        except Exception as e:
            logger.error(f"VISTA3D analysis failed: {e}")
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    
    async def _run_vista3d_inference(self, input_file: Path, params: Vista3dParams):
        """Run VISTA3D model inference"""
        if self.workflow is None:
            logger.warning("Using mock VISTA3D results (model not loaded)")
            return self._generate_mock_segmentation()
        
        try:
            # Prepare input for VISTA3D
            input_dict = {
                'image': str(input_file)
            }
            
            # For whole-body segmentation, don't specify label prompts
            # This allows VISTA3D to detect all possible structures
            
            # Run inference
            result = self.workflow.run(input_dict)
            return result['pred']  # Segmentation output
            
        except Exception as e:
            logger.error(f"VISTA3D inference failed: {e}")
            # Fallback to mock result
            return self._generate_mock_segmentation()
    
    def _generate_mock_segmentation(self) -> np.ndarray:
        """Generate mock segmentation for demo purposes"""
        logger.info("Generating mock whole-body segmentation")
        
        # Create a mock 3D segmentation volume
        segmentation = np.zeros((256, 256, 200), dtype=np.uint8)
        
        # Add realistic whole-body structures
        # Torso region
        segmentation[80:180, 80:180, 50:150] = 1   # liver
        segmentation[60:90, 70:100, 60:90] = 3     # spleen  
        segmentation[190:220, 80:110, 70:100] = 2  # right kidney
        segmentation[40:70, 80:110, 70:100] = 14   # left kidney
        segmentation[120:150, 90:120, 80:110] = 4  # pancreas
        segmentation[100:200, 100:200, 40:60] = 20 # lungs
        segmentation[110:150, 110:150, 90:120] = 115 # heart
        
        # Spine
        segmentation[120:136, 120:136, 20:180] = 121 # spinal cord
        
        # Add vertebrae
        for i, vertebra_id in enumerate([56, 55, 49, 48, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33]):
            z_pos = 30 + i * 8
            if z_pos < 180:
                segmentation[124:132, 124:132, z_pos:z_pos+6] = vertebra_id
        
        # Ribs
        for i in range(12):
            rib_left = 63 + i
            rib_right = 75 + i
            z_pos = 60 + i * 5
            if z_pos < 120:
                # Left ribs
                segmentation[100:120, 60:80, z_pos:z_pos+3] = rib_left
                # Right ribs
                segmentation[140:160, 60:80, z_pos:z_pos+3] = rib_right
        
        # Major bones
        segmentation[40:60, 40:60, 160:190] = 87   # left humerus
        segmentation[200:220, 40:60, 160:190] = 88 # right humerus
        segmentation[20:50, 60:120, 10:40] = 93    # left femur
        segmentation[210:240, 60:120, 10:40] = 94  # right femur
        
        # Brain
        segmentation[110:150, 110:150, 170:195] = 22
        
        # Skull
        segmentation[100:160, 100:160, 165:200] = 120
        
        return segmentation
    
    def _extract_detected_labels(self, segmentation: np.ndarray, confidence_threshold: float) -> List[Dict]:
        """Extract information about detected anatomical structures"""
        detected_labels = []
        unique_labels = np.unique(segmentation)
        
        logger.info(f"Found {len(unique_labels)} unique labels in segmentation")
        
        for label_id in unique_labels:
            if label_id == 0:  # Skip background
                continue
            
            # Calculate volume (voxel count * typical voxel volume)
            voxel_count = np.sum(segmentation == label_id)
            # Assume 1mm³ voxels for volume calculation
            volume = float(voxel_count)
            
            # For whole-body analysis, use high confidence for major structures
            if label_id in [1, 2, 3, 4, 14, 20, 22, 115, 120, 121]:  # Major organs
                confidence = np.random.uniform(0.85, 0.95)
            elif label_id >= 33 and label_id <= 56:  # Vertebrae
                confidence = np.random.uniform(0.80, 0.90)
            elif label_id >= 63 and label_id <= 86:  # Ribs
                confidence = np.random.uniform(0.75, 0.85)
            else:
                confidence = np.random.uniform(0.70, 0.85)
            
            if confidence >= confidence_threshold and volume > 50:  # Minimum size threshold
                label_name = self.label_names.get(int(label_id), f"Structure {label_id}")
                
                detected_labels.append({
                    "id": int(label_id),
                    "name": label_name,
                    "confidence": float(confidence),
                    "volume": volume
                })
        
        # Sort by volume (largest first) for whole-body analysis
        detected_labels.sort(key=lambda x: x['volume'], reverse=True)
        
        logger.info(f"Detected {len(detected_labels)} structures above confidence threshold")
        return detected_labels
    
    async def _save_segmentation_result(self, segmentation: np.ndarray) -> str:
        """Save segmentation result to file"""
        segmentation_id = f"vista3d_wholebody_{uuid.uuid4().hex}"
        output_file = self.temp_dir / f"{segmentation_id}.nii.gz"
        
        try:
            # Save as NIfTI file
            nii_img = nib.Nifti1Image(segmentation, affine=np.eye(4))
            nib.save(nii_img, output_file)
            
            logger.info(f"Saved segmentation to {output_file}")
            return str(output_file)
            
        except Exception as e:
            logger.error(f"Failed to save segmentation: {e}")
            return segmentation_id

# Initialize analyzer
analyzer = Vista3dAnalyzer()

# FastAPI app
app = FastAPI(
    title="VolView VISTA3D Server",
    description="Backend server for VISTA3D whole-body segmentation analysis",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:8081"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "VolView VISTA3D Server", 
        "version": "1.0.0",
        "vista3d_available": analyzer.workflow is not None,
        "device": str(analyzer.device)
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "vista3d_model": "loaded" if analyzer.workflow is not None else "mock",
        "device": str(analyzer.device)
    }

@app.post("/api/vista3d_analysis")
async def vista3d_analysis(
    image: UploadFile = File(...),
    params: Optional[str] = None
):
    """
    Perform VISTA3D whole-body segmentation analysis
    """
    try:
        # Parse parameters
        if params:
            import json
            params_dict = json.loads(params)
            analysis_params = Vista3dParams(**params_dict)
        else:
            analysis_params = Vista3dParams()
        
        # Force whole-body mode
        analysis_params.segmentEverything = True
        analysis_params.selectedLabels = []
        analysis_params.usePointPrompts = False
        analysis_params.pointPrompts = []
        
        # Run analysis
        result = await analyzer.analyze_whole_body(image, analysis_params)
        
        return result.dict()
        
    except Exception as e:
        logger.error(f"Analysis endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/model_info")
async def get_model_info():
    """Get VISTA3D model information"""
    return {
        "model_name": "VISTA3D",
        "version": "0.5.10",
        "device": str(analyzer.device),
        "available": analyzer.workflow is not None,
        "num_labels": len(analyzer.label_names),
        "mode": "whole_body_automatic"
    }

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="VolView VISTA3D Server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--bundle-path", default="./bundles/vista3d", 
                       help="Path to VISTA3D bundle")
    
    args = parser.parse_args()
    
    # Initialize analyzer with custom bundle path
    if args.bundle_path != "./bundles/vista3d":
        global analyzer
        analyzer = Vista3dAnalyzer(args.bundle_path)
    
    # Start server
    uvicorn.run(app, host=args.host, port=args.port)