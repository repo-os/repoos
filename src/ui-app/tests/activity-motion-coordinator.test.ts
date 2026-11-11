import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ActivityIndicator from "../src/components/ActivityIndicator.vue";
import { OVERLAY_LAYER_ATTR } from "../src/components/ui/dialog/layer.js";
import { resetActivityMotionCoordinatorForTests } from "../src/lib/activity-motion";
import { useConfigStore } from "../src/stores/config";

type Entry = { target: Element; isIntersecting: boolean };
type Callback = (entries: Entry[]) => void;
const observers: FakeIntersectionObserver[] = [];
let layoutSeq = 0;
function stubIndicatorLayout(el: Element): void {
  const i = layoutSeq++;
  const left = 8 + i * 40;
  const top = 8;
  el.getBoundingClientRect = () =>
    ({
      width: 16,
      height: 16,
      left,
      top,
      right: left + 16,
      bottom: top + 16,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

class FakeIntersectionObserver {
  targets = new Set<Element>();
  constructor(private readonly callback: Callback) {
    observers.push(this);
  }
  observe(target: Element): void {
    this.targets.add(target);
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.targets.clear();
  }
  trigger(target: Element, isIntersecting: boolean): void {
    this.callback([{ target, isIntersecting }]);
  }
}

describe("activity animation coordinator", () => {
  const mounted: ReturnType<typeof mount>[] = [];
  const originalObserver = globalThis.IntersectionObserver;
  let oldVisibility: PropertyDescriptor | undefined;

  beforeEach(() => {
    layoutSeq = 0;
    resetActivityMotionCoordinatorForTests();
  });

  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    resetActivityMotionCoordinatorForTests();
    globalThis.IntersectionObserver = originalObserver;
    if (oldVisibility) Object.defineProperty(document, "visibilityState", oldVisibility);
    vi.restoreAllMocks();
  });

  it("registers one shared IntersectionObserver and one visibility listener", async () => {
    observers.length = 0;
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrappers = Array.from({ length: 5 }, () => {
      const wrapper = mount(ActivityIndicator, { global: { plugins: [pinia] } });
      mounted.push(wrapper);
      return wrapper;
    });
    expect(observers).toHaveLength(1);
    expect(addSpy.mock.calls.filter((c) => c[0] === "visibilitychange")).toHaveLength(1);
    wrappers.forEach((w) => w.unmount());
    expect(removeSpy.mock.calls.filter((c) => c[0] === "visibilitychange")).toHaveLength(1);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("pauses indicators covered by another layer at the sample point", async () => {
    observers.length = 0;
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const pinia = createPinia();
    setActivePinia(pinia);
    useConfigStore(pinia).form.activityAnimationEnabled = true;
    const wrapper = mount(ActivityIndicator, { global: { plugins: [pinia] } });
    mounted.push(wrapper);
    const observer = observers[0]!;
    const root = wrapper.element;
    stubIndicatorLayout(root);
    const blocker = document.createElement("div");
    document.body.appendChild(blocker);
    document.elementFromPoint = vi.fn(() => blocker) as typeof document.elementFromPoint;
    observer.trigger(root, true);
    await wrapper.vm.$nextTick();
    expect(root.classList.contains("ai-motion-paused")).toBe(true);
    document.elementFromPoint = vi.fn(() => root) as typeof document.elementFromPoint;
    observer.trigger(root, true);
    await wrapper.vm.$nextTick();
    expect(root.classList.contains("ai-motion-paused")).toBe(false);
    blocker.remove();
  });

  it("pauses when a teleported overlay opens without scroll or resize", async () => {
    observers.length = 0;
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const pinia = createPinia();
    setActivePinia(pinia);
    useConfigStore(pinia).form.activityAnimationEnabled = true;
    const wrapper = mount(ActivityIndicator, { global: { plugins: [pinia] } });
    mounted.push(wrapper);
    const observer = observers[0]!;
    const root = wrapper.element;
    stubIndicatorLayout(root);
    document.elementFromPoint = vi.fn(() => root) as typeof document.elementFromPoint;
    observer.trigger(root, true);
    await wrapper.vm.$nextTick();
    expect(root.classList.contains("ai-motion-paused")).toBe(false);

    const overlay = document.createElement("div");
    overlay.setAttribute(OVERLAY_LAYER_ATTR, "overlay-test");
    document.body.appendChild(overlay);
    document.elementFromPoint = vi.fn(() => overlay) as typeof document.elementFromPoint;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    await wrapper.vm.$nextTick();
    expect(root.classList.contains("ai-motion-paused")).toBe(true);
    overlay.remove();
  });

  it("pauses offscreen and hidden indicators and enforces the live cap", async () => {
    observers.length = 0;
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    let motionChange: ((event: MediaQueryListEvent) => void) | undefined;
    vi.stubGlobal(
      "matchMedia",
      () =>
        ({
          matches: false,
          addEventListener: (_name: string, callback: (event: MediaQueryListEvent) => void) => {
            motionChange = callback;
          },
        }) as unknown as MediaQueryList,
    );
    oldVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    useConfigStore(pinia).form.activityAnimationEnabled = true;
    useConfigStore(pinia).form.activityAnimationConcurrency = 2;
    const wrappers = Array.from({ length: 3 }, () => {
      const wrapper = mount(ActivityIndicator, { global: { plugins: [pinia] } });
      mounted.push(wrapper);
      return wrapper;
    });
    expect(observers).toHaveLength(1);
    const observer = observers[0]!;
    const roots = wrappers.map((wrapper) => wrapper.element);
    roots.forEach(stubIndicatorLayout);
    document.elementFromPoint = vi.fn((x: number, y: number) => {
      for (const el of roots) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
      }
      return null;
    }) as typeof document.elementFromPoint;
    expect(roots.every((root) => observer.targets.has(root))).toBe(true);

    observer.trigger(roots[0]!, true);
    observer.trigger(roots[1]!, true);
    observer.trigger(roots[2]!, true);
    await wrappers[0]!.vm.$nextTick();
    expect(roots.map((root) => root.classList.contains("ai-motion-paused"))).toEqual([
      false,
      false,
      true,
    ]);

    observer.trigger(roots[0]!, false);
    await wrappers[0]!.vm.$nextTick();
    expect(roots[0]!.classList.contains("ai-motion-paused")).toBe(true);
    expect(roots[2]!.classList.contains("ai-motion-paused")).toBe(false);

    motionChange?.({ matches: true } as MediaQueryListEvent);
    await wrappers[0]!.vm.$nextTick();
    expect(roots.every((root) => root.classList.contains("ai-motion-paused"))).toBe(true);
    motionChange?.({ matches: false } as MediaQueryListEvent);
    await wrappers[0]!.vm.$nextTick();
    expect(roots[1]!.classList.contains("ai-motion-paused")).toBe(false);

    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await wrappers[0]!.vm.$nextTick();
    expect(roots.every((root) => root.classList.contains("ai-motion-paused"))).toBe(true);
  });
});
