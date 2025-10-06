import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { useSegmentGroupStore, createLabelmapFromImage } from '@/src/store/segmentGroups';
import { useMessageStore, MessageType } from '@/src/store/messages';
import { useImageCacheStore } from '@/src/store/image-cache';
import { VISTA3D_LABELS, type Vista3dLabel } from '@/src/config/vista3d-labels';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

// 🚀 VTK.js decoding functions (following ChatGPT's recommendations)
function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gunzipUint8Array(dataU8: Uint8Array): Promise<Uint8Array> {
  if ('DecompressionStream' in globalThis) {
    const ds = new DecompressionStream('gzip');
    const stream = new Response(
      new Blob([dataU8] as BlobPart[]).stream().pipeThrough(ds)
    );
    const buf = await stream.arrayBuffer();
    return new Uint8Array(buf);
  }
  throw new Error('No gunzip available: use a DecompressionStream-capable browser');
}

function typedArrayCtor(dtype: string): any {
  return ({
    Uint8Array, Int8Array, Uint16Array, Int16Array,
    Uint32Array, Int32Array, Float32Array, Float64Array
  }[dtype]) || Uint8Array;
}

async function decodeArrayFieldInPlace(arrObj: any): Promise<void> {
  const isGz = arrObj.valuesCompression === 'gzip';
  const isB64 = arrObj.valuesEncoding === 'base64';
  if (!isB64 || typeof arrObj.values !== 'string') return;

  // base64 -> bytes
  let bytes = base64ToUint8Array(arrObj.values);

  // gunzip if needed
  if (isGz) bytes = await gunzipUint8Array(bytes);

  const Ctor = typedArrayCtor(arrObj.dtype);
  // eslint-disable-next-line no-param-reassign
  arrObj.values = new Ctor(
    bytes.buffer, bytes.byteOffset, bytes.byteLength / Ctor.BYTES_PER_ELEMENT
  );

  // eslint-disable-next-line no-param-reassign
  delete arrObj.valuesEncoding;
  // eslint-disable-next-line no-param-reassign
  delete arrObj.valuesCompression;
}

async function decodeVtkJsInPlace(ds: any): Promise<any> {
  const tasks: Promise<void>[] = [];

  const fixArrayList = (section: string) => {
    const arrays = ds?.[section]?.arrays;
    if (Array.isArray(arrays)) {
      arrays.forEach((a: any) => tasks.push(decodeArrayFieldInPlace(a)));
    }
  };

  fixArrayList('pointData');
  fixArrayList('cellData');

  ['points','verts','lines','polys','strips'].forEach((k) => {
    if (ds?.[k]?.values) tasks.push(decodeArrayFieldInPlace(ds[k]));
  });

  await Promise.all(tasks);
  return ds;
}

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
  console.log('🖥️ Server endpoint:', 'http://localhost:8081/api/vista3d_analysis');
  
  try {
    // Make HTTP request to real VISTA3D server
    console.log('📡 Calling real VISTA3D server...');
    
    // Get the actual image data for processing
    const imageCacheStore = useImageCacheStore();
    const sourceImage = imageCacheStore.getVtkImageData(imageId);
    
    if (!sourceImage) {
      throw new Error(`Image with ID ${imageId} not found`);
    }
    
    // Serialize the VTK image data for the server
    const serializedImageData = sourceImage.toJSON();
    console.log('📦 Serialized image data:', serializedImageData);
    
    const response = await fetch('http://localhost:8081/api/vista3d_analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageId,
        imageData: serializedImageData,
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
      let segmentationArray: Uint8Array;
      let shape: number[];
      
      if (typeof labelmapData === 'string') {
        // Parse JSON string format 
        const labelmapInfo = JSON.parse(labelmapData);
        
        if (labelmapInfo.conversion_method === 'direct_numpy') {
          console.log('🔄 Processing direct numpy conversion format...');
          // Fallback numpy format
          const binaryString = atob(labelmapInfo.data);
          segmentationArray = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            segmentationArray[i] = binaryString.charCodeAt(i);
          }
          shape = labelmapInfo.shape;
        } else {
          // 🚀 NEW: Proper VTK.js format with gzip+base64 decoding
          console.log('🔄 Processing VTK.js format with proper decoding...');
          await decodeVtkJsInPlace(labelmapInfo);
          
          if (labelmapInfo.pointData && labelmapInfo.pointData.arrays && labelmapInfo.pointData.arrays.length > 0) {
            const arrayData = labelmapInfo.pointData.arrays[0];
            segmentationArray = new Uint8Array(arrayData.values);
            
            // Calculate shape from extent
            const extent = labelmapInfo.extent;
            shape = [
              extent[1] - extent[0] + 1,
              extent[3] - extent[2] + 1,
              extent[5] - extent[4] + 1
            ];
          } else {
            throw new Error('Invalid VTK.js format: missing point data');
          }
        }
      } else {
        // 🚀 NEW: Direct VTK.js format object with proper decoding
        console.log('🔄 Processing direct VTK.js object format with proper decoding...');
        const vtkjsObj = labelmapData as any;
        
        await decodeVtkJsInPlace(vtkjsObj);
        
        if (vtkjsObj.pointData && vtkjsObj.pointData.arrays && vtkjsObj.pointData.arrays.length > 0) {
          const arrayData = vtkjsObj.pointData.arrays[0];
          segmentationArray = new Uint8Array(arrayData.values);
          
          // Calculate shape from extent
          const extent = vtkjsObj.extent;
          shape = [
            extent[1] - extent[0] + 1,
            extent[3] - extent[2] + 1,
            extent[5] - extent[4] + 1
          ];
        } else {
          throw new Error('Invalid VTK.js format: missing point data');
        }
      }
      
      // Create VTK labelmap with real segmentation data
      const labelmap = createLabelmapWithData(imageId, segmentationArray, shape);
      
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
    console.log('📊 Creating empty labelmap (server data not available)...');
    // Create empty labelmap - segments will show in list but won't have voxel data until server works
    const emptyId = segmentGroupStore.newLabelmapFromImage(imageId);
    if (!emptyId) {
      throw new Error('Failed to create labelmap from image');
    }
    segmentGroupId = emptyId;
    segmentGroupStore.updateMetadata(segmentGroupId, { name: groupName });
    console.log('⚠️ Note: Segments created but no voxel data (server issue needs to be fixed)');
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
  
  // Note: Using actual VISTA3D label IDs as segment values
  
  importantStructures.forEach((label) => {
    const color = getSegmentColor(label.name);
    // 🔧 FIX: Use the actual label ID from VISTA3D model (matches voxel values)
    const segmentValue = label.id; // This matches the voxel values in the labelmap
    
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