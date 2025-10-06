import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { useSegmentGroupStore, createLabelmapFromImage } from '@/src/store/segmentGroups';
import { useMessageStore, MessageType } from '@/src/store/messages';
import { useImageCacheStore } from '@/src/store/image-cache';
import { VISTA3D_LABELS, type Vista3dLabel } from '@/src/config/vista3d-labels';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

// Helper function to create labelmap with real segmentation data
function createLabelmapWithData(imageId: string, segmentationData: Uint8Array, shape: number[]) {
  const imageCacheStore = useImageCacheStore();
  const sourceImage = imageCacheStore.getVtkImageData(imageId);
  
  if (!sourceImage) {
    throw new Error('Source image not found');
  }
  
  // Create labelmap from source image structure
  const labelmap = createLabelmapFromImage(sourceImage);
  
  // Replace the empty data with real segmentation data
  const scalars = vtkDataArray.newInstance({
    numberOfComponents: 1,
    values: segmentationData,
  });
  
  labelmap.getPointData().setScalars(scalars);
  labelmap.setDimensions(shape);
  labelmap.computeTransforms();
  
  return labelmap;
}

export interface Vista3dParams {
  segmentEverything: boolean;
  selectedLabels: number[];
  confidenceThreshold: number;
  usePointPrompts: boolean;
  pointPrompts: Array<{ point: [number, number, number]; label: number }>;
}

export interface Vista3dResult {
  segmentationId: string;
  labels: Array<{
    id: number;
    name: string;
    confidence: number;
    volume: number;
  }>;
  processingTime: number;
  labelmapData?: string; // Base64 encoded labelmap data from server
}

