<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { SelectViewport, useForwardProps, type SelectViewportProps } from "radix-vue";
import { cn } from "@/lib/utils";

interface Props extends SelectViewportProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();
const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;
  return delegated;
});
const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <SelectViewport v-bind="forwarded" :class="cn('p-1', props.class)">
    <slot />
  </SelectViewport>
</template>
