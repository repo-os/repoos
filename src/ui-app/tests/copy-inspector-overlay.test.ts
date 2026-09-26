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

    mount(CopyInspectorOverlay, { attachTo: document.body });
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
  });
});
