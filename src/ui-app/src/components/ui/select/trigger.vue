<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { SelectIcon, SelectTrigger, useForwardProps, type SelectTriggerProps } from "radix-vue";
import { ChevronDown } from "lucide-vue-next";
import { cn } from "@/lib/utils";

interface Props extends SelectTriggerProps {
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
  <SelectTrigger
    v-bind="forwarded"
    :class="
      cn(
        'flex h-10 w-full items-center justify-between gap-2 whitespace-nowrap rounded-[10px] border border-[var(--border)] bg-[var(--panel-solid)] px-3 py-2 text-[13px] text-[var(--txt)] focus-visible:border-[var(--border-bright)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
        props.class,
      )
    "
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="size-4 shrink-0 opacity-60" />
    </SelectIcon>
  </SelectTrigger>
</template>
