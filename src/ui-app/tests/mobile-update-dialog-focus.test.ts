// @vitest-environment jsdom
/**
 * Hub dev-update dialog keyboard behaviour (QA #1271 review round 2).
 *
 * The update prompt is a modal (`aria-modal="true"`) over the server list. It
 * must take focus when it opens, keep Tab inside itself, treat Escape as
 * "Later" (snooze), and hand focus back to the control that had it when it
 * closes. It shares `useModalFocus` with the bottom sheet, so this also pins
 * that the two dialogs use the same handling.
 */
import { afterEach, describe, expect, it } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import DevUpdateDialog from "../../../mobile/src/components/DevUpdateDialog.vue";
import type { DevUpdateManifest } from "../../../mobile/src/dev-updates";

const UPDATE: DevUpdateManifest = {
  commit: "abcdef1234567",
  notes: ["Fix the picker"],
} as DevUpdateManifest;

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
});

function mountDialog() {
  const trigger = document.createElement("button");
  trigger.textContent = "Servers";
  document.body.appendChild(trigger);
  trigger.focus();
  wrapper = mount(DevUpdateDialog, {
    props: { update: UPDATE },
    attachTo: document.body,
  });
  return { trigger, dialog: wrapper };
}

function activeLabel(): string {
  const el = document.activeElement as HTMLElement | null;
  return el?.textContent?.trim() ?? "";
}

function root(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".update-backdrop");
  if (!el) throw new Error("dialog is not mounted");
  return el;
}

describe("mobile dev update dialog focus", () => {
  it("moves focus into the dialog on open", async () => {
    mountDialog();
    await flushPromises();
    expect(document.activeElement?.closest(".update-dialog")).not.toBeNull();
  });

  it("is teleported to body as a floating overlay layer", async () => {
    // A fixed overlay inside the page tree is trapped by an ancestor's stacking
    // context (AGENTS.md: fixed overlays teleport to body).
    const { dialog } = mountDialog();
    await flushPromises();
    expect(root().parentElement).toBe(document.body);
    expect(root().getAttribute("data-overlay-layer")).toBe("floating");
    dialog.unmount();
    wrapper = null;
  });

  it.each([
    ["Tab from the last control wraps to the first", "Later", "Tab", false, "Download now"],
    ["Shift+Tab from the first control wraps to the last", "Download now", "Tab", true, "Later"],
    ["Shift+Tab from the dialog wraps to the last", "dialog", "Tab", true, "Later"],
  ])("%s", async (_name, from, key, shiftKey, expected) => {
    mountDialog();
    await flushPromises();
    if (from === "dialog") {
      document.querySelector<HTMLElement>(".update-dialog")?.focus();
    } else {
      [...document.querySelectorAll<HTMLElement>(".update-dialog button")]
        .find((el) => el.textContent?.trim() === from)
        ?.focus();
    }
    root().dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
    expect(activeLabel()).toBe(expected);
  });

  it("treats Escape as Later", async () => {
    const { dialog } = mountDialog();
    await flushPromises();
    root().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dialog.emitted("later")).toHaveLength(1);
  });

  it("returns focus to the control that was focused before it opened", async () => {
    const { trigger } = mountDialog();
    await flushPromises();
    wrapper?.unmount();
    wrapper = null;
    expect(document.activeElement).toBe(trigger);
  });
});
