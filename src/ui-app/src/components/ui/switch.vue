<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { SwitchRoot, SwitchThumb } from "radix-vue";
import { cn } from "@/lib/utils";

interface Props {
  checked?: boolean;
  disabled?: boolean;
  class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<Props>(), { checked: false, disabled: false });
const emits = defineEmits<{ "update:checked": [value: boolean] }>();
</script>

<template>
  <SwitchRoot
    :checked="props.checked"
    :disabled="props.disabled"
    :class="
      cn(
        'inline-flex h-[22px] w-10 shrink-0 cursor-pointer items-center rounded-full border border-[var(--border)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-bright)] disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-[var(--cyan)] data-[state=checked]:bg-[var(--cyan-dim)]',
        props.class,
      )
    "
    @update:checked="(v) => emits('update:checked', v)"
  >
    <SwitchThumb
      :class="
        cn(
          'pointer-events-none block size-4 rounded-full bg-[var(--txt-faint)] transition-transform duration-200',
          'data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-[var(--cyan)]',
        )
      "
    />
  </SwitchRoot>
</template>