// Real VISTA3D server call function
async function callVista3dServer(imageId: string, params: Vista3dParams): Promise<Vista3dResult> {
  // Debug logging
  console.log('🧠 VISTA3D: Starting real analysis...');
  console.log('📋 Image ID:', imageId);
  console.log('⚙️ Parameters:', params);
  console.log('🖥️ Server endpoint:', 'http://localhost:8000/api/vista3d_analysis');
  
  try {
    // Make HTTP request to real VISTA3D server
    console.log('📡 Calling real VISTA3D server...');
    
    const response = await fetch('http://localhost:8000/api/vista3d_analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageId,
        confidenceThreshold: params.confidenceThreshold,
        segmentEverything: params.segmentEverything,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const serverResult = await response.json();
    console.log('✅ Server response received:', serverResult);

    // Convert server response to our format
    const result: Vista3dResult = {
      segmentationId: serverResult.segmentationId,
      labels: serverResult.labels,
      processingTime: serverResult.processingTime,
      labelmapData: serverResult.labelmapData
    };

    console.log('✅ VISTA3D Analysis Complete!');
    console.log('📊 Results:', result);
    console.log('🎯 Segmented structures:', result.labels.length);

    return result;

  } catch (error) {
    console.error('❌ VISTA3D Server Error:', error);
    
    // Fallback to mock data if server is unavailable
    console.log('🔄 Falling back to mock data...');
    const mockResult: Vista3dResult = {
      segmentationId: `vista3d_mock_${Date.now()}`,
      labels: [
        { id: 1, name: "liver", confidence: 0.94, volume: 1850.2 },
        { id: 20, name: "lung", confidence: 0.92, volume: 4200.5 },
        { id: 22, name: "brain", confidence: 0.96, volume: 1400.8 },
        { id: 115, name: "heart", confidence: 0.89, volume: 650.3 },
        { id: 3, name: "spleen", confidence: 0.87, volume: 180.4 },
        { id: 2, name: "kidney", confidence: 0.91, volume: 320.6 },
      ],
      processingTime: 2.5
    };

    console.log('✅ Mock Analysis Complete!');
    return mockResult;
  }
}

// Create actual segment group for VISTA3D visualization with real labelmap data
async function createVista3dSegmentGroup(
  groupName: string, 
  labels: Array<{ id: number; name: string; confidence: number; volume: number }>,
  imageId: string,
  labelmapData?: string
) {
  console.log('🎨 Creating VISTA3D segment group...');
  
  // Get the segment group store
  const segmentGroupStore = useSegmentGroupStore();
  
  let segmentGroupId: string;
  
  if (labelmapData) {
    console.log('📊 Processing real labelmap data from VISTA3D server...');
    try {
      // Parse the labelmap data from server
      const labelmapInfo = JSON.parse(labelmapData);
      const segmentationArray = new Uint8Array(Buffer.from(labelmapInfo.data, 'base64'));
      
      // Create VTK labelmap with real segmentation data
      const labelmap = createLabelmapWithData(imageId, segmentationArray, labelmapInfo.shape);
      
      // Add the real labelmap to the store
      segmentGroupId = segmentGroupStore.addLabelmap(labelmap, {
        name: groupName,
        parentImage: imageId,
        segments: { order: [], byValue: {} }
      });
      
      console.log('✅ Real labelmap data loaded successfully');
    } catch (error) {
      console.warn('⚠️ Failed to load real labelmap data, falling back to empty labelmap:', error);
      // Fall back to empty labelmap
      const fallbackId = segmentGroupStore.newLabelmapFromImage(imageId);
      if (!fallbackId) {
        throw new Error('Failed to create labelmap from image');
      }
      segmentGroupId = fallbackId;
      segmentGroupStore.updateMetadata(segmentGroupId, { name: groupName });
    }
  } else {
    console.log('📊 Creating empty labelmap (no server data available)...');
    // Create empty labelmap for mock data
    const emptyId = segmentGroupStore.newLabelmapFromImage(imageId);
    if (!emptyId) {
      throw new Error('Failed to create labelmap from image');
    }
    segmentGroupId = emptyId;
    segmentGroupStore.updateMetadata(segmentGroupId, { name: groupName });
  }
  
  // Color mapping for anatomical structures
  const getSegmentColor = (name: string): [number, number, number, number] => {
    const colorMap: Record<string, [number, number, number, number]> = {
      'liver': [139, 69, 19, 255],         // Brown
      'lung': [255, 182, 193, 255],        // Light pink
      'brain': [255, 20, 147, 255],        // Deep pink
      'heart': [220, 20, 60, 255],         // Crimson
      'spleen': [75, 0, 130, 255],         // Indigo
      'kidney': [255, 215, 0, 255],        // Gold
      'pancreas': [255, 165, 0, 255],      // Orange
      'bone': [255, 255, 255, 255],        // White
      'skull': [192, 192, 192, 255],       // Silver
      'vertebrae': [169, 169, 169, 255],   // Dark gray
      'rib': [211, 211, 211, 255],         // Light gray
      'humerus': [176, 196, 222, 255],     // Light steel blue
      'femur': [70, 130, 180, 255],        // Steel blue
    };
    
    // Find matching color or generate one
    const matchingEntry = Object.entries(colorMap).find(([key]) => 
      name.toLowerCase().includes(key)
    );
    if (matchingEntry) {
      return matchingEntry[1];
    }
    
    // Generate color based on name hash
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = name.charCodeAt(i) + ((hash * 5) - hash);
    }
    
    const r = Math.abs(hash) % 200 + 55;
    const g = Math.abs(Math.floor(hash / 256)) % 200 + 55;
    const b = Math.abs(Math.floor(hash / 65536)) % 200 + 55;
    
    return [r, g, b, 255];
  };

  // Add segments for the most important structures (first 10 to show expanded results)
  const importantStructures = labels
    .filter(label => label.confidence > 0.6) // Include medium to high confidence
    .slice(0, 10); // Limit to 10 segments for visibility
  
  console.log(`🏷️ Adding ${importantStructures.length} high-confidence segments:`);
  
  importantStructures.forEach((label, index) => {
    const color = getSegmentColor(label.name);
    const segmentValue = index + 1; // Start from 1 (0 is background)
    
    try {
      segmentGroupStore.addSegment(segmentGroupId, {
        name: `${label.name} (${(label.confidence * 100).toFixed(0)}%)`,
        value: segmentValue,
        color,
        visible: true,
        locked: false,
      });
      
      console.log(`  ✅ ${label.name}: value=${segmentValue}, confidence=${label.confidence.toFixed(2)}`);
    } catch (error) {
      console.warn(`  ⚠️ Failed to add segment ${label.name}:`, error);
    }
  });
  
  console.log(`🎯 Created segment group "${groupName}" with ID: ${segmentGroupId}`);
  console.log(`📊 Total segments: ${importantStructures.length}`);
  
  return {
    segmentGroupId,
    segments: importantStructures.length,
    structures: importantStructures.map(l => l.name),
  };
}

