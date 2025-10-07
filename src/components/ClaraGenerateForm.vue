<template>
  <v-container fluid class="pa-2">
    <!-- Server Status Banner -->
    <v-alert
      v-if="maisiStore.serverStatus !== 'ready'"
      :type="serverStatusType"
      :icon="serverStatusIcon"
      prominent
      border="start"
      class="mb-4"
    >
      <template v-slot:title>
        {{ serverStatusTitle }}
      </template>
      <div v-if="maisiStore.serverStatus === 'error'">
        Ensure MAISI server is running on port 8083.
        <v-btn size="small" variant="outlined" class="ml-2" @click="maisiStore.checkServerHealth()">
          Retry
        </v-btn>
      </div>
    </v-alert>

    <!-- Resource Warning Banner -->
    <v-alert
      v-if="maisiStore.warnings.length > 0"
      :type="warningBannerType"
      :icon="warningBannerIcon"
      prominent
      border="start"
      class="mb-4"
    >
      <template v-slot:title>
        {{ warningBannerTitle }}
      </template>
      <ul class="pl-4">
        <li v-for="(warning, idx) in maisiStore.warnings" :key="idx">
          {{ warning.message }}
        </li>
      </ul>
      
      <!-- Resource Summary -->
      <v-divider class="my-3"></v-divider>
      <div v-if="maisiStore.resourceEstimate" class="text-caption">
        <strong>Estimated Requirements:</strong><br>
        GPU Memory: {{ maisiStore.resourceEstimate.estimated_gpu_memory_gb }} GB<br>
        Generation Time: ~{{ maisiStore.resourceEstimate.estimated_time_minutes }} min<br>
        Output Volume: {{ maisiStore.resourceEstimate.output_dimensions }}
      </div>
    </v-alert>

    <!-- Generation Controls -->
    <v-card class="mb-3">
      <v-card-title class="text-h6">
        <v-icon left>mdi-cog</v-icon>
        Generation Parameters
      </v-card-title>
      
      <v-card-text>
        <!-- Preset Selection -->
        <v-row>
          <v-col cols="12">
            <div class="text-subtitle-2 mb-2">Quick Presets</div>
            <v-chip-group
              v-model="selectedPresetIndex"
              column
              @update:model-value="onPresetChange"
            >
              <v-chip
                v-for="(preset, key) in MAISI_PRESETS"
                :key="key"
                :value="key"
                filter
                variant="outlined"
              >
                <v-icon left>{{ preset.icon }}</v-icon>
                {{ preset.name }}
              </v-chip>
            </v-chip-group>
          </v-col>
        </v-row>

        <v-divider class="my-4"></v-divider>

        <!-- Output Size -->
        <v-row>
          <v-col cols="12">
            <div class="text-subtitle-2 mb-2">Output Size (voxels)</div>
          </v-col>
          <v-col cols="4">
            <v-text-field
              v-model.number="params.output_size[0]"
              label="X"
              type="number"
              :step="4"
              :min="128"
              :max="512"
              density="compact"
              @update:model-value="onParamsChange"
            ></v-text-field>
          </v-col>
          <v-col cols="4">
            <v-text-field
              v-model.number="params.output_size[1]"
              label="Y"
              type="number"
              :step="4"
              :min="128"
              :max="512"
              density="compact"
              @update:model-value="onParamsChange"
            ></v-text-field>
          </v-col>
          <v-col cols="4">
            <v-text-field
              v-model.number="params.output_size[2]"
              label="Z"
              type="number"
              :step="4"
              :min="128"
              :max="512"
              density="compact"
              @update:model-value="onParamsChange"
            ></v-text-field>
          </v-col>
        </v-row>

        <!-- Spacing -->
        <v-row>
          <v-col cols="12">
            <div class="text-subtitle-2 mb-2">Voxel Spacing (mm)</div>
          </v-col>
          <v-col cols="4">
            <v-text-field
              v-model.number="params.spacing[0]"
              label="X"
              type="number"
              :step="0.1"
              :min="0.5"
              :max="5.0"
              density="compact"
              @update:model-value="onParamsChange"
            ></v-text-field>
          </v-col>
          <v-col cols="4">
            <v-text-field
              v-model.number="params.spacing[1]"
              label="Y"
              type="number"
              :step="0.1"
              :min="0.5"
              :max="5.0"
              density="compact"
              @update:model-value="onParamsChange"
            ></v-text-field>
          </v-col>
          <v-col cols="4">
            <v-text-field
              v-model.number="params.spacing[2]"
              label="Z"
              type="number"
              :step="0.1"
              :min="0.5"
              :max="5.0"
              density="compact"
              @update:model-value="onParamsChange"
            ></v-text-field>
          </v-col>
        </v-row>

        <!-- Controllable Anatomy Size -->
        <v-row>
          <v-col cols="12">
            <div class="text-subtitle-2 mb-2">Anatomy Scale (0.5 - 1.5)</div>
            <div class="text-caption text-grey">Controls the overall size of anatomical structures</div>
          </v-col>
          <v-col cols="4">
            <v-slider
              v-model="params.controllable_anatomy_size[0]"
              label="X"
              :min="0.5"
              :max="1.5"
              :step="0.1"
              thumb-label
              density="compact"
              @update:model-value="onParamsChange"
            ></v-slider>
          </v-col>
          <v-col cols="4">
            <v-slider
              v-model="params.controllable_anatomy_size[1]"
              label="Y"
              :min="0.5"
              :max="1.5"
              :step="0.1"
              thumb-label
              density="compact"
              @update:model-value="onParamsChange"
            ></v-slider>
          </v-col>
          <v-col cols="4">
            <v-slider
              v-model="params.controllable_anatomy_size[2]"
              label="Z"
              :min="0.5"
              :max="1.5"
              :step="0.1"
              thumb-label
              density="compact"
              @update:model-value="onParamsChange"
            ></v-slider>
          </v-col>
        </v-row>

        <!-- Advanced Settings -->
        <v-expansion-panels class="mt-3">
          <v-expansion-panel>
            <v-expansion-panel-title>
              <v-icon left>mdi-tune</v-icon>
              Advanced Settings
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-row>
                <v-col cols="12">
                  <v-slider
                    v-model="params.num_inference_steps"
                    label="Inference Steps"
                    :min="10"
                    :max="2000"
                    :step="10"
                    thumb-label
                    @update:model-value="onParamsChange"
                  >
                    <template v-slot:append>
                      <v-text-field
                        v-model.number="params.num_inference_steps"
                        type="number"
                        style="width: 80px"
                        density="compact"
                        hide-details
                        @update:model-value="onParamsChange"
                      ></v-text-field>
                    </template>
                  </v-slider>
                  <div class="text-caption text-grey mt-1">
                    Higher values = better quality, longer generation time
                  </div>
                </v-col>

                <v-col cols="12">
                  <v-text-field
                    v-model.number="params.seed"
                    label="Random Seed"
                    type="number"
                    density="compact"
                    @update:model-value="onParamsChange"
                  >
                    <template v-slot:append>
                      <v-btn
                        icon="mdi-dice-6"
                        size="small"
                        variant="text"
                        @click="randomizeSeed"
                      ></v-btn>
                    </template>
                  </v-text-field>
                  <div class="text-caption text-grey">
                    Use same seed for reproducible results
                  </div>
                </v-col>
              </v-row>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          color="primary"
          size="large"
          :loading="maisiStore.isGenerating"
          :disabled="!maisiStore.canGenerate"
          @click="generate"
        >
          <v-icon left>mdi-creation</v-icon>
          Generate CT
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- Generation Progress -->
    <v-card v-if="maisiStore.isGenerating" class="mb-3">
      <v-card-text>
        <div class="text-center">
          <v-progress-circular
            indeterminate
            color="primary"
            size="64"
            class="mb-3"
          ></v-progress-circular>
          <div class="text-h6">Generating Synthetic CT...</div>
          <div class="text-caption">
            This may take {{ maisiStore.resourceEstimate?.estimated_time_minutes || '5-10' }} minutes
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useMAISIStore, MAISI_PRESETS } from '@/src/store/tools/maisi';

