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
});
