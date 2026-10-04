<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{ id: string; label: string; modelValue: string; options: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const root = ref<HTMLElement>();
const open = ref(false);
const activeIndex = ref(0);
function close() {
  open.value = false;
}
function show() {
  if (!props.options.length) return;
  activeIndex.value = Math.max(0, props.options.indexOf(props.modelValue));
  open.value = true;
}
function choose(index: number) {
  const value = props.options[index];
  if (value === undefined) return;
  emit('update:modelValue', value);
  close();
}
function outside(event: PointerEvent) {
  // Use the composed path because the control lives inside a shadow root.
  if (root.value && !event.composedPath().includes(root.value)) close();
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    close();
    return;
  }
  if (event.key === 'Escape') {
    if (open.value) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (open.value) choose(activeIndex.value);
    else show();
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  if (!open.value) show();
  else if (event.key === 'ArrowDown')
    activeIndex.value = Math.min(props.options.length - 1, activeIndex.value + 1);
  else if (event.key === 'ArrowUp') activeIndex.value = Math.max(0, activeIndex.value - 1);
  if (event.key === 'Home') activeIndex.value = 0;
  if (event.key === 'End') activeIndex.value = props.options.length - 1;
  void nextTick(() =>
    root.value
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  );
}
watch(
  () => [props.modelValue, props.options] as const,
  () => {
    activeIndex.value = Math.max(0, props.options.indexOf(props.modelValue));
    if (!props.options.length) close();
  }
);
onMounted(() => document.addEventListener('pointerdown', outside, true));
onUnmounted(() => document.removeEventListener('pointerdown', outside, true));
</script>

<template>
  <div ref="root" class="dropdown-select">
    <button
      :id="id"
      type="button"
      class="dropdown-trigger"
      role="combobox"
      :aria-label="label"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="`${id}-options`"
      :aria-activedescendant="open ? `${id}-option-${activeIndex}` : undefined"
      :disabled="!options.length"
      @click="open ? close() : show()"
      @keydown="keydown"
      @blur="close"
    >
      <span>{{ modelValue }}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true" :class="{ open }"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    <ul
      v-if="open"
      :id="`${id}-options`"
      class="dropdown-options"
      role="listbox"
      :aria-label="label"
    >
      <li
        v-for="(option, index) in options"
        :id="`${id}-option-${index}`"
        :key="option"
        role="option"
        :aria-selected="option === modelValue"
        :data-index="index"
        class="dropdown-option"
        :class="{ active: index === activeIndex }"
        @pointerdown.prevent
        @mouseenter="activeIndex = index"
        @click="choose(index)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path v-if="option === modelValue" d="m3 8 3 3 7-7" />
        </svg>
        <span>{{ option }}</span>
      </li>
    </ul>
  </div>
</template>
