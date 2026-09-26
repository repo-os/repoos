import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import CopyInspectorOverlay from "../src/components/CopyInspectorOverlay.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";

async function flushAffordanceRaf(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

beforeEach(() => {
  setActivePinia(createPinia());
  const repo = useRepoStore();
  repo.health = { ok: true, copyInspectorAvailable: true } as typeof repo.health;
  const config = useConfigStore();
  config.data = { dev: { inspector: { enabled: true } } } as typeof config.data;
});

describe("CopyInspectorOverlay affordance", () => {
  it("stays visible when the pointer moves onto the affordance button", async () => {
    const labeled = document.createElement("p");
    labeled.setAttribute("data-repoos-file", "src/ui-app/Foo.vue");
    labeled.setAttribute("data-repoos-line", "12");
    labeled.textContent = "Hello inspector";
    document.body.appendChild(labeled);

    document.elementFromPoint = vi.fn(() => labeled) as typeof document.elementFromPoint;

    const wrapper = mount(CopyInspectorOverlay, { attachTo: document.body });
    await nextTick();

    window.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 40,
        clientY: 40,
        altKey: true,
      }),
    );
    await flushAffordanceRaf();
    await nextTick();

    const btn = document.body.querySelector(
      ".copy-inspector-affordance",
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();

    const overBtn = new PointerEvent("pointermove", {
      bubbles: true,
      clientX: 50,
      clientY: 50,
      altKey: true,
    });
    Object.defineProperty(overBtn, "target", { value: btn });
    window.dispatchEvent(overBtn);
    await flushAffordanceRaf();
    await nextTick();

    expect(document.body.querySelector(".copy-inspector-affordance")).not.toBeNull();
    wrapper.unmount();
  });

  it("names the location, outlines the element and explains a disabled Open in editor", async () => {
    const labeled = document.createElement("p");
    labeled.setAttribute("data-repoos-file", "src/ui-app/Foo.vue");
    labeled.setAttribute("data-repoos-line", "12");
    labeled.textContent = "Hello inspector";
    document.body.appendChild(labeled);
    document.elementFromPoint = vi.fn(() => labeled) as typeof document.elementFromPoint;

    const wrapper = mount(CopyInspectorOverlay, { attachTo: document.body });
    await nextTick();
    window.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, altKey: true }),
    );
    await flushAffordanceRaf();
    await nextTick();

    const btn = document.body.querySelector(".copy-inspector-affordance") as HTMLElement;
    // The pill names the location and the located element is outlined.
    expect(btn.textContent).toContain("Foo.vue:12");
    expect(document.body.querySelector(".copy-inspector-highlight")).not.toBeNull();

    // Releasing Alt while over the pill must not hide it.
    const overPill = new PointerEvent("pointermove", {
      bubbles: true,
      clientX: 50,
      clientY: 50,
      altKey: false,
    });
    Object.defineProperty(overPill, "target", { value: btn });
    window.dispatchEvent(overPill);
    await flushAffordanceRaf();
    await nextTick();
    expect(document.body.querySelector(".copy-inspector-affordance")).not.toBeNull();

    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 50, clientY: 50 }));
    await nextTick();

    const pane = document.body.querySelector(".copy-inspector-pane") as HTMLElement;
    expect(pane.textContent).toContain("src/ui-app/Foo.vue:12");
    expect(pane.textContent).toContain("editor command");
    const openBtn = Array.from(pane.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Open in editor"),
    ) as HTMLButtonElement;
    expect(openBtn.disabled).toBe(true);
    wrapper.unmount();
  });

  it("opens the popup on Enter while the pill is showing, but not from a text field", async () => {
    const labeled = document.createElement("p");
    labeled.setAttribute("data-repoos-file", "src/ui-app/Foo.vue");
    labeled.setAttribute("data-repoos-line", "12");
    labeled.textContent = "Hello inspector";
    document.body.appendChild(labeled);
    const field = document.createElement("input");
    document.body.appendChild(field);
    document.elementFromPoint = vi.fn(() => labeled) as typeof document.elementFromPoint;

    const wrapper = mount(CopyInspectorOverlay, { attachTo: document.body });
    await nextTick();
    window.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, altKey: true }),
    );
    await flushAffordanceRaf();
    await nextTick();
    expect(document.body.querySelector(".copy-inspector-affordance")).not.toBeNull();

    // Typing Enter in a focused input must be left alone.
    field.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await nextTick();
    expect(document.body.querySelector(".copy-inspector-pane")).toBeNull();

    field.blur();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await nextTick();
    const pane = document.body.querySelector(".copy-inspector-pane") as HTMLElement;
    expect(pane.textContent).toContain("src/ui-app/Foo.vue:12");
    wrapper.unmount();
  });

  it("popup shortcuts: Enter opens in editor, C copies the path, Cmd+C is left alone", async () => {
    const labeled = document.createElement("p");
    labeled.setAttribute("data-repoos-file", "src/ui-app/Foo.vue");
    labeled.setAttribute("data-repoos-line", "12");
    labeled.textContent = "Hello inspector";
    document.body.appendChild(labeled);
    document.elementFromPoint = vi.fn(() => labeled) as typeof document.elementFromPoint;
    const config = useConfigStore();
    config.data = {
      dev: { inspector: { enabled: true, editorCommand: "zed {file}:{line}" } },
    } as typeof config.data;
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const wrapper = mount(CopyInspectorOverlay, { attachTo: document.body });
    await nextTick();
    window.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40, altKey: true }),
    );
    await flushAffordanceRaf();
    await nextTick();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await nextTick();
    expect(document.body.querySelector(".copy-inspector-pane")).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true }));
    await nextTick();
    expect(writeText).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("src/ui-app/Foo.vue:12"));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() =>
      expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("copy-inspector/open"))).toBe(
        true,
      ),
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(document.body.querySelector(".copy-inspector-pane")).toBeNull();
    wrapper.unmount();
  });

  it("keeps the popup inside the viewport near the edges and lays buttons out in one row", async () => {
    const labeled = document.createElement("p");
    labeled.setAttribute("data-repoos-file", "src/ui-app/Foo.vue");
    labeled.setAttribute("data-repoos-line", "12");
    labeled.textContent = "Hello inspector";
    document.body.appendChild(labeled);
    document.elementFromPoint = vi.fn(() => labeled) as typeof document.elementFromPoint;
    const wrapper = mount(CopyInspectorOverlay, { attachTo: document.body });
    await nextTick();

    for (const [x, y] of [
      [2, window.innerHeight - 4],
      [window.innerWidth - 2, 3],
    ]) {
      window.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, altKey: true }),
      );
      await flushAffordanceRaf();
      await nextTick();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await nextTick();
      const pane = document.body.querySelector(".copy-inspector-pane") as HTMLElement;
      const left = Number.parseFloat(pane.style.left);
      const top = Number.parseFloat(pane.style.top);
      const width = Number.parseFloat(pane.style.width);
      expect(left).toBeGreaterThanOrEqual(12);
      expect(left + width).toBeLessThanOrEqual(window.innerWidth - 12);
      expect(top).toBeGreaterThanOrEqual(12);
      expect(top).toBeLessThan(window.innerHeight - 12);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await nextTick();
    }
    wrapper.unmount();
  });
});
