<script setup lang="ts">
/**
 * The shared hotfix badge (#0644) — a red pill reading `HOTFIX · BRANCH` or
 * `HOTFIX · MAIN`. `main` is the riskier variant and reads louder. Used on
 * both the board card and the task drawer so the two surfaces can't drift.
 *
 * `title`/`data-tip` is picked up by the global tooltip (`lib/tooltip.ts`),
 * which shows on hover AND keyboard focus; the native browser bubble never
 * appears. Keep the element focusable so keyboard users get the explanation.
 */
import { computed } from "vue";
import { hotfixBadgeLabel, hotfixTooltip, type HotfixTarget } from "../lib/hotfix";

const props = defineProps<{
  target?: HotfixTarget | null;
  branch?: string | null;
}>();

const label = computed(() => hotfixBadgeLabel(props.target));
const tip = computed(() => hotfixTooltip(props.target, props.branch));
</script>

<template>
  <span
    class="hotfix-badge"
    :class="{ 'hotfix-badge--main': target === 'main' }"
    tabindex="0"
    :aria-label="`${label}. ${tip}`"
    :data-tip="tip"
    >{{ label }}</span
  >
</template>
