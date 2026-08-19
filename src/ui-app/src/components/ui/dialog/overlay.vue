<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { DialogOverlay, type DialogOverlayProps } from "radix-vue";
import { cn } from "@/lib/utils";

interface Props extends DialogOverlayProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();
</script>

<template>
  <DialogOverlay v-bind="props" :class="cn('overlay', props.class)" />
</template>
