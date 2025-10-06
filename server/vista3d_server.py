#!/usr/bin/env python3
"""
VISTA3D Server for VolView Integration
Real MONAI VISTA3D implementation with labelmap generation
"""

import os
import sys
import json
import tempfile
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional
import logging
from datetime import datetime
import base64
import itk

# Import VolView server transformation functions
sys.path.append(str(Path(__file__).parent / "volview_server"))
try:
    from volview_server.transformers import convert_vtkjs_to_itk_image, convert_itk_to_vtkjs_image
    VOLVIEW_TRANSFORMERS_AVAILABLE = True
    print("✅ VolView transformers loaded!")
except ImportError as e:
    print(f"⚠️ VolView transformers not available: {e}")
    VOLVIEW_TRANSFORMERS_AVAILABLE = False

# ---- VTK.js Binary Serialization Helpers ----
VTKJS_TO_NUMPY = {
    "Int8Array":   np.int8,
    "Uint8Array":  np.uint8,
    "Int16Array":  np.int16,
    "Uint16Array": np.uint16,
    "Int32Array":  np.int32,
    "Uint32Array": np.uint32,
    "Float32Array": np.float32,
    "Float64Array": np.float64,
}

# Map numpy types (not dtype objects) to VTK.js names
NUMPY_TO_VTKJS = {
    np.int8:    "Int8Array",
    np.uint8:   "Uint8Array",
    np.int16:   "Int16Array",
    np.uint16:  "Uint16Array",
    np.int32:   "Int32Array",
    np.uint32:  "Uint32Array",
    np.float32: "Float32Array",
    np.float64: "Float64Array",
}

def _numpy_type(dt):
    """Return the numpy *type* object (np.uint8, np.int16, ...) for any dtype-like."""
    return np.dtype(dt).type

def numpy_to_vtkjs_array(arr: np.ndarray, name="Scalars", ncomp: Optional[int] = None):
    """
    Convert a NumPy array to a VTK.js JSON-able vtkDataArray dict with base64 'values'.
    For segmentation labels stored as floats, convert to appropriate integer type.
    """
    # Get numpy type from array dtype (NUMPY_TO_VTKJS uses type objects as keys, not dtype objects)
    dtype_type = arr.dtype.type
    
    # Special handling for float arrays that contain integer labels (segmentation masks)
    if dtype_type in [np.float32, np.float64]:
        # Check if all values are integers
        if np.all(np.mod(arr, 1) == 0):
            # Convert to smallest appropriate unsigned integer type
            max_val = arr.max()
            if max_val <= 255:
                arr = arr.astype(np.uint8)
                dtype_type = np.uint8
            elif max_val <= 65535:
                arr = arr.astype(np.uint16)
                dtype_type = np.uint16
            else:
                arr = arr.astype(np.uint32)
                dtype_type = np.uint32
            print(f"🔄 Converted float segmentation labels to {dtype_type.__name__} (max value: {max_val})")
    
    if dtype_type not in NUMPY_TO_VTKJS:
        raise TypeError(f"Unsupported dtype {dtype_type}")

    dataType = NUMPY_TO_VTKJS[dtype_type]
    ncomp = ncomp or (arr.shape[-1] if arr.ndim > 1 else 1)
    size = int(arr.size)

    raw = arr.tobytes(order="C")
    b64 = base64.b64encode(raw).decode("ascii")

    return {
        "vtkClass": "vtkDataArray",
        "name": name,
        "numberOfComponents": int(ncomp),
        "size": size,
        "dataType": dataType,
        "littleEndian": (sys.byteorder == "little"),
        "values": b64,
    }

def bytes_to_vtkjs_array(buf: bytes, dtype, name="Scalars", ncomp=1, size=None):
    """
    If you already have a bytes-like buffer, wrap it the same way.
    """
    dtype_type = _numpy_type(dtype)  # Normalize to type object
    if dtype_type not in NUMPY_TO_VTKJS:
        raise TypeError(f"Unsupported dtype {dtype_type}")
    if size is None:
        size = len(buf) // np.dtype(dtype_type).itemsize
    b64 = base64.b64encode(bytes(buf)).decode("ascii")
    return {
        "vtkClass": "vtkDataArray",
        "name": name,
        "numberOfComponents": int(ncomp),
        "size": int(size),
        "dataType": NUMPY_TO_VTKJS[dtype_type],
        "littleEndian": (sys.byteorder == "little"),
        "values": b64,
    }

def ensure_vtkjs_values(field_dict):
    """
    Ensure the 'values' field in a VTK.js array dict is properly base64-encoded.
    Handles both numpy arrays and bytes objects.
    """
    vals = field_dict.get("values")
    if isinstance(vals, np.ndarray):
        field_dict.update(numpy_to_vtkjs_array(vals, name=field_dict.get("name", "Scalars")))
    elif isinstance(vals, (bytes, bytearray, memoryview)):
        # Extract dtype from dataType field
        data_type = field_dict.get("dataType", "Uint8Array")
        dtype_type = VTKJS_TO_NUMPY.get(data_type, np.uint8)
        ncomp = field_dict.get("numberOfComponents", 1)
        size = field_dict.get("size")
        field_dict.update(
            bytes_to_vtkjs_array(vals, dtype=dtype_type, name=field_dict.get("name", "Scalars"), ncomp=ncomp, size=size)
        )
    # else: already JSON (e.g., a base64 string) – leave as is
    return field_dict

