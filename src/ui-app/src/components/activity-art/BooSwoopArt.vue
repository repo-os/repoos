<script setup lang="ts">
/**
 * Boo swoop (#0833) — a rounded pale ghost swoops and banks, with independently
 * waving arms, a continuously rippling ragged hem, dark oval eyes / open mouth,
 * pink cheeks, and three small colorful wisps circling around it.
 *
 * Geometry is the approved 128×128 prototype. Body, arms and hem share the pale
 * `--ai-art-pale` fill (outlined for legibility on both themes); the wisps use
 * cyan / pink / purple tokens so the multicolor relationship is preserved.
 */
const WISPS = [
  { color: "pink", delay: "0s" },
  { color: "cyan", delay: "-1.05s" },
  { color: "purple", delay: "-2.1s" },
];

/**
 * The body is drawn with a smooth bottom; four overlapping flaps below it form
 * the ragged hem and bob out of phase, so the edge visibly ripples.
 */
const BODY = "M-30,22 C-36,-10 -24,-42 0,-42 C26,-43 37,-16 29,22 Q0,33 -30,22 Z";

const FLAPS = [
  { x: -22, delay: "0s" },
  { x: -7.5, delay: "-0.22s" },
  { x: 7.5, delay: "-0.45s" },
  { x: 22, delay: "-0.67s" },
].map((f) => ({ ...f, d: `M${f.x - 8},15 Q${f.x},35 ${f.x + 8},15 Z` }));

// Arms are re-based to their shoulders so a rotation pivots at the joint.
const LEFT_ARM = "M0,0 Q-22,1 -19,17 Q-12,25 2,14 Z";
const RIGHT_ARM = "M0,0 Q23,-12 18,6 Q13,17 -2,14 Z";
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
    <!-- orbiting wisps (elliptical orbit: 44 × 39) -->
    <g v-for="(wisp, i) in WISPS" :key="`wisp-${i}`" transform="translate(64,65) scale(1,0.886)">
      <g class="ai-wisp" :style="{ animationDelay: wisp.delay }">
        <circle cx="44" cy="0" r="2.5" :style="{ fill: `var(--ai-art-${wisp.color})` }" />
      </g>
    </g>

    <g transform="translate(64,65)">
      <g class="ai-ghost-sway-x">
        <g class="ai-ghost-sway-y">
          <g class="ai-ghost-bank">
            <path
              :d="BODY"
              :style="{
                fill: 'var(--ai-art-pale)',
                stroke: 'var(--ai-art-edge)',
                strokeWidth: 1.4,
              }"
            />

            <!-- rippling ragged hem -->
            <path
              v-for="(flap, i) in FLAPS"
              :key="`hem-${i}`"
              class="ai-hem"
              :d="flap.d"
              :style="{ fill: 'var(--ai-art-pale)', animationDelay: flap.delay }"
            />

            <!-- independently waving arms -->
            <g transform="translate(-24,-9)">
              <path
                class="ai-ghost-arm left"
                :d="LEFT_ARM"
                :style="{ fill: 'var(--ai-art-pale)' }"
              />
            </g>
            <g transform="translate(25,-9)">
              <path
                class="ai-ghost-arm right"
                :d="RIGHT_ARM"
                :style="{ fill: 'var(--ai-art-pale)' }"
              />
            </g>

            <!-- face: dark oval eyes, open mouth, pink cheeks -->
            <ellipse cx="-11" cy="-12" rx="5" ry="8" :style="{ fill: 'var(--ai-art-ink)' }" />
            <ellipse cx="11" cy="-12" rx="5" ry="8" :style="{ fill: 'var(--ai-art-ink)' }" />
            <ellipse cx="0" cy="6" rx="6" ry="8" :style="{ fill: 'var(--ai-art-ink)' }" />
            <ellipse cx="-20" cy="0" rx="5" ry="3" :style="{ fill: 'var(--ai-art-pink)' }" />
            <ellipse cx="20" cy="0" rx="5" ry="3" :style="{ fill: 'var(--ai-art-pink)' }" />
          </g>
        </g>
      </g>
    </g>
  </svg>
</template>
