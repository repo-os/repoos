/**
 * The Catppuccin theme (#0516): Catppuccin Mocha (dark) and Latte (light) as one
 * design theme with both appearances, reachable from the existing Settings
 * theme list and persisted through the existing `repoos.uiTheme` path.
 *
 * The palette is GENERATED from the installed shikijs package rather than typed
 * (see scripts/catppuccin-palette.mjs), so these tests cover the two things
 * that can then go wrong: that the checked-in stylesheet still matches what the
 * generator emits (a shikijs upgrade that moves a slot must fail, not drift),
 * and that each variant resolves to Catppuccin's own canonical ramp values.
 * Selection + persistence are covered against the real store, and the resolved
 * palette is read back out of the real stylesheet with the same cascade the
 * theme-contrast guard uses, so a test can't pass on values CSS never applies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPinia, setActivePinia } from "pinia";
import { spawnSync } from "node:child_process";
import { useConfigStore, DESIGN_THEMES } from "../src/stores/config";
import * as apiMod from "../src/api";
import type { ConfigField } from "../src/types";
import {
  CATPPUCCIN_LATTE,
  CATPPUCCIN_MOCHA,
  type CatppuccinRole,
} from "../../../scripts/catppuccin-palette.mjs";
import { latteWcagOverrides } from "../../../scripts/gen-catppuccin-theme.mjs";

/**
 * Latte's canonical ramp misses the 4.5:1 rendered floor on its own light
 * surfaces (#0596), so the generator darkens these roles — hue preserved —
 * before emitting the LIGHT block. Everything else stays canonical, and
 * Mocha's slots stay one-for-one with the palette; the assertions below
 * compare Latte against the adjusted value.
 */
const LATTE_ADJUST = latteWcagOverrides(CATPPUCCIN_LATTE);
const latte = (role: CatppuccinRole): string =>
  LATTE_ADJUST.get(CATPPUCCIN_LATTE[role].toLowerCase()) ?? CATPPUCCIN_LATTE[role];

const api = vi.spyOn(apiMod, "api");

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} as Record<string, string> }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const repoRoot = resolve(__dirname, "../../..");
const stylesheet = readFileSync(join(repoRoot, "src/ui-app/src/style.css"), "utf8");

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

describe("catppuccin is selectable in Settings alongside the existing themes", () => {
  it("is in the design-theme catalog, labelled and last in fallback order", () => {
    const entry = DESIGN_THEMES.find((t) => t.id === "catppuccin");
    expect(entry).toEqual({ id: "catppuccin", label: "Catppuccin" });
    expect(DESIGN_THEMES.map((t) => t.id)).toContain("catppuccin");
    // The pre-existing themes are all still offered.
    for (const id of ["classic", "clear", "gen z", "jelly", "gruvbox"]) {
      expect(DESIGN_THEMES.some((t) => t.id === id)).toBe(true);
    }
  });

  it("has a Settings swatch, so the list previews it rather than falling back", () => {
    // SettingsView's swatchFor() falls back to var(--panel-solid) for an unknown
    // id, which would render but preview nothing of the theme.
    const settings = readFileSync(join(repoRoot, "src/ui-app/src/views/SettingsView.vue"), "utf8");
    expect(settings).toMatch(/catppuccin:\s*\{\s*bg:\s*"#1e1e2e"/);
  });

  it("applies both appearances when selected, across the dark/light control", async () => {
    const config = await loadConfig();

    await config.setUiTheme("catppuccin");
    expect(config.uiTheme).toBe("catppuccin");
    expect(document.documentElement.dataset.uiTheme).toBe("catppuccin");
    // "system" resolves against the stubbed light-preferring matchMedia.
    expect(document.documentElement.dataset.theme).toBe("light");

    await config.setTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    // Switching appearance must not drop the design theme.
    expect(document.documentElement.dataset.uiTheme).toBe("catppuccin");
  });

  it("still resolves a 'system' preference sensibly under catppuccin", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const config = await loadConfig();
    await config.setUiTheme("catppuccin");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(config.effectiveTheme).toBe("dark");
  });
});

