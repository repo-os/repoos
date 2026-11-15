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
  mirrorThemePrefs,
} from "../../../mobile/src/theme-core";
import { fixtureServers, fixtureInitialRoute, readHubFixture } from "../../../mobile/src/fixture";
import { resolveShotTargets } from "../../core/shot-targets.js";

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

  it("mirrors design and appearance mode for Preferences-backed persistence", () => {
    mirrorThemePrefs("solarized", "dark");
    expect(localStorage.getItem(DESIGN_KEY)).toBe("solarized");
    expect(localStorage.getItem(APPEARANCE_KEY)).toBe("dark");
    const boot = bootThemeFromStorage();
    expect(boot.design).toBe("solarized");
    expect(boot.appearanceMode).toBe("dark");
    applyThemesToDocument(boot.design, boot.appearanceMode);
    expect(document.documentElement.dataset.uiTheme).toBe("solarized");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("persists system appearance mode and resolves it from matchMedia", () => {
    stubMatchMedia(false);
    mirrorThemePrefs("jelly", "system");
    expect(localStorage.getItem(APPEARANCE_KEY)).toBe("system");
    const boot = bootThemeFromStorage();
    expect(boot.appearanceMode).toBe("system");
    applyThemesToDocument(boot.design, boot.appearanceMode);
    expect(document.documentElement.dataset.theme).toBe("light");
    stubMatchMedia(true);
    applyThemesToDocument(boot.design, boot.appearanceMode);
    expect(document.documentElement.dataset.theme).toBe("dark");
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

describe("mobile hub server list states", () => {
  it.each([
    ["empty", 0, [] as string[]],
    ["one", 1, ["dev"]],
    ["many", 3, ["dev", "celleris", "staging"]],
    ["unreachable", 1, ["offline"]],
  ] as const)("%s fixture seeds %i servers", (fixture, count, names) => {
    const servers = fixtureServers(fixture) ?? [];
    expect(servers).toHaveLength(count);
    expect(servers.map((s) => s.name)).toEqual(names);
    expect(fixtureInitialRoute(fixture)).toBe("picker");
    for (const server of servers) {
      expect(server.url).toMatch(/^https:\/\//);
    }
  });
});

describe("mobile hub settings navigation", () => {
  it("seeds the discovery fixture with a trusted server and import rows", () => {
    setLocationSearch("?fixture=discover");
    expect(readHubFixture()).toBe("discover");
    expect(fixtureInitialRoute(readHubFixture())).toBe("discover");
    expect(fixtureServers(readHubFixture())).toHaveLength(3);
  });

  it("opens settings and add flows from fixture query params", () => {
    setLocationSearch("?fixture=settings");
    expect(fixtureInitialRoute(readHubFixture())).toBe("settings");
    setLocationSearch("?fixture=add");
    expect(fixtureInitialRoute(readHubFixture())).toBe("add");
    setLocationSearch("?fixture=one");
    expect(fixtureInitialRoute(readHubFixture())).toBe("picker");
    expect(fixtureServers(readHubFixture())).toHaveLength(1);
  });

  it("does not inject servers for settings or add fixtures", () => {
    expect(fixtureServers("settings")).toBeNull();
    expect(fixtureServers("add")).toBeNull();
  });
});

describe("mobile preview target", () => {
  it("resolves repoos-mobile-dev when that preview target is registered", () => {
    const preview = {
      targets: [
        {
          name: "repoos-mobile-dev",
          areas: ["mobile"],
          paths: ["mobile/**"],
          command: "bun run dev -- --port {port} --host {host} --strictPort",
          cwd: "mobile",
        },
      ],
    };
    const r = resolveShotTargets(preview, "mobile", ["mobile/src/App.vue"]);
    expect(r.names).toContain("repoos-mobile-dev");
  });
});
