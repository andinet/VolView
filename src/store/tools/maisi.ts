import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useSegmentGroupStore, createLabelmapFromImage } from '@/src/store/segmentGroups';
import { useMessageStore } from '@/src/store/messages';
import { useImageCacheStore } from '@/src/store/image-cache';
import { usePaintToolStore } from '@/src/store/tools/paint';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

// ============================================================================
// MAISI Server Configuration
// ============================================================================

const MAISI_SERVER_URL = 'http://localhost:8083';

// ============================================================================
// Types and Interfaces
// ============================================================================

// These interfaces use snake_case to match the Python API contract
/* eslint-disable camelcase */
export interface MAISIParams {
  output_size: [number, number, number];
  spacing: [number, number, number];
  controllable_anatomy_size: number[];
  body_region: string[];
  anatomy_list: string[];
  num_inference_steps: number;
  seed: number;
}

export interface MAISIResult {
  image: vtkImageData;
  segmentation: vtkImageData;
  metadata: {
    output_size: [number, number, number];
    spacing: [number, number, number];
    seed: number;
    num_inference_steps: number;
    timestamp: string;
  };
}

export interface ResourceEstimate {
  estimated_gpu_memory_gb: number;
  estimated_time_minutes: number;
  volume_size: number;
  inference_steps: number;
  output_dimensions: string;
}

export interface Warning {
  level: 'info' | 'warning' | 'error';
  message: string;
}

export interface SystemResources {
  gpu_available: boolean;
  gpu_name?: string;
  gpu_memory_total_gb?: number;
  gpu_memory_free_gb?: number;
  cuda_version?: string;
  error?: string;
}
/* eslint-enable camelcase */

// ============================================================================
// VTK.js Decoding Helpers (reused from vista3d.ts)
// ============================================================================

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

  let bytes = base64ToUint8Array(arrObj.values);
  if (isGz) bytes = await gunzipUint8Array(bytes);

  const dtype = arrObj.dataType || arrObj.dtype || 'Uint8Array';
  const Ctor = typedArrayCtor(dtype);
  
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

  await Promise.all(tasks);
  return ds;
}

async function decodeVTKJSImage(vtkjsObj: any): Promise<vtkImageData> {
  await decodeVtkJsInPlace(vtkjsObj);
  
  const img = vtkImageData.newInstance();
  img.setOrigin(vtkjsObj.origin || [0, 0, 0]);
  img.setSpacing(vtkjsObj.spacing || [1, 1, 1]);
  img.setDimensions(vtkjsObj.dimensions || [1, 1, 1]);

  const arrays = vtkjsObj.pointData?.arrays || [];
  arrays.forEach((arr: any) => {
    const actualArr = arr.data || arr;
    const pd = img.getPointData();
    pd.setScalars(
      vtkDataArray.newInstance({
        name: actualArr.name || 'Scalars',
        values: actualArr.values,
        numberOfComponents: actualArr.numberOfComponents || 1,
      })
    );
  });

  return img;
}

// ============================================================================
// MAISI Presets
// ============================================================================

/* eslint-disable camelcase */
export interface MAISIPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  params: MAISIParams;
  estimated_time_min: string;
  estimated_gpu_gb: number;
  anatomyHighlights: string[];
}
/* eslint-enable camelcase */

