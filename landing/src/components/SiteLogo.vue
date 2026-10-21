<script setup lang="ts">
import { useId } from "vue";
import {
  LOGO_BARS_PATH,
  LOGO_BARS_STROKE_WIDTH,
  LOGO_GRADIENT,
  LOGO_HEX_PATH,
  LOGO_HEX_STROKE_WIDTH,
  LOGO_VIEW_BOX,
} from "../../../shared/logo";

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
    :viewBox="LOGO_VIEW_BOX"
    :class="class"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gradId" v-bind="LOGO_GRADIENT">
        <stop stop-color="var(--cyan)" />
        <stop offset="1" stop-color="var(--violet)" />
      </linearGradient>
    </defs>
    <path
      :d="LOGO_HEX_PATH"
      :stroke="`url(#${gradId})`"
      :stroke-width="LOGO_HEX_STROKE_WIDTH"
      stroke-linejoin="round"
      fill="none"
    />
    <path
      :d="LOGO_BARS_PATH"
      stroke="var(--violet)"
      :stroke-width="LOGO_BARS_STROKE_WIDTH"
      stroke-linecap="round"
      fill="none"
    />
  </svg>
</template>
