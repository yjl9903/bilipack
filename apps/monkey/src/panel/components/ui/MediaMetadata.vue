<script setup lang="ts">
import { ref, useId, watch } from 'vue';

const props = defineProps<{
  items: { label: string; value: string; truncate?: boolean }[];
  label: string;
}>();
const tooltipId = useId();
const activeTooltip = ref<string | null>(null);
watch(
  () => props.items,
  () => {
    activeTooltip.value = null;
  }
);
function showTooltip(event: Event, label: string) {
  const target = event.currentTarget as HTMLElement;
  activeTooltip.value = target.scrollWidth > target.clientWidth ? label : null;
}
</script>

<template>
  <dl class="media-metadata" :aria-label="label">
    <template v-for="item in items" :key="item.label">
      <dt>{{ item.label }}</dt>
      <dd>
        <div
          v-if="item.truncate"
          class="metadata-file"
          @mouseleave="activeTooltip = null"
          @keydown.esc="activeTooltip = null"
        >
          <span
            class="metadata-filename"
            tabindex="0"
            :aria-describedby="activeTooltip === item.label ? tooltipId : undefined"
            @mouseenter="showTooltip($event, item.label)"
            @focus="showTooltip($event, item.label)"
            @blur="activeTooltip = null"
            >{{ item.value }}</span
          >
          <div
            v-if="activeTooltip === item.label"
            :id="tooltipId"
            class="file-tooltip"
            role="tooltip"
          >
            {{ item.value }}
          </div>
        </div>
        <template v-else>{{ item.value }}</template>
      </dd>
    </template>
  </dl>
</template>
