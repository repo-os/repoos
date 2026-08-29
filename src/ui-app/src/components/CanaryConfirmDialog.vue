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
  busy?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();

function onConfirm(): void {
  emit("confirm");
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogOverlay />
    <DialogContent class="cc-modal">
      <div class="cc-modal-head">
        <DialogTitle>Run the canary flow test?</DialogTitle>
        <DialogClose class="close-x" aria-label="Close" :disabled="busy">
          <span aria-hidden="true">×</span>
        </DialogClose>
      </div>
      <DialogDescription class="cc-modal-desc">
        Clicking the canary starts a <strong>real, billed agent run</strong> — it is not
        preview-only.
      </DialogDescription>
      <div class="cc-modal-body">
        <p>
          The canary task is deliberately trivial: it walks
          <code>draft → inbox → ready → active → review → merge → done</code>.
        </p>
        <p>
          The only change is a <strong>one-line diff</strong> to <code>src/core/canary.ts</code>:
          increment <code>CANARY_COUNTER</code> by 1 (wrapping 9 → 0) — nothing else, no
          tests/comments, and <code>CANARY_PROMPT</code> itself stays untouched.
        </p>
      </div>
      <div class="cc-modal-actions">
        <DialogClose as-child>
          <Button variant="outline" :disabled="busy">Cancel</Button>
        </DialogClose>
        <Button variant="accent" :disabled="busy" @click="onConfirm">
          {{ busy ? "Creating…" : "Create canary task" }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
