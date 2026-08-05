<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { DialogClose, type DialogCloseProps } from "radix-vue";
import { cn } from "@/lib/utils";

interface Props extends DialogCloseProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();
</script>

<template>
  <DialogClose v-bind="props" :class="cn(props.class)">
    <slot />
  </DialogClose>
</template>
