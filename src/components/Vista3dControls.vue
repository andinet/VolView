<template>
  <div class="d-flex flex-column w-100">
    <!-- Simple Analysis Button -->
    <v-card class="mb-4">
      <v-card-title class="text-h6">
        <v-icon class="mr-2">mdi-brain</v-icon>
        VISTA-3D Whole Body Analysis
      </v-card-title>
      <v-card-text>
        <div class="text-body-2 mb-4">
          Automatically segment 130+ anatomical structures in CT scans.
        </div>
        
        <!-- Big Analysis Button -->
        <v-btn
          color="primary"
          size="x-large"
          block
          :loading="isAnalyzing"
          @click="runAnalysis"
          class="mb-3"
        >
          <v-icon class="mr-2">mdi-play</v-icon>
          {{ isAnalyzing ? 'Running Analysis...' : 'START ANALYSIS' }}
        </v-btn>
        
        <!-- Simple Confidence Slider -->
        <div class="mb-3">
          <div class="text-body-2 mb-2">
            Confidence: {{ confidenceThreshold.toFixed(2) }}
          </div>
          <v-slider
            v-model="confidenceThreshold"
            :min="0.3"
            :max="0.9"
            :step="0.05"
            color="primary"
            label="Confidence Threshold"
          />
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useVista3dStore } from '@/src/store/tools/vista3d';

const vista3dStore = useVista3dStore();

const {
  confidenceThreshold,
  isAnalyzing,
} = storeToRefs(vista3dStore);

const {
  runVista3dAnalysis,
} = vista3dStore;

async function runAnalysis() {
  console.log('🔥 BUTTON CLICKED! Starting VISTA3D Analysis...');
  await runVista3dAnalysis();
}

// Initialize automatic whole-body segmentation mode
onMounted(() => {
  vista3dStore.setSegmentEverything();
});
</script>