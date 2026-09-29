/**
 * The Hypercolor theme: the Charm/Crush-flavoured CRT appearance — neon ink on
 * tape-black, an animated gradient wordmark, a faint scanline — as one design
 * theme with both appearances, reachable from the existing Settings theme list
 * and persisted through the existing `repoos.uiTheme` path.
 *
 * The palette is hand-authored rather than generated, so these tests cover the
 * things that can then go wrong: that the theme is selectable and persists like
 * every other theme, that the stylesheet still declares the two blocks
 * `repoos.toml` promises the guard, and that the guard's declared contrast
 * pairs and gradient tokens hold in both appearances — read back with the
 * guard's own cascade, so a test can't pass on values CSS never applies.
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
const DARK = ':root[data-ui-theme="hypercolor"]';
const LIGHT = ':root[data-ui-theme="hypercolor"][data-theme="light"]';

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

describe("hypercolor is selectable in Settings alongside the existing themes", () => {
  it("is in the design-theme catalog, labelled and last in fallback order", () => {
    expect(DESIGN_THEMES.find((t) => t.id === "hypercolor")).toEqual({
      id: "hypercolor",
      label: "Hypercolor",
    });
    expect(DESIGN_THEMES[DESIGN_THEMES.length - 1]?.id).toBe("hypercolor");
  });

  it("has a Settings swatch, so the list previews it rather than falling back", () => {
    // SettingsView's swatchFor() falls back to var(--panel-solid) for an unknown
    // id, which would render but preview nothing of the theme.
    const settings = readFileSync(join(repoRoot, "src/ui-app/src/views/SettingsView.vue"), "utf8");
    expect(settings).toMatch(/hypercolor:\s*\{\s*bg:\s*"#0a0713"/);
  });

  it("applies both appearances when selected, across the dark/light control", async () => {
    const config = await loadConfig();

    await config.setUiTheme("hypercolor");
    expect(config.uiTheme).toBe("hypercolor");
    expect(document.documentElement.dataset.uiTheme).toBe("hypercolor");
    // "system" resolves against the stubbed light-preferring matchMedia.
    expect(document.documentElement.dataset.theme).toBe("light");

    await config.setTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    // Switching appearance must not drop the design theme.
    expect(document.documentElement.dataset.uiTheme).toBe("hypercolor");
  });
});

describe("hypercolor selection persists across a reload", () => {
  it("re-applies from localStorage on the next load, like every other theme", async () => {
    const first = await loadConfig();
    await first.setUiTheme("hypercolor");
    expect(localStorage.getItem("repoos.uiTheme")).toBe("hypercolor");

    // A fresh store + page load: no in-memory state carries over.
    setActivePinia(createPinia());
    document.documentElement.removeAttribute("data-ui-theme");
    const second = await loadConfig();

    expect(second.uiTheme).toBe("hypercolor");
    expect(document.documentElement.dataset.uiTheme).toBe("hypercolor");
  });
});

describe("hypercolor declares both appearances in the stylesheet", () => {
  it("has a dark and a light block with different grounds", () => {
    const dark = readBlock(stylesheet, DARK);
    const light = readBlock(stylesheet, LIGHT);
    expect(dark["--bg"]).toBe("#0a0713");
    expect(light["--bg"]).toBe("#f7f2ff");
    expect(dark["--txt"]).not.toBe(light["--txt"]);
  });

  it("carries the signature neon trio and a gradient fill in both appearances", () => {
    const dark = readBlock(stylesheet, DARK);
    const light = readBlock(stylesheet, LIGHT);
    // magenta primary, violet ambient, cyan ghost — the Charm pairing.
    expect(dark["--red"]).toBe("#ff4d8d");
    expect(dark["--violet"]).toBe("#a97bff");
    expect(dark["--cyan"]).toBe("#5ff2ff");
    for (const block of [dark, light]) {
      expect(block["--btn-primary-bg"]).toContain("gradient(");
      expect(block["--btn-new-bg"]).toContain("gradient(");
    }
  });

  it("keeps the animated wordmark and the scanline non-interactive", () => {
    expect(stylesheet).toContain('[data-ui-theme="hypercolor"] .brand');
    expect(stylesheet).toContain("@keyframes hypercolor-ink");

    // The scanline is dark-appearance only (the :not() in the selector) and
    // must never take a pointer event, or it would swallow board clicks.
    const scanline = stylesheet.indexOf(
      '[data-ui-theme="hypercolor"]:not([data-theme="light"]) body::after',
    );
    expect(scanline).toBeGreaterThan(-1);
    expect(stylesheet.slice(scanline, scanline + 400)).toContain("pointer-events: none");
  });
});

describe("hypercolor is registered with the theme-contrast guard in both appearances", () => {
  it("declares a dark and a light scope that both match a real stylesheet block", async () => {
    const { loadConfig: loadToml } = await import("../../core/config.js");
    const scopes = loadToml(repoRoot).check?.themeScopes ?? [];
    const mine = scopes.filter((s) => s.selector.includes('data-ui-theme="hypercolor"'));
    expect(mine.map((s) => s.name).sort()).toEqual(["hypercolor-dark", "hypercolor-light"]);

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
