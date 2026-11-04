<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import type { SubtitleAttachment } from '../../../application/types';
import { subtitleKey } from '../../utils/subtitles';
import CodePreview from '../ui/CodePreview.vue';
import DropdownSelect from '../ui/DropdownSelect.vue';

const props = defineProps<{ files: SubtitleAttachment[] }>();
const languageId = useId();
const tooltipId = useId();
const selectedLanguage = defineModel<string>({ default: '' });
const tooltipVisible = ref(false);
const subtitles = computed(() => props.files);
watch(
  subtitles,
  (files) => {
    if (!files.some((file) => subtitleKey(file, files) === selectedLanguage.value))
      selectedLanguage.value = files[0] ? subtitleKey(files[0], files) : '';
  },
  { immediate: true }
);
const selected = computed(() =>
  subtitles.value.find((file) => subtitleKey(file, subtitles.value) === selectedLanguage.value)
);
const filename = computed(() => selected.value?.name.split(/[\\/]/).at(-1) ?? '');
watch(selected, () => {
  tooltipVisible.value = false;
});
function showFilename(event: Event) {
  const target = event.currentTarget as HTMLElement;
  tooltipVisible.value = target.scrollWidth > target.clientWidth;
}
</script>

<template>
  <div v-if="selected" class="subtitle-preview">
    <div class="subtitle-language">
      <label :for="languageId">语言</label>
      <DropdownSelect
        :id="languageId"
        v-model="selectedLanguage"
        label="字幕语言"
        :options="subtitles.map((file) => subtitleKey(file, subtitles))"
      />
    </div>
    <div
      class="file-heading"
      @mouseleave="tooltipVisible = false"
      @keydown.esc="tooltipVisible = false"
    >
      <p
        class="file-name"
        tabindex="0"
        :aria-describedby="tooltipVisible ? tooltipId : undefined"
        @mouseenter="showFilename"
        @focus="showFilename"
        @blur="tooltipVisible = false"
      >
        {{ filename }}
      </p>
      <div v-if="tooltipVisible" :id="tooltipId" class="file-tooltip" role="tooltip">
        {{ filename }}
      </div>
    </div>
    <CodePreview :source="selected.source" language="text" />
  </div>
  <p v-else class="empty-state">暂无字幕。</p>
</template>
