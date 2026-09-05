<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import Button from "./ui/button.vue";
import VoiceDictate from "./VoiceDictate.vue";
import { insertTextAtCursor } from "../utils/text-insertion";

const props = defineProps<{
  open: boolean;
  body: string;
}>();
const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "save", body: string): void;
}>();

const text = ref(props.body);
const editEl = ref<HTMLTextAreaElement | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    text.value = props.body;
    nextTick(() => editEl.value?.focus());
  },
);

function onTranscribed(textChunk: string): void {
  if (editEl.value) insertTextAtCursor(editEl.value, textChunk);
}

function cancel(): void {
  emit("update:open", false);
}

function save(): void {
  emit("save", text.value);
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogOverlay />
    <DialogContent class="sm-modal">
      <div class="sm-modal-head">
        <div class="sm-modal-head-text">
          <DialogTitle>Edit spec</DialogTitle>
          <DialogDescription class="sm-modal-desc">
            Edit the spec markdown below. Save applies your changes to the spec.
          </DialogDescription>
        </div>
        <DialogClose class="close-x" aria-label="Close">
          <span aria-hidden="true">×</span>
        </DialogClose>
      </div>
      <div class="sm-modal-body">
        <div class="sm-modal-editor">
          <div class="sm-modal-editor-head">
            <span class="sm-modal-label">Spec markdown</span>
            <VoiceDictate @transcribed="onTranscribed" />
          </div>
          <textarea
            ref="editEl"
            class="sm-modal-textarea"
            v-model="text"
            rows="12"
            placeholder="Markdown body"
          ></textarea>
        </div>
      </div>
      <div class="sm-modal-actions">
        <DialogClose as-child>
          <Button variant="outline" @click="cancel">Cancel</Button>
        </DialogClose>
        <Button variant="default" @click="save">Save</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
