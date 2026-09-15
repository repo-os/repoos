/**
 * `repoos check`'s CSS-layering and theme-contrast guards are per-project and
 * opt-in (#0351). Both read a `[check] uiStylesheet` path, and the contrast
 * guard's whole token vocabulary (which blocks exist, how they inherit, which
 * pairs to compare, which tokens must be gradients) is declared under `[check]`
 * too — no RepoOS selector or token name lives in check.ts. The last describe
 * block guards that RepoOS's own repo declares its current coverage through
 * that same config, so it isn't silently downgraded to a skip.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  cssLayeringOffenders,
  themeContrastOffenders,
  type ThemeContrastConfig,
} from "../../commands/check.js";
import { loadConfig } from "../../core/config.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});
function tmpRepo(toml = ""): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-check-css-"));
  roots.push(d);
  writeFileSync(join(d, "repoos.toml"), toml);
  return d;
}

const THEME_CSS = `
:root {
  --bg: #000000;
  --txt: #ffffff;
  --btn-primary-bg: linear-gradient(#111111, #222222);
}
[data-theme="light"] {
  --bg: #ffffff;
  --txt: #000000;
}
`;

const THEME_CONFIG: ThemeContrastConfig = {
  scopes: [
    { selector: ":root", name: "classic-dark", inherits: ["classic-dark"] },
    {
      selector: '[data-theme="light"]',
      name: "classic-light",
      inherits: ["classic-dark", "classic-light"],
    },
  ],
  pairs: [{ fg: "--txt", bg: "--bg" }],
  gradientTokens: ["--btn-primary-bg"],
};

describe("themeContrastOffenders — driven by configured scopes/tokens", () => {
  it("passes a stylesheet whose configured pairs and gradients all hold", () => {
    expect(themeContrastOffenders(THEME_CSS, THEME_CONFIG)).toEqual([]);
  });

  it("flags a low-contrast pair in the scope it inherits into", () => {
    const css = THEME_CSS.replace("--txt: #000000;", "--txt: #eeeeee;");
    const offenders = themeContrastOffenders(css, THEME_CONFIG);
    // classic-light inherits classic-dark's bg then overrides to white with a
    // near-white txt — the classic invisible-text bug.
    expect(offenders.length).toBeGreaterThan(0);
    expect(offenders.some((o) => o.includes("classic-light"))).toBe(true);
  });

  it("flags a configured gradient token that resolves to a solid color", () => {
    const css = THEME_CSS.replace("linear-gradient(#111111, #222222)", "#123456");
    const offenders = themeContrastOffenders(css, THEME_CONFIG);
    expect(offenders.some((o) => o.includes("--btn-primary-bg must be a gradient"))).toBe(true);
  });

  it("returns nothing when no configured scope matches the stylesheet", () => {
    expect(
      themeContrastOffenders(THEME_CSS, {
        scopes: [{ selector: ":root[data-ui-theme='other']", name: "other" }],
        pairs: [{ fg: "--txt", bg: "--bg" }],
        gradientTokens: [],
      }),
    ).toEqual([]);
  });

  it("treats a scope with no inherits as a standalone block", () => {
    const css = `:root {\n  --bg: #000000;\n  --txt: #111111;\n}`;
    const offenders = themeContrastOffenders(css, {
      scopes: [{ selector: ":root", name: "dark" }],
      pairs: [{ fg: "--txt", bg: "--bg" }],
      gradientTokens: [],
    });
    expect(offenders.some((o) => o.includes("dark") && o.includes("--txt"))).toBe(true);
  });
});

describe("cssLayeringOffenders", () => {
  it("flags unlayered universal/bare-element selectors", () => {
    expect(cssLayeringOffenders("* { margin: 0; }\nbody { padding: 0; }")).toHaveLength(2);
  });

  it("allows the same selectors inside @layer", () => {
    expect(cssLayeringOffenders("@layer base {\n  * { margin: 0; }\n}")).toEqual([]);
  });
});

describe("loadConfig [check] stylesheet vocabulary parsing", () => {
  it("reads the stylesheet, scopes, pairs, and gradient tokens", () => {
    const cfg = loadConfig(
      tmpRepo(
        [
          "[check]",
          'uiStylesheet = "src/app.css"',
          'gradientTokens = ["--g1", "--g2"]',
          "",
          "[[check.themeScopes]]",
          'selector = ":root"',
          'name = "dark"',
          'inherits = ["dark", "base"]',
          "",
          "[[check.contrastPairs]]",
          'fg = "--fg"',
          'bg = "--bg"',
          "",
        ].join("\n"),
      ),
    ).check;
    expect(cfg?.uiStylesheet).toBe("src/app.css");
    expect(cfg?.gradientTokens).toEqual(["--g1", "--g2"]);
    expect(cfg?.themeScopes).toEqual([
      { selector: ":root", name: "dark", inherits: ["dark", "base"] },
    ]);
    expect(cfg?.contrastPairs).toEqual([{ fg: "--fg", bg: "--bg" }]);
  });

  it("accepts the plural [checks] spelling and drops incomplete rows", () => {
    const cfg = loadConfig(
      tmpRepo(
        [
          "[checks]",
          'uiStylesheet = "web/app.css"',
          "",
          "[[checks.themeScopes]]",
          'selector = ":root"',
          'name = ""',
          "",
          "[[checks.contrastPairs]]",
          'fg = "--fg"',
          "",
        ].join("\n"),
      ),
    ).check;
    expect(cfg?.uiStylesheet).toBe("web/app.css");
    expect(cfg?.themeScopes).toBeUndefined();
    expect(cfg?.contrastPairs).toBeUndefined();
  });

  it("is undefined when unset", () => {
    const cfg = loadConfig(tmpRepo("")).check;
    expect(cfg?.uiStylesheet).toBeUndefined();
    expect(cfg?.themeScopes).toBeUndefined();
    expect(cfg?.contrastPairs).toBeUndefined();
    expect(cfg?.gradientTokens).toBeUndefined();
  });
});

describe("RepoOS dogfoods the stylesheet-guard declaration", () => {
  // Without this config both guards would silently skip in RepoOS's own repo,
  // exactly as if it had configured nothing at all.
  const root = resolve(__dirname, "../../..");

  it("declares its stylesheet and token vocabulary through the generic [check] section", () => {
    const cfg = loadConfig(root).check;
    expect(cfg?.uiStylesheet).toBe("src/ui-app/src/style.css");
    expect(cfg?.themeScopes?.length).toBeGreaterThan(0);
    expect(cfg?.contrastPairs?.length).toBeGreaterThan(0);
    expect(cfg?.gradientTokens?.length).toBeGreaterThan(0);
  });

  it("keeps its current coverage: the real stylesheet still passes", () => {
    const cfg = loadConfig(root).check;
    const css = readFileSync(join(root, cfg?.uiStylesheet ?? ""), "utf8");
    const scopes = cfg?.themeScopes ?? [];
    // Sanity: the configured selectors genuinely match the real stylesheet, so
    // the empty-offender result below isn't a vacuous "no blocks parsed" pass.
    expect(
      themeContrastOffenders(css, {
        scopes,
        pairs: [{ fg: "--bg", bg: "--bg" }], // a token against itself → ratio 1
        gradientTokens: [],
      }).some((o) => o.includes("classic-dark")),
    ).toBe(true);
    expect(
      themeContrastOffenders(css, {
        scopes,
        pairs: cfg?.contrastPairs ?? [],
        gradientTokens: cfg?.gradientTokens ?? [],
      }),
    ).toEqual([]);
  });
});
