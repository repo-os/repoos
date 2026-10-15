<script setup lang="ts">
defineOptions({ name: "ActivityIndicator" });

import { computed } from "vue";
import {
  activityAnimationStyleOrDefault,
  type ActivityAnimationStyle,
} from "../../../core/activity-animation.js";
import { useConfigStore } from "../stores/config";

export type ActivityMotion = "coding" | "reviewing" | "agent";

const props = withDefaults(
  defineProps<{
    size?: "sm" | "md";
    dots?: number;
    label?: string;
    variant?: "working" | "reviewing";
    /** Overrides variant-derived motion when set. */
    activity?: ActivityMotion;
    /** Settings preview — does not read repo config. */
    animationStyle?: ActivityAnimationStyle;
  }>(),
  {
    size: "sm",
    dots: 3,
    label: "Working…",
    variant: "working",
  },
);

const config = useConfigStore();

const style = computed((): ActivityAnimationStyle => {
  if (props.animationStyle) return props.animationStyle;
  const raw = config.form.activityAnimationStyle;
  return activityAnimationStyleOrDefault(
    typeof raw === "string" ? (raw as ActivityAnimationStyle) : undefined,
  );
});

const motion = computed((): ActivityMotion => {
  if (props.activity) return props.activity;
  if (props.variant === "reviewing") return "reviewing";
  return "coding";
});

const legacyDots = computed(() => style.value === "three-dots");

const matrixPositions = [
  { x: "15%", y: "0%", d: "0s" },
  { x: "65%", y: "0%", d: "0.12s" },
  { x: "15%", y: "34%", d: "0.24s" },
  { x: "65%", y: "34%", d: "0.36s" },
  { x: "15%", y: "68%", d: "0.48s" },
  { x: "65%", y: "68%", d: "0.6s" },
];
</script>

<template>
  <span
    class="ai"
    :class="[
      size === 'md' ? 'ai-md' : 'ai-sm',
      `ai-${variant}`,
      legacyDots ? 'ai-legacy-dots' : 'ai-compact',
      !legacyDots && `ai-style-${style}`,
      !legacyDots && `ai-motion-${motion}`,
    ]"
    role="status"
    :aria-label="label"
  >
    <template v-if="legacyDots">
      <span
        v-for="n in dots"
        :key="n"
        class="ai-dot"
        :style="{ animationDelay: `${(n - 1) * 0.16}s` }"
      ></span>
    </template>
    <span v-else-if="style === 'orbital-pixel'" class="ai-mark ai-orbit" aria-hidden="true"></span>
    <span
      v-else-if="style === 'cursor-scan-pulse'"
      class="ai-mark ai-caret"
      aria-hidden="true"
    ></span>
    <span
      v-else-if="style === 'breathing-brackets'"
      class="ai-mark ai-bracket"
      aria-hidden="true"
    ></span>
    <span
      v-else-if="style === 'micro-dot-matrix'"
      class="ai-mark ai-matrix"
      aria-hidden="true"
    >
      <i
        v-for="(dot, idx) in matrixPositions"
        :key="idx"
        :style="{ '--x': dot.x, '--y': dot.y, '--d': dot.d }"
      ></i>
    </span>
    <span v-else-if="style === 'tiny-signal-bars'" class="ai-mark ai-bars" aria-hidden="true">
      <i v-for="n in 3" :key="n" :style="{ '--d': `${(n - 1) * 0.18}s` }"></i>
    </span>
    <span v-else-if="style === 'spark-diamond'" class="ai-mark ai-spark" aria-hidden="true"></span>
  </span>
</template>
