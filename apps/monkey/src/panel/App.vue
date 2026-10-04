<script setup lang="ts">
import { computed, shallowRef, onUnmounted } from 'vue';
import type { Controller } from '../application/controller';
import type { ViewState } from '../application/types';
import { panelStatuses } from './status';
import FloatingPanel from './components/ui/FloatingPanel.vue';
import UploadDirectoryCard from './UploadDirectoryCard.vue';
import SelectedDirectoryCard from './SelectedDirectoryCard.vue';

const props = defineProps<{ controller: Controller }>();
const state = shallowRef<ViewState>();
const unsubscribe = props.controller.subscribe((value) => {
  state.value = value;
});
onUnmounted(unsubscribe);
const statusBadge = computed(() =>
  state.value?.directoryName != null
    ? panelStatuses[state.value.panelStatus ?? 'preparing']
    : undefined
);
</script>

<template>
  <FloatingPanel
    v-if="state?.visible && state.panelVisible"
    :title="state.directoryName ?? '选择 Bilipack 目录'"
    :initially-expanded="state.panelInitiallyExpanded"
    :busy="state.busy"
  >
    <template #title>
      <div class="panel-heading" :aria-busy="state.busy">
        <strong class="panel-title" :title="state.directoryName ?? '选择 Bilipack 目录'">{{
          state.directoryName ?? '选择 Bilipack 目录'
        }}</strong>
        <span
          v-if="statusBadge"
          class="panel-status"
          :class="statusBadge.tone"
          role="status"
          aria-live="polite"
          :aria-label="statusBadge.label"
        >
          <span v-if="statusBadge.loading" class="loading-spinner" aria-hidden="true"></span>
          {{ statusBadge.label }}
        </span>
      </div>
    </template>
    <UploadDirectoryCard
      v-if="state.directoryName === null"
      :busy="state.busy"
      :errors="state.results.map((result) => result.message)"
      @select="controller.importDirectory()"
    />
    <SelectedDirectoryCard
      v-else
      :key="state.directoryName"
      :state="state"
      @clear="controller.clearSelection()"
      @write="controller.writeConfiguration()"
    />
  </FloatingPanel>
</template>
