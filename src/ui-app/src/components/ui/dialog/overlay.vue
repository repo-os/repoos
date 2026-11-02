<script setup lang="ts">
import { useAttrs, type HTMLAttributes } from "vue";
import { DialogOverlay, DialogPortal, type DialogOverlayProps } from "radix-vue";
import { cn } from "@/lib/utils";
import { useOverlayLayerId } from "./layer";

interface Props extends DialogOverlayProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();
defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
// The scrim shares its dialog's layer id (#0575): it is *this* panel's own
// dismiss target, not another layer's.
const layerId = useOverlayLayerId();
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      v-bind="{ ...attrs, ...props }"
      :class="cn('overlay', props.class)"
      :data-overlay-layer="layerId"
    />
  </DialogPortal>
</template>
