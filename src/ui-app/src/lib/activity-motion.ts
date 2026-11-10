import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { OVERLAY_LAYER_ATTR } from "../components/ui/dialog/layer.js";

type Entry = {
  el: Element;
  intersecting: boolean;
  visible: boolean;
  active: Ref<boolean>;
  limit: Ref<number>;
  eligible: Ref<boolean>;
};
const entries = new Set<Entry>();
const pageVisible = ref(typeof document === "undefined" || document.visibilityState !== "hidden");
const reduced = ref(false);
let observer: IntersectionObserver | null = null;
let observerConstructor: typeof IntersectionObserver | null = null;
let media: MediaQueryList | null = null;
let visibilityListenerCount = 0;
let motionListenerCount = 0;
let occlusionListenerCount = 0;
let overlayDomListenerCount = 0;
let overlayDomObserver: MutationObserver | null = null;
let occlusionRaf = 0;

/** True when the element's center is not covered by another hit-tested layer (drawer, dialog). */
function unobstructed(el: Element): boolean {
  if (typeof document === "undefined") return true;
  const rect = el.getBoundingClientRect();
  // Skip hit-testing when not laid out (JSDOM); intersection already gates those nodes.
  if (rect.width <= 0 || rect.height <= 0) return true;
  let x = rect.left + rect.width / 2;
  let y = rect.top + rect.height / 2;
  if (window.innerWidth > 1) x = Math.min(Math.max(x, 0), window.innerWidth - 1);
  if (window.innerHeight > 1) y = Math.min(Math.max(y, 0), window.innerHeight - 1);
  const hit = document.elementFromPoint(x, y);
  if (!hit) return false;
  return el === hit || el.contains(hit);
}

function syncEntryVisibility(entry: Entry): void {
  entry.visible = entry.intersecting && unobstructed(entry.el);
}

function scheduleOcclusionRefresh(): void {
  if (occlusionRaf || typeof requestAnimationFrame === "undefined") return;
  occlusionRaf = requestAnimationFrame(() => {
    occlusionRaf = 0;
    for (const entry of entries) syncEntryVisibility(entry);
    refresh();
  });
}

function onOcclusionEvent(): void {
  scheduleOcclusionRefresh();
}

function nodeTouchesOverlayLayer(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  if (node.hasAttribute(OVERLAY_LAYER_ATTR)) return true;
  return node.querySelector(`[${OVERLAY_LAYER_ATTR}]`) !== null;
}

function attachOverlayDomObserver(): void {
  if (overlayDomListenerCount++ > 0) return;
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
  overlayDomObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        (mutation.attributeName === OVERLAY_LAYER_ATTR || mutation.attributeName === "data-state")
      ) {
        scheduleOcclusionRefresh();
        return;
      }
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (nodeTouchesOverlayLayer(node)) {
            scheduleOcclusionRefresh();
            return;
          }
        }
        for (const node of mutation.removedNodes) {
          if (nodeTouchesOverlayLayer(node)) {
            scheduleOcclusionRefresh();
            return;
          }
        }
      }
    }
  });
  overlayDomObserver.observe(document.body, {
    attributes: true,
    attributeFilter: [OVERLAY_LAYER_ATTR, "data-state"],
    childList: true,
    subtree: true,
  });
}

function detachOverlayDomObserver(): void {
  if (--overlayDomListenerCount <= 0) {
    overlayDomListenerCount = 0;
    overlayDomObserver?.disconnect();
    overlayDomObserver = null;
  }
}

function attachOcclusionListeners(): void {
  if (occlusionListenerCount++ > 0) return;
  window.addEventListener("scroll", onOcclusionEvent, true);
  window.addEventListener("resize", onOcclusionEvent);
}

function detachOcclusionListeners(): void {
  if (--occlusionListenerCount <= 0) {
    occlusionListenerCount = 0;
    window.removeEventListener("scroll", onOcclusionEvent, true);
    window.removeEventListener("resize", onOcclusionEvent);
  }
}

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

function ensureObserver(): void {
  if (typeof IntersectionObserver === "undefined") return;
  if (observerConstructor === IntersectionObserver && observer) return;
  observer?.disconnect();
  observerConstructor = IntersectionObserver;
  observer = new IntersectionObserver((records) => {
    for (const record of records) {
      const found = [...entries].find((candidate) => candidate.el === record.target);
      if (!found) continue;
      found.intersecting = record.isIntersecting;
      syncEntryVisibility(found);
    }
    refresh();
  });
}

/** Vitest-only: drop the singleton observer and listener refcount between cases. */
export function resetActivityMotionCoordinatorForTests(): void {
  entries.clear();
  if (observer && typeof observer.disconnect === "function") observer.disconnect();
  observer = null;
  observerConstructor = null;
  while (visibilityListenerCount > 0) detachVisibilityListener();
  while (motionListenerCount > 0) detachMotionListener();
  while (occlusionListenerCount > 0) detachOcclusionListeners();
  while (overlayDomListenerCount > 0) detachOverlayDomObserver();
  if (occlusionRaf) cancelAnimationFrame(occlusionRaf);
  occlusionRaf = 0;
  pageVisible.value = typeof document === "undefined" || document.visibilityState !== "hidden";
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
  let mounted = false;
  const enabled = computed(() => eligible.value && active.value);
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
    const useIo = typeof IntersectionObserver !== "undefined";
    entry = {
      el,
      intersecting: !useIo,
      visible: useIo ? false : unobstructed(el),
      active,
      limit: max,
      eligible,
    };
    entries.add(entry);
    if (useIo) {
      ensureObserver();
      observer?.observe(el);
      syncEntryVisibility(entry);
    }
    refresh();
  };
  onMounted(() => {
    mounted = true;
    pageVisible.value = document.visibilityState !== "hidden";
    attachMotionListener();
    reduced.value = media?.matches ?? false;
    attachVisibilityListener();
    ensureObserver();
    attachOcclusionListeners();
    attachOverlayDomObserver();
    bindElement(element.value);
  });
  watch(element, bindElement);
  watch(max, refresh);
  watch(eligible, refresh);
  onUnmounted(() => {
    mounted = false;
    detachVisibilityListener();
    detachMotionListener();
    detachOcclusionListeners();
    detachOverlayDomObserver();
    if (entry) {
      observer?.unobserve(entry.el);
      entries.delete(entry);
      entry = null;
    }
    refresh();
    if (entries.size === 0) {
      if (observer && typeof observer.disconnect === "function") observer.disconnect();
      observer = null;
      observerConstructor = null;
    }
  });
  return enabled;
}
