<template>
  <svg
    class="hub-logo"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 2L4 7v10l8 5 8-5V7l-8-5z"
      stroke="var(--cyan)"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <path
      d="M12 7v10M8 9.5v5M16 9.5v5"
      stroke="var(--violet)"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 22 });
</script>