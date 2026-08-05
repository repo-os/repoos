<script setup lang="ts">
import { DialogRoot, useForwardProps, type DialogRootProps } from "radix-vue";

const props = defineProps<Omit<DialogRootProps, "open">>();
const model = defineModel<boolean>("open", { default: false });
const forwarded = useForwardProps(props);
</script>

<template>
  <DialogRoot v-bind="forwarded" :open="model" @update:open="model = $event">
    <slot />
  </DialogRoot>
</template>
