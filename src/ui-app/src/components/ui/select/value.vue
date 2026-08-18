<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { SelectValue, useForwardProps, type SelectValueProps } from "radix-vue";
import { cn } from "@/lib/utils";

interface Props extends SelectValueProps {
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
  <SelectValue v-bind="forwarded" :class="cn('text-[var(--txt)]', props.class)">
    <slot />
  </SelectValue>
</template>