describe("catppuccin selection persists across a reload", () => {
  it("re-applies from localStorage on the next load, like every other theme", async () => {
    const first = await loadConfig();
    await first.setUiTheme("catppuccin");
    await first.setTheme("light");
    expect(localStorage.getItem("repoos.uiTheme")).toBe("catppuccin");
    expect(localStorage.getItem("repoos.theme")).toBe("light");

    // A fresh store + page load: no in-memory state carries over.
    setActivePinia(createPinia());
    document.documentElement.removeAttribute("data-ui-theme");
    const second = await loadConfig();

    expect(second.uiTheme).toBe("catppuccin");
    expect(document.documentElement.dataset.uiTheme).toBe("catppuccin");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("falls back to the default theme when nothing is stored", async () => {
    const config = await loadConfig();
    expect(config.uiTheme).toBe("classic");
    expect(document.documentElement.dataset.uiTheme).toBe("classic");
  });

  it("can be starred like any other theme", async () => {
    const config = await loadConfig();
    expect(config.toggleThemeFavorite("catppuccin")).toBe(true);
    expect(config.isThemeFavorite("catppuccin")).toBe(true);
    expect(config.sidebarThemes.map((t) => t.id)).toEqual(["catppuccin"]);
  });
});

describe("the checked-in Catppuccin palette matches the shikijs source of truth", () => {
  it("style.css is exactly what the generator emits (no hand-edited hex)", () => {
    // The generator also re-verifies all 9 [check] contrastPairs before exiting,
    // so this asserts palette freshness *and* contrast in one call. It reports on
    // stderr (stdout is reserved for the CSS), so both streams are needed.
    const run = spawnSync(process.execPath, ["scripts/gen-catppuccin-theme.mjs", "--check"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    expect(run.status, out).toBe(0);
    expect(out).toContain("style.css matches the generated Catppuccin blocks");
  });

  it("resolves each variant's tokens from the real stylesheet, per the cascade", () => {
    // The neutral ramp roles the token map actually binds to a token. Not the
    // whole 12-step ramp: subtext1 and surface0 have no token of their own in
    // the app's vocabulary (the same is true of gruvbox and classic).
    const BOUND: [string, CatppuccinRole][] = [
      ["--bg", "base"],
      ["--bg-2", "mantle"],
      ["--panel-solid", "mantle"],
      ["--txt", "text"],
      ["--txt-dim", "subtext0"],
      ["--txt-faint", "overlay2"],
      ["--popover", "mantle"],
    ];
    const scopes: [string, string, Record<string, string>][] = [
      [':root[data-ui-theme="catppuccin"]', "catppuccin-dark", CATPPUCCIN_MOCHA],
      [
        ':root[data-ui-theme="catppuccin"][data-theme="light"]',
        "catppuccin-light",
        CATPPUCCIN_LATTE,
      ],
    ];

    for (const [selector, name, palette] of scopes) {
      const decls = readBlock(stylesheet, selector);
      expect(Object.keys(decls).length, `${name} block parsed`).toBeGreaterThan(50);
      const isLatte = palette === CATPPUCCIN_LATTE;
      for (const [token, role] of BOUND) {
        const expected = isLatte ? latte(role) : palette[role];
        expect(decls[token], `${name} ${token} is ${role}`).toBe(expected);
      }
      // Borders come from the palette's own surface2, not a neutral gray —
      // that tint is Catppuccin's signature and the reason it reads as itself.
      expect(decls["--border"], `${name} border is surface2-tinted`).toMatch(
        new RegExp(`^${palette.surface2}[0-9a-f]{2}$`),
      );
    }

    const dark = readBlock(stylesheet, ':root[data-ui-theme="catppuccin"]');
    const light = readBlock(stylesheet, ':root[data-ui-theme="catppuccin"][data-theme="light"]');
    // The two flavours must not share a single set of values (#0516 requires
    // per-variant palettes, not one recoloured the other).
    expect(dark["--bg"]).not.toBe(light["--bg"]);
    expect(dark["--txt"]).not.toBe(light["--txt"]);
  });

  it("maps RepoOS's accent slots onto Catppuccin hue families, per variant", () => {
    // The slot names are --cyan/--violet/--green/--red/--amber, so they are
    // mapped by hue family rather than one-for-one: --cyan → blue (primary),
    // --violet → mauve, --amber → peach.
    const dark = readBlock(stylesheet, ':root[data-ui-theme="catppuccin"]');
    const light = readBlock(stylesheet, ':root[data-ui-theme="catppuccin"][data-theme="light"]');
    expect(dark["--cyan"]).toBe(CATPPUCCIN_MOCHA.blue);
    expect(light["--cyan"]).toBe(latte("blue"));
    expect(dark["--violet"]).toBe(CATPPUCCIN_MOCHA.mauve);
    expect(light["--violet"]).toBe(latte("mauve"));
    expect(dark["--amber"]).toBe(CATPPUCCIN_MOCHA.peach);
    expect(light["--amber"]).toBe(latte("peach"));
    expect(dark["--green"]).toBe(CATPPUCCIN_MOCHA.green);
    expect(dark["--red"]).toBe(CATPPUCCIN_MOCHA.red);
  });

  it("keeps the light variant's control fills as washes, since its accents are mid-dark", () => {
    // Latte's green (#40a02b) is a *text* colour on a light base: a solid fill
    // under light text measures 2.96:1 and no neutral in the ramp clears 3:1.
    // So Latte washes and uses body text, while Mocha — whose accents are light
    // pastels meant as fills — uses the solid pastel with base-coloured text.
    const dark = readBlock(stylesheet, ':root[data-ui-theme="catppuccin"]');
    const light = readBlock(stylesheet, ':root[data-ui-theme="catppuccin"][data-theme="light"]');

    expect(dark["--btn-primary-bg"]).toContain(CATPPUCCIN_MOCHA.blue);
    expect(dark["--btn-primary-bg"]).toContain(CATPPUCCIN_MOCHA.mauve);
    expect(dark["--btn-primary-color"]).toBe(CATPPUCCIN_MOCHA.base);

    // Every Latte stop carries an alpha suffix — a bare 7-char accent here is
    // exactly the solid-fill mistake the variant can't afford.
    for (const stop of gradientStops(light["--btn-primary-bg"])) {
      expect(stop, "Latte fill stop is washed").toMatch(/^#[0-9a-f]{8}$/);
      expect(stop.slice(0, 7)).toMatch(
        new RegExp(`^(${CATPPUCCIN_LATTE.blue}|${CATPPUCCIN_LATTE.mauve})$`),
      );
    }
    expect(light["--btn-primary-color"]).toBe(CATPPUCCIN_LATTE.text);
  });
});

describe("catppuccin is registered with the theme-contrast guard in both appearances", () => {
  it("declares a dark and a light scope that both match a real stylesheet block", async () => {
    const { loadConfig: loadToml } = await import("../../core/config.js");
    const scopes = loadToml(repoRoot).check?.themeScopes ?? [];
    const mine = scopes.filter((s) => s.selector.includes('data-ui-theme="catppuccin"'));
    expect(mine.map((s) => s.name).sort()).toEqual(["catppuccin-dark", "catppuccin-light"]);

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

/** The hex colour stops in a gradient token value, in source order. */
function gradientStops(value: string): string[] {
  return value.match(/#[0-9a-fA-F]{6,8}/g) ?? [];
}

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
