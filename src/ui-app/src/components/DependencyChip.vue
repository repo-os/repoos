<script setup lang="ts">
import { computed } from "vue";
import { Archive, Ban, Lock } from "lucide-vue-next";
import type { DependencyBlocker } from "../types";
import { dependencyBlockerLabel } from "../lib/task-dependencies";

/**
 * Compact "depends on #id" marker: an icon for the blocker's state plus the
 * task id. The full sentence lives in the tooltip/aria-label. Renders a button
 * when `interactive` (task drawer), otherwise a plain span (board cards, whose
 * whole surface is already a click target).
 */
const props = defineProps<{ blocker: DependencyBlocker; interactive?: boolean }>();
defineEmits<{ (e: "open", id: string): void }>();

const icon = computed(() =>
  props.blocker.state === "cancelled" ? Ban : props.blocker.state === "archived" ? Archive : Lock,
);
const label = computed(() => dependencyBlockerLabel(props.blocker));
</script>

<template>
  <component
    :is="interactive ? 'button' : 'span'"
    :type="interactive ? 'button' : undefined"
    class="dep-chip"
    :class="[`dep-chip-${blocker.state}`, { 'dep-chip-btn': interactive }]"
    :title="label"
    :aria-label="label"
    @click="interactive && $emit('open', blocker.id)"
  >
    <component :is="icon" class="dep-chip-icon" aria-hidden="true" />#{{ blocker.id }}
  </component>
</template>