export const MAISI_PRESETS: Record<string, MAISIPreset> = {
  low_memory_fast: {
    id: 'low_memory_fast',
    name: 'Low Memory - Fast Preview',
    description: 'Optimized for 60GB GPU - Low quality, fast generation',
    icon: 'mdi-speedometer',
    params: {
      output_size: [256, 256, 128],   // MAISI requires XY same, Z from [128,256,384,512,640,768]
      spacing: [2.0, 2.0, 2.0],       // MAISI requires XY same, XY: 0.5-3.0, Z: 0.5-5.0
      controllable_anatomy_size: [],
      body_region: [],
      anatomy_list: ['liver'],
      num_inference_steps: 50,
      seed: 42,
    },
    estimated_time_min: '1-2 min',
    estimated_gpu_gb: 58,
    anatomyHighlights: ['quick preview', 'testing', '60GB GPU required'],
  },

  chest_full: {
    id: 'chest_full',
    name: 'Chest - Full Body',
    description: 'Full-body chest CT with standard anatomy',
    icon: 'mdi-lungs',
    params: {
      output_size: [512, 512, 512],
      spacing: [1.0, 1.0, 1.0],
      controllable_anatomy_size: [],
      body_region: [],
      anatomy_list: ['left lung upper lobe', 'left lung lower lobe', 'right lung upper lobe', 'right lung middle lobe', 'right lung lower lobe'],
      num_inference_steps: 1000,
      seed: 42,
    },
    estimated_time_min: '8-12 min',
    estimated_gpu_gb: 80,
    anatomyHighlights: ['lungs', 'heart', 'ribs', 'spine'],
  },
  
  abdomen_standard: {
    id: 'abdomen_standard',
    name: 'Abdomen - Standard',
    description: 'Standard abdominal CT scan',
    icon: 'mdi-stomach',
    params: {
      output_size: [384, 384, 256],
      spacing: [1.5, 1.5, 2.0],
      controllable_anatomy_size: [],
      body_region: [],
      anatomy_list: ['liver', 'spleen', 'pancreas', 'right kidney', 'left kidney'],
      num_inference_steps: 1000,
      seed: 42,
    },
    estimated_time_min: '5-8 min',
    estimated_gpu_gb: 70,
    anatomyHighlights: ['liver', 'kidneys', 'spleen', 'pancreas'],
  },
  
  head_neck: {
    id: 'head_neck',
    name: 'Head/Neck - High Resolution',
    description: 'High-resolution head and neck region',
    icon: 'mdi-head-outline',
    params: {
      output_size: [256, 256, 256],
      spacing: [0.5, 0.5, 0.5],
      controllable_anatomy_size: [],
      body_region: [],
      anatomy_list: ['brain'],
      num_inference_steps: 1000,
      seed: 42,
    },
    estimated_time_min: '4-6 min',
    estimated_gpu_gb: 58,
    anatomyHighlights: ['brain', 'skull', 'cervical spine'],
  },
  
  pelvis: {
    id: 'pelvis',
    name: 'Pelvis - Standard',
    description: 'Standard pelvic region CT',
    icon: 'mdi-human',
    params: {
      output_size: [384, 384, 256],
      spacing: [1.5, 1.5, 2.0],
      controllable_anatomy_size: [],
      body_region: [],
      anatomy_list: ['bladder'],
      num_inference_steps: 1000,
      seed: 42,
    },
    estimated_time_min: '5-8 min',
    estimated_gpu_gb: 70,
    anatomyHighlights: ['pelvis', 'bladder', 'femur'],
  },
  
  custom: {
    id: 'custom',
    name: 'Custom Settings',
    description: 'User-defined parameters',
    icon: 'mdi-cog',
    params: {
      output_size: [128, 128, 128],
      spacing: [2.0, 2.0, 2.0],
      controllable_anatomy_size: [],
      body_region: [],
      anatomy_list: ['liver'],
      num_inference_steps: 50,
      seed: 42,
    },
    estimated_time_min: 'Variable',
    estimated_gpu_gb: 20,
    anatomyHighlights: [],
  },
};

// ============================================================================
// MAISI Store
// ============================================================================

