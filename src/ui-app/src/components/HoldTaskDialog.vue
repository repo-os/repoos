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
  hold: [value: { reason: string; until?: string }];
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
  if (!clean) return;
  emit("hold", {
    reason: clean,
    ...(until.value ? { until: new Date(`${until.value}T23:59:59`).toISOString() } : {}),
  });
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogOverlay />
    <DialogContent class="cc-modal">
      <div class="flex items-center justify-between gap-3">
        <DialogTitle>Hold task</DialogTitle>
        <DialogClose class="close-x" aria-label="Close" :disabled="busy">×</DialogClose>
      </div>
      <DialogDescription class="cc-modal-desc"
        >Automation will not start this task while the hold is active.</DialogDescription
      >
      <label class="grid gap-1.5 text-sm font-medium"
        >Reason <span class="sr-only">(required)</span>
        <textarea
          v-model="reason"
          class="input min-h-20 resize-y"
          required
          maxlength="1000"
          placeholder="Why should this task stay parked?"
        />
      </label>
      <label class="mt-3 grid gap-1.5 text-sm font-medium"
        >Auto-release date <span class="text-xs font-normal text-muted-foreground">Optional</span>
        <input v-model="until" class="input" type="date" />
      </label>
      <div class="mt-5 flex justify-end gap-2">
        <DialogClose as-child
          ><Button variant="outline" :disabled="busy">Cancel</Button></DialogClose
        >
        <Button variant="default" :disabled="busy || !reason.trim()" @click="submit">{{
          busy ? "Holding…" : "Hold task"
        }}</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
