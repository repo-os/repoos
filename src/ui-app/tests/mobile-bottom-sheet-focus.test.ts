// @vitest-environment jsdom
/**
 * Hub bottom sheet keyboard behaviour (QA #1271).
 *
 * The rename sheet is a modal dialog. It must take focus when it opens, keep
 * Tab inside itself, close on Escape and hand focus back to the control that
 * opened it. Before this, focus stayed on the server row behind the scrim and
 * Escape did nothing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import BottomSheet from "../../../mobile/src/components/BottomSheet.vue";

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
});

function mountSheet() {
  const trigger = document.createElement("button");
  trigger.textContent = "Edit dev";
  document.body.appendChild(trigger);
  trigger.focus();
  wrapper = mount(BottomSheet, {
    props: { title: "Edit server", open: false },
    slots: { default: '<input aria-label="Display name" /><button>Delete</button><button>Save</button>' },
    attachTo: document.body,
  });
  return { trigger, sheet: wrapper };
}

function activeLabel(): string {
  const el = document.activeElement as HTMLElement | null;
  return el?.getAttribute("aria-label") ?? el?.textContent?.trim() ?? "";
}

function root(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".sheet-root");
  if (!el) throw new Error("sheet is not open");
  return el;
}

describe("mobile bottom sheet focus", () => {
  it("moves focus into the panel on open", async () => {
    const { sheet } = mountSheet();
    await sheet.setProps({ open: true });
    await flushPromises();
    expect(document.activeElement?.closest(".sheet-panel")).not.toBeNull();
  });

  it.each([
    ["Tab from the last control wraps to the first", "Save", "Tab", false, "Close"],
    ["Shift+Tab from the first control wraps to the last", "Close", "Tab", true, "Save"],
    ["Shift+Tab from the panel wraps to the last", "panel", "Tab", true, "Save"],
  ])("%s", async (_name, from, key, shiftKey, expected) => {
    const { sheet } = mountSheet();
    await sheet.setProps({ open: true });
    await flushPromises();
    if (from === "panel") {
      document.querySelector<HTMLElement>(".sheet-panel")?.focus();
    } else {
      const control = [...document.querySelectorAll<HTMLElement>(".sheet-panel button")].find(
        (el) => (el.getAttribute("aria-label") ?? el.textContent?.trim()) === from,
      );
      control?.focus();
    }
    root().dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
    expect(activeLabel()).toBe(expected);
  });

  it("closes on Escape", async () => {
    const { sheet } = mountSheet();
    await sheet.setProps({ open: true });
    await flushPromises();
    root().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(sheet.emitted("close")).toHaveLength(1);
  });

  it("returns focus to the control that opened it", async () => {
    const { sheet, trigger } = mountSheet();
    await sheet.setProps({ open: true });
    await flushPromises();
    await sheet.setProps({ open: false });
    await flushPromises();
    expect(document.activeElement).toBe(trigger);
  });
});
