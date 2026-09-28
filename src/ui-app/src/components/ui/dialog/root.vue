<script setup lang="ts">
import { provide } from "vue";
import { DialogRoot, useForwardProps, type DialogRootProps } from "radix-vue";
import { newOverlayLayerId, OVERLAY_LAYER_KEY } from "./layer";

const props = defineProps<Omit<DialogRootProps, "open">>();
const model = defineModel<boolean>("open", { default: false });
const forwarded = useForwardProps(props);

// One id per dialog layer: its content and its scrim share it, so an outside
// interaction on the panel's own backdrop still dismisses this panel, while
// the same interaction on another layer's content or scrim does not (#0575).
provide(OVERLAY_LAYER_KEY, newOverlayLayerId());
</script>

<template>
  <DialogRoot v-bind="forwarded" :open="model" @update:open="model = $event">
    <slot />
  </DialogRoot>
</template>
