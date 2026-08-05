<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { SelectContent, SelectPortal, useForwardProps, type SelectContentProps } from "radix-vue";
import { cn } from "@/lib/utils";

interface Props extends SelectContentProps {
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
  <SelectPortal>
    <SelectContent
      v-bind="forwarded"
      :class="
        cn(
          'relative z-[120] max-h-96 min-w-[8rem] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--popover)] text-[var(--txt)] shadow-[0_18px_40px_rgba(0,0,0,.45)]',
          props.class,
        )
      "
    >
      <slot />
    </SelectContent>
  </SelectPortal>
</template>
