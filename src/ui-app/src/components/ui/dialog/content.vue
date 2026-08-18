<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { DialogContent, type DialogContentProps } from "radix-vue";
import { cn } from "@/lib/utils";

interface Props extends DialogContentProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();
</script>

<template>
  <DialogContent v-bind="props" :class="cn('drawer-wrap drawer', props.class)">
    <slot />
  </DialogContent>
</template>
