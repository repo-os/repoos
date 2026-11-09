import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";

type Entry = {
  el: Element;
  visible: boolean;
  active: Ref<boolean>;
  limit: Ref<number>;
  eligible: Ref<boolean>;
};
const entries = new Set<Entry>();
const pageVisible = ref(typeof document === "undefined" || document.visibilityState !== "hidden");
const reduced = ref(false);
let observer: IntersectionObserver | null = null;
let media: MediaQueryList | null = null;
let visibilityListenerCount = 0;
let motionListenerCount = 0;

function attachVisibilityListener(): void {
  if (visibilityListenerCount++ === 0) {
    document.addEventListener("visibilitychange", onVisibility);
  }
}
function detachVisibilityListener(): void {
  if (--visibilityListenerCount <= 0) {
    visibilityListenerCount = 0;
    document.removeEventListener("visibilitychange", onVisibility);
  }
}
function attachMotionListener(): void {
  if (!media && typeof matchMedia !== "undefined") {
    media = matchMedia("(prefers-reduced-motion: reduce)");
  }
  if (media && motionListenerCount++ === 0) {
    media.addEventListener?.("change", onMotion);
  }
}
function detachMotionListener(): void {
  if (media && --motionListenerCount <= 0) {
    motionListenerCount = 0;
    media.removeEventListener?.("change", onMotion);
  }
}

/** Vitest-only: drop the singleton observer and listener refcount between cases. */
export function resetActivityMotionCoordinatorForTests(): void {
  entries.clear();
  if (observer && typeof observer.disconnect === "function") observer.disconnect();
  observer = null;
  while (visibilityListenerCount > 0) detachVisibilityListener();
  while (motionListenerCount > 0) detachMotionListener();
  pageVisible.value =
    typeof document === "undefined" || document.visibilityState !== "hidden";
  reduced.value = media?.matches ?? false;
}

function refresh(): void {
  const first = entries.values().next().value as Entry | undefined;
  let slots = Math.max(0, Math.round(first?.limit.value ?? 6));
  for (const entry of entries) {
    const on =
      pageVisible.value && !reduced.value && entry.visible && entry.eligible.value && slots > 0;
    entry.active.value = on;
    if (on) slots--;
  }
}
function onVisibility(): void {
  pageVisible.value = document.visibilityState !== "hidden";
  refresh();
}
function onMotion(e: MediaQueryListEvent): void {
  reduced.value = e.matches;
  refresh();
}

export function useActivityMotion(
  element: Ref<HTMLElement | null>,
  max: Ref<number>,
  eligible: Ref<boolean> = ref(true),
) {
  const active = ref(false);
  let entry: Entry | null = null;
  const enabled = computed(() => eligible.value && active.value);
  onMounted(() => {
    pageVisible.value = document.visibilityState !== "hidden";
    attachMotionListener();
    reduced.value = media?.matches ?? false;
    attachVisibilityListener();
    if (typeof IntersectionObserver !== "undefined") {
      observer ??= new IntersectionObserver((records) => {
        for (const record of records) {
          const found = [...entries].find((candidate) => candidate.el === record.target);
          if (found) found.visible = record.isIntersecting;
        }
        refresh();
      });
      if (element.value) {
        entry = { el: element.value, visible: false, active, limit: max, eligible };
        entries.add(entry);
        observer.observe(element.value);
      }
    } else if (element.value) {
      entry = { el: element.value, visible: true, active, limit: max, eligible };
      entries.add(entry);
    }
    refresh();
  });
  watch(max, refresh);
  watch(eligible, refresh);
  onUnmounted(() => {
    detachVisibilityListener();
    detachMotionListener();
    if (entry) {
      observer?.unobserve(entry.el);
      entries.delete(entry);
    }
    refresh();
    if (entries.size === 0) {
      if (observer && typeof observer.disconnect === "function") observer.disconnect();
      observer = null;
    }
  });
  return enabled;
}
