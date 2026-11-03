import { onScopeDispose, readonly, ref, type Ref } from "vue";

// One timer for cards, drawers and stores, but each consumer gets its OWN
// clock ref that the shared tick advances. A consumer's setup therefore never
// writes a ref that another component subscribes to: writing a shared ref
// during setup invalidated every other consumer's render effects, and in the
// component tests (task-drawer-landable.test.ts) a drawer still mounted from
// an earlier case re-rendered while the current case was inside an await —
// its late-mounted v-if children resolved their pinia stores via injection
// and flipped pinia's global active pinia across cases. Per-consumer clocks
// keep the single-timer efficiency without that cross-component invalidation.
//
// #1018: one timer, and it STOPS while the document is hidden. A board left
// open for days in a background tab (or a PWA window behind other windows)
// must not keep waking every consumer once a second for work nobody can see.
// On return the clocks are advanced immediately so relative times and hold
// badges are correct before the first visible frame.
const clocks = new Set<Ref<number>>();
let timer: ReturnType<typeof setInterval> | undefined;
let visibilityBound = false;

function documentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function tick(): void {
  const t = Date.now();
  for (const clock of clocks) clock.value = t;
}

function stopTimer(): void {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

function startTimer(): void {
  if (clocks.size === 0 || documentHidden()) return;
  // Re-create rather than reuse: a consumer can be created after a test (or a
  // tool) swapped the timer implementation, and the old timer would then never
  // fire. The previous per-consumer `ensureTimer` did the same restart.
  stopTimer();
  timer = setInterval(tick, 1000);
}

function onVisibilityChange(): void {
  if (documentHidden()) {
    stopTimer();
    return;
  }
  // Catch up in one write, then resume the steady one-second cadence.
  tick();
  startTimer();
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", onVisibilityChange);
}

export function useNow() {
  const now = ref(Date.now());
  clocks.add(now);
  bindVisibility();
  startTimer();
  onScopeDispose(() => {
    clocks.delete(now);
    if (clocks.size === 0) stopTimer();
  });
  return readonly(now);
}
