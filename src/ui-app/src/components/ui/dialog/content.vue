<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { DialogContent, type DialogContentProps } from "radix-vue";
import { cn } from "@/lib/utils";
import { landedInAnotherLayer, useOverlayLayerId } from "./layer";

interface Props extends DialogContentProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();
const layerId = useOverlayLayerId();

/**
 * Radix only skips dismissal for pointers inside another `[data-dismissable-layer]`;
 * hand-rolled teleported overlays are not in that registry, so a click on one
 * would read as "outside" and close the panel behind it (#0575). A click that
 * landed in *another* floating layer belongs to that layer.
 */
function onInteractOutside(event: Event): void {
  if (landedInAnotherLayer(event.target, layerId)) event.preventDefault();
}
</script>

<template>
  <DialogContent
    v-bind="props"
    :class="cn('drawer-wrap drawer', props.class)"
    :data-overlay-layer="layerId"
    @interact-outside="onInteractOutside"
  >
    <slot />
  </DialogContent>
</template>
