<script setup lang="ts">
defineOptions({ name: "ActivityIndicator" });

import { computed, ref } from "vue";
import { getActivePinia } from "pinia";
import {
  ACTIVITY_ANIMATION_STYLE_SLOT,
  activityAnimationSizeOrDefault,
  activityAnimationSizePx,
  activityAnimationStyleOrDefault,
  isActivityAnimationArtStyle,
  normalizeActivityAnimationSize,
  type ActivityAnimationSize,
  type ActivityAnimationStyle,
} from "../../../core/activity-animation.js";
import { useConfigStore } from "../stores/config";
import { useActivityMotion } from "../lib/activity-motion";
import BooSwoopArt from "./activity-art/BooSwoopArt.vue";
import PumpkinSpellArt from "./activity-art/PumpkinSpellArt.vue";
import RgbKeystormArt from "./activity-art/RgbKeystormArt.vue";
import WheelieCourierArt from "./activity-art/WheelieCourierArt.vue";

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
    /** Settings preview — does not read repo config. */
    animationSize?: ActivityAnimationSize;
  }>(),
  {
    size: "sm",
    dots: 3,
    label: "Working…",
    variant: "working",
  },
);

const pinia = getActivePinia();
const config = pinia ? useConfigStore(pinia) : null;
const root = ref<HTMLElement | null>(null);
const animationLimit = computed(() => {
  const value = config?.form.activityAnimationConcurrency;
  return typeof value === "number" ? value : 6;
});
const animate = useActivityMotion(root, animationLimit);

const style = computed((): ActivityAnimationStyle => {
  if (props.animationStyle) return props.animationStyle;
  const raw = config?.form.activityAnimationStyle;
  return activityAnimationStyleOrDefault(
    typeof raw === "string" ? (raw as ActivityAnimationStyle) : undefined,
  );
});

const animationSize = computed((): ActivityAnimationSize => {
  if (props.animationSize !== undefined) {
    return activityAnimationSizeOrDefault(normalizeActivityAnimationSize(props.animationSize));
  }
  return activityAnimationSizeOrDefault(
    normalizeActivityAnimationSize(config?.form.activityAnimationSize),
  );
});

const sizePx = computed(() => activityAnimationSizePx(animationSize.value));
const sized = computed(() => sizePx.value > 0);

/**
 * The chosen size is the reserved width in pixels, so it renders at the same
 * size on every surface (#0816). `--ai-size-px` is that fixed width; the
 * artwork's font is given a fixed pixel size of `size / slot` so each style's
 * em-based geometry fills the slot without reading the surrounding font.
 */
const sizeStyle = computed((): Record<string, string> => {
  const px = sizePx.value;
  const slot = ACTIVITY_ANIMATION_STYLE_SLOT[style.value];
  const markPx = slot > 0 ? px / slot : px;
  return {
    "--ai-size-px": `${px}px`,
    "--ai-mark-px": `${markPx}px`,
  };
});

const motion = computed((): ActivityMotion => {
  if (props.activity) return props.activity;
  if (props.variant === "reviewing") return "reviewing";
  return "coding";
});

const legacyDots = computed(() => style.value === "three-dots");

/**
 * The four #0833 styles render a square multicolor inline-SVG artwork that
 * fills the whole reserved slot, rather than the em-based CSS glyphs. The mark
 * therefore becomes square (`ai-art`) instead of the default 1.1em tall slot.
 */
const artStyle = computed(() => (isActivityAnimationArtStyle(style.value) ? style.value : null));

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
    ref="root"
    class="ai"
    :class="[
      size === 'md' ? 'ai-md' : 'ai-sm',
      `ai-${variant}`,
      legacyDots ? 'ai-legacy-dots' : 'ai-compact',
      !legacyDots && `ai-style-${style}`,
      !legacyDots && `ai-motion-${motion}`,
      !animate ? 'ai-motion-paused' : '',
      sized ? 'ai-sized' : '',
    ]"
    :style="sizeStyle"
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
    <span v-else-if="artStyle" class="ai-mark ai-art" aria-hidden="true">
      <RgbKeystormArt v-if="artStyle === 'rgb-keystorm'" />
      <WheelieCourierArt v-else-if="artStyle === 'wheelie-courier'" />
      <BooSwoopArt v-else-if="artStyle === 'boo-swoop'" />
      <PumpkinSpellArt v-else />
    </span>
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
    <span v-else-if="style === 'micro-dot-matrix'" class="ai-mark ai-matrix" aria-hidden="true">
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
    <span v-else-if="style === 'arcade-hopper'" class="ai-mark ai-hopper" aria-hidden="true">
      <i></i>
    </span>
    <span v-else-if="style === 'puppy-tracks'" class="ai-mark ai-paws" aria-hidden="true">
      <i></i>
      <i></i>
    </span>
    <span
      v-else-if="style === 'bird-quick-trail'"
      class="ai-mark ai-bird-quick quick"
      aria-hidden="true"
    >
      <span class="ai-bird-quick-stage">
        <span class="foot">
          <i class="toe l"></i><i class="toe"></i><i class="toe r"></i><i class="heel"></i>
        </span>
        <span class="foot second">
          <i class="toe l"></i><i class="toe"></i><i class="toe r"></i><i class="heel"></i>
        </span>
      </span>
    </span>
  </span>
</template>