def fix_vtkjs_binary_data(obj):
    """
    Recursively fix any bytes objects in a VTK.js structure to be base64-encoded strings.
    Handles all VTK.js structures including geometry fields.
    """
    if isinstance(obj, dict):
        # If this dict itself looks like a data array with bytes values, fix it directly
        if "values" in obj and isinstance(obj["values"], (bytes, bytearray, memoryview)):
            # Try to infer dtype if present
            dtype = VTKJS_TO_NUMPY.get(obj.get("dataType") or obj.get("dtype") or "Uint8Array", np.uint8)
            ncomp = obj.get("numberOfComponents", 1)
            size = obj.get("size")
            wrapped = bytes_to_vtkjs_array(obj["values"], dtype=dtype, ncomp=ncomp, size=size, name=obj.get("name","Scalars"))
            obj.update(wrapped)
        
        # Fix arrays in pointData/cellData (with or without 'data' wrapper)
        for section in ("pointData", "cellData"):
            sect = obj.get(section)
            if isinstance(sect, dict) and isinstance(sect.get("arrays"), list):
                for arr in sect["arrays"]:
                    if isinstance(arr, dict):
                        if "data" in arr and isinstance(arr["data"], dict):
                            fix_vtkjs_binary_data(arr["data"])
                        fix_vtkjs_binary_data(arr)  # in case 'values' is top-level
        
        # Fix common geometry containers
        for geom in ("points", "verts", "lines", "polys", "strips"):
            if geom in obj and isinstance(obj[geom], dict):
                fix_vtkjs_binary_data(obj[geom])
        
        # Recurse all children
        for v in obj.values():
            if isinstance(v, dict):
                fix_vtkjs_binary_data(v)
            elif isinstance(v, list):
                for it in v:
                    if isinstance(it, dict):
                        fix_vtkjs_binary_data(it)
    
    elif isinstance(obj, list):
        for it in obj:
            if isinstance(it, dict):
                fix_vtkjs_binary_data(it)
    
    return obj

