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

// Same geometry as the landing nav (landing/src/components/SiteLogo.vue).
// Colours come from --cyan/--violet, which custom.css maps onto the docs brand
// tokens, so the mark follows the docs theme picker without any JS.
const gradId = useId();
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    class="docs-logo"
    :viewBox="LOGO_VIEW_BOX"
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
