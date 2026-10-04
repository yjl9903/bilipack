<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ViewState } from '../application/types';
import SummaryTab from './components/summary/SummaryTab.vue';
import ValidationTab from './components/validation/ValidationTab.vue';
import ConfigTab from './components/config/ConfigTab.vue';
import VideoPreview from './components/video/VideoPreview.vue';
import CoverPreviews from './components/cover/CoverPreviews.vue';
import SubtitlePreview from './components/subtitle/SubtitlePreview.vue';

const props = defineProps<{ state: ViewState }>();
defineEmits<{ clear: []; write: [] }>();

const subtitles = computed(() =>
  props.state.attachments.filter((file) => file.type === 'subtitle')
);
const selectedLanguage = ref('');
const selectedSubtitle = computed(() =>
  subtitles.value.find((file) => file.language === selectedLanguage.value)
);

const videos = computed(() => props.state.attachments.filter((file) => file.type === 'video'));
const covers = computed(() => props.state.attachments.filter((file) => file.type === 'cover'));
const mediaTabs = computed(() => [
  { id: 'video', label: '视频' },
  { id: 'cover', label: '封面' },
  ...(subtitles.value.length ? [{ id: 'subtitle', label: '字幕' }] : [])
]);
const tabs = computed(() => [
  { id: 'summary', label: '总结' },
  { id: 'validation', label: '校验' },
  { id: 'config', label: '配置' },
  ...mediaTabs.value
]);
const activeTab = ref('summary');
watch(tabs, (value) => {
  if (!value.some((tab) => tab.id === activeTab.value)) activeTab.value = 'summary';
});
function navigateTabs(event: KeyboardEvent) {
  const index = tabs.value.findIndex((tab) => tab.id === activeTab.value);
  const next =
    event.key === 'ArrowRight'
      ? (index + 1) % tabs.value.length
      : event.key === 'ArrowLeft'
        ? (index + tabs.value.length - 1) % tabs.value.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.value.length - 1
            : undefined;
  if (next === undefined) return;
  event.preventDefault();
  activeTab.value = tabs.value[next].id;
  (event.currentTarget as HTMLElement)
    .querySelectorAll<HTMLButtonElement>('[role="tab"]')
    [next]?.focus();
}
</script>

<template>
  <div class="selected-directory-card">
    <div class="tabs" role="tablist" aria-label="视频包详情" @keydown="navigateTabs">
      <button
        v-for="tab in tabs"
        :id="`bilipack-tab-${tab.id}`"
        :key="tab.id"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`bilipack-panel-${tab.id}`"
        :tabindex="activeTab === tab.id ? 0 : -1"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>
    <section
      id="bilipack-panel-summary"
      v-show="activeTab === 'summary'"
      role="tabpanel"
      aria-labelledby="bilipack-tab-summary"
      tabindex="0"
    >
      <SummaryTab :state="state" @write="$emit('write')" @clear="$emit('clear')" />
    </section>
    <section
      id="bilipack-panel-validation"
      v-show="activeTab === 'validation'"
      role="tabpanel"
      aria-labelledby="bilipack-tab-validation"
      tabindex="0"
    >
      <ValidationTab :results="state.results" :comparison="state.comparison" />
    </section>
    <section
      id="bilipack-panel-config"
      v-show="activeTab === 'config'"
      role="tabpanel"
      aria-labelledby="bilipack-tab-config"
      tabindex="0"
    >
      <ConfigTab :raw="state.raw" />
    </section>
    <section
      v-for="tab in mediaTabs"
      :id="`bilipack-panel-${tab.id}`"
      :key="tab.id"
      v-show="activeTab === tab.id"
      role="tabpanel"
      :aria-labelledby="`bilipack-tab-${tab.id}`"
      tabindex="0"
    >
      <CoverPreviews v-if="tab.id === 'cover' && covers.length" :files="covers" />
      <SubtitlePreview
        v-else-if="tab.id === 'subtitle'"
        v-model="selectedLanguage"
        :files="subtitles"
      />
      <template v-else-if="tab.id === 'video' && videos.length">
        <figure v-for="(file, i) in videos" :key="i">
          <p
            v-if="
              state.results.some(
                (result) => result.id === 'video.upload' && result.status === 'skipped'
              )
            "
            class="video-upload-notice"
          >
            未上传（页面已有视频）
          </p>
          <VideoPreview
            v-if="activeTab === tab.id"
            :file="file.file"
            :subtitle="selectedSubtitle"
          />
        </figure>
      </template>
      <p v-else class="empty-state">暂无{{ tab.label }}。</p>
    </section>
  </div>
</template>
