// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async () => ({ value: null }),
    set: async () => undefined,
    remove: async () => undefined,
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
  },
}));
import { mount, flushPromises } from "@vue/test-utils";
import {
  normalizeAppearanceMode,
  normalizeDesignThemeId,
  resolveAppearance,
  applyThemesToDocument,
  DESIGN_THEMES,
  APPEARANCE_KEY,
  DESIGN_KEY,
  bootThemeFromStorage,
} from "../../../mobile/src/theme";
import { fixtureServers, readHubFixture, fixtureInitialRoute } from "../../../mobile/src/fixture";
import App from "../../../mobile/src/App.vue";

function stubMatchMedia(dark = true) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("light") ? !dark : dark,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

describe("mobile hub theme", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
    document.documentElement.removeAttribute("data-ui-theme");
    document.documentElement.removeAttribute("data-theme");
  });

  it("normalizes design theme ids and appearance modes", () => {
    expect(normalizeDesignThemeId("jelly")).toBe("jelly");
    expect(normalizeDesignThemeId("nope")).toBeNull();
    expect(normalizeAppearanceMode("system")).toBe("system");
    expect(normalizeAppearanceMode("auto")).toBeNull();
  });

  it("resolves system appearance from matchMedia", () => {
    expect(resolveAppearance("dark")).toBe("dark");
    expect(resolveAppearance("light")).toBe("light");
    expect(["dark", "light"]).toContain(resolveAppearance("system"));
  });

  it("persists and restores theme prefs via localStorage boot mirror", () => {
    localStorage.setItem(DESIGN_KEY, "gruvbox");
    localStorage.setItem(APPEARANCE_KEY, "light");
    const boot = bootThemeFromStorage();
    expect(boot.design).toBe("gruvbox");
    expect(boot.appearanceMode).toBe("light");
    applyThemesToDocument(boot.design, boot.appearanceMode);
    expect(document.documentElement.dataset.uiTheme).toBe("gruvbox");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("lists every web design theme the shell exposes", () => {
    expect(DESIGN_THEMES.map((t) => t.id)).toEqual([
      "classic",
      "clear",
      "gen z",
      "jelly",
      "gruvbox",
      "catppuccin",
      "solarized",
      "hypercolor",
    ]);
  });
});

describe("mobile hub fixtures", () => {
  it("seeds server list states for browser shots", () => {
    expect(fixtureServers("empty")).toEqual([]);
    expect(fixtureServers("one")).toHaveLength(1);
    expect(fixtureServers("many")).toHaveLength(3);
    expect(fixtureInitialRoute("settings")).toBe("settings");
  });

  it("readHubFixture returns null without a query", () => {
    expect(readHubFixture()).toBeNull();
  });
});

describe("mobile hub navigation", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });

  it("renders empty state fixture", async () => {
    window.history.replaceState({}, "", "/?fixture=empty");
    const wrapper = mount(App);
    await vi.waitFor(
      () => {
        expect(wrapper.find('[data-testid="hub-empty-state"]').exists()).toBe(true);
      },
      { timeout: 3000 },
    );
    window.history.replaceState({}, "", "/");
  });

  it("opens settings from header", async () => {
    window.history.replaceState({}, "", "/?fixture=one&appearance=dark");
    const wrapper = mount(App);
    await flushPromises();
    await flushPromises();
    await wrapper.get('[data-testid="hub-open-settings"]').trigger("click");
    expect(wrapper.find('[data-testid="hub-settings"]').exists()).toBe(true);
    window.history.replaceState({}, "", "/");
  });
});