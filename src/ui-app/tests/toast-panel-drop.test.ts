/**
 * Regression tests for #1225: floating surfaces that share the toast stack's
 * top-right corner must publish their bottom edge as a CSS custom property the
 * toast panel drops below (`uiRecovery.setToastPanelDrop`), and clear it when
 * they go away — otherwise the recovery banner (z-index 1000) or the notice-bell
 * popover leaves the toasts' dismiss buttons dead underneath. The real layout
 * behaviour is verified by the headless QA pass
 * (`docs/qa/measure-toasts-banners-dialogs.mjs`); these tests pin the var
 * contract at the component level.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import UiRecoveryBanner from "../src/components/UiRecoveryBanner.vue";
import NoticeBell from "../src/components/NoticeBell.vue";
import {
  dismissRecovery,
  setToastPanelDrop,
  showOffline,
  TOAST_PANEL_DROP_BANNER_VAR,
  TOAST_PANEL_DROP_POPOVER_VAR,
} from "../src/lib/uiRecovery";

const dropVars = () => {
  const style = document.documentElement.style;
  return [
    style.getPropertyValue(TOAST_PANEL_DROP_BANNER_VAR),
    style.getPropertyValue(TOAST_PANEL_DROP_POPOVER_VAR),
  ];
};

afterEach(() => {
  setToastPanelDrop(TOAST_PANEL_DROP_BANNER_VAR, null);
  setToastPanelDrop(TOAST_PANEL_DROP_POPOVER_VAR, null);
  document.body.innerHTML = "";
});

describe("setToastPanelDrop", () => {
  it("publishes a drop relative to the stack's default top and clears on null", () => {
    setToastPanelDrop(TOAST_PANEL_DROP_BANNER_VAR, 200);
    const banner = document.documentElement.style.getPropertyValue(TOAST_PANEL_DROP_BANNER_VAR);
    // 200 (surface bottom) + 12 (gap) - the stack's 64px default top, with the
    // theme's safe-top so a device inset keeps composing.
    expect(banner).toBe("calc(200px + 12px - calc(64px + var(--safe-top)))");

    setToastPanelDrop(TOAST_PANEL_DROP_BANNER_VAR, null);
    expect(document.documentElement.style.getPropertyValue(TOAST_PANEL_DROP_BANNER_VAR)).toBe("");
  });

  it("uses one independent var per covering surface", () => {
    setToastPanelDrop(TOAST_PANEL_DROP_BANNER_VAR, 120);
    setToastPanelDrop(TOAST_PANEL_DROP_POPOVER_VAR, 300);
    const [banner, pop] = dropVars();
    expect(banner).toContain("120px");
    expect(pop).toContain("300px");
    setToastPanelDrop(TOAST_PANEL_DROP_BANNER_VAR, null);
    // Clearing one surface's drop leaves the other's untouched.
    expect(document.documentElement.style.getPropertyValue(TOAST_PANEL_DROP_POPOVER_VAR)).toContain(
      "300px",
    );
  });
});

describe("UiRecoveryBanner toast-drop publishing (#1225)", () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    dismissRecovery();
  });

  it("publishes the banner drop while visible and clears it on dismiss", async () => {
    showOffline("The server is temporarily unavailable.");
    wrapper = mount(UiRecoveryBanner, { attachTo: document.body });
    await wrapper.vm.$nextTick();

    const [banner] = dropVars();
    expect(banner).not.toBe("");

    const dismiss = [...document.body.querySelectorAll(".ui-recovery-banner button")].find((b) =>
      (b.textContent || "").includes("Dismiss"),
    );
    expect(dismiss).toBeTruthy();
    (dismiss as HTMLElement).click();
    await wrapper.vm.$nextTick();

    expect(document.documentElement.style.getPropertyValue(TOAST_PANEL_DROP_BANNER_VAR)).toBe("");
  });

  it("clears the banner drop on unmount", async () => {
    showOffline("The server is temporarily unavailable.");
    wrapper = mount(UiRecoveryBanner, { attachTo: document.body });
    await wrapper.vm.$nextTick();
    expect(dropVars()[0]).not.toBe("");

    wrapper.unmount();
    wrapper = null;
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.style.getPropertyValue(TOAST_PANEL_DROP_BANNER_VAR)).toBe("");
  });
});

describe("NoticeBell popover toast-drop publishing (#1225)", () => {
  let wrapper: VueWrapper | null = null;
  let router: Router;

  beforeEach(() => {
    setActivePinia(createPinia());
    router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", name: "work", component: { template: "<div />" } }],
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
  });

  it("publishes the popover drop while open and clears it when the popover closes", async () => {
    wrapper = mount(NoticeBell, {
      attachTo: document.body,
      global: { plugins: [router] },
    });
    expect(dropVars()[1]).toBe("");

    await wrapper.get('[data-test-id="notice-bell-trigger"]').trigger("click");
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.querySelector('[data-test-id="notice-bell-popover"]')).not.toBeNull();
    // happy-dom reports no layout, so the published value is a (negative)
    // calc — the contract under test is that the var is present while open.
    expect(dropVars()[1]).not.toBe("");

    await wrapper.get('[data-test-id="notice-bell-trigger"]').trigger("click");
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.querySelector('[data-test-id="notice-bell-popover"]')).toBeNull();
    expect(dropVars()[1]).toBe("");
  });

  it("clears the popover drop when the component unmounts while open", async () => {
    wrapper = mount(NoticeBell, {
      attachTo: document.body,
      global: { plugins: [router] },
    });
    await wrapper.get('[data-test-id="notice-bell-trigger"]').trigger("click");
    await new Promise((r) => setTimeout(r, 0));
    expect(dropVars()[1]).not.toBe("");

    wrapper.unmount();
    wrapper = null;
    await new Promise((r) => setTimeout(r, 0));
    expect(dropVars()[1]).toBe("");
  });
});
