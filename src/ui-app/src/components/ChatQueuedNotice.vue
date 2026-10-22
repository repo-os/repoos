<script setup lang="ts">
/**
 * Shared "message queued" notice for every AI chat (#0821), with a popover
 * listing what is waiting (#0926).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { QueuedMessageDetail } from "../../../core/queued-message-ui.js";
import { queuedMessageSourceLabel } from "../../../core/queued-message-ui.js";
import { fmtTime, relTime } from "../lib/time";
import { useRepoStore } from "../stores/repo";

const PREVIEW_CHARS = 220;
const CLOSE_DELAY_MS = 200;
const POINTER_FOCUS_GRACE_MS = 600;
const POPOVER_WIDTH = 320;
const POPOVER_ID = "chat-queued-pop";

const props = withDefaults(
  defineProps<{
    active?: boolean;
    /** Task id or chat session key — loads queued items from the repo store. */
    queueKey?: string;
    /** Test override; when set, skips the store lookup. */
    items?: QueuedMessageDetail[];
  }>(),
  { active: false },
);

const repo = useRepoStore();
const { queuedMessages } = storeToRefs(repo);

const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;
nowTimer = setInterval(() => {
  now.value = Date.now();
}, 1000);
onBeforeUnmount(() => {
  if (nowTimer) clearInterval(nowTimer);
});

const resolvedItems = computed(() => {
  if (props.items) return props.items;
  const key = props.queueKey;
  if (!key) return [];
  return queuedMessages.value[key]?.items ?? [];
});

const expanded = ref<Record<number, boolean>>({});

function previewText(text: string, index: number): string {
  if (expanded.value[index] || text.length <= PREVIEW_CHARS) return text;
  return `${text.slice(0, PREVIEW_CHARS).trimEnd()}…`;
}

function needsMore(text: string, index: number): boolean {
  return text.length > PREVIEW_CHARS && !expanded.value[index];
}

function showMore(index: number): void {
  expanded.value = { ...expanded.value, [index]: true };
}

const open = ref(false);
const triggerEl = ref<HTMLButtonElement | null>(null);
const popupEl = ref<HTMLElement | null>(null);
const popupStyle = ref<Record<string, string>>({ left: "0px", top: "0px" });
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let lastPointerAt = 0;
let ignoreFocusUntil = 0;

const canHover = (): boolean => {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover)").matches
    );
  } catch {
    return false;
  }
};

function measure(): void {
  const anchor = triggerEl.value;
  const popup = popupEl.value;
  if (!anchor || !popup) return;
  const rect = anchor.getBoundingClientRect();
  const height = popup.offsetHeight;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
  let top = rect.bottom + 8;
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - height - 8);
  }
  popupStyle.value = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
}

function cancelClose(): void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function scheduleClose(delay = CLOSE_DELAY_MS): void {
  if (!open.value) return;
  cancelClose();
  closeTimer = setTimeout(() => {
    closeTimer = null;
    open.value = false;
  }, delay);
}

function closeNow(): void {
  cancelClose();
  open.value = false;
}

async function show(opts: { moveFocus?: boolean } = {}): Promise<void> {
  if (!props.active) return;
  cancelClose();
  if (open.value) return;
  open.value = true;
  void repo.fetchQueued();
  await nextTick();
  measure();
  if (opts.moveFocus) popupEl.value?.focus({ preventScroll: true });
}

function onEnter(): void {
  if (!canHover()) return;
  void show();
}

function onLeave(): void {
  if (!canHover()) return;
  scheduleClose();
}

function notePointer(): void {
  lastPointerAt = Date.now();
}

function onFocus(): void {
  if (Date.now() - lastPointerAt < POINTER_FOCUS_GRACE_MS) return;
  if (Date.now() < ignoreFocusUntil) return;
  void show({ moveFocus: true });
}

function focusTrigger(): void {
  ignoreFocusUntil = Date.now() + POINTER_FOCUS_GRACE_MS;
  triggerEl.value?.focus({ preventScroll: true });
}

function onClick(): void {
  if (!canHover()) {
    if (open.value) closeNow();
    else void show();
    return;
  }
  void show();
}

function onDocPointerDown(event: Event): void {
  const target = event.target as Node | null;
  if (!target) return;
  if (popupEl.value?.contains(target) || triggerEl.value?.contains(target)) return;
  closeNow();
}

function onDocKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closeNow();
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onDocKeydown);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
  } else {
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    document.removeEventListener("keydown", onDocKeydown);
    window.removeEventListener("resize", measure);
    window.removeEventListener("scroll", measure, true);
    cancelClose();
    const active = document.activeElement;
    if (popupEl.value && active && popupEl.value.contains(active)) {
      focusTrigger();
    }
  }
});

watch(
  () => [props.active, resolvedItems.value.length] as const,
  async () => {
    if (!open.value) return;
    await nextTick();
    measure();
  },
);

watch(
  () => props.active,
  (on) => {
    if (!on) closeNow();
  },
);

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, true);
  document.removeEventListener("keydown", onDocKeydown);
  window.removeEventListener("resize", measure);
  window.removeEventListener("scroll", measure, true);
  cancelClose();
});
</script>

<template>
  <div v-if="active" class="chat-queued-wrap" @mouseenter="onEnter" @mouseleave="onLeave">
    <button
      ref="triggerEl"
      type="button"
      class="chat-queued-note"
      role="status"
      data-test-id="chat-queued-note"
      :aria-expanded="open"
      :aria-controls="open ? POPOVER_ID : undefined"
      aria-label="Queued message — show what is waiting"
      @pointerdown="notePointer"
      @focus="onFocus"
      @focusout="scheduleClose()"
      @click.stop="onClick"
    >
      Queued — will be read when the current turn ends.
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="open && active"
      :id="POPOVER_ID"
      ref="popupEl"
      class="chat-queued-pop"
      data-overlay-layer="floating"
      data-test-id="chat-queued-popover"
      role="dialog"
      aria-label="Queued messages"
      tabindex="-1"
      :style="popupStyle"
      @mouseenter="cancelClose"
      @mouseleave="scheduleClose"
    >
      <p class="chat-queued-pop-lead">Waiting for the current turn to end</p>
      <ul v-if="resolvedItems.length" class="chat-queued-pop-list">
        <li v-for="(item, index) in resolvedItems" :key="`${item.queuedAt}-${index}`">
          <div class="chat-queued-pop-meta">
            <span class="chat-queued-pop-source">{{ queuedMessageSourceLabel(item.source) }}</span>
            <time
              class="chat-queued-pop-time"
              :datetime="item.queuedAt"
              :title="fmtTime(item.queuedAt)"
            >
              {{ relTime(item.queuedAt, new Date(now)) }}
            </time>
          </div>
          <div class="chat-queued-pop-text">{{ previewText(item.text, index) }}</div>
          <button
            v-if="needsMore(item.text, index)"
            type="button"
            class="chat-queued-pop-more"
            @click="showMore(index)"
          >
            Show more
          </button>
        </li>
      </ul>
      <p v-else class="chat-queued-pop-empty">Loading queued messages…</p>
    </div>
  </Teleport>
</template>
