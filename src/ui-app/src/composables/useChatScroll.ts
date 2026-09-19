/**
 * The single scroll implementation every AI chat in the UI shares (#0444).
 *
 * The rules, in one place — see docs/ai-chat-standards.md for the full spec:
 *   1. a chat opens on the newest message (bottom of the log);
 *   2. where the reader was is remembered per conversation id, so leaving and
 *      coming back lands them where they left off;
 *   3. new output is auto-followed only while the reader is already at the
 *      bottom — never yanked away from someone reading history;
 *   4. `showJumpToLatest` flips on as soon as they scroll away, and drives the
 *      shared <ChatJumpToLatest> button that brings them back down.
 *
 * Chats must not hand-roll any of this. `useChatScroll` plus the two shared
 * components are the whole contract, and src/ui-app/tests/ai-chat-standard.test.ts
 * fails when a chat reimplements it.
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";

/** How close to the bottom (px) still counts as "reading the newest message". */
export const CHAT_BOTTOM_THRESHOLD = 64;

/** How long a programmatic smooth scroll may take to settle, in ms. */
const SMOOTH_SETTLE_MS = 800;

const STORAGE_PREFIX = "repoos.chat-scroll.";

export interface UseChatScrollOptions {
  /** Stable per-conversation id. The scroll position is remembered under it. */
  chatId: MaybeRefOrGetter<string>;
  /** Message count. Growth is what makes us decide whether to follow or hold. */
  contentSize?: MaybeRefOrGetter<number>;
  /** False while the surface is closed — a closed panel has no measurable log. */
  active?: MaybeRefOrGetter<boolean>;
  /** Override the bottom threshold for unusually tall/short logs. */
  threshold?: number;
  /** Set false for chats whose position should not survive navigation. */
  persist?: boolean;
}

export interface ChatScroll {
  /** True while the viewport is within `threshold` px of the newest message. */
  atBottom: Ref<boolean>;
  /** Drives <ChatJumpToLatest>: true once the reader has scrolled away. */
  showJumpToLatest: Ref<boolean>;
  /** Pixels between the bottom of the viewport and the newest message. */
  distanceFromBottom: () => number;
  /** Wire to the log element's `@scroll`. */
  onScroll: () => void;
  /** Jump to the newest message. Pass "auto" for an instant, non-animated jump. */
  scrollToLatest: (behavior?: ScrollBehavior) => void;
  /** Re-apply the remembered position (after the surface re-opens). */
  restore: () => void;
  /** Drop the remembered position for this conversation. */
  forget: () => void;
}

function storageKey(chatId: string): string {
  return `${STORAGE_PREFIX}${chatId}`;
}

function readSaved(chatId: string): number | null {
  try {
    const raw = window.localStorage.getItem(storageKey(chatId));
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeSaved(chatId: string, distance: number): void {
  try {
    window.localStorage.setItem(storageKey(chatId), String(Math.round(distance)));
  } catch {
    // Private mode / quota exceeded — remembering the position is best-effort.
  }
}

export function useChatScroll(
  log: Ref<HTMLElement | null>,
  options: UseChatScrollOptions,
): ChatScroll {
  const atBottom = ref(true);
  const threshold = options.threshold ?? CHAT_BOTTOM_THRESHOLD;
  const persist = options.persist ?? true;
  const showJumpToLatest = computed(() => !atBottom.value);

  // A smooth scroll emits a stream of scroll events on its way down; without
  // this the jump button would flash back into view for the whole animation.
  let settleAt = 0;
  let observer: ResizeObserver | null = null;

  const isActive = (): boolean => toValue(options.active) ?? true;

  function distanceFromBottom(): number {
    const el = log.value;
    if (!el) return 0;
    return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
  }

  function measure(): void {
    const el = log.value;
    if (!el) return;
    const distance = distanceFromBottom();
    atBottom.value = distance <= threshold;
    if (persist) writeSaved(toValue(options.chatId), distance);
  }

  function onScroll(): void {
    if (Date.now() < settleAt) {
      // Our own smooth scroll is still running — don't fight it.
      if (distanceFromBottom() <= threshold) settleAt = 0;
      atBottom.value = true;
      return;
    }
    measure();
  }

  function scrollToLatest(behavior: ScrollBehavior = "smooth"): void {
    const el = log.value;
    if (!el) return;
    const top = el.scrollHeight;
    if (behavior === "smooth" && typeof el.scrollTo === "function") {
      settleAt = Date.now() + SMOOTH_SETTLE_MS;
      el.scrollTo({ top, behavior });
    } else {
      el.scrollTop = top;
    }
    atBottom.value = true;
    if (persist) writeSaved(toValue(options.chatId), 0);
  }

  /**
   * Put the reader back where they were — or, when we have nothing remembered
   * for this conversation, on the newest message, which is the whole point.
   */
  function restore(): void {
    const el = log.value;
    if (!el) return;
    const saved = persist ? readSaved(toValue(options.chatId)) : null;
    el.scrollTop =
      saved === null ? el.scrollHeight : Math.max(0, el.scrollHeight - el.clientHeight - saved);
    settleAt = 0;
    measure();
  }

  function forget(): void {
    try {
      window.localStorage.removeItem(storageKey(toValue(options.chatId)));
    } catch {
      // best-effort
    }
  }

  // Re-opening the surface (or switching conversation inside it) is when a
  // remembered position gets applied.
  watch(
    () => isActive(),
    (active) => {
      if (active) void nextTick(restore);
    },
    { flush: "post" },
  );

  watch(
    () => toValue(options.chatId),
    () => {
      if (isActive()) void nextTick(restore);
    },
    { flush: "post" },
  );

  // New output: follow it only for a reader who is already at the bottom. This
  // watcher is pre-render, so `atBottom` still describes the pre-append state.
  watch(
    () => toValue(options.contentSize) ?? 0,
    () => {
      if (!isActive()) return;
      void nextTick(atBottom.value ? () => scrollToLatest("auto") : measure);
    },
  );

  onMounted(() => {
    if (isActive()) void nextTick(restore);
    const el = log.value;
    if (el && typeof ResizeObserver !== "undefined") {
      // A resize (panel drag, growing composer) can pull the newest message out
      // from under a reader who was already at it.
      observer = new ResizeObserver(() => {
        const current = log.value;
        if (current && distanceFromBottom() <= threshold) {
          current.scrollTop = current.scrollHeight;
        }
      });
      observer.observe(el);
    }
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return {
    atBottom,
    showJumpToLatest,
    distanceFromBottom,
    onScroll,
    scrollToLatest,
    restore,
    forget,
  };
}
