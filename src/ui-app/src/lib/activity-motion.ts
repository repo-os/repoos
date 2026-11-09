import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";

type Entry = { el: Element; visible: boolean; active: Ref<boolean>; limit: Ref<number> };
const entries = new Set<Entry>();
const pageVisible = ref(typeof document === "undefined" || document.visibilityState !== "hidden");
const reduced = ref(false);
let observer: IntersectionObserver | null = null;
let observerConstructor: typeof IntersectionObserver | null = null;
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
  let mounted = false;
  const bindElement = (el: HTMLElement | null): void => {
    if (entry?.el === el) return;
    if (entry) {
      observer?.unobserve(entry.el);
      entries.delete(entry);
      entry = null;
    }
    if (!mounted || !el) {
      active.value = false;
      refresh();
      return;
    }
    entry = { el, visible: typeof IntersectionObserver === "undefined", active, limit: max };
    entries.add(entry);
    observer?.observe(el);
    refresh();
  };
  const enabled = computed(() => active.value);
  onMounted(() => {
    mounted = true;
    pageVisible.value = document.visibilityState !== "hidden";
    if (typeof matchMedia !== "undefined") {
      const currentMedia = matchMedia("(prefers-reduced-motion: reduce)");
      if (!media) {
        media = currentMedia;
        media.addEventListener?.("change", onMotion);
      }
      reduced.value = currentMedia.matches;
    }
    document.addEventListener("visibilitychange", onVisibility);
    if (typeof IntersectionObserver !== "undefined") {
      if (observerConstructor !== IntersectionObserver) {
        observer?.disconnect();
        observerConstructor = IntersectionObserver;
        observer = new IntersectionObserver((records) => {
          for (const record of records) {
            const found = [...entries].find((candidate) => candidate.el === record.target);
            if (found) found.visible = record.isIntersecting;
          }
          refresh();
        });
      }
    }
    bindElement(element.value);
    refresh();
  });
  watch(element, bindElement);
  watch(max, refresh);
  onUnmounted(() => {
    mounted = false;
    document.removeEventListener("visibilitychange", onVisibility);
    if (entry) {
      observer?.unobserve(entry.el);
      entries.delete(entry);
    }
    refresh();
  });
  return enabled;
}
