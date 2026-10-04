<script setup lang="ts">
import { computed } from 'vue';
import type { CoverAttachment } from '../../../application/types';
import type { CoverSource } from '../../../input/types';
import { formatSize, aspectRatio } from '../../utils/media-metadata';
import MediaMetadata from '../ui/MediaMetadata.vue';

const props = defineProps<{ files: CoverAttachment[] }>();
const covers = computed(() =>
  [...props.files].sort(
    (a, b) => Number(b.cover.ratio === '4:3') - Number(a.cover.ratio === '4:3')
  )
);
const singleSource = computed(
  () => covers.value.find((file) => file.cover.source.mode === 'single')?.cover.source
);
const singlePositions = computed(() =>
  covers.value.flatMap(({ cover: { ratio, source } }) => {
    if (source.mode !== 'single') return [];
    const [horizontal, vertical] = source.position;
    return [
      { label: `${ratio} 偏移`, value: `水平 ${horizontal}% · 垂直 ${vertical}%` }
    ];
  })
);
const title = (file: CoverAttachment) =>
  file.cover.ratio === '4:3' ? '首页推荐封面（4:3）' : '个人空间封面（16:9）';
function metadata(source: CoverSource, positions: { label: string; value: string }[]) {
  const { file, width, height } = source;
  return [
    { label: '文件名', value: file.name, truncate: true },
    { label: '文件大小', value: formatSize(file.size) },
    { label: '文件格式', value: file.name.split('.').at(-1)?.toUpperCase() || '未知' },
    { label: '媒体类型', value: file.type || '未知' },
    { label: '图片尺寸', value: `${width} × ${height}` },
    { label: '画面比例', value: aspectRatio(width, height) },
    ...positions,
    {
      label: '修改时间',
      value: new Date(file.lastModified).toLocaleString('zh-CN', { hour12: false })
    }
  ];
}
</script>

<template>
  <div class="cover-previews">
    <figure v-for="(file, index) in covers" :key="index">
      <h2 class="cover-preview-title">{{ title(file) }}</h2>
      <img :src="file.url" :alt="title(file)" />
      <MediaMetadata
        v-if="file.cover.source.mode === 'dual'"
        :items="metadata(file.cover.source, [{ label: '偏移', value: '无偏移（不裁剪）' }])"
        :label="`${title(file)}元信息`"
      />
    </figure>
    <MediaMetadata
      v-if="singleSource"
      :items="metadata(singleSource, singlePositions)"
      label="原始封面图片元信息"
    />
  </div>
</template>
