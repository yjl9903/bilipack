<script setup lang="ts">
import { computed } from 'vue';
import { highlightCode } from '../../utils/highlight';

const props = defineProps<{ source: string; language?: 'toml' | 'text' }>();
const html = computed(() => highlightCode(props.source, props.language));
</script>

<template>
  <!-- Both Shiki and the plain-text fallback escape the read-only source. -->
  <div class="code-preview" v-html="html"></div>
</template>
