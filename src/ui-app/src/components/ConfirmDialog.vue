<script setup lang="ts">
/**
 * Shared body-teleported confirmation (#0641): the neutral `cc-modal` shell
 * parameterized by title and confirm label, for prompting before work is
 * discarded. Replaces the native `confirm()` the release-notes field used to
 * reach for — AGENTS.md bans native alert/confirm/prompt for app actions.
 *
 * The `ui/dialog/*` primitives stamp their `data-overlay-layer` id, so a
 * dialog opened over the release drawer is never click-transparent (#0575).
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
  /** Confirm button text; names the action ("Replace notes"). */
  confirmLabel: string;
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
      <DialogContent class="cc-modal">
        <div class="cc-modal-head">
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogClose class="close-x" aria-label="Close">×</DialogClose>
        </div>
        <DialogDescription class="cc-modal-desc"><slot /></DialogDescription>
        <div class="cc-modal-actions">
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="accent" @click="emit('confirm')">{{ confirmLabel }}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </Teleport>
</template>
