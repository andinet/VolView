# VISTA3D Server Integration

This document explains how to implement the server-side VISTA3D analysis functionality to work with the VolView Analysis panel.

## Overview

The VolView Analysis panel communicates with a Python server that runs VISTA3D models from the MONAI model zoo. The server needs to implement specific RPC methods that the client can call.

## Required Server Methods

### 1. vista3d_analysis

**Method:** `vista3d_analysis(image_id: str, params: dict) -> dict`

**Parameters:**
- `image_id`: The ID of the image to analyze
- `params`: Analysis parameters dictionary containing:
  - `segmentEverything`: Boolean - if true, segment all available structures
  - `selectedLabels`: List[int] - specific label IDs to segment (if not segmentEverything)
  - `confidenceThreshold`: float - minimum confidence threshold (0.1-0.9)
  - `usePointPrompts`: Boolean - whether to use interactive point prompts
  - `pointPrompts`: List[dict] - point prompts with 'point' (3D coordinates) and 'label' fields

**Returns:**
```python
{
    "segmentationId": "generated_segmentation_id",
    "labels": [
        {
            "id": 1,
            "name": "liver", 
            "confidence": 0.95,
            "volume": 1250.5
        },
        # ... more detected structures
    ],
    "processing_time": 12.34
}
```

## Example Python Implementation

```python
import monai
from monai.bundle import create_workflow
import numpy as np
import nibabel as nib
from typing import Dict, List, Any

class Vista3DAnalyzer:
    def __init__(self):
        # Download and initialize VISTA3D bundle
        self.bundle_path = "path/to/vista3d/bundle"
        self.workflow = create_workflow(
            config_file=f"{self.bundle_path}/configs/inference.json"
        )
    
    async def vista3d_analysis(self, image_id: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Perform VISTA3D analysis on the specified image
        """
        import time
        start_time = time.time()
        
        # Get image data from VolView's image store
        image_data = self.get_image_data(image_id)
        
        # Prepare VISTA3D input
        input_dict = {
            'image': image_data
        }
        
        # Configure segmentation based on parameters
        if params['segmentEverything']:
            # Use VISTA3D's "segment everything" mode
            input_dict['label_prompt'] = None
        else:
            # Use specific label prompts
            input_dict['label_prompt'] = params['selectedLabels']
        
        # Add point prompts if enabled
        if params['usePointPrompts'] and params['pointPrompts']:
            input_dict['point_prompts'] = self.format_point_prompts(
                params['pointPrompts']
            )
        
        # Run VISTA3D inference
        result = self.workflow.run(input_dict)
        
        # Process results
        segmentation = result['pred']
        labels_found = self.extract_labels(segmentation, params['confidenceThreshold'])
        
        # Save segmentation as new image in VolView
        segmentation_id = self.save_segmentation(segmentation, image_id)
        
        processing_time = time.time() - start_time
        
        return {
            "segmentationId": segmentation_id,
            "labels": labels_found,
            "processing_time": processing_time
        }
    
    def get_image_data(self, image_id: str):
        """
        Retrieve image data from VolView's image store
        This would integrate with VolView's data management system
        """
        # Implementation depends on how VolView exposes image data to server
        pass
    
    def format_point_prompts(self, point_prompts: List[Dict]) -> List:
        """
        Convert VolView point prompts to VISTA3D format
        """
        formatted_prompts = []
        for prompt in point_prompts:
            formatted_prompts.append({
                'point': prompt['point'],  # [x, y, z]
                'label': prompt['label']   # 1 for positive, 0 for negative
            })
        return formatted_prompts
    
    def extract_labels(self, segmentation: np.ndarray, confidence_threshold: float) -> List[Dict]:
        """
        Extract detected labels from segmentation result
        """
        labels_found = []
        unique_labels = np.unique(segmentation)
        
        for label_id in unique_labels:
            if label_id == 0:  # Skip background
                continue
                
            # Calculate volume (number of voxels * voxel volume)
            volume = np.sum(segmentation == label_id)
            
            # For this example, assume high confidence
            # In real implementation, extract from model output
            confidence = 0.9
            
            if confidence >= confidence_threshold:
                label_info = self.get_label_info(label_id)
                labels_found.append({
                    "id": int(label_id),
                    "name": label_info['name'],
                    "confidence": confidence,
                    "volume": float(volume)
                })
        
        return labels_found
    
    def get_label_info(self, label_id: int) -> Dict[str, str]:
        """
        Get label information from VISTA3D metadata
        """
        # This should map to the same labels as defined in vista3d-labels.ts
        VISTA3D_LABELS = {
            1: {"name": "liver", "category": "organs"},
            2: {"name": "kidney", "category": "organs"},
            3: {"name": "spleen", "category": "organs"},
            # ... complete mapping
        }
        
        return VISTA3D_LABELS.get(label_id, {"name": f"Unknown {label_id}", "category": "unknown"})
    
    def save_segmentation(self, segmentation: np.ndarray, parent_image_id: str) -> str:
        """
        Save segmentation result back to VolView as a new image/segment group
        """
        # Implementation depends on VolView's image storage system
        # Should return the ID of the newly created segmentation
        pass

# Server integration example (using your existing RPC framework)
class VolViewServer:
    def __init__(self):
        self.vista3d = Vista3DAnalyzer()
    
    async def handle_vista3d_analysis(self, image_id: str, params: dict) -> dict:
        """
        RPC method handler for VISTA3D analysis
        """
        try:
            result = await self.vista3d.vista3d_analysis(image_id, params)
            return result
        except Exception as e:
            # Handle errors appropriately
            raise Exception(f"VISTA3D Analysis failed: {str(e)}")
```

## Installation Requirements

The server needs these Python packages:

```bash
pip install monai[all]
pip install "monai[fire]"
pip install torch torchvision
pip install nibabel
pip install numpy
pip install scipy
```

## VISTA3D Bundle Setup

```bash
# Download VISTA3D bundle
python -m monai.bundle download "vista3d" --bundle_dir "bundles/"

# The bundle will be available at: bundles/vista3d/
```

## Integration Notes

1. **Image Data Exchange**: The server needs access to VolView's image data. This might require:
   - Temporary file writing/reading
   - Shared memory communication
   - Network-based image transfer

2. **Result Integration**: The segmentation results need to be imported back into VolView as segment groups. The server should:
   - Save results in a format VolView can read (e.g., NIfTI)
   - Return the file path or image ID for VolView to load
   - Maintain proper metadata for segment group creation

3. **Performance**: VISTA3D can be computationally intensive:
   - Consider GPU acceleration
   - Implement progress reporting for long-running analyses
   - Add timeout handling

4. **Error Handling**: Implement robust error handling for:
   - Model loading failures
   - Out-of-memory errors
   - Invalid input data
   - Network communication issues

## Testing

You can test the VISTA3D integration using the "Test VISTA3D" button in the Remote panel of VolView. This will call the server with sample parameters and log the results to the console.

## Future Enhancements

- Support for custom VISTA3D model fine-tuning
- Batch processing of multiple images
- Real-time analysis progress reporting
- Integration with other MONAI models
- Support for different medical imaging modalities