<script setup lang="ts">
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

defineProps<{
  open: boolean;
  task: { id: string; title: string } | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();
</script>

<template>
  <Teleport to="body">
    <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
      <DialogOverlay />
      <DialogContent class="delete-confirm-modal">
        <div class="delete-confirm-head">
          <DialogTitle>Delete task?</DialogTitle>
          <DialogClose class="close-x" aria-label="Close" :disabled="busy">×</DialogClose>
        </div>
        <DialogDescription class="delete-confirm-desc">
          This will permanently remove
          <strong>#{{ task?.id }} {{ task?.title }}</strong
          >. Committed changes remain recoverable from git, but uncommitted work will be lost.
        </DialogDescription>
        <div class="delete-confirm-actions">
          <DialogClose as-child>
            <Button variant="outline" :disabled="busy">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" :disabled="busy" @click="emit('confirm')">
            {{ busy ? "Deleting…" : "Delete task" }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </Teleport>
</template>
