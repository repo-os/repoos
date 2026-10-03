<script setup lang="ts">
/**
 * Shared destructive-action confirmation (#0634): the same body-teleported
 * `ui/dialog/*` shell `DeleteTaskDialog` uses — title, description slot,
 * Cancel + destructive confirm, busy/disabled while the request runs —
 * parameterized so the input and story panels don't copy-paste a third modal.
 * Copy stays specific to the caller via the title, confirm label and slot.
 *
 * #0575 layer marking is handled by the shared primitives themselves: both
 * `DialogContent` and `DialogOverlay` stamp their dialog's id as
 * `data-overlay-layer`, so this teleport is never click-transparent — asserted
 * in tests/input-story-delete-ui.test.ts.
 */
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

defineProps<{
  open: boolean;
  title: string;
  busy?: boolean;
  /** Button text while idle; a leading "Delete …" names the action. */
  confirmLabel?: string;
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
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogClose class="close-x" aria-label="Close" :disabled="busy">×</DialogClose>
        </div>
        <DialogDescription class="delete-confirm-desc"><slot /></DialogDescription>
        <div class="delete-confirm-actions">
          <DialogClose as-child>
            <Button variant="outline" :disabled="busy">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" :disabled="busy" @click="emit('confirm')">
            {{ busy ? "Deleting…" : (confirmLabel ?? "Delete") }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </Teleport>
</template>