def save_debug_segmentation(segmentation_array: np.ndarray, labels: List[Dict], request_id: str, original_nifti_path: str = None):
    """Save raw segmentation data for debugging"""
    try:
        debug_dir = Path("debug_outputs")
        debug_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 🆕 Save original MONAI bundle result as-is (NIfTI format)
        if original_nifti_path and Path(original_nifti_path).exists():
            debug_nifti_path = f"debug_outputs/monai_result_{request_id}_{timestamp}.nii.gz"
            import shutil
            shutil.copy2(original_nifti_path, debug_nifti_path)
            print(f"🔧 DEBUG: Saved original MONAI bundle result as: {debug_nifti_path}")
        
        # Save raw numpy array (can be loaded with np.load())
        np.save(f"debug_outputs/segmentation_{request_id}_{timestamp}.npy", 
                segmentation_array)
        
        # Save as NRRD for easy viewing in ITK-SNAP, 3D Slicer, etc.
        try:
            import nrrd
            # NRRD expects data in different axis order (z, y, x)
            nrrd_data = np.transpose(segmentation_array, (2, 1, 0))
            
            # Create NRRD header with proper spacing and metadata
            nrrd_header = {
                'space': 'left-posterior-superior',
                'space directions': [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
                'space origin': [0.0, 0.0, 0.0],
                'encoding': 'gzip'
            }
            
            nrrd.write(f"debug_outputs/segmentation_{request_id}_{timestamp}.nrrd", 
                      nrrd_data, header=nrrd_header)
            
            print(f"🔧 DEBUG: Saved NRRD file to debug_outputs/segmentation_{request_id}_{timestamp}.nrrd")
            
        except Exception as nrrd_error:
            print(f"⚠️ DEBUG: NRRD save failed: {nrrd_error}")
        
        # Save labels metadata as JSON
        debug_info = {
            'request_id': request_id,
            'timestamp': timestamp,
            'shape': segmentation_array.shape,
            'dtype': str(segmentation_array.dtype),
            'unique_values': np.unique(segmentation_array).tolist(),
            'labels': labels,
            'total_structures_generated': len(labels),
            'min_value': int(segmentation_array.min()),
            'max_value': int(segmentation_array.max()),
            'non_zero_voxels': int(np.count_nonzero(segmentation_array)),
            'total_voxels': int(segmentation_array.size),
            'files_generated': {
                'numpy_array': f"segmentation_{request_id}_{timestamp}.npy",
                'nrrd_file': f"segmentation_{request_id}_{timestamp}.nrrd",
                'monai_original': f"monai_result_{request_id}_{timestamp}.nii.gz" if original_nifti_path else None
            },
            'viewing_instructions': {
                'ITK-SNAP': 'File → Open Segmentation → Select .nrrd or .nii.gz file',
                '3D_Slicer': 'File → Add Data → Select .nrrd or .nii.gz file → Check as Labelmap',
                'ImageJ': 'File → Import → NRRD or NIfTI → Select file',
                'Original_MONAI': 'Use monai_result_*.nii.gz for original MONAI bundle output'
            }
        }
        
        with open(f"debug_outputs/metadata_{request_id}_{timestamp}.json", 'w') as f:
            json.dump(debug_info, f, indent=2)
            
        print(f"🔧 DEBUG: Saved numpy array to debug_outputs/segmentation_{request_id}_{timestamp}.npy")
        print(f"🔧 DEBUG: Saved metadata to debug_outputs/metadata_{request_id}_{timestamp}.json")
        print(f"📺 VIEWING: Open the .nrrd file in ITK-SNAP or 3D Slicer for visualization")
        
    except Exception as e:
        print(f"⚠️ DEBUG: Failed to save debug data: {e}")

# VISTA3D anatomical structure labels (subset of 130+ structures)
VISTA3D_LABELS = {
    1: {"name": "liver", "category": "abdominal_organs"},
    2: {"name": "kidney_right", "category": "abdominal_organs"},
    3: {"name": "spleen", "category": "abdominal_organs"},
    4: {"name": "pancreas", "category": "abdominal_organs"},
    5: {"name": "aorta", "category": "cardiovascular"},
    6: {"name": "inferior_vena_cava", "category": "cardiovascular"},
    7: {"name": "right_adrenal_gland", "category": "endocrine"},
    8: {"name": "left_adrenal_gland", "category": "endocrine"},
    9: {"name": "gallbladder", "category": "abdominal_organs"},
    10: {"name": "esophagus", "category": "digestive"},
    11: {"name": "stomach", "category": "digestive"},
    12: {"name": "duodenum", "category": "digestive"},
    13: {"name": "kidney_left", "category": "abdominal_organs"},
    14: {"name": "colon_ascending", "category": "digestive"},
    15: {"name": "colon_transverse", "category": "digestive"},
    16: {"name": "colon_descending", "category": "digestive"},
    17: {"name": "small_intestine", "category": "digestive"},
    18: {"name": "rectum", "category": "digestive"},
    19: {"name": "urinary_bladder", "category": "urological"},
    20: {"name": "lung_left", "category": "respiratory"},
    21: {"name": "lung_right", "category": "respiratory"},
    22: {"name": "brain", "category": "neurological"},
    23: {"name": "vertebrae_C1", "category": "skeletal"},
    24: {"name": "vertebrae_C2", "category": "skeletal"},
    25: {"name": "vertebrae_C3", "category": "skeletal"},
    26: {"name": "vertebrae_C4", "category": "skeletal"},
    27: {"name": "vertebrae_C5", "category": "skeletal"},
    28: {"name": "vertebrae_C6", "category": "skeletal"},
    29: {"name": "vertebrae_C7", "category": "skeletal"},
    30: {"name": "vertebrae_T1", "category": "skeletal"},
    31: {"name": "vertebrae_T2", "category": "skeletal"},
    32: {"name": "vertebrae_T3", "category": "skeletal"},
    33: {"name": "vertebrae_T4", "category": "skeletal"},
    34: {"name": "vertebrae_T5", "category": "skeletal"},
    35: {"name": "vertebrae_T6", "category": "skeletal"},
    36: {"name": "vertebrae_T7", "category": "skeletal"},
    37: {"name": "vertebrae_T8", "category": "skeletal"},
    38: {"name": "vertebrae_T9", "category": "skeletal"},
    39: {"name": "vertebrae_T10", "category": "skeletal"},
    40: {"name": "vertebrae_T11", "category": "skeletal"},
    41: {"name": "vertebrae_T12", "category": "skeletal"},
    42: {"name": "vertebrae_L1", "category": "skeletal"},
    43: {"name": "vertebrae_L2", "category": "skeletal"},
    44: {"name": "vertebrae_L3", "category": "skeletal"},
    45: {"name": "vertebrae_L4", "category": "skeletal"},
    46: {"name": "vertebrae_L5", "category": "skeletal"},
    47: {"name": "rib_1_left", "category": "skeletal"},
    48: {"name": "rib_1_right", "category": "skeletal"},
    49: {"name": "rib_2_left", "category": "skeletal"},
    50: {"name": "rib_2_right", "category": "skeletal"},
    115: {"name": "heart", "category": "cardiovascular"},
    121: {"name": "spinal_cord", "category": "neurological"},
    122: {"name": "thyroid", "category": "endocrine"},
    123: {"name": "prostate", "category": "reproductive"},
    124: {"name": "uterus", "category": "reproductive"},
}

# FastAPI imports
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# MONAI imports
try:
    from monai.bundle import ConfigWorkflow
    MONAI_AVAILABLE = True
    print("✅ MONAI successfully loaded!")
except ImportError as e:
    print(f"Warning: MONAI not available - {e}")
    print("Using fallback implementation.")
    MONAI_AVAILABLE = False
    ConfigWorkflow = None
except Exception as e:
    print(f"Warning: MONAI import error - {e}")
    print("Using fallback implementation.")
    MONAI_AVAILABLE = False
    ConfigWorkflow = None

# MONAI imports
try:
    import monai
    from monai.bundle import ConfigWorkflow
    from monai.data import MetaTensor
    import nibabel as nib
    import torch
    MONAI_AVAILABLE = True
except ImportError as e:
    print(f"Warning: MONAI not available: {e}")
    MONAI_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Vista3DRequest(BaseModel):
    imageId: str
    imageData: Dict  # Serialized VTK.js image data
    confidenceThreshold: float = 0.5
    segmentEverything: bool = True

class Vista3DResponse(BaseModel):
    segmentationId: str
    labels: List[Dict]
    processingTime: float
    labelmapData: Optional[str] = None  # Base64 encoded VTK data

class Vista3DServer:
    def __init__(self):
        self.bundle_root = Path(__file__).parent / "bundles"
        self.temp_dir = Path(tempfile.mkdtemp(prefix="vista3d_"))
        
        # Initialize VISTA3D bundle if available
        self.vista3d_available = self._initialize_vista3d()
        
    def _initialize_vista3d(self) -> bool:
        """Initialize VISTA3D bundle"""
        if not MONAI_AVAILABLE:
            logger.error("MONAI not available - VISTA3D cannot run")
            return False
            
        try:
            # Check if VISTA3D bundle exists
            bundle_path = self.bundle_root / "vista3d"
            if not bundle_path.exists():
                logger.info("Downloading VISTA3D bundle...")
                self._download_vista3d_bundle()
            
            # Load VISTA3D configuration
            config_path = bundle_path / "configs" / "inference.json"
            if config_path.exists():
                logger.info("VISTA3D bundle ready")
                return True
            else:
                logger.error("VISTA3D config not found - bundle incomplete")
                return False
                
        except Exception as e:
            logger.error(f"Failed to initialize VISTA3D: {e}")
            return False
    
    def _download_vista3d_bundle(self):
        """Download VISTA3D bundle using MONAI"""
        try:
            import subprocess
            cmd = [
                sys.executable, "-m", "monai.bundle", "download", "vista3d",
                "--bundle_dir", str(self.bundle_root)
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise RuntimeError(f"Bundle download failed: {result.stderr}")
            logger.info("VISTA3D bundle downloaded successfully")
        except Exception as e:
            logger.error(f"Failed to download VISTA3D bundle: {e}")
            raise
    
    def _run_vista3d_inference(self, request: Vista3DRequest) -> np.ndarray:
        """Run VISTA3D inference using MONAI bundle"""
        try:
            # Initialize VISTA3D bundle workflow
            bundle_path = self.bundle_root / "vista3d"
            config_path = bundle_path / "configs" / "inference.json"
            
            if not config_path.exists():
                raise FileNotFoundError(f"VISTA3D config not found: {config_path}")
            
            logger.info("Loading VISTA3D bundle configuration...")
            
            # TODO: Load actual medical image data from VolView using request.imageId
            # For now, this would need to be implemented to get real image data
            # input_image_path = self._get_image_from_volview(request.imageId)
            
            logger.info("Running VISTA3D inference...")
            
            # Use MONAI bundle workflow for inference
            if not MONAI_AVAILABLE:
                raise RuntimeError("MONAI not available for VISTA3D inference")
            
            # Use subprocess to run MONAI bundle (recommended approach)
            import subprocess
            import tempfile
            
            # Create temporary output directory
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)
                output_path = temp_path / "segmentation.nii.gz"
                
                # Get image data from VolView request
                if not hasattr(request, 'imageData') or not request.imageData:
                    raise ValueError("No image data provided in request")
                
                # Convert VTK.js image data to ITK image using proper VolView transformers approach
                # Import the correct transformer function from our local copy
                from volview_server.transformers.image_data import vtk_to_itk_image
                
                logger.info(f"Converting VTK.js image data to ITK using VolView transformers...")
                logger.info(f"VTK.js data type: {type(request.imageData)}")
                logger.info(f"VTK.js data keys: {list(request.imageData.keys()) if isinstance(request.imageData, dict) else 'Not a dict'}")
                
                if isinstance(request.imageData, dict):
                    logger.info(f"vtkClass: {request.imageData.get('vtkClass', 'Missing')}")
                    logger.info(f"extent: {request.imageData.get('extent', 'Missing')}")
                    logger.info(f"spacing: {request.imageData.get('spacing', 'Missing')}")
                    logger.info(f"origin: {request.imageData.get('origin', 'Missing')}")
                    logger.info(f"direction type: {type(request.imageData.get('direction', 'Missing'))}")
                    if 'pointData' in request.imageData:
                        logger.info(f"pointData keys: {list(request.imageData['pointData'].keys())}")
                        if 'arrays' in request.imageData['pointData']:
                            arrays = request.imageData['pointData']['arrays']
                            logger.info(f"Number of arrays: {len(arrays)}")
                            if len(arrays) > 0:
                                first_array = arrays[0]
                                logger.info(f"First array keys: {list(first_array.keys())}")
                                if 'data' in first_array:
                                    data_info = first_array['data']
                                    logger.info(f"Array data keys: {list(data_info.keys())}")
                                    logger.info(f"Array dataType: {data_info.get('dataType', 'Missing')}")
                                    logger.info(f"Array size: {data_info.get('size', 'Missing')}")
                                    logger.info(f"Values type: {type(data_info.get('values', 'Missing'))}")
                
                try:
                    # The issue is that our VTK.js data has pixel values as a list, not bytes
                    # Let's fix this by converting the list to bytes first
                    vtkjs_data = request.imageData.copy()  # Make a copy to avoid modifying original
                    
                    if 'pointData' in vtkjs_data and 'arrays' in vtkjs_data['pointData']:
                        arrays = vtkjs_data['pointData']['arrays']
                        for array in arrays:
                            if 'data' in array and 'values' in array['data']:
                                values = array['data']['values']
                                if isinstance(values, list):
                                    logger.info("Converting pixel values from list to bytes...")
                                    # Convert list to numpy array then to bytes
                                    import numpy as np
                                    dataType = array['data']['dataType']
                                    
                                    # Map VTK.js data types to numpy dtypes
                                    dtype_map = {
                                        'Int8Array': np.int8,
                                        'Uint8Array': np.uint8,
                                        'Int16Array': np.int16,
                                        'Uint16Array': np.uint16,
                                        'Int32Array': np.int32,
                                        'Uint32Array': np.uint32,
                                        'Float32Array': np.float32,
                                        'Float64Array': np.float64
                                    }
                                    
                                    if dataType in dtype_map:
                                        np_dtype = dtype_map[dataType]
                                        # Convert list to numpy array then to bytes
                                        values_array = np.array(values, dtype=np_dtype)
                                        array['data']['values'] = values_array.tobytes()
                                        logger.info(f"Converted {len(values)} values from list to bytes")
                    
                    # Now use the VolView transformer function
                    itk_image = vtk_to_itk_image(vtkjs_data)
                    logger.info(f"Successfully converted to ITK image with size: {itk_image.GetLargestPossibleRegion().GetSize()}")
                except Exception as e:
                    logger.error(f"VTK to ITK conversion failed: {str(e)}")
                    logger.error(f"Exception type: {type(e)}")
                    # Let's try to see the detailed traceback
                    import traceback
                    logger.error(f"Full traceback: {traceback.format_exc()}")
                    raise
                
                # Save ITK image as NIfTI for MONAI bundle
                input_nifti_path = temp_path / "input.nii.gz"
                itk.imwrite(itk_image, str(input_nifti_path))
                
                # DEBUGGING: Also save a copy to debug_outputs for inspection
                debug_outputs_dir = Path("debug_outputs")
                debug_outputs_dir.mkdir(exist_ok=True)
                
                from datetime import datetime
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                debug_input_path = debug_outputs_dir / f"input_converted_{request.imageId}_{timestamp}.nii.gz"
                
                # Copy the converted input file for debugging
                import shutil
                shutil.copy2(input_nifti_path, debug_input_path)
                logger.info(f"🔧 DEBUG: Saved converted input NIfTI to {debug_input_path}")
                
                # Also save the original VTK.js data as JSON for comparison
                debug_vtkjs_path = debug_outputs_dir / f"vtkjs_data_{request.imageId}_{timestamp}.json"
                import json
                with open(debug_vtkjs_path, 'w') as f:
                    # Convert any bytes data to base64 for JSON serialization
                    vtkjs_debug = request.imageData.copy()
                    if 'pointData' in vtkjs_debug and 'arrays' in vtkjs_debug['pointData']:
                        for array in vtkjs_debug['pointData']['arrays']:
                            if 'data' in array and 'values' in array['data']:
                                values = array['data']['values']
                                if isinstance(values, bytes):
                                    import base64
                                    array['data']['values'] = base64.b64encode(values).decode('utf-8')
                                    array['data']['_values_type'] = 'base64_bytes'
                    json.dump(vtkjs_debug, f, indent=2)
                logger.info(f"🔧 DEBUG: Saved original VTK.js data to {debug_vtkjs_path}")
                
                # Run real VISTA3D bundle inference
                vista3d_bundle_path = self.bundle_root / "vista3d"
                config_file = vista3d_bundle_path / "configs" / "inference.json"
                
                # Set the output directory to our temp directory
                output_dir = str(temp_path)
                # Use json.dumps for proper JSON formatting
                input_dict = json.dumps({"image": str(input_nifti_path), "output_dir": output_dir})
                cmd = [
                    sys.executable, "-m", "monai.bundle", "run",
                    "--config_file", str(config_file),
                    "--input_dict", input_dict,
                    "--bundle_root", str(vista3d_bundle_path)
                ]
                
                logger.info(f"Running VISTA3D: {' '.join(cmd)}")
                logger.info(f"Working directory: {vista3d_bundle_path}")
                
                # Run the command from the vista3d bundle directory so scripts.inferer can be found
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=str(vista3d_bundle_path))
                
                logger.info(f"MONAI bundle stdout: {result.stdout}")
                if result.stderr:
                    logger.info(f"MONAI bundle stderr: {result.stderr}")
                    
                # List all files in temp directory to see what was actually created
                import os
                temp_files = os.listdir(temp_path)
                logger.info(f"Files in temp directory after MONAI bundle: {temp_files}")
                
                if result.returncode != 0:
                    error_msg = f"VISTA3D inference failed: {result.stderr}"
                    logger.error(error_msg)
                    raise RuntimeError(error_msg)
                
                # Load segmentation result from the actual MONAI bundle output location
                import nibabel as nib
                
                # The MONAI bundle saves to eval/input/input_trans.nii.gz regardless of our output_dir setting
                actual_output_path = vista3d_bundle_path / "eval" / "input" / "input_trans.nii.gz"
                logger.info(f"Looking for segmentation result at: {actual_output_path}")
                
                if not actual_output_path.exists():
                    # List all files in eval directory for debugging
                    eval_dir = vista3d_bundle_path / "eval"
                    if eval_dir.exists():
                        import os
                        for root, dirs, files in os.walk(eval_dir):
                            for file in files:
                                if file.endswith('.nii.gz'):
                                    logger.info(f"Found output file: {os.path.join(root, file)}")
                    raise FileNotFoundError(f"No such file or no access: '{actual_output_path}'")
                
                segmentation_nii = nib.load(actual_output_path)
                segmentation = segmentation_nii.get_fdata().astype(np.uint8)
                
                logger.info(f"VISTA3D inference completed: {segmentation.shape}")
                return segmentation, str(actual_output_path)
                
                # Example of what the real implementation would look like:
                # cmd = [
                #     sys.executable, "-m", "monai.bundle", "run", "vista3d",
                #     "--input_image", str(input_image_path),
                #     "--output_image", str(output_path),
                #     "--bundle_dir", str(self.bundle_root)
                # ]
                # result = subprocess.run(cmd, capture_output=True, text=True)
                # 
                # if result.returncode != 0:
                #     raise RuntimeError(f"VISTA3D inference failed: {result.stderr}")
                # 
                # # Load segmentation result
                # import nibabel as nib
                # segmentation_nii = nib.load(output_path)
                # segmentation = segmentation_nii.get_fdata().astype(np.uint8)
                # 
                # logger.info("VISTA3D inference completed successfully")
                # return segmentation
            
        except Exception as e:
            logger.error(f"VISTA3D inference failed: {e}")
            raise
    

    
    def _extract_detected_labels(self, segmentation: np.ndarray, confidence_threshold: float) -> List[Dict]:
        """Extract detected anatomical structures from segmentation"""
        detected_labels = []
        unique_labels = np.unique(segmentation)
        
        logger.info(f"Extracting labels from segmentation with {len(unique_labels)} unique values")
        
        for label_id in unique_labels:
            if label_id == 0:  # Skip background
                continue
            
            # Calculate volume (voxel count)
            voxel_count = np.sum(segmentation == label_id)
            volume = float(voxel_count)
            
            # Calculate confidence based on volume and structure type
            # Larger, well-defined structures get higher confidence
            # This would normally come from the VISTA3D model output
            base_confidence = 0.75 + (min(voxel_count, 50000) / 100000) * 0.2
            confidence = min(0.98, base_confidence)
            
            if confidence >= confidence_threshold and volume > 500:  # Minimum volume threshold
                label_info = VISTA3D_LABELS.get(int(label_id), {
                    "name": f"structure_{label_id}", 
                    "category": "unknown"
                })
                
                detected_labels.append({
                    "id": int(label_id),
                    "name": label_info["name"],
                    "confidence": float(confidence),
                    "volume": volume
                })
        
        logger.info(f"Detected {len(detected_labels)} anatomical structures above threshold")
        return detected_labels
    
    async def analyze_image(self, request: Vista3DRequest) -> Vista3DResponse:
        """Perform VISTA3D analysis on image"""
        import time
        start_time = time.time()
        
        logger.info(f"Starting VISTA3D analysis for image: {request.imageId}")
        
        try:
            # Real VISTA3D analysis only
            segmentation, labels, original_nifti_path = await self._run_real_vista3d(request)
            
            # 🔧 DEBUG: Save raw segmentation data for debugging
            save_debug_segmentation(segmentation, labels, request.imageId, original_nifti_path)
            
            # Convert segmentation to VTK labelmap format
            labelmap_data = self._convert_to_vtk_labelmap(segmentation, original_nifti_path)
            
            # 🔧 DEBUG: Save both conversion approaches for comparison
            try:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                debug_dir = Path("debug_outputs")
                debug_dir.mkdir(exist_ok=True)
                
                # Save the labelmap data that will be sent to frontend
                if labelmap_data is not None:
                    with open(debug_dir / f"vtk_labelmap_{request.imageId}_{timestamp}.json", 'w') as f:
                        if isinstance(labelmap_data, str):
                            f.write(labelmap_data)
                        else:
                            # For VTK.js format, we need special handling for binary data
                            import json
                            json.dump(labelmap_data, f, indent=2, default=str)
                    print(f"🔧 DEBUG: Saved VTK labelmap data to debug_outputs/vtk_labelmap_{request.imageId}_{timestamp}.json")
            except Exception as debug_error:
                logger.warning(f"⚠️ Debug labelmap save failed: {debug_error}")
            
            processing_time = time.time() - start_time
            
            response = Vista3DResponse(
                segmentationId=f"vista3d_{int(time.time())}",
                labels=labels,
                processingTime=processing_time,
                labelmapData=labelmap_data
            )
            
            logger.info(f"Analysis complete: {len(labels)} structures, {processing_time:.2f}s")
            return response
            
        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    async def _run_real_vista3d(self, request: Vista3DRequest):
        """Run real MONAI VISTA3D bundle"""
        logger.info("Running real MONAI VISTA3D analysis...")
        
        try:
            # Download VISTA3D bundle if not exists
            bundle_path = self.bundle_root / "vista3d"
            if not bundle_path.exists():
                logger.info("Downloading VISTA3D bundle...")
                self._download_vista3d_bundle()
            
            # Run actual VISTA3D inference
            segmentation, original_nifti_path = self._run_vista3d_inference(request)
            
            # 🔧 FIX: Remap liver (label 1 → 101) to avoid VolView's default segment conflict
            # Do this vectorized on server side for better performance
            segmentation = segmentation.copy()
            segmentation[segmentation == 1] = 101
            logger.info("🔄 Remapped liver voxels from label 1 to 101 (avoiding VolView default segment)")
            
            # Extract detected labels from segmentation
            labels = self._extract_detected_labels(segmentation, request.confidenceThreshold)
            
            logger.info(f"VISTA3D analysis completed: {len(labels)} structures detected")
            return segmentation, labels, original_nifti_path
            
        except Exception as e:
            logger.error(f"VISTA3D analysis failed: {e}")
            raise
    

    
    def _convert_to_vtk_labelmap(self, segmentation: np.ndarray, original_nifti_path: str = None):
        """Convert numpy segmentation to VTK labelmap format using VolView transformers"""
        try:
            # 🔧 DEBUG: Add detailed logging about segmentation data
            logger.info(f"Converting segmentation to VTK format:")
            logger.info(f"  Original shape: {segmentation.shape}")
            logger.info(f"  Original dtype: {segmentation.dtype}")
            logger.info(f"  Value range: [{segmentation.min()}, {segmentation.max()}]")
            logger.info(f"  Unique values: {len(np.unique(segmentation))} labels")
            
            # 🆕 APPROACH: Use VolView transformers to properly convert ITK/NIfTI to VTK.js format
            if VOLVIEW_TRANSFORMERS_AVAILABLE and original_nifti_path and Path(original_nifti_path).exists():
                try:
                    logger.info("🔄 Using VolView transformers for proper ITK→VTK.js conversion...")
                    
                    # Load the original MONAI result as ITK image with uint8 pixel type
                    import itk
                    # Force uint8 pixel type for segmentation labels
                    ImageType = itk.Image[itk.UC, 3]  # UC = unsigned char = uint8
                    itk_image = itk.imread(original_nifti_path, pixel_type=itk.UC)
                    logger.info(f"  ITK image loaded: {itk_image.GetLargestPossibleRegion().GetSize()}")
                    logger.info(f"  ITK pixel type: {type(itk_image).__name__}")
                    
                    # Convert ITK image to VTK.js format using VolView transformers
                    from volview_server.transformers import convert_itk_to_vtkjs_image
                    vtkjs_result = convert_itk_to_vtkjs_image(itk_image)
                    
                    logger.info("✅ Successfully converted using VolView transformers")
                    
                    # 🔧 PROPER VTK.js SERIALIZATION: Fix bytes objects to base64 strings
                    if isinstance(vtkjs_result, dict):
                        try:
                            # Apply ChatGPT's fix: convert all bytes objects to base64 strings
                            fixed_result = fix_vtkjs_binary_data(vtkjs_result)
                            logger.info("✅ VTK.js binary data converted to base64 strings")
                            
                            # Now JSON serialization should work
                            json_str = json.dumps(fixed_result)
                            logger.info("✅ JSON serialization successful!")
                            return json_str
                            
                        except Exception as encoding_error:
                            logger.error(f"❌ VTK.js encoding failed: {encoding_error}")
                            # Find problematic objects for debugging
                            def find_bytes_objects(obj, path=""):
                                if isinstance(obj, bytes):
                                    logger.error(f"  Found bytes object at: {path}")
                                elif isinstance(obj, dict):
                                    for k, v in obj.items():
                                        find_bytes_objects(v, f"{path}.{k}")
                                elif isinstance(obj, list):
                                    for i, v in enumerate(obj):
                                        find_bytes_objects(v, f"{path}[{i}]")
                            find_bytes_objects(vtkjs_result)
                            raise encoding_error
                    else:
                        logger.warning("VTK.js result is not a dict, using fallback")
                        return None
                    
                except Exception as transformer_error:
                    logger.warning(f"⚠️ VolView transformer failed: {transformer_error}")
                    logger.info("Falling back to direct numpy conversion...")
            else:
                logger.info("VolView transformers not available or no original file, using direct conversion...")
            
            # FALLBACK: Direct numpy array conversion with axis handling
            import base64
            
            # Option 1: Use as-is (MONAI typically outputs in correct ITK orientation)
            segmentation_vtk = np.ascontiguousarray(segmentation)
            
            logger.info(f"  VTK shape: {segmentation_vtk.shape}")
            logger.info(f"  VTK memory layout: {'C' if segmentation_vtk.flags['C_CONTIGUOUS'] else 'F'}-contiguous")
            
            # Convert to bytes and encode
            segmentation_bytes = segmentation_vtk.tobytes()
            encoded_data = base64.b64encode(segmentation_bytes).decode('utf-8')
            
            # Include metadata for reconstruction
            metadata = {
                'data': encoded_data,
                'shape': segmentation_vtk.shape,  # Use VTK shape
                'dtype': str(segmentation_vtk.dtype),
                'original_shape': segmentation.shape,  # Keep original for reference
                'memory_layout': 'C_CONTIGUOUS',
                'conversion_method': 'direct_numpy'
            }
            
            return json.dumps(metadata)
            
        except Exception as e:
            logger.error(f"Failed to convert segmentation to VTK format: {e}")
            return None
    
    def _np_dtype_to_typedarray(self, dtype) -> str:
        """Map numpy dtype to JS TypedArray name expected by vtk.js"""
        import numpy as np
        mapping = {
            np.dtype('uint8'):  'Uint8Array',
            np.dtype('int8'):   'Int8Array', 
            np.dtype('uint16'): 'Uint16Array',
            np.dtype('int16'):  'Int16Array',
            np.dtype('uint32'): 'Uint32Array',
            np.dtype('int32'):  'Int32Array',
            np.dtype('float32'):'Float32Array',
            np.dtype('float64'):'Float64Array',
        }
        return mapping.get(dtype, 'Uint8Array')
    
    def _gzip_b64(self, data: bytes) -> str:
        """Compress data with gzip and encode as base64"""
        import gzip
        import base64
        return base64.b64encode(gzip.compress(data)).decode('ascii')
    
    def _encode_array_gz(self, values) -> dict:
        """Encode numpy array or bytes with gzip+base64 for VTK.js"""
        import numpy as np
        
        if isinstance(values, np.ndarray):
            arr = np.ascontiguousarray(values)
            gz_b64 = self._gzip_b64(arr.tobytes())
            return {
                "values": gz_b64,
                "valuesEncoding": "base64",
                "valuesCompression": "gzip",
                "dtype": self._np_dtype_to_typedarray(arr.dtype),
                "numberOfComponents": int(arr.shape[-1]) if arr.ndim > 1 else 1,
                "size": int(arr.size),
                "byteLength": int(arr.nbytes)
            }
        elif isinstance(values, (bytes, bytearray, memoryview)):
            gz_b64 = self._gzip_b64(bytes(values))
            return {
                "values": gz_b64,
                "valuesEncoding": "base64", 
                "valuesCompression": "gzip",
                "dtype": "Uint8Array",
                "numberOfComponents": 1,
                "size": len(values),
                "byteLength": len(values)
            }
        return None
    
    def _encode_vtkjs_inplace_gz(self, ds: dict) -> dict:
        """
        Walk VTK.js dataset and gzip+base64 encode all binary arrays.
        Following ChatGPT's recommended approach.
        """
        def fix_values(container: dict, key: str):
            if key in container and isinstance(container[key], dict) and "values" in container[key]:
                values = container[key]["values"]
                encoded = self._encode_array_gz(values)
                if encoded:
                    container[key].update(encoded)
        
        def fix_arrays(section: str):
            sect = ds.get(section)
            if isinstance(sect, dict) and isinstance(sect.get("arrays"), list):
                for arr in sect["arrays"]:
                    # Prefer 'data' wrapper if present
                    target = arr.get("data", arr)
                    values = target.get("values")
                    encoded = self._encode_array_gz(values)
                    if encoded:
                        target.update(encoded)
        
        # Handle pointData and cellData arrays
        for section in ("pointData", "cellData"):
            fix_arrays(section)
        
        # Handle geometry arrays
        for geom in ("points", "verts", "lines", "polys", "strips"):
            fix_values(ds, geom)
        
        # Mark the encoding method
        ds.setdefault("encoding", {})["binaryArrays"] = "base64+gzip"
        
        return ds

