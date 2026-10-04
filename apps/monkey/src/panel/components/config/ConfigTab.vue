<script setup lang="ts">
import CodePreview from '../ui/CodePreview.vue';

defineProps<{ raw: string | null }>();
</script>

<template>
  <CodePreview v-if="raw !== null" :source="raw" />
  <p v-else class="empty-state">暂无可预览的配置。</p>
</template>
