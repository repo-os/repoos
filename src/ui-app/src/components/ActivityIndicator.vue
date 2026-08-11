<script setup lang="ts">
withDefaults(defineProps<{ size?: "sm" | "md"; dots?: number }>(), {
  size: "sm",
  dots: 3,
});
</script>

<template>
  <span class="ai" :class="size === 'md' ? 'ai-md' : 'ai-sm'" role="status" aria-label="Working…">
    <span
      v-for="n in dots"
      :key="n"
      class="ai-dot"
      :style="{ animationDelay: `${(n - 1) * 0.16}s` }"
    ></span>
  </span>
</template>
