<script setup lang="ts">
import { Check } from "lucide-vue-next";
import { CheckboxIndicator, CheckboxRoot } from "radix-vue";
import { cn } from "@/lib/utils";

defineProps<{ checked?: boolean; class?: string }>();
const emit = defineEmits<{ "update:checked": [value: boolean] }>();
</script>

<template>
  <CheckboxRoot
    :checked="checked"
    :class="
      cn(
        'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-[var(--border-bright)] bg-[var(--bg-secondary)] text-[var(--txt)] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--txt-faint)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--txt)] data-[state=checked]:bg-[var(--txt)] data-[state=checked]:text-[var(--bg)]',
        $props.class,
      )
    "
    @update:checked="(value) => emit('update:checked', value)"
  >
    <CheckboxIndicator><Check class="size-3" :stroke-width="3" /></CheckboxIndicator>
  </CheckboxRoot>
</template>
