<template>
  <div class="d-flex flex-column align-center w-100">
    <!-- Simple Instructions -->
    <v-card class="mb-4 w-100">
      <v-card-text class="text-center">
        <div class="text-h6 mb-2">
          <v-icon class="mr-2">mdi-brain</v-icon>
          AI-Powered Medical Analysis
        </div>
        <div class="text-body-2">
          Use the <strong>VISTA-3D</strong> tab below to analyze CT scans.
        </div>
      </v-card-text>
    </v-card>

    <!-- Status Alert -->
    <v-alert
      v-if="!currentImageID"
      type="info"
      variant="tonal"
      class="mb-4 w-100"
    >
      <v-icon class="mr-2">mdi-image-off</v-icon>
      <strong>Load a CT image first</strong> to run analysis.
    </v-alert>

    <v-alert 
      v-if="isAnalyzing" 
      type="success" 
      variant="tonal"
      class="mb-4 w-100"
    >
      <v-icon class="mr-2">mdi-loading mdi-spin</v-icon>
      <strong>Analysis running...</strong> Please wait.
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useVista3dStore } from '@/src/store/tools/vista3d';
import { useCurrentImage } from '@/src/composables/useCurrentImage';

const vista3dStore = useVista3dStore();
const { currentImageID } = useCurrentImage();

const {
  isAnalyzing,
} = storeToRefs(vista3dStore);
</script>