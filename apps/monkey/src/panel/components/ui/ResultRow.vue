<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { diffArrays } from 'diff';
import { resultName, resultStatusLabel } from '../../labels';
import type { Result } from '../../../workflow/types';

const props = defineProps<{ result: Result; comparison?: boolean }>();
const tooltipId = useId();
const tooltip = ref<HTMLElement>();
const tooltipText = ref('');
const tooltipTarget = ref<HTMLElement>();
function hideTooltip() {
  tooltipText.value = '';
  tooltipTarget.value = undefined;
  window.removeEventListener('resize', hideTooltip);
  window.removeEventListener('scroll', onScroll, true);
}
function onScroll(event: Event) {
  if (!tooltip.value || !event.composedPath().includes(tooltip.value)) hideTooltip();
}
async function showTooltip(event: Event, text: string) {
  const target = event.currentTarget as HTMLElement;
  hideTooltip();
  if (target.scrollWidth <= target.clientWidth && !/[\r\n]/.test(text)) return;
  tooltipTarget.value = target;
  tooltipText.value = text;
  await nextTick();
  const popup = tooltip.value;
  if (!popup || tooltipTarget.value !== target) return;
  const bounds = target.getBoundingClientRect();
  popup.showPopover?.();
  const { width, height } = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8))}px`;
  popup.style.top = `${Math.max(8, bounds.bottom + height > window.innerHeight - 8 ? bounds.top - height : bounds.bottom)}px`;
  window.addEventListener('resize', hideTooltip);
  window.addEventListener('scroll', onScroll, true);
}
watch(() => [props.result.id, props.result.status, props.result.expected], hideTooltip);
onBeforeUnmount(hideTooltip);
const statusLabel = computed(() => resultStatusLabel(props.result.status, props.comparison));
const label = computed(() => resultName(props.result.id));
const needsAttention = computed(() =>
  ['failed', 'blocked', 'unverified', 'different'].includes(props.result.status)
);
const active = computed(() => ['running', 'verifying'].includes(props.result.status));
const tagSets = computed(() => {
  const { id, actual, expected } = props.result;
  if (id !== 'info.tags' || !Array.isArray(actual) || !Array.isArray(expected)) return;
  return { current: new Set(actual), target: new Set(expected) };
});
function tagChange(kind: string, tag: unknown) {
  const sets = tagSets.value;
  if (!sets) return;
  if (kind === 'current' && !sets.target.has(tag)) return 'removed';
  if (kind === 'target' && !sets.current.has(tag)) return 'added';
}
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function textTokens(text: string) {
  // Keep episode numbers and English words whole without splitting emoji or combining marks.
  const tokens: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    if (/^[a-zA-Z0-9]+$/.test(segment) && /^[a-zA-Z0-9]+$/.test(tokens.at(-1) ?? ''))
      tokens[tokens.length - 1] += segment;
    else tokens.push(segment);
  }
  return tokens;
}
const textDiff = computed(() => {
  const { actual, expected } = props.result;
  if (typeof actual !== 'string' || typeof expected !== 'string' || actual === expected) return;
  const changes = diffArrays(textTokens(actual), textTokens(expected), { timeout: 50 }) ?? [
    { value: [actual], removed: true, added: false },
    { value: [expected], removed: false, added: true }
  ];
  return {
    current: changes
      .filter((part) => !part.added)
      .map((part) => ({
        text: part.value.join(''),
        changed: part.removed
      })),
    target: changes
      .filter((part) => !part.removed)
      .map((part) => ({
        text: part.value.join(''),
        changed: part.added
      }))
  };
});
const values = computed(() => {
  const { id, actual, expected } = props.result;
  // Attachment names and workflow checkpoints are not comparable form values.
  if (
    !/^(info|publish|display|commercial|media|interaction)\./.test(id) ||
    actual === undefined ||
    expected === undefined ||
    JSON.stringify(actual) === JSON.stringify(expected)
  )
    return [];
  const sets = tagSets.value;
  if (
    sets &&
    sets.current.size === sets.target.size &&
    [...sets.current].every((tag) => sets.target.has(tag))
  )
    return [];
  return [
    {
      kind: 'current',
      label: props.comparison ? '当前页面' : '页面读回',
      value: props.result.actual
    },
    { kind: 'target', label: '配置目标', value: props.result.expected }
  ];
});
const format = (value: unknown): string => {
  if (typeof value === 'boolean') {
    // Native checkboxes say '关闭评论/弹幕'; config booleans mean enabled.
    const checked = ['interaction.comments', 'interaction.danmaku'].includes(props.result.id)
      ? !value
      : value;
    return checked ? '是' : '否';
  }
  if (Array.isArray(value)) return value.join('、') || '（空）';
  if (typeof value === 'string') return value || '（空）';
  return JSON.stringify(value) ?? '未知';
};
</script>

<template>
  <li class="result-row" :class="result.status">
    <div class="result-heading" @mouseleave="hideTooltip" @keydown.esc="hideTooltip">
      <span
        v-if="active"
        class="loading-spinner result-icon"
        role="img"
        :aria-label="statusLabel"
        :title="statusLabel"
      ></span>
      <svg
        v-else
        class="result-icon"
        viewBox="0 0 20 20"
        role="img"
        :aria-label="statusLabel"
        :title="statusLabel"
      >
        <path v-if="result.status === 'verified'" d="m4 10 4 4 8-8" />
        <template v-else-if="result.status === 'failed' || result.status === 'blocked'">
          <circle cx="10" cy="10" r="7" />
          <path v-if="result.status === 'failed'" d="m7 7 6 6m0-6-6 6" />
          <path v-else d="m5 15 10-10" />
        </template>
        <template v-else-if="needsAttention">
          <path d="M10 3 18 17H2Z" />
          <path d="M10 8v4m0 2v.5" />
        </template>
        <template v-else-if="result.status === 'skipped'">
          <path d="M3 10h12m-4-4 4 4-4 4m6-8v8" />
        </template>
        <template v-else>
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6v4l3 2" />
        </template>
      </svg>
      <strong
        class="result-name"
        tabindex="0"
        :aria-describedby="tooltipTarget?.classList.contains('result-name') ? tooltipId : undefined"
        @mouseenter="showTooltip($event, label)"
        @focus="showTooltip($event, label)"
        @blur="hideTooltip"
        >{{ label }}</strong
      >
      <span
        v-if="result.status === 'verified' && result.expected !== undefined"
        class="result-summary-value"
        tabindex="0"
        :aria-describedby="
          tooltipTarget?.classList.contains('result-summary-value') ? tooltipId : undefined
        "
        @mouseenter="showTooltip($event, format(result.expected))"
        @focus="showTooltip($event, format(result.expected))"
        @blur="hideTooltip"
        >{{ format(result.expected) }}</span
      >
      <span
        v-else-if="result.status !== 'verified' && result.status !== 'failed'"
        class="result-status"
        >{{ statusLabel }}</span
      >
      <div
        v-if="tooltipText"
        :id="tooltipId"
        ref="tooltip"
        class="result-tooltip"
        role="tooltip"
        popover="manual"
      >
        {{ tooltipText }}
      </div>
    </div>
    <div v-if="needsAttention || result.skipReason" class="result-details">
      <p>{{ result.message }}</p>
      <dl v-if="values.length" class="result-comparison">
        <div v-for="item in values" :key="item.kind" class="comparison-block" :class="item.kind">
          <dt>{{ item.label }}</dt>
          <dd v-if="Array.isArray(item.value) && item.value.length" class="comparison-tags">
            <span
              v-for="(tag, index) in item.value"
              :key="index"
              class="comparison-tag"
              :class="tagChange(item.kind, tag)"
              :title="
                tagChange(item.kind, tag) === 'added'
                  ? `待添加：${tag}`
                  : tagChange(item.kind, tag) === 'removed'
                    ? `待删除：${tag}`
                    : undefined
              "
            >
              <span class="tag-label">{{ tag }}</span>
            </span>
          </dd>
          <dd
            v-else-if="textDiff && typeof item.value === 'string' && item.value.length"
            class="comparison-text"
          >
            <template
              v-for="(part, index) in textDiff[item.kind === 'current' ? 'current' : 'target']"
              :key="index"
              ><del
                v-if="part.changed && item.kind === 'current'"
                class="comparison-text-removed"
                >{{ part.text }}</del
              ><ins v-else-if="part.changed" class="comparison-text-added">{{ part.text }}</ins
              ><span v-else>{{ part.text }}</span></template
            >
          </dd>
          <dd v-else class="comparison-text">{{ format(item.value) }}</dd>
        </div>
      </dl>
    </div>
  </li>
</template>
