// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  normalizeAppearanceMode,
  normalizeDesignThemeId,
  resolveAppearance,
  applyThemesToDocument,
  DESIGN_THEMES,
  APPEARANCE_KEY,
  DESIGN_KEY,
  bootThemeFromStorage,
} from "../../../mobile/src/theme-core";
import { fixtureServers, fixtureInitialRoute, readHubFixture } from "../../../mobile/src/fixture";
import { loadThemePrefs, saveAppearanceMode, saveDesignTheme } from "../../../mobile/src/theme";
import { loadConfig } from "../../core/config.js";
import { resolveShotTargets } from "../../core/shot-targets.js";

const prefStore = new Map<string, string>();

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({
      value: prefStore.get(key) ?? null,
    })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      prefStore.set(key, value);
    }),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock("@capacitor/status-bar", () => ({
  StatusBar: { setStyle: vi.fn(), setBackgroundColor: vi.fn() },
  Style: { Light: "LIGHT", Dark: "DARK" },
}));

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

function setLocationSearch(search: string) {
  const url = new URL(window.location.href);
  url.search = search;
  window.history.replaceState({}, "", url.pathname + search);
}

describe("mobile hub theme", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
    prefStore.clear();
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

describe("mobile hub theme persistence (Preferences)", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
    prefStore.clear();
  });

  it("loads and saves design theme and appearance mode", async () => {
    await saveDesignTheme("solarized");
    await saveAppearanceMode("dark");
    const prefs = await loadThemePrefs();
    expect(prefs.design).toBe("solarized");
    expect(prefs.appearanceMode).toBe("dark");
    expect(localStorage.getItem(DESIGN_KEY)).toBe("solarized");
    expect(localStorage.getItem(APPEARANCE_KEY)).toBe("dark");
  });
});

describe("mobile hub fixtures and navigation", () => {
  beforeEach(() => {
    setLocationSearch("");
  });

  it("seeds server list states for browser shots", () => {
    expect(fixtureServers("empty")).toEqual([]);
    expect(fixtureServers("one")).toHaveLength(1);
    expect(fixtureServers("many")).toHaveLength(3);
    expect(fixtureServers("unreachable")).toHaveLength(1);
    expect(fixtureServers("unreachable")?.[0]?.name).toBe("offline");
    expect(fixtureServers("settings")).toBeNull();
    expect(fixtureServers("add")).toBeNull();
  });

  it("routes settings and add fixtures to the right initial screen", () => {
    expect(fixtureInitialRoute("settings")).toBe("settings");
    expect(fixtureInitialRoute("add")).toBe("add");
    expect(fixtureInitialRoute("one")).toBe("picker");
    expect(fixtureInitialRoute("many")).toBe("picker");
    expect(fixtureInitialRoute("empty")).toBe("picker");
  });

  it("reads fixture ids from the location query", () => {
    setLocationSearch("?fixture=settings");
    expect(readHubFixture()).toBe("settings");
    expect(fixtureInitialRoute(readHubFixture())).toBe("settings");
    setLocationSearch("?fixture=unknown");
    expect(readHubFixture()).toBeNull();
  });
});

describe("mobile preview target", () => {
  it("resolves repoos-mobile-dev from mobile/** path changes", () => {
    const config = loadConfig(process.cwd());
    const r = resolveShotTargets(config.preview, "mobile", ["mobile/src/App.vue"]);
    expect(r.names).toContain("repoos-mobile-dev");
  });
});
