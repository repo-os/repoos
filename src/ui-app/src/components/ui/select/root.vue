<script setup lang="ts">
import { SelectRoot, useForwardProps, type SelectRootProps } from "radix-vue";

const props = defineProps<Omit<SelectRootProps, "modelValue">>();
const model = defineModel<string>();
const forwarded = useForwardProps(props);
</script>

<template>
  <SelectRoot v-bind="forwarded" :model-value="model" @update:model-value="model = $event">
    <slot />
  </SelectRoot>
</template>
