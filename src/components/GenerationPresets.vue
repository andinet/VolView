<template>
  <v-container fluid class="pa-2">
    <v-card class="mb-3">
      <v-card-title class="text-h6">
        <v-icon left>mdi-bookmark-multiple</v-icon>
        Preset Library
      </v-card-title>
      <v-card-subtitle>
        Quick start templates for common CT generation scenarios
      </v-card-subtitle>
    </v-card>

    <!-- Preset Cards -->
    <v-row>
      <v-col
        v-for="(preset, key) in MAISI_PRESETS"
        :key="key"
        cols="12"
        sm="6"
      >
        <v-card
          :class="{ 'preset-card': true, 'preset-selected': isSelected(key as string) }"
          @click="loadPreset(key as string)"
          hover
        >
          <v-card-title>
            <v-icon left :color="isSelected(key as string) ? 'primary' : ''">
              {{ preset.icon }}
            </v-icon>
            {{ preset.name }}
            <v-spacer></v-spacer>
            <v-chip
              v-if="isSelected(key as string)"
              color="primary"
              size="small"
              variant="flat"
            >
              Active
            </v-chip>
          </v-card-title>
          
          <v-card-subtitle>
            {{ preset.description }}
          </v-card-subtitle>

          <v-card-text>
            <!-- Preset Details -->
            <v-row dense class="text-caption">
              <v-col cols="6">
                <div class="text-grey">Output Size</div>
                <div class="font-weight-medium">
                  {{ preset.params.output_size.join('×') }}
                </div>
              </v-col>
              <v-col cols="6">
                <div class="text-grey">Spacing</div>
                <div class="font-weight-medium">
                  {{ preset.params.spacing.join('×') }} mm
                </div>
              </v-col>
              <v-col cols="6">
                <div class="text-grey">Estimated GPU</div>
                <div class="font-weight-medium">
                  <v-chip
                    :color="gpuChipColor(preset.estimated_gpu_gb)"
                    size="x-small"
                    variant="flat"
                  >
                    {{ preset.estimated_gpu_gb }} GB
                  </v-chip>
                </div>
              </v-col>
              <v-col cols="6">
                <div class="text-grey">Estimated Time</div>
                <div class="font-weight-medium">{{ preset.estimated_time_min }}</div>
              </v-col>
            </v-row>

            <!-- Anatomy Highlights -->
            <div v-if="preset.anatomyHighlights.length > 0" class="mt-3">
              <div class="text-caption text-grey mb-1">Anatomy Highlights</div>
              <v-chip-group>
                <v-chip
                  v-for="anatomy in preset.anatomyHighlights"
                  :key="anatomy"
                  size="x-small"
                  variant="outlined"
                >
                  {{ anatomy }}
                </v-chip>
              </v-chip-group>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-btn
              :color="isSelected(key as string) ? 'primary' : 'default'"
              :variant="isSelected(key as string) ? 'flat' : 'outlined'"
              block
              @click.stop="loadPreset(key as string)"
            >
              <v-icon left>mdi-check-circle</v-icon>
              {{ isSelected(key as string) ? 'Current Preset' : 'Load Preset' }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Custom Preset Info -->
    <v-card class="mt-4" variant="outlined">
      <v-card-text>
        <div class="d-flex align-center">
          <v-icon left color="info">mdi-information-outline</v-icon>
          <div class="text-caption">
            <strong>Custom Preset:</strong> Select "Custom Settings" to manually adjust all parameters.
            Your custom settings will be preserved until you select a different preset.
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { useMAISIStore, MAISI_PRESETS } from '@/src/store/tools/maisi';

const maisiStore = useMAISIStore();

const isSelected = (presetKey: string) => {
  return maisiStore.selectedPreset === presetKey;
};

const gpuChipColor = (gpuGB: number) => {
  if (gpuGB <= 58) return 'success';
  if (gpuGB <= 70) return 'warning';
  return 'error';
};

function loadPreset(presetKey: string) {
  maisiStore.loadPreset(presetKey);
}
</script>

<style scoped>
.preset-card {
  transition: all 0.3s ease;
  cursor: pointer;
}

.preset-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.preset-selected {
  border: 2px solid rgb(var(--v-theme-primary));
}

.text-caption {
  font-size: 0.75rem;
}
</style>
