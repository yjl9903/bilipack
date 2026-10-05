<script setup lang="ts">
import { computed } from 'vue';
import type { Result } from '../../../workflow/types';
import ResultRow from '../ui/ResultRow.vue';

const props = defineProps<{ results: Result[]; comparison?: boolean }>();
const visibleResults = computed(() => props.results.filter((result) => result.id !== 'editor.ready'));
</script>

<template>
  <section v-if="visibleResults.length" aria-live="polite">
    <h2>结果清单</h2>
    <ul class="result-list">
      <ResultRow
        v-for="result in visibleResults"
        :key="result.id"
        :result="result"
        :comparison="comparison"
      />
    </ul>
  </section>
  <p v-else class="empty-state">暂无校验结果。</p>
</template>
