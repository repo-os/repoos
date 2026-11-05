<script setup lang="ts">
import { ref, watch } from "vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import Button from "./ui/button.vue";

const props = defineProps<{ open: boolean; busy?: boolean }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  hold: [value: { reason?: string; until?: string }];
}>();
const reason = ref("");
const until = ref("");
watch(
  () => props.open,
  (open) => {
    if (open) {
      reason.value = "";
      until.value = "";
    }
  },
);
function submit(): void {
  const clean = reason.value.trim();
  emit("hold", {
    ...(clean ? { reason: clean } : {}),
    ...(until.value ? { until: new Date(`${until.value}T23:59:59`).toISOString() } : {}),
  });
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogOverlay />
    <DialogContent class="cc-modal">
      <div class="cc-modal-head">
        <DialogTitle>Hold task</DialogTitle>
        <DialogClose class="close-x" aria-label="Close" :disabled="busy">×</DialogClose>
      </div>
      <DialogDescription class="cc-modal-desc"
        >Automation will not start this task while the hold is active.</DialogDescription
      >
      <div class="cc-modal-body">
        <div class="field hold-dialog-field">
          <label for="hold-reason">Reason <span class="field-optional">(optional)</span></label>
          <textarea
            id="hold-reason"
            v-model="reason"
            class="ff-textarea hold-dialog-reason"
            maxlength="1000"
            placeholder="Why should this task stay parked?"
            :disabled="busy"
          />
        </div>
        <div class="field hold-dialog-field">
          <label for="hold-until"
            >Auto-release date <span class="field-optional">(optional)</span></label
          >
          <input id="hold-until" v-model="until" type="date" :disabled="busy" />
        </div>
      </div>
      <div class="cc-modal-actions">
        <DialogClose as-child
          ><Button variant="outline" :disabled="busy">Cancel</Button></DialogClose
        >
        <Button variant="default" :disabled="busy" @click="submit">{{
          busy ? "Holding…" : "Hold task"
        }}</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
