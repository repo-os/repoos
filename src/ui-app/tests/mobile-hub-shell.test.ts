// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
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
import { fixtureServers, fixtureInitialRoute } from "../../../mobile/src/fixture";

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
    expect(fixtureServers("unreachable")).toHaveLength(1);
    expect(fixtureServers("unreachable")?.[0]?.name).toBe("offline");
    expect(fixtureInitialRoute("settings")).toBe("settings");
    expect(fixtureInitialRoute("add")).toBe("add");
  });
});
