<script setup lang="ts">
import { progressLabel } from '../../labels';
import { computed, ref, useId } from 'vue';
import type { ViewState } from '../../../application/types';
import ResultRow from '../ui/ResultRow.vue';

const props = defineProps<{ state: ViewState }>();
defineEmits<{ clear: []; write: [] }>();

const unsuccessful = computed(() =>
  props.state.results.filter((result) =>
    ['failed', 'blocked', 'unverified', 'different'].includes(result.status)
  )
);
const skipped = computed(() => props.state.results.filter((result) => result.skipReason));
const writeDisabledReason = computed(() => {
  if (props.state.busy) return '请等待当前操作完成';
  if (props.state.canWrite) return undefined;
  if (props.state.panelStatus === 'completed') return '本次写入已完成，没有待写入项目';
  if (props.state.panelStatus === 'interrupted') return '页面或稿件已变化，请重新选择目录后再写入';
  const reasons = props.state.results
    .filter((result) => result.status === 'blocked' || result.status === 'failed')
    .map((result) => result.message);
  return [...new Set(reasons)].join('；') || props.state.summary || '尚未完成比对';
});
const showWriteReason = ref(false);
const writeReasonId = useId();
</script>

<template>
  <p v-if="state.busy" class="progress-message" role="status">
    {{
      state.panelStatus === 'video-wait'
        ? state.summary
        : state.currentStep
          ? progressLabel(state.currentStep)
          : '正在准备…'
    }}
  </p>
  <p v-else class="summary-message" aria-live="polite">
    {{ state.summary || '导入后查看结果。' }}
  </p>
  <section
    v-if="unsuccessful.length"
    class="summary-problems"
    aria-label="需处理的项目"
    aria-live="polite"
  >
    <h2>{{ state.comparison ? '差异与待核验项目' : '未成功的项目' }}</h2>
    <ul class="result-list">
      <ResultRow
        v-for="result in unsuccessful"
        :key="result.id"
        :result="result"
        :comparison="state.comparison"
      />
    </ul>
  </section>
  <section v-if="skipped.length" class="summary-skipped" aria-label="已跳过的项目">
    <h2>已跳过的项目</h2>
    <ul class="result-list">
      <ResultRow
        v-for="result in skipped"
        :key="result.id"
        :result="result"
        :comparison="state.comparison"
      />
    </ul>
  </section>
  <div class="summary-actions">
    <span
      class="write-action"
      :tabindex="writeDisabledReason ? 0 : undefined"
      :aria-describedby="showWriteReason && writeDisabledReason ? writeReasonId : undefined"
      @mouseenter="showWriteReason = true"
      @mouseleave="showWriteReason = false"
      @focus="showWriteReason = true"
      @blur="showWriteReason = false"
      @keydown.esc="showWriteReason = false"
    >
      <button
        class="primary write-configuration"
        :disabled="state.busy || !state.canWrite"
        @click="$emit('write')"
      >
        写入配置
      </button>
      <span
        v-if="showWriteReason && writeDisabledReason"
        :id="writeReasonId"
        class="write-disabled-tooltip"
        role="tooltip"
        >{{ writeDisabledReason }}</span
      >
    </span>
    <button
      class="clear-selection"
      :disabled="state.busy"
      aria-label="去除目录选择"
      title="去除目录选择"
      @click="$emit('clear')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"
        />
        <path d="m10 11 5 5m0-5-5 5" />
      </svg>
      <span>取消选择</span>
    </button>
  </div>
</template>
