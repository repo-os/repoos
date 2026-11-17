/**
 * Settings phone navigation density (#1148).
 *
 * At 390px the page used to stack a 2-column page-tab grid and a wrapping row
 * of 14 section chips before any setting control. The phone now gets a
 * single-row tab rail and one compact "Sections" disclosure; desktop keeps the
 * chip row unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { getConfigSchema } from "../../core/config.js";
import * as apiMod from "../src/api";
import { GENERAL_SECTIONS } from "../src/settings-location.js";
import { useConfigStore } from "../src/stores/config";
import type { ConfigField } from "../src/types";
import SettingsView from "../src/views/SettingsView.vue";

const api = vi.spyOn(apiMod, "api");

const routeState = reactive<{ query: Record<string, string | string[]> }>({ query: {} });
const replaceSpy = vi.fn(
  async (_to?: { query?: Record<string, string | string[]>; name?: string }) => {},
);

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: replaceSpy, push: vi.fn() }),
}));

let pinia: ReturnType<typeof createPinia>;

function stubViewport(narrow: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: narrow,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

async function mountSettings(): Promise<ReturnType<typeof mount>> {
  await useConfigStore().load();
  const wrapper = mount(SettingsView, {
    attachTo: document.body,
    global: { plugins: [pinia] },
  });
  await flushPromises();
  return wrapper;
}

function sectionChip(wrapper: ReturnType<typeof mount>, label: string) {
  const chip = wrapper
    .findAll(".settings-section-nav--phone .settings-section-chip")
    .find((c) => c.text() === label);
  expect(chip, label).toBeDefined();
  return chip!;
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  routeState.query = { tab: "general" };
  replaceSpy.mockReset();
  replaceSpy.mockImplementation(async (to?: { query?: Record<string, string | string[]> }) => {
    if (to?.query !== undefined) routeState.query = { ...to.query };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
  api.mockResolvedValue({
    config: {},
    schema: getConfigSchema() as ConfigField[],
  });
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Settings phone navigation density (#1148)", () => {
  it("shows one tab rail and a collapsed section disclosure", async () => {
    stubViewport(true);
    const wrapper = await mountSettings();

    expect(wrapper.find(".settings-mobile-nav").exists()).toBe(true);
    expect(wrapper.findAll(".settings-mobile-nav-btn")).toHaveLength(7);
    expect(wrapper.find(".settings-section-jump").exists()).toBe(true);
    expect(wrapper.find(".settings-section-jump-btn").attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".settings-section-jump-value").text()).toBe("Browse all");

    // The full chip list stays rendered but collapsed, so the first screen is
    // tab rail → section control → selected section content.
    const panel = wrapper.find(".settings-section-nav--phone");
    expect(panel.exists()).toBe(true);
    expect(panel.isVisible()).toBe(false);
    expect(wrapper.findAll(".settings-section-nav--phone .settings-section-chip")).toHaveLength(
      GENERAL_SECTIONS.length,
    );

    wrapper.unmount();
  });

  it("opens the section list and navigates to the chosen section", async () => {
    stubViewport(true);
    const wrapper = await mountSettings();

    await wrapper.find(".settings-section-jump-btn").trigger("click");
    expect(wrapper.find(".settings-section-jump-btn").attributes("aria-expanded")).toBe("true");
    expect(wrapper.find(".settings-section-nav--phone").isVisible()).toBe(true);

    await sectionChip(wrapper, "Board").trigger("click");
    expect(replaceSpy).toHaveBeenCalledWith({
      name: "settings",
      query: { tab: "general", section: "board" },
    });
    expect(wrapper.find(".settings-section-jump-btn").attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".settings-section-jump-value").text()).toBe("Board");

    wrapper.unmount();
  });

  it("names the active section and marks its chip", async () => {
    stubViewport(true);
    routeState.query = { tab: "general", section: "automation" };
    const wrapper = await mountSettings();

    expect(wrapper.find(".settings-section-jump-value").text()).toBe("Automation & approval");
    expect(wrapper.find(".settings-section-nav--phone .settings-section-chip.active").text()).toBe(
      "Automation & approval",
    );

    wrapper.unmount();
  });

  it("closes the section list on Escape from a chip and restores focus", async () => {
    stubViewport(true);
    const wrapper = await mountSettings();

    await wrapper.find(".settings-section-jump-btn").trigger("click");
    expect(wrapper.find(".settings-section-nav--phone").isVisible()).toBe(true);

    const chip = sectionChip(wrapper, "Themes");
    (chip.element as HTMLElement).focus();
    await chip.trigger("keydown", { key: "Escape" });
    expect(wrapper.find(".settings-section-nav--phone").isVisible()).toBe(false);
    expect(wrapper.find(".settings-section-jump-btn").attributes("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(wrapper.find(".settings-section-jump-btn").element);

    wrapper.unmount();
  });

  it("scrolls the rail to the active tab without moving the page", async () => {
    stubViewport(true);
    routeState.query = { tab: "general" };
    const wrapper = await mountSettings();

    const rail = wrapper.find(".settings-mobile-nav").element as HTMLElement;
    // Give the rail a real viewport so the reveal maths has something to do:
    // the target pill starts outside the visible strip.
    rail.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 390, bottom: 44, width: 390, height: 44 }) as DOMRect;
    Object.defineProperty(rail, "clientWidth", { value: 390, configurable: true });
    rail.scrollLeft = 0;
    wrapper.findAll(".settings-mobile-nav-btn").forEach((btn, index) => {
      (btn.element as HTMLElement).getBoundingClientRect = () =>
        ({
          left: index * 100,
          top: 0,
          right: index * 100 + 80,
          bottom: 44,
          width: 80,
          height: 44,
        }) as DOMRect;
    });

    const target = wrapper.findAll(".settings-mobile-nav-btn")[4]!;
    await target.trigger("click");
    await flushPromises();
    await flushPromises();

    expect(rail.scrollLeft).toBeGreaterThan(0);
    // The reveal must never fall back to scrolling the page.
    const scrollSpy = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
    expect(scrollSpy.mock.contexts).not.toContain(target.element);

    wrapper.unmount();
  });

  it("dismisses the section list on a tap outside it", async () => {
    stubViewport(true);
    const wrapper = await mountSettings();

    await wrapper.find(".settings-section-jump-btn").trigger("click");
    expect(wrapper.find(".settings-section-nav--phone").isVisible()).toBe(true);

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(wrapper.find(".settings-section-nav--phone").isVisible()).toBe(false);
    expect(wrapper.find(".settings-section-jump-btn").attributes("aria-expanded")).toBe("false");

    wrapper.unmount();
  });

  it("keeps the desktop chip row and drops the phone-only controls", async () => {
    stubViewport(false);
    const wrapper = await mountSettings();

    expect(wrapper.find(".settings-mobile-nav").exists()).toBe(false);
    expect(wrapper.find(".settings-section-jump").exists()).toBe(false);
    const panel = wrapper.find(".settings-section-nav");
    expect(panel.exists()).toBe(true);
    expect(panel.classes()).not.toContain("settings-section-nav--phone");
    expect(panel.isVisible()).toBe(true);

    await wrapper.findAll(".settings-section-chip")[3]!.trigger("click");
    expect(replaceSpy).toHaveBeenCalledWith({
      name: "settings",
      query: { tab: "general", section: GENERAL_SECTIONS[3]!.id },
    });

    wrapper.unmount();
  });
});

describe("Settings phone scroll containers keep focus rings visible (#1148)", () => {
  const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");

  // A scroll container clips at its padding box, so a focus ring at +2px never
  // paints on the first/last item. Every focusable row we put inside one must
  // draw its ring inside the control.
  const cases = [
    {
      name: "phone tab rail",
      rule: /\.settings-mobile-nav-btn:focus-visible\s*\{[^}]*outline-offset:\s*-2px/s,
    },
    {
      name: "phone section list",
      rule: /\.settings-section-nav--phone \.settings-section-chip:focus-visible\s*\{[^}]*outline-offset:\s*-2px/s,
    },
  ];

  it.each(cases)("keeps the $name ring inside the scrolling padding box", ({ rule }) => {
    expect(css).toMatch(rule);
  });

  it("leaves the non-scrolling desktop chip ring outside the control", () => {
    expect(css).toMatch(/\.settings-section-chip:focus-visible\s*\{[^}]*outline-offset:\s*2px/s);
  });

  it("keeps phone controls at the 44px touch target and snaps the rail", () => {
    expect(css).toMatch(/\.settings-page \.settings-section-chip\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.settings-mobile-nav\s*\{[^}]*scroll-snap-type:\s*x proximity/s);
    expect(css).toMatch(/\.settings-mobile-nav-btn\s*\{[^}]*scroll-snap-align:\s*start/s);
  });
});
