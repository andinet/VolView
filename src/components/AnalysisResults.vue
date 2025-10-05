<template>
  <div class="analysis-results">
    <v-card>
      <v-card-title>
        <v-icon class="mr-2">mdi-chart-box-outline</v-icon>
        Analysis Results
      </v-card-title>

      <v-card-text>
        <div class="mb-4">
          <div class="text-h6 mb-2">
            VISTA-3D Segmentation Status
          </div>
          
          <v-progress-linear
            v-if="vista3dStore.isAnalyzing"
            indeterminate
            color="primary"
            class="mb-2"
          />
          
          <v-chip
            :color="getStatusColor()"
            variant="elevated"
            class="mb-3"
          >
            <v-icon start>{{ getStatusIcon() }}</v-icon>
            {{ getStatusText() }}
          </v-chip>
        </div>

        <div v-if="hasResults">
          <div class="text-h6 mb-3">
            Analysis Results ({{ totalStructures }} runs)
          </div>
          
          <v-expansion-panels class="mb-4">
            <v-expansion-panel
              v-for="(result, index) in vista3dStore.analysisResults"
              :key="index"
            >
              <v-expansion-panel-title>
                <v-icon class="mr-2">mdi-eye</v-icon>
                Run {{ index + 1 }}: {{ result.labels.length }} structures detected
                <v-spacer />
                <span class="text-caption">{{ result.processingTime.toFixed(2) }}s</span>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="results-grid">
                  <v-chip
                    v-for="label in result.labels"
                    :key="label.id"
                    variant="outlined"
                    size="small"
                    class="ma-1"
                  >
                    {{ label.name }}
                    <span class="ml-1 text-caption">
                      ({{ (label.confidence * 100).toFixed(1) }}%)
                    </span>
                  </v-chip>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <v-alert
            type="success"
            variant="tonal"
            class="mb-3"
          >
            <div class="text-body-2">
              <strong>Segment Groups Created:</strong> 
              {{ totalStructures }} analysis runs completed. Anatomical structures have been segmented
              and added to the Segmentation panel for 3D visualization.
            </div>
          </v-alert>
        </div>

        <div v-else-if="!vista3dStore.isAnalyzing && vista3dStore.lastAnalysisTime">
          <v-alert type="info" variant="tonal">
            No significant structures detected in the current analysis.
          </v-alert>
        </div>

        <div v-else-if="!vista3dStore.isAnalyzing && !vista3dStore.lastAnalysisTime">
          <v-alert type="info" variant="outlined">
            Click "START ANALYSIS" to begin VISTA-3D whole-body segmentation.
          </v-alert>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useVista3dStore } from '@/src/store/tools/vista3d';

const vista3dStore = useVista3dStore();

const hasResults = computed(() => vista3dStore.analysisResults.length > 0);
const totalStructures = computed(() => vista3dStore.analysisResults.length);

const getStatusColor = () => {
  if (vista3dStore.isAnalyzing) return 'primary';
  if (hasResults.value) return 'success';
  return 'grey';
};

const getStatusIcon = () => {
  if (vista3dStore.isAnalyzing) return 'mdi-loading';
  if (hasResults.value) return 'mdi-check-circle';
  return 'mdi-information';
};

const getStatusText = () => {
  if (vista3dStore.isAnalyzing) return 'Analyzing...';
  if (hasResults.value) return 'Analysis Complete';
  return 'Ready';
};
</script>

<style scoped>
.analysis-results {
  height: 100%;
}

.results-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.v-expansion-panel-text {
  max-height: 300px;
  overflow-y: auto;
}
</style>