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
const clocks = new Set<Ref<number>>();
let timer: ReturnType<typeof setInterval> | undefined;

function ensureTimer(): void {
  clearInterval(timer);
  timer = setInterval(() => {
    const t = Date.now();
    for (const clock of clocks) clock.value = t;
  }, 1000);
}

export function useNow() {
  const now = ref(Date.now());
  clocks.add(now);
  ensureTimer();
  onScopeDispose(() => {
    clocks.delete(now);
    if (clocks.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  });
  return readonly(now);
}
