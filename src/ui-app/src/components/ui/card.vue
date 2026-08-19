<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface Props {
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();
</script>

<template>
  <div
    :class="
      cn(
        'relative overflow-hidden rounded-[15px] border border-[var(--border)] bg-[var(--panel)] text-[var(--txt)] backdrop-blur-[14px]',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