export const useMAISIStore = defineStore('maisi', () => {
  // State
  const isGenerating = ref(false);
  const serverStatus = ref<'unknown' | 'ready' | 'initializing' | 'error'>('unknown');
  
  // Default parameters matching MAISI constraints
  // MAISI requires: XY dimensions same, from [256,384,512]
  //                 Z dimension from [128,256,384,512,640,768]
  //                 XY spacing same, 0.5-3.0mm
  //                 Z spacing 0.5-5.0mm
  const params = ref<MAISIParams>({
    output_size: [256, 256, 128],  // Smallest valid MAISI size (60GB GPU)
    spacing: [2.0, 2.0, 2.0],      // Coarser spacing within limits
    controllable_anatomy_size: [],
    body_region: [],
    anatomy_list: ['liver'],
    num_inference_steps: 50,       // Low quality, faster generation (~1-2 min)
    seed: 42,
  });
  
  const result = ref<MAISIResult | null>(null);
  const resourceEstimate = ref<ResourceEstimate | null>(null);
  const systemResources = ref<SystemResources | null>(null);
  const warnings = ref<Warning[]>([]);
  const warningLevel = ref<'safe' | 'warning' | 'critical'>('safe');
  
  const selectedPreset = ref<string>('low_memory_fast');  // Default to 24GB GPU compatible preset
  const generatedImageId = ref<string | null>(null);
  const generatedSegId = ref<string | null>(null);

  // Composables
  const messageStore = useMessageStore();
  const imageStore = useImageCacheStore();
  const segmentStore = useSegmentGroupStore();

  // Computed
  const canGenerate = computed(() => {
    return !isGenerating.value && serverStatus.value === 'ready';
  });

  const currentPreset = computed(() => {
    return MAISI_PRESETS[selectedPreset.value];
  });

  // Actions
  async function checkServerHealth() {
    try {
      const response = await fetch(`${MAISI_SERVER_URL}/api/maisi_health`);
      const data = await response.json();
      
      serverStatus.value = data.status;
      systemResources.value = {
        gpu_available: data.gpu_available,
        gpu_name: data.gpu_name,
        gpu_memory_free_gb: data.gpu_memory_free_gb,
      };
      
      return data;
    } catch (error) {
      console.error('MAISI server health check failed:', error);
      serverStatus.value = 'error';
      messageStore.addError('MAISI server is not responding. Is it running on port 8083?');
      throw error;
    }
  }

  async function estimateResources() {
    try {
      const response = await fetch(`${MAISI_SERVER_URL}/api/maisi_estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          output_size: params.value.output_size,
          spacing: params.value.spacing,
          num_inference_steps: params.value.num_inference_steps,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        resourceEstimate.value = data.resource_estimate;
        systemResources.value = data.system_resources;
        warnings.value = data.warnings || [];
        warningLevel.value = data.warning_level || 'safe';
      } else {
        throw new Error(data.error || 'Resource estimation failed');
      }
    } catch (error) {
      console.error('Resource estimation failed:', error);
      warnings.value = [{
        level: 'error',
        message: 'Failed to connect to MAISI server. Is it running on port 8083?',
      }];
      warningLevel.value = 'critical';
    }
  }

  async function generate() {
    if (!canGenerate.value) {
      messageStore.addError('Cannot generate: server not ready');
      return;
    }

    isGenerating.value = true;
    warnings.value = [];
    
    try {
      // Estimate resources first
      await estimateResources();
      
      messageStore.addInfo(
        'MAISI Generation Started',
        `Generating ${params.value.output_size.join('×')} CT image. This may take ${resourceEstimate.value?.estimated_time_minutes || 5} minutes...`
      );

      const response = await fetch(`${MAISI_SERVER_URL}/api/maisi_generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params.value),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Generation failed');
      }

      // Store any warnings from backend
      if (data.warnings && data.warnings.length > 0) {
        warnings.value = data.warnings.map((w: string) => ({
          level: 'warning' as const,
          message: w,
        }));
      }

      // Decode VTK.js binary data
      console.log('🔄 Decoding generated image...');
      const imageData = await decodeVTKJSImage(data.image);
      
      console.log('🔄 Decoding generated segmentation...');
      const segData = await decodeVTKJSImage(data.segmentation);

      // Store results
      result.value = {
        image: imageData,
        segmentation: segData,
        metadata: data.metadata,
      };

      // Add to VolView's image store (fix parameter order)
      const imageName = `MAISI_CT_${data.metadata.seed}_${Date.now()}`;
      const imageId = imageStore.addVTKImageData(imageData, imageName);
      generatedImageId.value = imageId;

      // Add segmentation to segment store (following VISTA3D pattern)
      const segName = `MAISI_Seg_${data.metadata.seed}`;
      
      // Create labelmap for this image
      const labelmap = createLabelmapFromImage(imageData);
      
      // Copy segmentation data into labelmap
      const labelmapScalars = labelmap.getPointData().getScalars();
      const segScalars = segData.getPointData().getScalars();
      const labelmapData = labelmapScalars.getData() as any;
      const segDataArray = segScalars.getData() as any;
      
      for (let i = 0; i < labelmapData.length; i++) {
        labelmapData[i] = segDataArray[i];
      }
      labelmapScalars.modified();
      
      // Create segment group using addLabelmap
      const segGroupId = segmentStore.addLabelmap(labelmap, {
        name: segName,
        parentImage: imageId,
        segments: {
          order: [1],
          byValue: {
            1: {
              value: 1,
              name: 'Generated Anatomy',
              color: [255, 100, 100, 255],
              visible: true,
              locked: false,
            },
          },
        },
      });
      
      // Set as active segment group
      const paintStore = usePaintToolStore();
      paintStore.setActiveSegmentGroup(segGroupId);
      
      generatedSegId.value = segGroupId;

      messageStore.addSuccess(
        'MAISI Generation Complete',
        `Generated CT image and segmentation successfully!`
      );

      console.log('✅ MAISI generation complete!', {
        imageId,
        segGroupId,
        metadata: data.metadata,
      });

    } catch (error: any) {
      console.error('❌ MAISI generation failed:', error);
      messageStore.addError(
        'MAISI Generation Failed',
        error.message || 'Unknown error occurred'
      );
      throw error;
    } finally {
      isGenerating.value = false;
    }
  }

  function loadPreset(presetId: string) {
    const preset = MAISI_PRESETS[presetId];
    if (preset) {
      selectedPreset.value = presetId;
      params.value = { ...preset.params };
      
      // Auto-estimate with new preset
      estimateResources();
      
      messageStore.addInfo(
        'Preset Loaded',
        `Loaded preset: ${preset.name}`
      );
    }
  }

  function updateParam<K extends keyof MAISIParams>(key: K, value: MAISIParams[K]) {
    params.value[key] = value;
    // Auto-estimate when params change
    estimateResources();
  }

  function randomizeSeed() {
    params.value.seed = Math.floor(Math.random() * 10000);
    estimateResources();
  }

  // Initialize on store creation
  checkServerHealth();

  return {
    // State
    isGenerating,
    serverStatus,
    params,
    result,
    resourceEstimate,
    systemResources,
    warnings,
    warningLevel,
    selectedPreset,
    generatedImageId,
    generatedSegId,
    
    // Computed
    canGenerate,
    currentPreset,
    
    // Actions
    generate,
    checkServerHealth,
    estimateResources,
    loadPreset,
    updateParam,
    randomizeSeed,
    
    // Constants
    MAISI_PRESETS,
  };
});
