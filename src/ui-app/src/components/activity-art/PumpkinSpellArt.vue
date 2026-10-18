<script setup lang="ts">
/**
 * Pumpkin spell (#0833) — a lobed orange jack-o'-lantern with rib details,
 * carved glowing eyes / grin, and a curved floppy purple witch hat with a green
 * band. The pumpkin bounces and rocks, its eyes glow gently, and multicolored
 * sparks rise around it (no rapid strobing).
 *
 * Geometry is the approved 128×128 prototype. The carved features and ribs use
 * the dark `--ai-art-ink` detail token in both themes so the face stays legible.
 */
const SPARKS = [0, 1, 2, 3, 4].map((i) => ({
  x: 20 + i * 22,
  color: i % 2 ? "green" : "orange",
  rise: `${(-i * 0.286).toFixed(3)}s`,
  sway: `${(-i * 0.42).toFixed(3)}s`,
}));

// Two fluted ribs on the outer lobes, stroked as ellipse arcs (99° → 261°).
const RIB_LEFT = "M-20.72,30.67 A11,27 0 0 1 -20.72,-22.67";
const RIB_RIGHT = "M17.28,30.67 A11,27 0 0 1 17.28,-22.67";
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
    <!-- rising multicolored sparks (behind the pumpkin) -->
    <g v-for="(spark, i) in SPARKS" :key="`spark-${i}`" :transform="`translate(${spark.x},110)`">
      <g class="ai-spark-sway" :style="{ animationDelay: spark.sway }">
        <g class="ai-spark-rise" :style="{ animationDelay: spark.rise }">
          <path
            class="ai-line"
            d="M-2,0 H2 M0,-2 V2"
            :style="{ stroke: `var(--ai-art-${spark.color})`, strokeWidth: 2 }"
          />
        </g>
      </g>
    </g>

    <g transform="translate(64,76)">
      <g class="ai-pumpkin-bounce">
        <g class="ai-pumpkin-rock">
          <!-- lobed body -->
          <ellipse cx="-17" cy="4" rx="24" ry="28" :style="{ fill: 'var(--ai-art-orange)' }" />
          <ellipse cx="17" cy="4" rx="24" ry="28" :style="{ fill: 'var(--ai-art-orange)' }" />
          <ellipse cx="0" cy="4" rx="24" ry="30" :style="{ fill: 'var(--ai-art-orange)' }" />

          <!-- rib detail -->
          <g class="ai-pumpkin-ribs" :style="{ stroke: 'var(--ai-art-ink)', strokeWidth: 2 }">
            <path :d="RIB_LEFT" />
            <path :d="RIB_RIGHT" />
          </g>

          <!-- carved face -->
          <path d="M-26,0 Q-17,-15 -8,-3 L-17,3 Z" :style="{ fill: 'var(--ai-art-ink)' }" />
          <path d="M8,-3 Q17,-15 26,0 L17,3 Z" :style="{ fill: 'var(--ai-art-ink)' }" />
          <path
            d="M-26,12 Q0,38 26,12 L13,18 L9,11 L2,21 L-4,14 L-12,21 Z"
            :style="{ fill: 'var(--ai-art-ink)' }"
          />
          <g class="ai-pumpkin-glow" :style="{ fill: 'var(--ai-art-green)' }">
            <ellipse cx="-17" cy="-2" rx="3" ry="2" />
            <ellipse cx="17" cy="-2" rx="3" ry="2" />
          </g>

          <!-- floppy witch hat + band -->
          <path
            d="M-30,-18 Q-14,-29 -8,-61 C6,-54 7,-73 23,-56 Q8,-58 20,-23 Q36,-20 30,-15 Q0,-9 -30,-18"
            :style="{ fill: 'var(--ai-art-purple)' }"
          />
          <path
            class="ai-line"
            d="M-16,-27 L18,-24"
            :style="{ stroke: 'var(--ai-art-green)', strokeWidth: 5 }"
          />
        </g>
      </g>
    </g>
  </svg>
</template>
