<script setup lang="ts">
import type { Result } from '../../../workflow/types';
import ResultRow from '../ui/ResultRow.vue';

defineProps<{ results: Result[]; comparison?: boolean }>();
</script>

<template>
  <section v-if="results.length" aria-live="polite">
    <h2>结果清单</h2>
    <ul class="result-list">
      <ResultRow
        v-for="result in results"
        :key="result.id"
        :result="result"
        :comparison="comparison"
      />
    </ul>
  </section>
  <p v-else class="empty-state">暂无校验结果。</p>
</template>