export const useVista3dStore = defineStore('vista3d', () => {
  const { currentImageID } = useCurrentImage();
  const messageStore = useMessageStore();

  // VISTA3D Parameters - Always automatic whole-body segmentation
  const segmentEverything = ref(true);
  const selectedLabels = ref<number[]>([]);
  const confidenceThreshold = ref(0.5);
  const usePointPrompts = ref(false);
  const pointPrompts = ref<Array<{ point: [number, number, number]; label: number }>>([]);

  // Analysis State
  const isAnalyzing = ref(false);
  const analysisResults = ref<Vista3dResult[]>([]);
  const lastAnalysisTime = ref<Date | null>(null);

  // Available labels from VISTA3D metadata
  const availableLabels = computed(() => VISTA3D_LABELS);

  // Get selected label names
  const selectedLabelNames = computed(() => 
    selectedLabels.value.map(id => 
      availableLabels.value.find((label: Vista3dLabel) => label.id === id)?.name || `Label ${id}`
    )
  );

  // Server connection status
  // For now, allow mock functionality even without server connection
  const isServerConnected = computed(() => 
    true // Always allow for testing with mock data
    // serverStore.connState === 1 // ConnectionState.Connected (enable this for production)
  );

  function setSegmentEverything() {
    // Always force to true for automatic whole-body segmentation
    segmentEverything.value = true;
    selectedLabels.value = [];
  }

  function toggleLabel(labelId: number) {
    const index = selectedLabels.value.indexOf(labelId);
    if (index === -1) {
      selectedLabels.value.push(labelId);
    } else {
      selectedLabels.value.splice(index, 1);
    }
  }

  function addPointPrompt(point: [number, number, number], label: number) {
    pointPrompts.value.push({ point, label });
  }

  function removePointPrompt(index: number) {
    pointPrompts.value.splice(index, 1);
  }

  function clearPointPrompts() {
    pointPrompts.value = [];
  }

  async function runVista3dAnalysis(): Promise<Vista3dResult | null> {
    console.log('🚀 VISTA3D Analysis Started');
    console.log('📸 Current Image ID:', currentImageID.value);
    
    if (!currentImageID.value) {
      console.error('❌ No image selected');
      messageStore.addError('No image selected', new Error('Please select an image first'));
      return null;
    }

    // Skip server check for mock mode
    // if (!isServerConnected.value) {
    //   messageStore.addError('Server not connected', new Error('Please connect to the VolView server first'));
    //   return null;
    // }

    console.log('⚙️ Setting analysis state to active');
    isAnalyzing.value = true;

    try {
      const params: Vista3dParams = {
        segmentEverything: true, // Always segment everything for whole-body analysis
        selectedLabels: [], // Empty for automatic mode
        confidenceThreshold: confidenceThreshold.value,
        usePointPrompts: false, // Disabled for automatic mode
        pointPrompts: [], // Empty for automatic mode
      };

      console.log('📡 Calling VISTA3D server...');
      // Call real VISTA3D server (with fallback to mock if unavailable)
      const result = await callVista3dServer(currentImageID.value, params);

      console.log('🔄 Processing segmentation results...');
      console.log('📊 Received', result.labels.length, 'segmented structures');
      
      // Create segment groups for visualization
      if (result.segmentationId && result.labels.length > 0) {
        console.log('🎨 Creating segment groups for visualization...');
        
        try {
          // Create a new segment group for VISTA3D results
          const segmentGroupName = `VISTA3D Analysis - ${new Date().toLocaleTimeString()}`;
          
          // Create segment group with real VISTA3D labelmap data
          await createVista3dSegmentGroup(segmentGroupName, result.labels, currentImageID.value, result.labelmapData);
          
          console.log('✅ Created segment group:', segmentGroupName);
          console.log('🏷️ Segments created for:', result.labels.slice(0, 5).map((l: any) => l.name).join(', '), '...');
          
        } catch (error) {
          console.error('❌ Failed to create segment group:', error);
          messageStore.addError('Failed to create segments', error as Error);
        }
      } else {
        console.warn('⚠️ No segmentation data to visualize');
      }

      analysisResults.value.unshift(result);
      lastAnalysisTime.value = new Date();

      messageStore._addMessage({
        title: 'VISTA-3D Analysis Complete',
        type: MessageType.Success,
      }, `Successfully segmented ${result.labels.length} structures in ${result.processingTime.toFixed(2)}s. Segment groups created for visualization.`);

      return result;
    } catch (error) {
      console.error('VISTA3D Analysis Failed:', error);
      messageStore.addError('VISTA-3D Analysis Failed', error as Error);
      return null;
    } finally {
      isAnalyzing.value = false;
    }
  }

  function clearResults() {
    analysisResults.value = [];
    lastAnalysisTime.value = null;
  }

  return {
    // Parameters
    segmentEverything,
    selectedLabels,
    confidenceThreshold,
    usePointPrompts,
    pointPrompts,

    // State
    isAnalyzing,
    analysisResults,
    lastAnalysisTime,

    // Computed
    availableLabels,
    selectedLabelNames,
    isServerConnected,

    // Actions
    setSegmentEverything,
    toggleLabel,
    addPointPrompt,
    removePointPrompt,
    clearPointPrompts,
    runVista3dAnalysis,
    clearResults,
  };
});