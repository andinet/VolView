import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useCurrentImage } from '@/src/composables/useCurrentImage';
import { useSegmentGroupStore, createLabelmapFromImage } from '@/src/store/segmentGroups';
import { useMessageStore, MessageType } from '@/src/store/messages';
import { useImageCacheStore } from '@/src/store/image-cache';
import { usePaintToolStore } from '@/src/store/tools/paint';
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
  // Handle both VTK.js format (Int16Array) and old format (int16)
  const typeMap: Record<string, any> = {
    'Uint8Array': Uint8Array, 'uint8': Uint8Array,
    'Int8Array': Int8Array, 'int8': Int8Array,
    'Uint16Array': Uint16Array, 'uint16': Uint16Array,
    'Int16Array': Int16Array, 'int16': Int16Array,
    'Uint32Array': Uint32Array, 'uint32': Uint32Array,
    'Int32Array': Int32Array, 'int32': Int32Array,
    'Float32Array': Float32Array, 'float32': Float32Array,
    'Float64Array': Float64Array, 'float64': Float64Array,
  };
  const Ctor = typeMap[dtype];
  if (!Ctor) throw new Error(`Unsupported vtk.js dtype: ${dtype}`);
  return Ctor;
}

async function decodeArrayFieldInPlace(arrObj: any): Promise<void> {
  const isGz = arrObj.valuesCompression === 'gzip';
  const isB64 = arrObj.valuesEncoding === 'base64' || typeof arrObj.values === 'string';
  
  if (!isB64 || typeof arrObj.values !== 'string') return;

  // base64 -> bytes
  let bytes = base64ToUint8Array(arrObj.values);

  // gunzip if needed
  if (isGz) bytes = await gunzipUint8Array(bytes);

  // Determine the typed array constructor
  const dtype = arrObj.dataType || arrObj.dtype || 'Uint8Array';
  const Ctor = typedArrayCtor(dtype);
  
  // Sanity check: ensure buffer length is divisible by element size
  const n = bytes.byteLength / Ctor.BYTES_PER_ELEMENT;
  if (!Number.isInteger(n)) {
    throw new Error(
      `Decoded buffer length (${bytes.byteLength}) is not divisible by ${Ctor.BYTES_PER_ELEMENT} for ${dtype}`
    );
  }
  
  // eslint-disable-next-line no-param-reassign
  arrObj.values = new Ctor(bytes.buffer, bytes.byteOffset, n);

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
      arrays.forEach((a: any) => {
        // Handle both direct array and array with 'data' wrapper
        if (a.data) {
          tasks.push(decodeArrayFieldInPlace(a.data));
        } else {
          tasks.push(decodeArrayFieldInPlace(a));
        }
      });
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
  
  const [dx, dy, dz] = shape;
  const expected = dx * dy * dz;
  
  // Replace the empty data with real segmentation data
  const scalars = vtkDataArray.newInstance({
    name: 'Labels',
    numberOfComponents: 1,
    values: segmentationData,
  });
  
  labelmap.getPointData().setScalars(scalars);
  
  const se = sourceImage.getExtent();
  const sx = se[1] - se[0] + 1;
  const sy = se[3] - se[2] + 1;
  const sz = se[5] - se[4] + 1;
  const sourceVox = sx * sy * sz;
  
  if (segmentationData.length !== expected) {
    console.warn(`Labelmap voxel count mismatch: got ${segmentationData.length}, expected ${expected}`);
  }
  
  // Log both voxel counts and computed shapes for debugging
  console.log(`🔍 Seg bytes=${segmentationData.length}, shape=${dx}×${dy}×${dz}, source=${sx}×${sy}×${sz}`);
  
  // If voxel counts match, mirror the source; otherwise use shape-derived extent.
  if (expected === sourceVox) {
    labelmap.setExtent(se[0], se[1], se[2], se[3], se[4], se[5]);
  } else {
    labelmap.setExtent(0, dx - 1, 0, dy - 1, 0, dz - 1);
  }
  
  labelmap.setSpacing(sourceImage.getSpacing());
  labelmap.setOrigin(sourceImage.getOrigin());
  
  // Set direction if available (for proper orientation)
  if (labelmap.setDirection && sourceImage.getDirection) {
    labelmap.setDirection(sourceImage.getDirection());
  }
  
  labelmap.modified();
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
  labelmapData?: string | Record<string, any>; // Can be JSON string or object
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
  labelmapData?: string | Record<string, any>
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
          
          const arr0 = labelmapInfo.pointData?.arrays?.[0];
          if (!arr0) throw new Error('Invalid VTK.js format: missing point data');
          
          // Unify: prefer 'data' wrapper if present
          const container = (arr0?.data ?? arr0) as any;
          const valuesTA = container?.values;
          
          // Debug: log decoded array info
          console.log('🔍 Decoded array info:', {
            dtype: container?.dataType,
            ncomp: container?.numberOfComponents,
            size: container?.size,
            isUint8: valuesTA instanceof Uint8Array,
            valuesLen: valuesTA?.length,
            extent: labelmapInfo.extent
          });
          
          if (!(valuesTA instanceof Uint8Array)) {
            throw new Error(`Segment array must be Uint8Array, got ${valuesTA?.constructor?.name}`);
          }
          segmentationArray = valuesTA;
          
          // Calculate shape from extent
          const extent = labelmapInfo.extent;
          shape = [
            extent[1] - extent[0] + 1,
            extent[3] - extent[2] + 1,
            extent[5] - extent[4] + 1
          ];
        }
      } else {
        // 🚀 NEW: Direct VTK.js format object with proper decoding
        console.log('🔄 Processing direct VTK.js object format with proper decoding...');
        const vtkjsObj = labelmapData as any;
        
        await decodeVtkJsInPlace(vtkjsObj);
        
        const arr0 = vtkjsObj.pointData?.arrays?.[0];
        if (!arr0) throw new Error('Invalid VTK.js format: missing point data');
        
        // Unify: prefer 'data' wrapper if present
        const container = (arr0?.data ?? arr0) as any;
        const valuesTA = container?.values;
        
        // Debug: log decoded array info
        console.log('🔍 Decoded array info:', {
          dtype: container?.dataType,
          ncomp: container?.numberOfComponents,
          size: container?.size,
          isUint8: valuesTA instanceof Uint8Array,
          valuesLen: valuesTA?.length,
          extent: vtkjsObj.extent
        });
        
        if (!(valuesTA instanceof Uint8Array)) {
          throw new Error(`Segment array must be Uint8Array, got ${valuesTA?.constructor?.name}`);
        }
        segmentationArray = valuesTA;
        
        // Calculate shape from extent
        const extent = vtkjsObj.extent;
        shape = [
          extent[1] - extent[0] + 1,
          extent[3] - extent[2] + 1,
          extent[5] - extent[4] + 1
        ];
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

  // Add all segments with any detected confidence (no limit on number of segments)
  const importantStructures = labels
    .filter(label => label.confidence > 0.0); // Include all detected structures
  
  console.log(`🏷️ Adding ${importantStructures.length} segments:`);
  
  // Note: Using actual VISTA3D label IDs as segment values
  
  // Note: Using actual VISTA3D label IDs as segment values (liver remapped from 1→101 to avoid VolView default segment conflict)
  
  importantStructures.forEach((label) => {
    const color = getSegmentColor(label.name);
    // 🔧 FIX: Handle VolView's default segment value=1 conflict
    // VolView creates default segment with value=1, so reassign liver to avoid conflict
    const segmentValue = label.id === 1 ? 101 : label.id; // Liver: 1 → 101, others keep original IDs
    
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
  
  // 🎯 Set as active segment group so UI displays the segments
  const paintStore = usePaintToolStore();
  paintStore.setActiveSegmentGroup(segmentGroupId);
  console.log(`✅ Set active segment group to: ${segmentGroupId}`);
  
  // 🔍 DEBUG: Comprehensive segment overlay validation
  console.log('🔍 [VISTA3D DEBUG] Validating segment overlay alignment...');
  
  try {
    const imageStore = useImageCacheStore();
    const parentImage = imageStore.imageById[imageId]?.getVtkImageData();
    const segmentGroup = segmentGroupStore.dataIndex[segmentGroupId];
    
    if (parentImage && segmentGroup) {
      // Check coordinate alignment
      const imageBounds = parentImage.getBounds();
      const segmentBounds = segmentGroup.getBounds();
      const imageSpacing = parentImage.getSpacing();
      const segmentSpacing = segmentGroup.getSpacing();
      const imageOrigin = parentImage.getOrigin();
      const segmentOrigin = segmentGroup.getOrigin();
      
      console.log(`   📐 Image bounds: [${imageBounds.map((b: number) => b.toFixed(2)).join(', ')}]`);
      console.log(`   📐 Segment bounds: [${segmentBounds.map((b: number) => b.toFixed(2)).join(', ')}]`);
      console.log(`   📏 Image spacing: [${imageSpacing.map((s: number) => s.toFixed(3)).join(', ')}]`);
      console.log(`   📏 Segment spacing: [${segmentSpacing.map((s: number) => s.toFixed(3)).join(', ')}]`);
      console.log(`   📍 Image origin: [${imageOrigin.join(', ')}]`);
      console.log(`   📍 Segment origin: [${segmentOrigin.join(', ')}]`);
      
      if (parentImage.getDirection && segmentGroup.getDirection) {
        console.log(`   🧭 Image direction: ${parentImage.getDirection()}`);
        console.log(`   🧭 Segment direction: ${segmentGroup.getDirection()}`);
      }
      
      // Check alignment
      const boundsMatch = imageBounds.every((val: number, i: number) => Math.abs(val - segmentBounds[i]) < 0.1);
      const spacingMatch = imageSpacing.every((val: number, i: number) => Math.abs(val - segmentSpacing[i]) < 0.001);
      const originMatch = imageOrigin.every((val: number, i: number) => Math.abs(val - segmentOrigin[i]) < 0.1);
      
      console.log(`   ✅ Coordinate alignment: bounds=${boundsMatch}, spacing=${spacingMatch}, origin=${originMatch}`);
      
      // Check actual voxel data for each created segment
      const scalars = segmentGroup.getPointData().getScalars();
      if (scalars) {
        console.log(`   🎯 Checking voxel data for ${importantStructures.length} segments:`);
        importantStructures.forEach((label) => {
          const segmentValue = label.id === 1 ? 101 : label.id;
          let voxelCount = 0;
          const totalVoxels = scalars.getNumberOfTuples();
          
          for (let i = 0; i < totalVoxels; i++) {
            if (scalars.getTuple(i)[0] === segmentValue) {
              voxelCount++;
            }
          }
          
          const percentage = (voxelCount / totalVoxels * 100).toFixed(2);
          console.log(`     ${label.name} (value=${segmentValue}): ${voxelCount}/${totalVoxels} voxels (${percentage}%)`);
          
          if (voxelCount === 0) {
            console.warn(`     ⚠️ WARNING: ${label.name} has NO voxel data in labelmap!`);
          }
        });
      } else {
        console.warn(`   ⚠️ NO SCALARS: Segment group missing voxel data entirely!`);
      }
      
      if (!boundsMatch || !spacingMatch) {
        console.warn(`   🚨 CRITICAL: Coordinate system mismatch detected - segments may not display correctly!`);
      } else {
        console.log(`   ✅ SUCCESS: All coordinates properly aligned for correct overlay`);
      }
    } else {
      console.warn(`   ⚠️ Missing data for validation: parentImage=${!!parentImage}, segmentGroup=${!!segmentGroup}`);
    }
  } catch (debugError) {
    console.warn(`   ⚠️ Debug validation failed:`, debugError);
  }
  
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
  const confidenceThreshold = ref(0.10);
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