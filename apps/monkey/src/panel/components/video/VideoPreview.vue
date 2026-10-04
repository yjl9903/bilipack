<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { parseSrt } from 'bilipack';
import type { SubtitleAttachment } from '../../../application/types';
import MediaMetadata from '../ui/MediaMetadata.vue';
import { formatSize, aspectRatio } from '../../utils/media-metadata';

const props = defineProps<{ file: File; subtitle?: SubtitleAttachment }>();
const player = ref<HTMLVideoElement>();
const subtitleError = ref('');
const subtitleTracks = new WeakMap<HTMLVideoElement, TextTrack>();
watch(
  [player, () => props.subtitle?.source],
  ([video, source]) => {
    subtitleError.value = '';
    if (!video) return;
    const previous = subtitleTracks.get(video);
    if (previous) {
      // Disabled tracks expose a null cue list in browsers; clear while hidden.
      previous.mode = 'hidden';
      while (previous.cues?.length) previous.removeCue(previous.cues[0]);
      previous.mode = 'disabled';
    }
    if (source === undefined) return;
    try {
      const cues = parseSrt(source).map(
        (cue) => new VTTCue(cue.start / 1000, cue.end / 1000, cue.text)
      );
      const track = previous ?? video.addTextTrack('subtitles', 'Bilipack 字幕');
      subtitleTracks.set(video, track);
      for (const cue of cues) track.addCue(cue);
      track.mode = 'showing';
    } catch {
      subtitleError.value = '字幕预览暂不可用，请检查字幕格式或浏览器支持。';
    }
  },
  { flush: 'post' }
);
const url = ref('');
const duration = ref<number>();
const dimensions = ref<{ width: number; height: number }>();
const failed = ref(false);
function release() {
  if (url.value) URL.revokeObjectURL(url.value);
}
watch(
  () => props.file,
  (file) => {
    release();
    duration.value = undefined;
    dimensions.value = undefined;
    failed.value = false;
    url.value = URL.createObjectURL(file);
  },
  { immediate: true }
);
onUnmounted(release);
function readMetadata(event: Event) {
  const video = event.currentTarget as HTMLVideoElement;
  duration.value =
    Number.isFinite(video.duration) && video.duration >= 0 ? video.duration : undefined;
  dimensions.value =
    video.videoWidth && video.videoHeight
      ? { width: video.videoWidth, height: video.videoHeight }
      : undefined;
}
function formatDuration(seconds: number) {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
const metadata = computed(() => [
  { label: '文件名', value: props.file.name, truncate: true },
  { label: '文件大小', value: formatSize(props.file.size) },
  {
    label: '文件格式',
    value: props.file.name.includes('.') ? props.file.name.split('.').at(-1)!.toUpperCase() : '未知'
  },
  { label: '媒体类型', value: props.file.type || '未知' },
  { label: '时长', value: duration.value === undefined ? '—' : formatDuration(duration.value) },
  {
    label: '分辨率',
    value: dimensions.value ? `${dimensions.value.width} × ${dimensions.value.height}` : '—'
  },
  {
    label: '画面比例',
    value: dimensions.value ? aspectRatio(dimensions.value.width, dimensions.value.height) : '—'
  },
  {
    label: '修改时间',
    value: new Date(props.file.lastModified).toLocaleString('zh-CN', { hour12: false })
  }
]);
</script>

<template>
  <div class="video-details">
    <video
      ref="player"
      :key="url"
      class="video-preview"
      :src="url"
      controls
      playsinline
      preload="metadata"
      @loadedmetadata="readMetadata"
      @durationchange="readMetadata"
      @resize="readMetadata"
      @error="failed = true"
    ></video>
    <p v-if="subtitleError" class="empty-state">{{ subtitleError }}</p>
    <MediaMetadata class="video-metadata" :items="metadata" label="视频元信息" />
    <p v-if="failed" class="hint">浏览器无法读取此视频的媒体信息，文件信息仍可查看。</p>
  </div>
</template>
