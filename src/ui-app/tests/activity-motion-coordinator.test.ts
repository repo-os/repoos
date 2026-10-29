import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActivityIndicator from "../src/components/ActivityIndicator.vue";
import { useConfigStore } from "../src/stores/config";

type Entry = { target: Element; isIntersecting: boolean };
type Callback = (entries: Entry[]) => void;
const observers: FakeIntersectionObserver[] = [];
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
  trigger(target: Element, isIntersecting: boolean): void {
    this.callback([{ target, isIntersecting }]);
  }
}

describe("activity animation coordinator", () => {
  const mounted: ReturnType<typeof mount>[] = [];
  const originalObserver = globalThis.IntersectionObserver;
  let oldVisibility: PropertyDescriptor | undefined;

  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    globalThis.IntersectionObserver = originalObserver;
    if (oldVisibility) Object.defineProperty(document, "visibilityState", oldVisibility);
    vi.restoreAllMocks();
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
    useConfigStore(pinia).form.activityAnimationConcurrency = 2;
    const wrappers = Array.from({ length: 3 }, () => {
      const wrapper = mount(ActivityIndicator, { global: { plugins: [pinia] } });
      mounted.push(wrapper);
      return wrapper;
    });
    expect(observers).toHaveLength(1);
    const observer = observers[0]!;
    const roots = wrappers.map((wrapper) => wrapper.element);
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
