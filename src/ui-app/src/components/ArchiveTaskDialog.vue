<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

const props = defineProps<{
  open: boolean;
  task: { id: string; title: string } | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [detail: string];
}>();

// The reason is optional and local to this dialog: reset it every time the
// modal opens so a previous session's text never leaks into a fresh archive.
const detail = ref("");

watch(
  () => props.open,
  (open) => {
    if (open) detail.value = "";
  },
);

function confirm(): void {
  emit("confirm", detail.value.trim());
}
</script>

<template>
  <Teleport to="body">
    <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
      <DialogOverlay />
      <DialogContent class="delete-confirm-modal archive-confirm-modal">
        <div class="delete-confirm-head">
          <DialogTitle>Archive task?</DialogTitle>
          <DialogClose class="close-x" aria-label="Close" :disabled="busy">×</DialogClose>
        </div>
        <DialogDescription class="delete-confirm-desc">
          This parks <strong>#{{ task?.id }} {{ task?.title }}</strong> without changing its status,
          branch or worktree. It leaves the board and every automatic check, and you can restore it
          later from the Archived list.
        </DialogDescription>
        <div class="field archive-confirm-field">
          <label for="archive-detail">Why are you archiving this task?</label>
          <textarea
            id="archive-detail"
            v-model="detail"
            class="ff-textarea"
            rows="3"
            placeholder="Optional — a note for your future self"
            :disabled="busy"
          ></textarea>
        </div>
        <div class="delete-confirm-actions">
          <DialogClose as-child>
            <Button variant="outline" :disabled="busy">Cancel</Button>
          </DialogClose>
          <Button variant="default" :disabled="busy" @click="confirm">
            {{ busy ? "Archiving…" : "Archive task" }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </Teleport>
</template>
