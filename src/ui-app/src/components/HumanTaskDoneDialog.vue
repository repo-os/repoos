<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

const props = defineProps<{ open: boolean; busy?: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean]; confirm: [report: string] }>();
const report = ref("");
const textarea = ref<HTMLTextAreaElement>();
watch(() => props.open, async (open) => {
  if (open) {
    report.value = "";
    await nextTick();
    textarea.value?.focus();
  }
});
function submit(): void {
  emit("confirm", report.value);
}
</script>

<template>
  <Teleport to="body">
    <Dialog :open="open" @update:open="(value) => emit('update:open', value)">
      <DialogOverlay />
      <DialogContent class="cc-modal human-done-modal" @keydown="(event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); submit(); } }">
        <div class="cc-modal-head">
          <DialogTitle>Mark done</DialogTitle>
          <DialogClose class="close-x" aria-label="Close" :disabled="busy">×</DialogClose>
        </div>
        <DialogDescription class="cc-modal-desc">Record what you completed and observed. You can leave this blank.</DialogDescription>
        <div class="cc-modal-body">
          <div class="field">
            <label for="human-completion-report">Completion report (optional)</label>
            <textarea id="human-completion-report" ref="textarea" v-model="report" class="ff-textarea human-done-report" :disabled="busy" />
          </div>
        </div>
        <div class="cc-modal-actions">
          <DialogClose as-child><Button variant="outline" :disabled="busy">Cancel</Button></DialogClose>
          <Button variant="default" :disabled="busy" @click="submit">Mark done</Button>
        </div>
      </DialogContent>
    </Dialog>
  </Teleport>
</template>
