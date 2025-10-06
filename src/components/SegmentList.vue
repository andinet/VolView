<script setup lang="ts">
import EditableChipList from '@/src/components/EditableChipList.vue';
import SegmentEditor from '@/src/components/SegmentEditor.vue';
import IsolatedDialog from '@/src/components/IsolatedDialog.vue';
import {
  useSegmentGroupStore,
  makeDefaultSegmentName,
} from '@/src/store/segmentGroups';
import { useImageCacheStore } from '@/src/store/image-cache';
import { Maybe } from '@/src/types';
import { hexaToRGBA, rgbaToHexa } from '@/src/utils/color';
import { reactive, ref, toRefs, computed, watch } from 'vue';
import { SegmentMask } from '@/src/types/segment';
import { usePaintToolStore } from '@/src/store/tools/paint';
import type { RGBAColor } from '@kitware/vtk.js/types';
import ColorDot from '@/src/components/ColorDot.vue';

const props = defineProps({
  groupId: {
    required: true,
    type: String,
  },
});

const { groupId } = toRefs(props);

const segmentGroupStore = useSegmentGroupStore();
const paintStore = usePaintToolStore();

const segments = computed<SegmentMask[]>(() => {
  const segs = segmentGroupStore.segmentByGroupID[groupId.value] ?? [];
  console.log(`🔍 SegmentList: groupId=${groupId.value}, segments count=${segs.length}`, segs);
  return segs;
});

function addNewSegment() {
  segmentGroupStore.addSegment(groupId.value);
}

// --- selection --- //

const selectedSegment = computed({
  get: () => paintStore.activeSegment,
  set: (value: Maybe<number>) => {
    paintStore.setActiveSegment(value);
  },
});

// reset selection when necessary
watch(
  segments,
  (segments_) => {
    let reset = true;
    if (segments_ && selectedSegment.value) {
      reset = !segments_.find((seg) => seg.value === selectedSegment.value);
    }

    if (reset) {
      selectedSegment.value = segments_?.length ? segments_[0].value : null;
    }
  },
  { immediate: true }
);

