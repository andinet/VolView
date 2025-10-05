import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { useSegmentGroupStore } from '@/src/store/segmentGroups';
import { useMessageStore, MessageType } from '@/src/store/messages';
import { VISTA3D_LABELS, type Vista3dLabel } from '@/src/config/vista3d-labels';

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
}

// Mock server call function (will be replaced with real HTTP calls later)
async function callVista3dServerMock(imageId: string, params: Vista3dParams): Promise<Vista3dResult> {
  // Debug logging
  console.log('🧠 VISTA3D Debug: Starting analysis...');
  console.log('📋 Image ID:', imageId);
  console.log('⚙️ Parameters:', params);
  console.log('🖥️ Server endpoint (mock):', 'http://localhost:8000/api/vista3d_analysis');
  
  // For demonstration, return mock results
  // In a real implementation, this would make an HTTP call to the VISTA3D server
  
  console.log('⏳ Simulating MONAI bundle execution...');
  console.log('📦 MONAI Bundle Commands (Real Implementation):');
  console.log('');
  console.log('1️⃣ Setup Environment:');
  console.log('   cd /path/to/volview/server');
  console.log('   source venv/bin/activate  # or poetry shell');
  console.log('');
  console.log('2️⃣ Download Model (if not exists):');
  console.log('   python -m monai.bundle download vista3d --bundle_dir ./bundles/');
  console.log('');
  console.log('3️⃣ Run Inference:');
  console.log('   python -m monai.bundle run vista3d \\');
  console.log('     --config_file bundles/vista3d/configs/inference.json \\');
  console.log('     --dataset_dir /tmp/vista3d_input \\');
  console.log('     --output_dir /tmp/vista3d_output \\');
  console.log(`     --input_image ${imageId}.nii.gz \\`);
  console.log(`     --confidence_threshold ${params.confidenceThreshold}`);
  console.log('');
  console.log('4️⃣ Or via FastAPI Server:');
  console.log('   POST http://localhost:8000/api/vista3d_analysis');
  console.log(`   Body: { imageId: "${imageId}", confidenceThreshold: ${params.confidenceThreshold} }`);
  console.log('');
  
  // Simulate processing time
  await new Promise<void>(resolve => {
    setTimeout(resolve, 2000);
  });
  
  // Mock result with realistic whole-body segmentation data
  const mockResult: Vista3dResult = {
    segmentationId: `vista3d_wholebody_${Date.now()}`,
    labels: [
      { id: 1, name: "liver", confidence: 0.94, volume: 1850.2 },
      { id: 20, name: "lung", confidence: 0.92, volume: 4200.5 },
      { id: 22, name: "brain", confidence: 0.96, volume: 1400.8 },
      { id: 115, name: "heart", confidence: 0.89, volume: 650.3 },
      { id: 3, name: "spleen", confidence: 0.87, volume: 180.4 },
      { id: 2, name: "kidney", confidence: 0.91, volume: 320.6 },
      { id: 14, name: "left kidney", confidence: 0.90, volume: 310.2 },
      { id: 4, name: "pancreas", confidence: 0.85, volume: 95.8 },
      { id: 121, name: "spinal cord", confidence: 0.93, volume: 45.2 },
      { id: 120, name: "skull", confidence: 0.95, volume: 780.4 },
      { id: 21, name: "bone", confidence: 0.88, volume: 2100.9 },
      { id: 37, name: "vertebrae L1", confidence: 0.82, volume: 25.4 },
      { id: 38, name: "vertebrae T12", confidence: 0.81, volume: 23.8 },
      { id: 49, name: "vertebrae T1", confidence: 0.80, volume: 22.1 },
      { id: 75, name: "right rib 1", confidence: 0.78, volume: 8.5 },
      { id: 63, name: "left rib 1", confidence: 0.77, volume: 8.2 },
      { id: 87, name: "left humerus", confidence: 0.84, volume: 95.3 },
      { id: 88, name: "right humerus", confidence: 0.83, volume: 97.1 },
      { id: 93, name: "left femur", confidence: 0.86, volume: 185.7 },
      { id: 94, name: "right femur", confidence: 0.85, volume: 187.2 },
    ],
    processingTime: 12.5
  };
  
  console.log('✅ VISTA3D Mock Analysis Complete!');
  console.log('📊 Results:', mockResult);
  console.log('🎯 Segmented structures:', mockResult.labels.length);
  
  return mockResult;
}

// Create actual segment group for VISTA3D visualization
async function createMockSegmentGroup(
  groupName: string, 
  labels: Array<{ id: number; name: string; confidence: number; volume: number }>,
  imageId: string
) {
  console.log('🎨 Creating VISTA3D segment group...');
  
  // Get the segment group store
  const segmentGroupStore = useSegmentGroupStore();
  
  // Create a new labelmap from the parent image
  const segmentGroupId = segmentGroupStore.newLabelmapFromImage(imageId);
  
  if (!segmentGroupId) {
    throw new Error('Failed to create labelmap from image');
  }
  
  // Update the segment group name
  segmentGroupStore.updateMetadata(segmentGroupId, {
    name: groupName,
  });
  
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

  // Add segments for the most important structures (first 8 to avoid clutter)
  const importantStructures = labels
    .filter(label => label.confidence > 0.8) // High confidence only
    .slice(0, 8); // Limit to 8 segments for visibility
  
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
      // Call VISTA3D analysis through server
      // For now, we'll use a mock call. In a full implementation, this would 
      // integrate with VolView's RPC system or make HTTP calls to the server
      const result = await callVista3dServerMock(currentImageID.value, params);

      console.log('🔄 Processing segmentation results...');
      console.log('📊 Received', result.labels.length, 'segmented structures');
      
      // Create segment groups for visualization
      if (result.segmentationId && result.labels.length > 0) {
        console.log('🎨 Creating segment groups for visualization...');
        
        try {
          // Create a new segment group for VISTA3D results
          const segmentGroupName = `VISTA3D Analysis - ${new Date().toLocaleTimeString()}`;
          
          // For demo purposes, create mock segment data
          // In real implementation, this would use actual segmentation volume data
          await createMockSegmentGroup(segmentGroupName, result.labels, currentImageID.value);
          
          console.log('✅ Created segment group:', segmentGroupName);
          console.log('🏷️ Segments created for:', result.labels.slice(0, 5).map(l => l.name).join(', '), '...');
          
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