<template>
  <div class="overflow-y-auto mx-2 fill-height">
    <v-tabs v-model="tab" align-tabs="center" density="compact" class="my-1">
      <v-tab value="generate" class="tab-header">
        <v-icon left>mdi-creation</v-icon>
        Generate
      </v-tab>
      <v-tab value="results" class="tab-header">
        <v-icon left>mdi-image-multiple</v-icon>
        Results
      </v-tab>
      <v-tab value="presets" class="tab-header">
        <v-icon left>mdi-bookmark-multiple</v-icon>
        Presets
      </v-tab>
    </v-tabs>
    
    <v-window v-model="tab">
      <v-window-item value="generate">
        <clara-generate-form />
      </v-window-item>
      
      <v-window-item value="results">
        <generation-results />
      </v-window-item>
      
      <v-window-item value="presets">
        <generation-presets />
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useMAISIStore } from '@/src/store/tools/maisi';
import ClaraGenerateForm from './ClaraGenerateForm.vue';
import GenerationResults from './GenerationResults.vue';
import GenerationPresets from './GenerationPresets.vue';

const tab = ref('generate');
const maisiStore = useMAISIStore();

onMounted(() => {
  // Check server health on component mount
  maisiStore.checkServerHealth();
});
</script>

<style scoped>
.tab-header {
  font-size: 0.8rem;
}
</style>
