/**
 * Overlay click isolation (#0575).
 *
 * A click on a floating layer must be consumed by that layer: it may not fall
 * through to the side panel (or its inline title editor) behind it, and it may
 * not read as "outside" and dismiss that panel. Intentional dismiss targets —
 * the panel's own scrim, an unmarked click outside — must keep working.
 *
 * jsdom does no hit-testing, so the "does not fall through" half is asserted
 * as the two things that produce it: the layer marker on every teleported
 * overlay, and the `[data-overlay-layer] { pointer-events: auto }` rule that
 * keeps the marker hit-testable while Radix has `pointer-events: none` on
 * `<body>`. The dismissal half is exercised for real.
 */
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import DialogContent from "../src/components/ui/dialog/content.vue";
import DialogOverlay from "../src/components/ui/dialog/overlay.vue";
import DialogRoot from "../src/components/ui/dialog/root.vue";
import HotfixConfirmDialog from "../src/components/HotfixConfirmDialog.vue";
import UiRecoveryBanner from "../src/components/UiRecoveryBanner.vue";
import { dismissRecovery, showOffline } from "../src/lib/uiRecovery";

const APP = resolve(__dirname, "../src");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Open a panel (the task drawer's shell) and record every close request. */
function mountPanel(): { closed: boolean[]; wrapper: VueWrapper } {
  const closed: boolean[] = [];
  const wrapper = mount(
    defineComponent({
      setup() {
        return () =>
          h(
            DialogRoot,
            {
              open: true,
              "onUpdate:open": (v: boolean) => {
                if (!v) closed.push(v);
              },
            },
            {
              default: () => [
                h(DialogOverlay),
                h(
                  DialogContent,
                  { class: "task-drawer-shell" },
                  {
                    default: () => h("span", { class: "task-title-text" }, "Title"),
                  },
                ),
              ],
            },
          );
      },
    }),
    { attachTo: document.body },
  );
  return { closed, wrapper };
}

/** One pointerdown, as Radix's outside-interaction listener sees it. */
async function pointerDown(target: Element): Promise<void> {
  target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  await nextTick();
  await sleep(20);
}

afterEach(() => {
  dismissRecovery();
  document.body.innerHTML = "";
  document.body.style.pointerEvents = "";
});

describe("overlay layer isolation (#0575)", () => {
  it("keeps a click on a body-teleported layer from dismissing the panel behind it", async () => {
    showOffline("The server is temporarily unavailable.");
    const { closed, wrapper } = mountPanel();
    await nextTick();
    await sleep(10);
    const banner = mount(UiRecoveryBanner, { attachTo: document.body });
    await nextTick();

    const card = document.body.querySelector(".ui-recovery-banner") as HTMLElement;
    expect(card).not.toBeNull();
    // Radix has made everything outside the panel click-transparent, which is
    // exactly why an unmarked layer used to fall through to the panel below.
    expect(document.body.style.pointerEvents).toBe("none");
    expect(card.getAttribute("data-overlay-layer")).toBe("floating");

    await pointerDown(card.querySelector("button") as Element);

    expect(closed).toEqual([]);
    await wrapper.unmount();
    await banner.unmount();
  });

  it("still dismisses the panel from its own scrim and from a click outside every layer", async () => {
    const { closed, wrapper } = mountPanel();
    await nextTick();
    await sleep(10);

    const scrim = document.body.querySelector(".overlay") as HTMLElement;
    expect(scrim).not.toBeNull();
    await pointerDown(scrim);
    expect(closed, "the panel's own scrim is still its dismiss target").toEqual([false]);

    const stray = document.createElement("div");
    document.body.appendChild(stray);
    await pointerDown(stray);
    expect(closed, "a click outside every layer still dismisses").toEqual([false, false]);

    await wrapper.unmount();
  });

  it("gives one dialog's content and scrim the same non-empty layer id", async () => {
    const { wrapper } = mountPanel();
    await nextTick();

    const content = document.body.querySelector(".task-drawer-shell") as HTMLElement;
    const scrim = document.body.querySelector(".overlay") as HTMLElement;
    const contentId = content.getAttribute("data-overlay-layer");
    const scrimId = scrim.getAttribute("data-overlay-layer");
    expect(contentId).toBeTruthy();
    expect(scrimId).toBe(contentId);

    await wrapper.unmount();
  });

  it("does not dismiss the panel for a click inside a dialog layered above it", async () => {
    const { closed, wrapper } = mountPanel();
    await nextTick();
    await sleep(10);

    const upper = mount(
      defineComponent({
        setup() {
          return () =>
            h(
              DialogRoot,
              { open: true },
              {
                default: () => [
                  h(DialogOverlay),
                  h(
                    DialogContent,
                    {},
                    { default: () => h("button", { class: "upper-btn" }, "Go") },
                  ),
                ],
              },
            );
        },
      }),
      { attachTo: document.body },
    );
    await nextTick();
    await sleep(10);

    await pointerDown(document.body.querySelector(".upper-btn") as Element);
    expect(closed).toEqual([]);

    upper.unmount();
    await wrapper.unmount();
  });

  it("keeps a confirm dialog's own controls and scrim away from the panel behind", async () => {
    const { closed, wrapper } = mountPanel();
    await nextTick();
    await sleep(10);
    let cancelled = 0;
    const confirm = mount(HotfixConfirmDialog, {
      attachTo: document.body,
      props: { open: true, taskId: "0575", busy: false },
      attrs: { onCancel: () => (cancelled += 1) },
    });
    await nextTick();
    await sleep(10);

    const root = document.body.querySelector(".hotfix-overlay") as HTMLElement;
    expect(root.getAttribute("data-overlay-layer")).toBe("floating");

    // A primary/secondary button inside the confirm belongs to the confirm…
    await pointerDown(root.querySelector(".hotfix-actions button") as Element);
    // …and so does its dimmed scrim, even though both are outside the panel.
    await pointerDown(root);
    expect(closed).toEqual([]);

    // The confirm's own dismissal is untouched: its scrim click is @click.self.
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    expect(cancelled).toBe(1);

    confirm.unmount();
    await wrapper.unmount();
  });

  it("keeps a marked layer hit-testable while <body> is click-transparent", () => {
    const css = readFileSync(join(APP, "style.css"), "utf8");
    const rule = css.match(/\[data-overlay-layer\]\s*\{[^}]*\}/);
    expect(rule, "style.css must keep the hit-test rule").not.toBeNull();
    const style = document.createElement("style");
    style.textContent = rule?.[0] ?? "";
    document.head.appendChild(style);

    // What Radix does to <body> while a panel is open: unmarked layers then
    // inherit `none` and the click falls through them (#0575).
    document.body.style.pointerEvents = "none";
    const marked = document.createElement("div");
    marked.setAttribute("data-overlay-layer", "floating");
    const unmarked = document.createElement("div");
    document.body.append(marked, unmarked);

    expect(getComputedStyle(marked).pointerEvents).toBe("auto");
    expect(getComputedStyle(unmarked).pointerEvents).toBe("none");

    style.remove();
  });

  it("marks every hand-teleported overlay root and keeps the hit-test rule", () => {
    const marked = [
      "components/UiRecoveryBanner.vue",
      "components/SearchOverlay.vue",
      "components/ChatJumpToLatest.vue",
      "components/HotfixConfirmDialog.vue",
      "components/StopWorkConfirmModal.vue",
      "components/DirtyCheckoutDialog.vue",
      "components/SendToEngineerDialog.vue",
      "components/ToastPanel.vue",
      "components/CopyInspectorOverlay.vue",
      "views/DeploymentsView.vue",
    ];
    for (const rel of marked) {
      const source = readFileSync(join(APP, rel), "utf8");
      expect(source, `${rel} must carry data-overlay-layer`).toContain("data-overlay-layer");
    }

    const css = readFileSync(join(APP, "style.css"), "utf8");
    expect(css).toMatch(/\[data-overlay-layer\]\s*\{\s*pointer-events:\s*auto;/);
  });
});
