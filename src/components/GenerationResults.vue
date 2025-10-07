<template>
  <v-container fluid class="pa-2">
    <!-- No Results State -->
    <v-card v-if="!maisiStore.result" class="text-center pa-8">
      <v-icon size="64" color="grey-lighten-1">mdi-image-off-outline</v-icon>
      <div class="text-h6 mt-4 text-grey">No Generated Images Yet</div>
      <div class="text-caption text-grey">
        Use the Generate tab to create synthetic CT images
      </div>
    </v-card>

    <!-- Results Display -->
    <div v-else>
      <!-- Metadata Card -->
      <v-card class="mb-3">
        <v-card-title class="text-h6">
          <v-icon left>mdi-information</v-icon>
          Generation Metadata
        </v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="6">
              <div class="text-caption text-grey">Output Size</div>
              <div class="text-body-2">
                {{ maisiStore.result.metadata.output_size.join(' × ') }} voxels
              </div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-grey">Spacing</div>
              <div class="text-body-2">
                {{ maisiStore.result.metadata.spacing.join(' × ') }} mm
              </div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-grey">Seed</div>
              <div class="text-body-2">{{ maisiStore.result.metadata.seed }}</div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-grey">Inference Steps</div>
              <div class="text-body-2">
                {{ maisiStore.result.metadata.num_inference_steps }}
              </div>
            </v-col>
            <v-col cols="12">
              <div class="text-caption text-grey">Generated At</div>
              <div class="text-body-2">
                {{ formatTimestamp(maisiStore.result.metadata.timestamp) }}
              </div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Generated Image Info -->
      <v-card class="mb-3">
        <v-card-title class="text-h6">
          <v-icon left>mdi-file-image</v-icon>
          Generated Images
        </v-card-title>
        <v-card-text>
          <v-list density="compact">
            <v-list-item v-if="maisiStore.generatedImageId">
              <template v-slot:prepend>
                <v-icon color="primary">mdi-image</v-icon>
              </template>
              <v-list-item-title>CT Image</v-list-item-title>
              <v-list-item-subtitle>
                Image ID: {{ maisiStore.generatedImageId }}
              </v-list-item-subtitle>
            </v-list-item>
            
            <v-list-item v-if="maisiStore.generatedSegId">
              <template v-slot:prepend>
                <v-icon color="success">mdi-vector-polygon</v-icon>
              </template>
              <v-list-item-title>Segmentation Mask</v-list-item-title>
              <v-list-item-subtitle>
                Segment Group ID: {{ maisiStore.generatedSegId }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>

      <!-- Warnings (if any) -->
      <v-card v-if="maisiStore.warnings.length > 0" class="mb-3">
        <v-card-title class="text-h6">
          <v-icon left color="warning">mdi-alert</v-icon>
          Generation Warnings
        </v-card-title>
        <v-card-text>
          <v-list density="compact">
            <v-list-item
              v-for="(warning, idx) in maisiStore.warnings"
              :key="idx"
            >
              <template v-slot:prepend>
                <v-icon :color="warningColor(warning.level)">
                  {{ warningIcon(warning.level) }}
                </v-icon>
              </template>
              <v-list-item-title>{{ warning.message }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>

      <!-- Actions -->
      <v-card>
        <v-card-title class="text-h6">
          <v-icon left>mdi-tools</v-icon>
          Actions
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="6">
              <v-btn
                color="primary"
                block
                variant="outlined"
                @click="regenerateWithSameSeed"
              >
                <v-icon left>mdi-refresh</v-icon>
                Regenerate (Same Seed)
              </v-btn>
            </v-col>
            <v-col cols="12" md="6">
              <v-btn
                color="secondary"
                block
                variant="outlined"
                @click="generateVariation"
              >
                <v-icon left>mdi-dice-6</v-icon>
                Generate Variation
              </v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { useMAISIStore } from '@/src/store/tools/maisi';

const maisiStore = useMAISIStore();

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch {
    return timestamp;
  }
}

function warningColor(level: string): string {
  switch (level) {
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'info': return 'info';
    default: return 'grey';
  }
}

function warningIcon(level: string): string {
  switch (level) {
    case 'error': return 'mdi-alert-circle';
    case 'warning': return 'mdi-alert';
    case 'info': return 'mdi-information';
    default: return 'mdi-circle-small';
  }
}

async function regenerateWithSameSeed() {
  if (maisiStore.result?.metadata.seed) {
    maisiStore.params.seed = maisiStore.result.metadata.seed;
    await maisiStore.generate();
  }
}

async function generateVariation() {
  maisiStore.randomizeSeed();
  await maisiStore.generate();
}
</script>

<style scoped>
.text-caption {
  font-size: 0.75rem;
}
</style>