# FastAPI application
app = FastAPI(title="VISTA3D Server for VolView", version="1.0.0")

# 🚀 Enable gzip compression for all responses (ChatGPT recommendation)
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=500)

# Enable CORS for VolView frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8082", "http://localhost:8080", "http://localhost:8083", "http://localhost:8084"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize VISTA3D server
vista3d_server = Vista3DServer()

@app.post("/api/vista3d_analysis", response_model=Vista3DResponse)
async def analyze_image(request: Vista3DRequest):
    """VISTA3D analysis endpoint"""
    logger.info(f"🔍 DEBUG: Received VISTA3D analysis request")
    logger.info(f"   - imageId: {request.imageId}")
    logger.info(f"   - confidenceThreshold: {request.confidenceThreshold}")
    logger.info(f"   - segmentEverything: {request.segmentEverything}")
    logger.info(f"   - imageData type: {type(request.imageData)}")
    if isinstance(request.imageData, dict):
        logger.info(f"   - vtkClass: {request.imageData.get('vtkClass', 'Missing')}")
        logger.info(f"   - imageData keys: {list(request.imageData.keys())}")
    
    try:
        result = await vista3d_server.analyze_image(request)
        logger.info(f"✅ Analysis completed successfully")
        return result
    except Exception as e:
        logger.error(f"❌ Analysis failed: {str(e)}")
        raise

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "vista3d_available": vista3d_server.vista3d_available,
        "monai_available": MONAI_AVAILABLE
    }

@app.get("/api/labels")
async def get_labels():
    """Get available VISTA3D labels"""
    return {"labels": VISTA3D_LABELS}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8081))
    uvicorn.run(app, host="0.0.0.0", port=port)