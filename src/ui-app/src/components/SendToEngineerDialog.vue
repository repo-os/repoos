<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "./ui/button.vue";

const props = defineProps<{ open: boolean; busy: boolean; title: string }>();
const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "confirm", note: string): void;
}>();

const note = ref("");
const textarea = ref<HTMLTextAreaElement | null>(null);

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape" && props.open) emit("cancel");
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

watch(
  () => props.open,
  (open) => {
    if (open) {
      note.value = "";
      void nextTick(() => textarea.value?.focus());
    }
  },
);

function confirm(): void {
  emit("confirm", note.value.trim());
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="ste-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ste-confirm-title"
      @click.self="emit('cancel')"
    >
      <div class="ste-card">
        <h3 id="ste-confirm-title" class="ste-title">{{ title }}</h3>
        <p class="ste-body">
          This returns the task to <strong>active</strong> and resumes the
          engineer with the reviewer findings. Add a short note to give the
          engineer specific instructions (optional).
        </p>
        <textarea
          ref="textarea"
          v-model="note"
          rows="4"
          class="ste-note"
          placeholder="e.g. Handle the reviewer's suggestions; there is a rendering issue visible in the preview…"
          :disabled="busy"
          @keydown.enter.exact.prevent="confirm"
          @keydown.escape="emit('cancel')"
        ></textarea>
        <div class="ste-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="emit('cancel')"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="accent"
            size="sm"
            :disabled="busy"
            @click="confirm"
          >
            Send to engineer{{ note.trim() ? " with note" : "" }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ste-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  isolation: isolate;
  pointer-events: auto;
  background: rgba(4, 6, 12, 0.62);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.ste-card {
  position: relative;
  z-index: 1;
  pointer-events: auto;
  width: min(540px, 100%);
  background: var(--panel-solid);
  border: 1px solid var(--border-bright);
  border-radius: 16px;
  padding: 22px;
  box-shadow: var(--drawer-shadow);
  animation: restartIn 0.18s ease-out;
}
.ste-title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 700;
  color: var(--txt);
}
.ste-body {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--txt-dim);
}
.ste-body strong {
  color: var(--txt);
}
.ste-note {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 88px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--md-body-bg);
  color: var(--txt);
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  font-family: inherit;
}
.ste-note:focus {
  outline: none;
  border-color: var(--violet);
}
.ste-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 18px;
}
</style>
