<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "./ui/button.vue";

/**
 * Modal ownership stack. Every mounted stop-work modal registers itself here
 * when open; only the top-most one reacts to ESC. Without this, multiple
 * mounted modal instances would all dismiss on a single ESC keypress.
 */
const openStack: number[] = [];
let modalSeq = 0;

const props = defineProps<{ open: boolean; taskId: string | undefined; busy: boolean }>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
  cancel: [];
}>();

const myId = ++modalSeq;
const modalEl = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

function focusable(): HTMLElement[] {
  if (!modalEl.value) return [];
  return Array.from(
    modalEl.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);
}

/** Keep keyboard focus inside the modal while it is open. */
function trapFocus(event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const items = focusable();
  if (items.length === 0) {
    event.preventDefault();
    modalEl.value?.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey) {
    if (!active || active === first || !modalEl.value!.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (!active || active === last || !modalEl.value!.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * ESC dismisses the modal, but only for the top-most open instance and never
 * while a stop request is in flight (busy). The latter protects against
 * vanishing mid-stop and the resulting "No task selected" dead-end on retry.
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  if (openStack[openStack.length - 1] !== myId) return;
  event.preventDefault();
  if (!props.busy) emit("cancel");
}

function onOverlayClick(): void {
  if (!props.busy) emit("cancel");
}

function close(): void {
  emit("cancel");
}

function confirm(): void {
  emit("confirm");
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      openStack.push(myId);
      void nextTick(() => {
        const items = focusable();
        (items[0] ?? modalEl.value)?.focus();
      });
    } else {
      const idx = openStack.indexOf(myId);
      if (idx !== -1) openStack.splice(idx, 1);
      previouslyFocused?.focus?.();
      previouslyFocused = null;
    }
  },
);

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  const idx = openStack.indexOf(myId);
  if (idx !== -1) openStack.splice(idx, 1);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="stop-work-overlay"
      @click.self="onOverlayClick"
    >
      <div
        ref="modalEl"
        class="stop-work-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stop-work-confirm-title"
        aria-describedby="stop-work-confirm-description"
        tabindex="-1"
        @keydown="trapFocus"
      >
        <div class="stop-work-modal-head">
          <h3 id="stop-work-confirm-title" class="stop-work-title">Confirm Stop Work</h3>
          <button
            type="button"
            class="stop-work-close"
            aria-label="Close confirmation"
            :disabled="busy"
            @click="close"
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
            type="button"
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="close"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            :disabled="busy"
            @click="confirm"
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
