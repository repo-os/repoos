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

/** Growth in distance-from-bottom that reads as the reader taking over. */
const SETTLE_SLACK_PX = 8;

/** How long to coalesce scroll-position writes before touching localStorage. */
const SAVE_DEBOUNCE_MS = 150;

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

/**
 * `measure()` runs on every scroll event, so the write is coalesced rather than
 * hitting localStorage once per frame. The last value always lands: the timer
 * is flushed on unmount and before a restore reads it back.
 */

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
  let settleDistance = 0;
  let observer: ResizeObserver | null = null;
  // A remembered distance we have not been able to honour yet, because the
  // conversation is still hydrating — see restore().
  let pendingRestore: number | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSave: number | null = null;

  const isActive = (): boolean => toValue(options.active) ?? true;

  function distanceFromBottom(): number {
    const el = log.value;
    if (!el) return 0;
    return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
  }

  /**
   * A log with no layout box (a `v-show`-hidden panel, a not-yet-mounted
   * dialog) reports `clientHeight === 0`. Measuring there would compute a
   * distance of 0 and overwrite the remembered position with "at the bottom",
   * so every geometry-dependent step bails out instead of guessing.
   */
  function hasGeometry(): boolean {
    const el = log.value;
    return Boolean(el && el.clientHeight > 0);
  }

  function flushSave(chatIdOverride?: string): void {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (pendingSave === null) return;
    const distance = pendingSave;
    pendingSave = null;
    if (persist) writeSaved(chatIdOverride ?? toValue(options.chatId), distance);
  }

  function queueSave(distance: number): void {
    pendingSave = distance;
    if (saveTimer === null) saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }

  function measure(): void {
    const el = log.value;
    if (!el) return;
    const distance = distanceFromBottom();
    atBottom.value = distance <= threshold;
    // While a remembered position is still being caught up on (the log is
    // mid-hydration), the distance we can measure is not the reader's real
    // position — saving it would overwrite what we are restoring.
    if (hasGeometry() && pendingRestore === null) queueSave(distance);
  }

  function onScroll(): void {
    if (Date.now() < settleAt) {
      // Our own smooth scroll is still running — don't fight it. But the
      // reader can still out-vote us: if they scroll up mid-animation the
      // distance grows, so hand control straight back to them.
      const distance = distanceFromBottom();
      if (distance > settleDistance + SETTLE_SLACK_PX) {
        settleAt = 0;
        measure();
        return;
      }
      if (distance <= threshold) settleAt = 0;
      settleDistance = distance;
      atBottom.value = true;
      return;
    }
    // The reader moved the viewport themselves: drop any restore we were still
    // catching up on, so following stays off until they return to the bottom.
    pendingRestore = null;
    measure();
  }

  function scrollToLatest(behavior: ScrollBehavior = "smooth"): void {
    const el = log.value;
    if (!el) return;
    const top = el.scrollHeight;
    if (behavior === "smooth" && typeof el.scrollTo === "function") {
      settleAt = Date.now() + SMOOTH_SETTLE_MS;
      settleDistance = distanceFromBottom();
      el.scrollTo({ top, behavior });
    } else {
      el.scrollTop = top;
    }
    atBottom.value = true;
    pendingRestore = null;
    if (hasGeometry()) queueSave(0);
  }

  /**
   * Put the reader back where they were — or, when we have nothing remembered
   * for this conversation, on the newest message, which is the whole point.
   */
  function restore(): void {
    const el = log.value;
    if (!el || !hasGeometry()) return;
    // Read through the pending save: a position written moments ago (this
    // surface closing, say) must not be shadowed by a stale timer.
    flushSave();
    const saved = persist ? readSaved(toValue(options.chatId)) : null;
    pendingRestore = saved;
    apply(saved);
    settleAt = 0;
    measure();
  }

  /**
   * `saved === null` means "nothing remembered", which per the standard means
   * "open on the newest message". Otherwise hold the remembered distance from
   * the bottom — and keep it pending, because a conversation that hydrates
   * asynchronously (the task PM chat's `loadOutput`, say) only reaches its full
   * height after this call; without that the distance would be computed against
   * partial content and never corrected.
   */
  function apply(saved: number | null): void {
    const el = log.value;
    if (!el) return;
    el.scrollTop =
      saved === null || saved === 0
        ? el.scrollHeight
        : Math.max(0, el.scrollHeight - el.clientHeight - saved);
  }

  function forget(): void {
    pendingSave = null;
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    pendingRestore = null;
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
    (_, oldId) => {
      // Flush any pending save under the OLD id before switching — flushSave()
      // without an override would write under the new id, corrupting its position.
      flushSave(oldId);
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
      void nextTick(() => {
        if (pendingRestore !== null) {
          // Still catching up to the remembered position: re-apply it against
          // the taller log rather than settling for wherever the partial
          // content left the reader.
          apply(pendingRestore);
          measure();
          return;
        }
        if (atBottom.value) scrollToLatest("auto");
        else measure();
      });
    },
  );

  // A resize (panel drag, growing composer) can pull the newest message out
  // from under a reader who was already at it. Called from onMounted AND from
  // watch(log, …) so floating-head chats (Dialog/v-if, log is null at mount)
  // still get the observer once their container renders.
  function attachObserver(el: HTMLElement): void {
    if (typeof ResizeObserver === "undefined") return;
    if (!observer) {
      observer = new ResizeObserver(() => {
        const current = log.value;
        if (current && distanceFromBottom() <= threshold) {
          current.scrollTop = current.scrollHeight;
        }
      });
    }
    observer.observe(el);
  }

  // Re-attach when the log ref becomes non-null (e.g. a Dialog that just opened).
  watch(log, (el) => {
    if (el) attachObserver(el);
  });

  onMounted(() => {
    if (isActive()) void nextTick(restore);
    const el = log.value;
    if (el) attachObserver(el);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
    flushSave();
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