const toggleVisible = (value: number) => {
  const segment = segmentGroupStore.getSegment(groupId.value, value);
  if (!segment) return;
  
  // 🔍 DEBUG: Check segment overlay alignment before toggling
  console.log(`🔍 [SEGMENT DEBUG] Toggling visibility for segment "${segment.name}" (value=${value})`);
  console.log(`   Current visibility: ${segment.visible} → ${!segment.visible}`);
  
  // Get parent image and segment group data for alignment check
  const metadata = segmentGroupStore.metadataByID[groupId.value];
  const parentImageId = metadata?.parentImage;
  
  if (parentImageId) {
    const imageCacheStore = useImageCacheStore();
    const parentImage = imageCacheStore.imageById[parentImageId]?.getVtkImageData();
    const segmentGroup = segmentGroupStore.dataIndex[groupId.value];
    
    if (parentImage && segmentGroup) {
      // Check coordinate system alignment
      const imageBounds = parentImage.getBounds();
      const segmentBounds = segmentGroup.getBounds();
      const imageSpacing = parentImage.getSpacing();
      const segmentSpacing = segmentGroup.getSpacing();
      const imageOrigin = parentImage.getOrigin();
      const segmentOrigin = segmentGroup.getOrigin();
      const imageDims = parentImage.getDimensions();
      const segmentDims = segmentGroup.getDimensions();
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.log(`   📐 Image bounds: [${imageBounds.map((b: any) => b.toFixed(2)).join(', ')}]`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.log(`   📐 Segment bounds: [${segmentBounds.map((b: any) => b.toFixed(2)).join(', ')}]`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.log(`   📏 Image spacing: [${imageSpacing.map((s: any) => s.toFixed(3)).join(', ')}]`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.log(`   📏 Segment spacing: [${segmentSpacing.map((s: any) => s.toFixed(3)).join(', ')}]`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.log(`   📍 Image origin: [${imageOrigin.map((o: any) => o.toFixed(2)).join(', ')}]`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.log(`   📍 Segment origin: [${segmentOrigin.map((o: any) => o.toFixed(2)).join(', ')}]`);
      console.log(`   📦 Image dimensions: [${imageDims.join(', ')}]`);
      console.log(`   📦 Segment dimensions: [${segmentDims.join(', ')}]`);
      
      // Check if coordinates align (within tolerance)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const boundsMatch = imageBounds.every((val: any, i: any) => Math.abs(val - segmentBounds[i]) < 0.1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spacingMatch = imageSpacing.every((val: any, i: any) => Math.abs(val - segmentSpacing[i]) < 0.001);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originMatch = imageOrigin.every((val: any, i: any) => Math.abs(val - segmentOrigin[i]) < 0.1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dimsMatch = imageDims.every((val: any, i: any) => val === segmentDims[i]);
      
      console.log(`   ✅ Bounds aligned: ${boundsMatch}`);
      console.log(`   ✅ Spacing aligned: ${spacingMatch}`);  
      console.log(`   ✅ Origin aligned: ${originMatch}`);
      console.log(`   ✅ Dimensions match: ${dimsMatch}`);
      
      if (!boundsMatch || !spacingMatch || !originMatch) {
        console.warn(`   ⚠️ ALIGNMENT ISSUE: Segment may not overlay correctly on image!`);
      }
      
      // Check if segment has actual voxel data for this value
      const scalars = segmentGroup.getPointData().getScalars();
      if (scalars) {
        let voxelCount = 0;
        const totalVoxels = scalars.getNumberOfTuples();
        for (let i = 0; i < totalVoxels; i++) {
          if (scalars.getTuple(i)[0] === value) {
            voxelCount++;
          }
        }
        console.log(`   🎯 Voxel count for value ${value}: ${voxelCount}/${totalVoxels} (${(voxelCount/totalVoxels*100).toFixed(2)}%)`);
        
        if (voxelCount === 0) {
          console.warn(`   ⚠️ NO VOXEL DATA: No voxels found with value ${value} in labelmap!`);
        }
      } else {
        console.warn(`   ⚠️ NO SCALARS: Segment group has no scalar data!`);
      }
    } else {
      console.warn(`   ⚠️ Missing data: parentImage=${!!parentImage}, segmentGroup=${!!segmentGroup}`);
    }
  } else {
    console.warn(`   ⚠️ No parent image ID found for segment group`);
  }
  
  segmentGroupStore.updateSegment(groupId.value, value, {
    visible: !segment.visible,
  });
  
  console.log(`   ✅ Visibility toggled successfully`);
};

const allVisible = computed(() => {
  return segments.value.every((seg) => seg.visible);
});

const allLocked = computed(() => {
  return segments.value.every((seg) => seg.locked);
});

function toggleGlobalVisible() {
  const visible = !allVisible.value;

  segments.value.forEach((seg) => {
    segmentGroupStore.updateSegment(groupId.value, seg.value, {
      visible,
    });
  });
}

function toggleGlobalLocked() {
  const locked = !allLocked.value;

  segments.value.forEach((seg) => {
    segmentGroupStore.updateSegment(groupId.value, seg.value, {
      locked,
    });
  });
}

// --- editing state --- //

const editingSegmentValue = ref<Maybe<number>>(null);
const editState = reactive({
  name: '',
  color: '',
  opacity: 1,
});
const editDialog = ref(false);

const editingSegment = computed(() => {
  if (editingSegmentValue.value == null) return null;
  return segmentGroupStore.getSegment(groupId.value, editingSegmentValue.value);
});
const invalidNames = computed(() => {
  const names = new Set(segments.value.map((seg) => seg.name));
  const currentName = editingSegment.value?.name;
  if (currentName) names.delete(currentName); // allow current name
  return names;
});

function startEditing(value: number) {
  editDialog.value = true;
  editingSegmentValue.value = value;
  if (!editingSegment.value) return;
  editState.name = editingSegment.value.name;
  editState.color = rgbaToHexa(editingSegment.value.color);
  editState.opacity = editingSegment.value.color[3] / 255;
}

function stopEditing(commit: boolean) {
  if (editingSegmentValue.value && commit) {
    const color = [
      ...(hexaToRGBA(editState.color).slice(0, 3) as [number, number, number]),
      Math.round(editState.opacity * 255),
    ] as RGBAColor;
    segmentGroupStore.updateSegment(groupId.value, editingSegmentValue.value, {
      name: editState.name ?? makeDefaultSegmentName(editingSegmentValue.value),
      color,
    });
  }
  editingSegmentValue.value = null;
  editDialog.value = false;
}

function deleteSegment(value: number) {
  segmentGroupStore.deleteSegment(groupId.value, value);
}

function deleteEditingSegment() {
  if (editingSegmentValue.value) deleteSegment(editingSegmentValue.value);
  stopEditing(false);
}

/**
 * Toggles the lock state of a segment.
 * Locked segments cannot be edited or painted over.
 *
 * @param value - The segment value to toggle lock state for
 */
const toggleLock = (value: number) => {
  const seg = segmentGroupStore.getSegment(groupId.value, value);
  if (seg) {
    segmentGroupStore.updateSegment(groupId.value, value, {
      locked: !seg.locked,
    });
  }
};
</script>

<template>
  <div class="d-flex justify-space-evenly">
    <v-btn @click.stop="toggleGlobalVisible" class="my-1">
      Toggle Segments
      <slot name="append">
        <v-icon v-if="allVisible" class="pl-2">mdi-eye</v-icon>
        <v-icon v-else class="pl-2">mdi-eye-off</v-icon>
        <v-tooltip location="top" activator="parent">{{
          allVisible ? 'Hide' : 'Show'
        }}</v-tooltip>
      </slot>
    </v-btn>

    <v-btn @click.stop="toggleGlobalLocked" class="my-1">
      Toggle Locks
      <slot name="append">
        <v-icon v-if="allLocked" class="pl-2" color="red">mdi-lock</v-icon>
        <v-icon v-else class="pl-2">mdi-lock-open</v-icon>
        <v-tooltip location="top" activator="parent">{{
          allLocked ? 'Unlock All' : 'Lock All'
        }}</v-tooltip>
      </slot>
    </v-btn>
  </div>

  <div class="segments-container">
    <editable-chip-list
      v-model="selectedSegment"
      :items="segments"
      item-key="value"
      item-title="name"
      create-label-text="New segment"
      @create="addNewSegment"
      class="my-4"
    >
    <template #item-prepend="{ item }">
      <!-- dot container keeps overflowing name from squishing dot width  -->
      <div class="dot-container mr-3">
        <ColorDot :color="item.color" />
      </div>
    </template>
    <template #item-append="{ key, item }">
      <!-- Lock/unlock segment button -->
      <v-btn
        icon
        size="small"
        density="compact"
        class="mr-1"
        variant="plain"
        @click.stop="toggleLock(key as number)"
        :color="item.locked ? 'error' : undefined"
      >
        <v-icon>{{ item.locked ? 'mdi-lock' : 'mdi-lock-open' }}</v-icon>
        <v-tooltip location="left" activator="parent">{{
          item.locked ? 'Unlock' : 'Lock'
        }}</v-tooltip>
      </v-btn>
      <v-btn
        icon
        size="small"
        density="compact"
        class="ml-auto mr-1"
        variant="plain"
        @click.stop="toggleVisible(key as number)"
      >
        <v-icon v-if="item.visible" style="pointer-events: none"
          >mdi-eye</v-icon
        >
        <v-icon v-else style="pointer-events: none">mdi-eye-off</v-icon>
        <v-tooltip location="left" activator="parent">{{
          item.visible ? 'Hide' : 'Show'
        }}</v-tooltip>
      </v-btn>
      <!-- Edit segment button (disabled when locked) -->
      <v-btn
        icon="mdi-pencil"
        size="small"
        density="compact"
        class="mr-1"
        variant="plain"
        @click.stop="startEditing(key as number)"
        :disabled="item.locked"
      />
      <!-- Delete segment button (disabled when locked) -->
      <v-btn
        icon="mdi-delete"
        size="small"
        density="compact"
        class="ml-auto"
        variant="plain"
        @click.stop="deleteSegment(key as number)"
        :disabled="item.locked"
      />
    </template>
  </editable-chip-list>
  </div>

  <isolated-dialog v-model="editDialog" @keydown.stop max-width="800px">
    <segment-editor
      v-if="!!editingSegment"
      v-model:name="editState.name"
      v-model:color="editState.color"
      v-model:opacity="editState.opacity"
      @delete="deleteEditingSegment"
      @cancel="stopEditing(false)"
      @done="stopEditing(true)"
      :invalidNames="invalidNames"
    />
  </isolated-dialog>
</template>

<style scoped>
.dot-container {
  width: 18px;
}

.segments-container {
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
