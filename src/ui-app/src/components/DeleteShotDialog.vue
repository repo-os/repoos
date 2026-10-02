<script setup lang="ts">
/**
 * Confirm dialog for deleting one captured shot from the task drawer (#0627).
 * Shared dialog components (body-teleported), never a native `confirm()` —
 * same shape as DeleteTaskDialog's confirm. The warning about the synced
 * declaration is stated up front because it is the non-obvious part: deleting
 * also removes the matching `## Shots` entry, so a re-handoff cannot
 * resurrect the deleted evidence.
 */
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import Button from "./ui/button.vue";
import type { ShotMeta } from "../types";

defineProps<{
  open: boolean;
  /** The shot being deleted, or null while closed. */
  shot: ShotMeta | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "confirm"): void;
}>();
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogOverlay />
    <DialogContent class="shot-delete-modal">
      <div class="shot-delete-head">
        <DialogTitle>Delete shot</DialogTitle>
        <DialogClose class="close-x" aria-label="Close" :disabled="busy">
          <span aria-hidden="true">×</span>
        </DialogClose>
      </div>
      <DialogDescription class="shot-delete-desc">
        Delete <strong>{{ shot?.label || shot?.name || "this shot" }}</strong
        >? The image and its manifest entry are removed.
        <template v-if="shot?.label">
          The matching <code>## Shots</code> declaration is removed too, so the next handoff capture
          cannot resurrect it.
        </template>
      </DialogDescription>
      <div class="shot-delete-actions">
        <DialogClose as-child>
          <Button variant="outline" :disabled="busy">Cancel</Button>
        </DialogClose>
        <Button variant="destructive" :disabled="busy" @click="emit('confirm')">
          {{ busy ? "Deleting…" : "Delete shot" }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
