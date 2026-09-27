<script setup lang="ts">
import { useId } from "vue";

withDefaults(
  defineProps<{
    size?: number;
    class?: string;
  }>(),
  { size: 28 },
);

const gradId = useId();
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :class="class"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gradId" x1="0.5" y1="0.5" x2="23.5" y2="23.5">
        <stop stop-color="var(--cyan)" />
        <stop offset="1" stop-color="var(--violet)" />
      </linearGradient>
    </defs>
    <path
      d="M12 2L4 7v10l8 5 8-5V7l-8-5z"
      :stroke="`url(#${gradId})`"
      stroke-width="1.8"
      stroke-linejoin="round"
      fill="none"
    />
    <path
      d="M12 7v10M8 9.5v5M16 9.5v5"
      stroke="var(--violet)"
      stroke-width="1.3"
      stroke-linecap="round"
      fill="none"
    />
  </svg>
</template>
