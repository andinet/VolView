<template>
  <div class="overflow-y-auto mx-2 fill-height">
    <analysis-controls />
    <v-divider thickness="4" />
    <v-tabs v-model="tab" align-tabs="center" density="compact" class="my-1">
      <v-tab value="vista3d" class="tab-header">VISTA-3D Analysis</v-tab>
      <v-tab value="results" class="tab-header">Results</v-tab>
    </v-tabs>
    <v-window v-model="tab">
      <v-window-item value="vista3d">
        <vista3d-controls />
      </v-window-item>
      <v-window-item value="results">
        <analysis-results />
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import AnalysisControls from './AnalysisControls.vue';
import Vista3dControls from './Vista3dControls.vue';
import AnalysisResults from './AnalysisResults.vue';

const tab = ref('vista3d');
</script>

<style scoped>
.tab-header {
  font-size: 0.8rem;
}
</style>