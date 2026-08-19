<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { DialogDescription, type DialogDescriptionProps } from "radix-vue";
import { cn } from "@/lib/utils";

interface Props extends DialogDescriptionProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();
</script>

<template>
  <DialogDescription v-bind="props" :class="cn('text-[var(--txt-dim)]', props.class)">
    <slot />
  </DialogDescription>
</template>