const maisiStore = useMAISIStore();

// Local reactive copy of params for v-model binding
const params = ref({ ...maisiStore.params });

// Selected preset tracking
const selectedPresetIndex = ref(maisiStore.selectedPreset);

// Server status computed properties
const serverStatusType = computed(() => {
  switch (maisiStore.serverStatus) {
    case 'ready': return 'success';
    case 'initializing': return 'info';
    case 'error': return 'error';
    default: return 'info';
  }
});

const serverStatusIcon = computed(() => {
  switch (maisiStore.serverStatus) {
    case 'ready': return 'mdi-check-circle';
    case 'initializing': return 'mdi-loading';
    case 'error': return 'mdi-alert-circle';
    default: return 'mdi-information';
  }
});

const serverStatusTitle = computed(() => {
  switch (maisiStore.serverStatus) {
    case 'ready': return 'MAISI Server Ready';
    case 'initializing': return 'MAISI Server Initializing...';
    case 'error': return 'MAISI Server Error';
    default: return 'Checking Server Status...';
  }
});

// Warning banner computed properties
const warningBannerType = computed(() => {
  switch (maisiStore.warningLevel) {
    case 'safe': return 'success';
    case 'warning': return 'warning';
    case 'critical': return 'error';
    default: return 'info';
  }
});

const warningBannerIcon = computed(() => {
  switch (maisiStore.warningLevel) {
    case 'safe': return 'mdi-check-circle';
    case 'warning': return 'mdi-alert';
    case 'critical': return 'mdi-alert-octagon';
    default: return 'mdi-information';
  }
});

const warningBannerTitle = computed(() => {
  switch (maisiStore.warningLevel) {
    case 'safe': return 'Ready to Generate';
    case 'warning': return 'Warning: Proceed with Caution';
    case 'critical': return 'Critical: Generation May Fail';
    default: return 'Resource Check';
  }
});

// Methods
function onPresetChange(presetKey: string) {
  if (presetKey) {
    maisiStore.loadPreset(presetKey);
    params.value = { ...maisiStore.params };
  }
}

// Debounced params change handler
let paramsChangeTimeout: ReturnType<typeof setTimeout> | null = null;
function onParamsChange() {
  // Update store params
  maisiStore.params = { ...params.value };
  
  // Debounced resource estimation
  if (paramsChangeTimeout) {
    clearTimeout(paramsChangeTimeout);
  }
  paramsChangeTimeout = setTimeout(() => {
    maisiStore.estimateResources();
  }, 500);
}

function randomizeSeed() {
  params.value.seed = Math.floor(Math.random() * 10000);
  maisiStore.randomizeSeed();
}

async function generate() {
  await maisiStore.generate();
}

// Watch for store param changes (from preset loading)
watch(
  () => maisiStore.params,
  (newParams) => {
    params.value = { ...newParams };
  },
  { deep: true }
);
</script>

<style scoped>
.text-caption {
  font-size: 0.75rem;
}
</style>
