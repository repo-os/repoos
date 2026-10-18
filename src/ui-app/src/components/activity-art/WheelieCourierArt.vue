<script setup lang="ts">
/**
 * Wheelie courier (#0833) — a recognizable motorcycle and crouched helmeted
 * rider: curved fuel tank, bent limbs, two spinning spoked wheels, suspension
 * bounce, streaming road marks and exhaust. The front wheel rises and settles
 * in repeated controlled wheelies while the scarf ripples behind.
 *
 * Geometry is the approved 128×128 prototype. Colors are theme-aware
 * `--ai-art-*` tokens; the rider/bike proportions and curves are preserved.
 */
const WHEEL_X = [28, 101];

const WHEELS = WHEEL_X.map((x) => ({
  x,
  transform: `translate(${x},94)`,
}));

/** Road marks streak left; a 111px sweep + opacity ends hides the wrap. */
const ROAD = [0, 1, 2].map((i) => ({
  x: 8 + i * 37,
  y: 111 + i * 3,
  delay: `${(-i * 0.4).toFixed(2)}s`,
}));

const EXHAUST = [0, 1, 2].map((i) => ({ delay: `${(-i * 0.33).toFixed(2)}s` }));
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
    <!-- streaming road marks -->
    <g class="ai-road">
      <line
        v-for="(m, i) in ROAD"
        :key="`road-${i}`"
        class="ai-road-mark"
        :x1="m.x"
        :y1="m.y"
        :x2="m.x + 14"
        :y2="m.y"
        :style="{ stroke: 'var(--ai-art-edge)', animationDelay: m.delay }"
      />
    </g>

    <g class="ai-bike-susp">
      <g transform="translate(28,93)">
        <g class="ai-bike-wheelie">
          <g transform="translate(-28,-93)">
            <!-- spinning spoked wheels -->
            <g v-for="(wheel, i) in WHEELS" :key="`wheel-${i}`" :transform="wheel.transform">
              <circle r="15" :style="{ fill: 'var(--ai-art-edge)' }" />
              <circle r="11" :style="{ fill: 'var(--ai-art-plate)' }" />
              <g class="ai-wheel-spokes" :style="{ stroke: 'var(--ai-art-line)' }">
                <line x1="0" y1="0" x2="10" y2="0" />
                <line x1="0" y1="0" x2="-5" y2="8.66" />
                <line x1="0" y1="0" x2="-5" y2="-8.66" />
              </g>
              <circle r="3" :style="{ fill: 'var(--ai-art-orange)' }" />
            </g>

            <!-- frame, tank and tail -->
            <path
              class="ai-line"
              d="M28,94 L52,73 L72,91 L28,94"
              :style="{ stroke: 'var(--ai-art-orange)', strokeWidth: 4 }"
            />
            <path
              class="ai-line"
              d="M72,91 L87,64 L101,94"
              :style="{ stroke: 'var(--ai-art-cyan)', strokeWidth: 4 }"
            />
            <path
              class="ai-line"
              d="M86,64 L93,61 L99,64"
              :style="{ stroke: 'var(--ai-art-line)', strokeWidth: 3 }"
            />
            <path
              d="M49,69 C55,51 77,53 80,67 Q66,75 49,69 Z"
              :style="{ fill: 'var(--ai-art-cyan)' }"
            />
            <path
              class="ai-line"
              d="M35,70 L51,70"
              :style="{ stroke: 'var(--ai-art-line)', strokeWidth: 5 }"
            />
            <ellipse cx="61" cy="85" rx="10" ry="8" :style="{ fill: 'var(--ai-art-edge)' }" />
            <path
              class="ai-line"
              d="M38,94 L64,96"
              :style="{ stroke: 'var(--ai-art-line)', strokeWidth: 3 }"
            />

            <!-- bent legs, arms and tucked torso -->
            <path
              class="ai-line"
              d="M51,55 L48,74 L67,87 L73,86"
              :style="{ stroke: 'var(--ai-art-purple)', strokeWidth: 7 }"
            />
            <path
              class="ai-line"
              d="M52,56 L69,43 L82,63 L91,65"
              :style="{ stroke: 'var(--ai-art-pink)', strokeWidth: 6 }"
            />
            <path
              class="ai-line"
              d="M49,57 L64,41"
              :style="{ stroke: 'var(--ai-art-purple)', strokeWidth: 13 }"
            />

            <!-- helmet + visor -->
            <circle
              cx="72"
              cy="30"
              r="12"
              :style="{
                fill: 'var(--ai-art-pale)',
                stroke: 'var(--ai-art-edge)',
                strokeWidth: 1.4,
              }"
            />
            <path d="M71,24 Q85,22 84,32 L72,34 Z" :style="{ fill: 'var(--ai-art-ink)' }" />

            <!-- rippling scarf -->
            <g class="ai-scarf">
              <path
                d="M62,37 C48,31 38,43 25,31 Q41,48 64,43 Z"
                :style="{ fill: 'var(--ai-art-pink)' }"
              />
            </g>
          </g>
        </g>
      </g>
    </g>

    <!-- exhaust puffs -->
    <g class="ai-exhaust">
      <g v-for="(puff, i) in EXHAUST" :key="`puff-${i}`" transform="translate(17,91)">
        <circle
          class="ai-exhaust-puff"
          cx="0"
          cy="0"
          r="2"
          :style="{ fill: 'var(--ai-art-edge)', animationDelay: puff.delay }"
        />
      </g>
    </g>
  </svg>
</template>
