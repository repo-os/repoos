/**
 * The Solarized theme: precision colors for machines and people, with dark
 * and light variants. Both variants use the same base palette but swap
 * foreground and background colors appropriately, similar to gruvbox.
 * The theme is reachable from the existing Settings theme list and persisted
 * through the existing `repoos.uiTheme` path.
 *
 * The palette is hand-authored, so these tests cover the things that can go
 * wrong: that the theme is selectable and persists like every other theme,
 * that the stylesheet still declares the two blocks `repoos.toml` promises the
 * guard, and that the guard's declared contrast pairs hold in both appearances
 * — read back with the guard's own cascade, so a test can't pass on values
 * CSS never applies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPinia, setActivePinia } from "pinia";
import { useConfigStore, DESIGN_THEMES } from "../src/stores/config";
import * as apiMod from "../src/api";
import type { ConfigField } from "../src/types";

const api = vi.spyOn(apiMod, "api");

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} as Record<string, string> }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const repoRoot = resolve(__dirname, "../../..");
const stylesheet = readFileSync(join(repoRoot, "src/ui-app/src/style.css"), "utf8");
const DARK = ':root[data-ui-theme="solarized"]';
const LIGHT = ':root[data-ui-theme="solarized"][data-theme="light"]';

function schemaField(key: string): ConfigField {
  return {
    key,
    label: key,
    type: "boolean",
    tier: "live",
    restartRequired: false,
    group: "general",
    default: false,
    description: "",
    options: [],
  } as ConfigField;
}

const SCHEMA: ConfigField[] = [schemaField("maxActiveTasks")];

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  localStorage.clear();
  document.documentElement.removeAttribute("data-ui-theme");
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function loadConfig() {
  api.mockResolvedValue({ config: { maxActiveTasks: 3 }, schema: SCHEMA });
  const config = useConfigStore();
  await config.load();
  return config;
}

describe("solarized is selectable in Settings alongside the existing themes", () => {
  it("is in the design-theme catalog, labelled immediately before hypercolor in fallback order", () => {
    expect(DESIGN_THEMES.find((t) => t.id === "solarized")).toEqual({
      id: "solarized",
      label: "Solarized",
    });
    // Hypercolor is last; solarized is immediately before it
    expect(DESIGN_THEMES[DESIGN_THEMES.length - 2]?.id).toBe("solarized");
    expect(DESIGN_THEMES[DESIGN_THEMES.length - 1]?.id).toBe("hypercolor");
  });

  it("has a Settings swatch, so the list previews it rather than falling back", () => {
    const settings = readFileSync(join(repoRoot, "src/ui-app/src/views/SettingsView.vue"), "utf8");
    expect(settings).toMatch(/solarized:\s*\{\s*bg:\s*"#002b36"/);
  });

  it("applies both appearances when selected, across the dark/light control", async () => {
    const config = await loadConfig();

    await config.setUiTheme("solarized");
    expect(config.uiTheme).toBe("solarized");
    expect(document.documentElement.dataset.uiTheme).toBe("solarized");
    // "system" resolves against the stubbed light-preferring matchMedia.
    expect(document.documentElement.dataset.theme).toBe("light");

    await config.setTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    // Switching appearance must not drop the design theme.
    expect(document.documentElement.dataset.uiTheme).toBe("solarized");
  });

  it("still resolves a 'system' preference sensibly under solarized", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const config = await loadConfig();
    await config.setUiTheme("solarized");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(config.effectiveTheme).toBe("dark");
  });
});

describe("solarized selection persists across a reload", () => {
  it("re-applies from localStorage on the next load, like every other theme", async () => {
    const first = await loadConfig();
    await first.setUiTheme("solarized");
    await first.setTheme("light");
    expect(localStorage.getItem("repoos.uiTheme")).toBe("solarized");
    expect(localStorage.getItem("repoos.theme")).toBe("light");

    // A fresh store + page load: no in-memory state carries over.
    setActivePinia(createPinia());
    document.documentElement.removeAttribute("data-ui-theme");
    const second = await loadConfig();

    expect(second.uiTheme).toBe("solarized");
    expect(document.documentElement.dataset.uiTheme).toBe("solarized");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("falls back to the default theme when nothing is stored", async () => {
    const config = await loadConfig();
    expect(config.uiTheme).toBe("classic");
    expect(document.documentElement.dataset.uiTheme).toBe("classic");
  });

  it("can be starred like any other theme", async () => {
    const config = await loadConfig();
    expect(config.toggleThemeFavorite("solarized")).toBe(true);
    expect(config.isThemeFavorite("solarized")).toBe(true);
    expect(config.sidebarThemes.map((t) => t.id)).toEqual(["solarized"]);
  });
});

describe("solarized declares both appearances in the stylesheet", () => {
  it("has a dark and a light block with different grounds", () => {
    const dark = readBlock(stylesheet, DARK);
    const light = readBlock(stylesheet, LIGHT);
    expect(dark["--bg"]).toBe("#002b36");
    expect(light["--bg"]).toBe("#fdf6e3");
    expect(dark["--txt"]).not.toBe(light["--txt"]);
  });

  it("carries the Solarized accents in both appearances with proper contrast", () => {
    const dark = readBlock(stylesheet, DARK);
    const light = readBlock(stylesheet, LIGHT);
    // Dark variant uses lightened green and blue for sufficient contrast
    expect(dark["--green"]).toBe("#a4bf00");
    expect(dark["--cyan"]).toBe("#3fd0c4");
    expect(dark["--violet"]).toBe("#9191e1");
    expect(dark["--red"]).toBe("#f97553");
    // Light variant uses much darker accent colors for WCAG contrast
    expect(light["--cyan"]).toBe("#004f4d");
    expect(light["--violet"]).toBe("#5a4a7a");
    expect(light["--red"]).toBe("#9d3d2b");
  });
});

describe("solarized is registered with the theme-contrast guard in both appearances", () => {
  it("declares a dark and a light scope that both match a real stylesheet block", async () => {
    const { loadConfig: loadToml } = await import("../../core/config.js");
    const scopes = loadToml(repoRoot).check?.themeScopes ?? [];
    const mine = scopes.filter((s) => s.selector.includes('data-ui-theme="solarized"'));
    expect(mine.map((s) => s.name).sort()).toEqual(["solarized-dark", "solarized-light"]);

    const { hasThemeBlocks, themeContrastOffenders, themeScopeConfigWarnings } =
      await import("../../commands/check.js");
    for (const s of mine) expect(hasThemeBlocks(stylesheet, [s])).toBe(true);

    const check = loadToml(repoRoot).check;
    expect(
      themeContrastOffenders(stylesheet, {
        scopes,
        pairs: check?.contrastPairs ?? [],
        gradientTokens: check?.gradientTokens ?? [],
        backdropToken: check?.backdropToken,
      }),
    ).toEqual([]);
    expect(themeScopeConfigWarnings(scopes)).toEqual([]);
  });
});

/**
 * Read one top-level theme block's declarations, the way the guard does: the
 * selector opens the block on a line ending in `{`, and one declaration per
 * line. Deliberately not a CSS parser — matching the guard's own line-oriented
 * read is the point, so a block it could not parse fails here too.
 */
function readBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {\n`);
  expect(start, `stylesheet has a block for ${selector}`).toBeGreaterThan(-1);
  const body = css.slice(start + selector.length + 3);
  const end = body.indexOf("\n}");
  const out: Record<string, string> = {};
  for (const line of body.slice(0, end).split("\n")) {
    const m = line.match(/^ {2}(--[a-z0-9-]+):\s*(.+);$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
