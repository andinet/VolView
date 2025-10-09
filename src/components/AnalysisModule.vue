<template>
  <div class="overflow-y-auto mx-2 fill-height">
    <analysis-controls />
    <v-divider thickness="4" />
    <!-- Removed Results tab - users can view segmentation results in the Annotations panel -->
    <vista3d-controls />
  </div>
</template>

<script setup lang="ts">
import AnalysisControls from './AnalysisControls.vue';
import Vista3dControls from './Vista3dControls.vue';
</script>

<style scoped>
/* No custom styles needed since we removed the tabs */
</style>