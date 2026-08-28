<script setup lang="ts">
import { ref } from "vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import Button from "./ui/button.vue";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
  cancel: [];
}>();

function onClose(): void {
  emit("update:open", false);
}

function onConfirm(): void {
  emit("update:open", false);
  emit("confirm");
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogOverlay />
    <DialogContent class="stop-work-modal">
      <div class="stop-work-modal-head">
        <div class="stop-work-modal-head-text">
          <DialogTitle>Confirm Stop Work</DialogTitle>
          <DialogDescription class="sr-only">
            Confirm stopping work on this task
          </DialogDescription>
        </div>
        <DialogClose class="close-x" @click="onClose">
          <svg class="size-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 6L6 18M6 6l12 12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </DialogClose>
      </div>
      
      <div class="stop-work-modal-body">
        <p class="stop-work-modal-message">
          Stop this task's current work and send it back to ready? 
          The worktree is kept, not deleted.
        </p>
        
        <div class="stop-work-modal-actions">
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            @click="onClose"
          >
            Cancel
          </Button>
          <Button 
            type="button" 
            variant="destructive" 
            size="sm" 
            @click="onConfirm"
          >
            Stop Work
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.stop-work-modal {
  width: min(400px, 90vw);
  max-width: 90vw;
  background: var(--panel-solid);
  border: 1px solid var(--border-bright);
  border-radius: 16px;
  padding: 0;
  box-shadow: var(--drawer-shadow);
  animation: slideIn .2s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.stop-work-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border);
}

.stop-work-modal-head-text h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--txt);
  margin: 0;
}

.stop-work-modal-body {
  padding: 22px;
}

.stop-work-modal-message {
  font-size: 13px;
  line-height: 1.55;
  color: var(--txt-dim);
  margin: 0 0 20px;
}

.stop-work-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>