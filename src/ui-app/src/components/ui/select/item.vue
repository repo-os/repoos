<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import {
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  useForwardProps,
  type SelectItemProps,
} from "radix-vue";
import { Check } from "lucide-vue-next";
import { cn } from "@/lib/utils";

interface Props extends SelectItemProps {
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
  <SelectItem
    v-bind="forwarded"
    :class="
      cn(
        'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-[8px] py-[7px] pl-2 pr-8 text-[13px] text-[var(--txt)] outline-none focus:bg-[var(--cyan-dim)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        props.class,
      )
    "
  >
    <span class="absolute right-2 flex size-3.5 items-center justify-center">
      <SelectItemIndicator>
        <Check class="size-4 text-[var(--cyan)]" />
      </SelectItemIndicator>
    </span>
    <SelectItemText class="flex items-center gap-2">
      <slot />
    </SelectItemText>
  </SelectItem>
</template>
