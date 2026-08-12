<script setup lang="ts">
withDefaults(defineProps<{ size?: "sm" | "md"; dots?: number; label?: string; variant?: "working" | "reviewing" }>(), {
  size: "sm",
  dots: 3,
  label: "Working…",
  variant: "working",
});
</script>

<template>
  <span class="ai" :class="[size === 'md' ? 'ai-md' : 'ai-sm', `ai-${variant}`]" role="status" :aria-label="label">
    <span
      v-for="n in dots"
      :key="n"
      class="ai-dot"
      :style="{ animationDelay: `${(n - 1) * 0.16}s` }"
    ></span>
  </span>
</template>
