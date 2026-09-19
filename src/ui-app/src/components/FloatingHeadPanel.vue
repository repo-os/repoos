<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import Dialog from "./ui/dialog/root.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import { useUiStore } from "../stores/ui";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    description?: string;
    class?: HTMLAttributes["class"];
  }>(),
  {
    title: undefined,
    description: undefined,
    class: undefined,
  },
);

const emit = defineEmits<{ close: [] }>();
const ui = useUiStore();

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen) emit("close");
}
</script>

<template>
  <Dialog :open="props.open" @update:open="handleOpenChange">
    <DialogOverlay />
    <DialogContent
      :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
      :class="props.class"
    >
      <DialogTitle v-if="props.title" class="sr-only">{{ props.title }}</DialogTitle>
      <DialogDescription v-if="props.description ?? props.title" class="sr-only">
        {{ props.description ?? props.title }}
      </DialogDescription>
      <slot />
    </DialogContent>
  </Dialog>
</template>
