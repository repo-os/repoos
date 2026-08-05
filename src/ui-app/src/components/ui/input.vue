<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface Props {
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();
const model = defineModel<string | number>();
</script>

<template>
  <input
    v-model="model"
    :class="
      cn(
        'w-full rounded-[10px] border border-[var(--border)] bg-[var(--panel-solid)] px-3 py-[10px] text-[13px] text-[var(--txt)] transition-colors placeholder:text-[var(--txt-faint)] focus-visible:border-[var(--border-bright)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  />
</template>
