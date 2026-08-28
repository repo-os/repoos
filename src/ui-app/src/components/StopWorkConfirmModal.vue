<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "./ui/button.vue";

const props = defineProps<{ open: boolean; taskId: string | undefined; busy: boolean }>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
  cancel: [];
}>();

const cancelButton = ref<InstanceType<typeof Button> | null>(null);

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape" && props.open) emit("cancel");
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

watch(
  () => props.open,
  (open) => {
    if (open) void nextTick(() => cancelButton.value?.$el?.focus());
  },
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="stop-work-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stop-work-confirm-title"
      aria-describedby="stop-work-confirm-description"
      @click.self="emit('cancel')"
    >
      <div class="stop-work-modal">
        <div class="stop-work-modal-head">
          <h3 id="stop-work-confirm-title" class="stop-work-title">Confirm Stop Work</h3>
          <button
            type="button"
            class="stop-work-close"
            aria-label="Close confirmation"
            :disabled="busy"
            @click="emit('cancel')"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <p id="stop-work-confirm-description" class="stop-work-modal-message">
          Stop work on task {{ taskId || "this task" }} and send it back to ready?
          The current worktree is kept, not deleted.
        </p>

        <div class="stop-work-modal-actions">
          <Button
            ref="cancelButton"
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
            variant="destructive"
            size="sm"
            :disabled="busy"
            @click="emit('confirm')"
          >
            Stop Work
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.stop-work-overlay {
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
.stop-work-modal {
  position: relative;
  z-index: 1;
  pointer-events: auto;
  width: min(400px, 100%);
  background: var(--panel-solid);
  border: 1px solid var(--border-bright);
  border-radius: 16px;
  padding: 22px;
  box-shadow: var(--drawer-shadow);
  animation: slideIn 0.18s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.stop-work-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.stop-work-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--txt);
  margin: 0;
}
.stop-work-close {
  border: 0;
  background: transparent;
  color: var(--txt-dim);
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
  padding: 2px 6px;
}
.stop-work-close:hover { color: var(--txt); }
.stop-work-close:disabled { cursor: not-allowed; opacity: 0.5; }
.stop-work-modal-message {
  font-size: 13px;
  line-height: 1.55;
  color: var(--txt-dim);
  margin: 12px 0 20px;
}

.stop-work-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
