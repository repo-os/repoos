<script setup lang="ts">
/**
 * RGB keystorm (#0833) — a curved ergonomic keyboard with individually lit
 * keys in a moving cyan/pink/green/purple wave, four rounded typing fingers
 * alternating above it, and colored code glyphs streaming upward.
 *
 * Geometry is the approved 128×128 prototype, expressed as SVG paths so the
 * whole drawing scales with the reserved slot. Every color is a theme-aware
 * `--ai-art-*` token so nothing is hard-coded to one appearance.
 */
const KEY_COLORS = ["cyan", "pink", "green", "purple"] as const;

interface Key {
  cx: number;
  cy: number;
  color: string;
  delay: string;
}

/** 3 rows × 8 columns, staggered; the wave lags each key by (col·0.8 + row)/7 s. */
const KEYS: Key[] = (() => {
  const keys: Key[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      keys.push({
        cx: 27 + col * 10.5 + (row % 2) * 2,
        cy: 88 + row * 6,
        color: KEY_COLORS[(col + row) % 4]!,
        delay: `${((col * 0.8 + row) / 7).toFixed(3)}s`,
      });
    }
  }
  return keys;
})();

interface Finger {
  x: number;
  color: string;
  delay: string;
}

const FINGERS: Finger[] = [0, 1, 2, 3].map((i) => ({
  x: 37 + i * 18,
  color: i % 2 ? "pink" : "cyan",
  delay: `${((i * 1.6) / 11).toFixed(3)}s`,
}));

const fingerPath = (x: number): string =>
  `M${x - 5},78 C${x - 10},54 ${x - 5},46 ${x},47 C${x + 8},48 ${x + 5},64 ${x + 5},78 Z`;

const GLYPH_COLORS = ["cyan", "pink", "green"] as const;
const GLYPHS = [0, 1, 2, 3, 4, 5].map((i) => ({
  x: 14 + i * 18 - 5,
  text: i % 2 ? "01" : "<>",
  color: GLYPH_COLORS[i % 3]!,
  delay: `${(-i * 0.278).toFixed(3)}s`,
}));
</script>

<template>
  <svg
    class="ai-art-svg"
    viewBox="0 0 128 128"
    role="img"
    aria-hidden="true"
    focusable="false"
    data-contrast-ok
  >
    <!-- streaming code, drawn behind the keyboard -->
    <text
      v-for="(glyph, i) in GLYPHS"
      :key="`glyph-${i}`"
      class="ai-code-glyph"
      :x="glyph.x"
      y="85"
      :style="{ fill: `var(--ai-art-${glyph.color})`, animationDelay: glyph.delay }"
    >
      {{ glyph.text }}
    </text>

    <!-- keyboard body -->
    <path
      class="ai-kbd-rim"
      d="M20,83 Q64,72 108,83 L116,104 Q64,115 12,104 Z"
      :style="{ fill: 'var(--ai-art-edge)' }"
    />
    <path
      class="ai-kbd-plate"
      d="M23,86 Q64,77 105,86 L110,100 Q64,109 18,100 Z"
      :style="{ fill: 'var(--ai-art-plate)' }"
    />
    <ellipse
      v-for="(key, i) in KEYS"
      :key="`key-${i}`"
      class="ai-key"
      :cx="key.cx"
      :cy="key.cy"
      rx="3.4"
      ry="1.9"
      :style="{ fill: `var(--ai-art-${key.color})`, animationDelay: key.delay }"
    />
    <path class="ai-kbd-underline" d="M47,105 L80,105" :style="{ stroke: 'var(--ai-art-cyan)' }" />

    <!-- typing fingers (path + rounded tip move together) -->
    <g
      v-for="(finger, i) in FINGERS"
      :key="`finger-${i}`"
      class="ai-finger"
      :style="{ animationDelay: finger.delay }"
    >
      <path :d="fingerPath(finger.x)" :style="{ fill: `var(--ai-art-${finger.color})` }" />
      <ellipse :cx="finger.x" cy="54" rx="2" ry="4" :style="{ fill: 'var(--ai-art-line)' }" />
    </g>
  </svg>
</template>
