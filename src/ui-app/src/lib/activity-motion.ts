import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";

type Entry = { el: Element; visible: boolean; active: Ref<boolean>; limit: Ref<number> };
const entries = new Set<Entry>();
const pageVisible = ref(typeof document === "undefined" || document.visibilityState !== "hidden");
const reduced = ref(false);
let observer: IntersectionObserver | null = null;
let media: MediaQueryList | null = null;

function refresh(): void {
  const first = entries.values().next().value as Entry | undefined;
  let slots = Math.max(0, Math.round(first?.limit.value ?? 6));
  for (const entry of entries) {
    const on = pageVisible.value && !reduced.value && entry.visible && slots > 0;
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

export function useActivityMotion(element: Ref<HTMLElement | null>, max: Ref<number>) {
  const active = ref(false);
  let entry: Entry | null = null;
  const enabled = computed(() => active.value);
  onMounted(() => {
    pageVisible.value = document.visibilityState !== "hidden";
    if (!media && typeof matchMedia !== "undefined") {
      media = matchMedia("(prefers-reduced-motion: reduce)");
      media.addEventListener?.("change", onMotion);
    }
    reduced.value = media?.matches ?? false;
    document.addEventListener("visibilitychange", onVisibility);
    if (typeof IntersectionObserver !== "undefined") {
      observer ??= new IntersectionObserver((records) => {
        for (const record of records) {
          const found = [...entries].find((candidate) => candidate.el === record.target);
          if (found) found.visible = record.isIntersecting;
        }
        refresh();
      });
      if (element.value) {
        entry = { el: element.value, visible: false, active, limit: max };
        entries.add(entry);
        observer.observe(element.value);
      }
    } else if (element.value) {
      entry = { el: element.value, visible: true, active, limit: max };
      entries.add(entry);
    }
    refresh();
  });
  watch(max, refresh);
  onUnmounted(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    if (entry) {
      observer?.unobserve(entry.el);
      entries.delete(entry);
    }
    refresh();
  });
  return enabled;
}
