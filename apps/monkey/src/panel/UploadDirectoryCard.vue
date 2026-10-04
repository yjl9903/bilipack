<script setup lang="ts">
defineProps<{ busy: boolean; errors: string[] }>();
defineEmits<{ select: [] }>();
</script>

<template>
  <section class="upload-directory-card" aria-label="上传 Bilipack 目录">
    <button class="directory-upload" :disabled="busy" @click="$emit('select')">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7V5h6l2 2h10v13H3V7Z" />
        <path d="M12 17v-6m-3 3 3-3 3 3" />
      </svg>
      <strong>选择目录</strong>
      <span>包含 bilipack.toml 和附件的视频包目录</span>
    </button>
    <p v-for="error in errors" :key="error" class="upload-error" role="alert">{{ error }}</p>
  </section>
</template>
