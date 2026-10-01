/**
 * The rendered contrast audit (#0596) — the pure halves: theme-scope → DOM
 * attribute derivation, the CSS colour parser the judge composes with, the
 * WCAG floor, and `judgeSample` itself (translucent chains, gradient
 * worst-stop, the unjudgeable cases). The browser half (the probe that walks
 * visible text) is exercised end-to-end by the audit run.
 */
import { describe, expect, it } from "vitest";
import {
  contrastProbe,
  judgeSample,
  parseCssColor,
  requiredRatio,
  scopeAttributes,
  scopeSettleWarning,
  settleScopeInPage,
  type ProbeSample,
} from "../../commands/ui-contrast-audit.js";

function sample(over: Partial<ProbeSample> = {}): ProbeSample {
  return {
    selector: "div.example",
    text: "hello",
    fg: "rgb(0, 0, 0)",
    bgLayers: ["rgb(255, 255, 255)"],
    photoBackdrop: false,
    clipText: false,
    fontSize: 13,
    fontWeight: 400,
    opacity: 1,
    ...over,
  };
}

describe("scopeAttributes (#0596)", () => {
  it("reads the ui-theme and mode out of a themeScopes selector", () => {
    expect(scopeAttributes({ selector: ":root", name: "classic-dark" })).toEqual({
      uiTheme: "classic",
      mode: "dark",
    });
    expect(
      scopeAttributes({
        selector: ':root[data-ui-theme="clear"][data-theme="light"]',
        name: "clear-light",
      }),
    ).toEqual({ uiTheme: "clear", mode: "light" });
    expect(
      scopeAttributes({ selector: ':root[data-ui-theme="gen z"]', name: "gen-z-dark" }),
    ).toEqual({ uiTheme: "gen z", mode: "dark" });
  });

  it("falls back to the scope name's suffix, then dark", () => {
    expect(scopeAttributes({ selector: ":root", name: "jelly-light" }).mode).toBe("light");
    expect(scopeAttributes({ selector: "html", name: "custom" }).mode).toBe("dark");
    expect(scopeAttributes({ selector: "html", name: "custom" }).uiTheme).toBe("classic");
  });
});

describe("scopeSettleWarning (#0617)", () => {
  const attrs = { uiTheme: "clear", mode: "light" };

  it("is silent when the flip landed on the requested scope", () => {
    expect(
      scopeSettleWarning("clear-light", { theme: "light", uiTheme: "clear" }, attrs),
    ).toBeNull();
  });

  it("warns (and never silently probes) when the flip did not settle", () => {
    const warn = scopeSettleWarning("clear-light", { theme: "dark", uiTheme: "classic" }, attrs);
    expect(warn).toContain("clear-light");
    expect(warn).toContain('wanted data-theme="light" data-ui-theme="clear"');
    expect(warn).toContain('got data-theme="dark" data-ui-theme="classic"');
    // A missing attribute must not read as a match either.
    expect(
      scopeSettleWarning("clear-light", { theme: null, uiTheme: "clear" }, attrs),
    ).not.toBeNull();
  });
});

describe("theme-flip settling (#0617)", () => {
  it("contrastProbe re-asserts the intended scope inside its own walk", () => {
    // A late config-store apply flipped the page to a different scope; the
    // probe must reclaim the requested one before it reads any styles.
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.uiTheme = "classic";
    localStorage.setItem("repoos.theme", "dark");
    localStorage.setItem("repoos.uiTheme", "classic");

    contrastProbe({
      exemptSelectors: [],
      scope: { uiTheme: "clear", mode: "light" },
    });

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.uiTheme).toBe("clear");
    expect(localStorage.getItem("repoos.theme")).toBe("light");
    expect(localStorage.getItem("repoos.uiTheme")).toBe("clear");
  });

  it("settleScopeInPage resolves only after the scope is stable across frames", async () => {
    const settled = await settleScopeInPage({ uiTheme: "gruvbox", mode: "light" });
    expect(settled.theme).toBe("light");
    expect(settled.uiTheme).toBe("gruvbox");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.uiTheme).toBe("gruvbox");
  });
});

describe("parseCssColor (#0596)", () => {
  it("parses the formats a browser actually serializes", () => {
    expect(parseCssColor("#c9d1d9")).toMatchObject({ r: 201, g: 209, b: 217, a: 1 });
    expect(parseCssColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor("#ffffff80")?.a).toBeCloseTo(0.502, 2);
    expect(parseCssColor("rgb(7, 10, 18)")).toMatchObject({ r: 7, g: 10, b: 18, a: 1 });
    expect(parseCssColor("rgba(0, 0, 0, 0)")).toMatchObject({ a: 0 });
    expect(parseCssColor("rgb(50% 0 0 / 50%)")).toMatchObject({ r: 127.5, a: 0.5 });
    // WebKit serializes color-mix() computed values like this:
    expect(parseCssColor("color(srgb 0.436 0.595 0.814 / 0.104)")).toMatchObject({
      r: expect.closeTo(111, 0),
      a: expect.closeTo(0.104, 3),
    });
    expect(parseCssColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it("returns null for color spaces it cannot convert", () => {
    expect(parseCssColor("oklab(0.5 0.1 0.1)")).toBeNull();
    expect(parseCssColor("hsl(0 0% 0%)")).toBeNull();
    expect(parseCssColor("not-a-color")).toBeNull();
  });
});

describe("requiredRatio (#0596)", () => {
  it("applies the WCAG large-text exception", () => {
    expect(requiredRatio(24, 400)).toBe(3);
    expect(requiredRatio(18.66, 700)).toBe(3);
    expect(requiredRatio(18.66, 400)).toBe(4.5);
    expect(requiredRatio(13, 700)).toBe(4.5);
  });
});

describe("judgeSample (#0596)", () => {
  it("fails the original Changes-tab bug: hard-coded light text on a light header", () => {
    const v = judgeSample(
      sample({
        fg: "rgb(201, 209, 217)", // #c9d1d9
        bgLayers: ["rgba(255, 255, 255, 0.04)", "rgb(255, 255, 255)"],
        selector: ".diff-file-item",
      }),
    );
    expect(v.kind).toBe("fail");
    expect(v.finding?.ratio).toBeLessThan(2);
    expect(v.finding?.need).toBe(4.5);
    expect(v.finding?.bg).toBe("#ffffff");
  });

  it("composites a translucent color(srgb) layer instead of treating it as opaque", () => {
    // The pre-fix bug read this layer as alpha=1, truncated the chain and
    // composited over white — phantom light backgrounds in dark themes.
    const v = judgeSample(
      sample({
        fg: "rgb(231, 236, 247)",
        bgLayers: ["color(srgb 0.4 0.5 0.6 / 0.1)", "rgb(7, 10, 18)"],
      }),
    );
    expect(v.kind).toBe("pass");
    // 0.1 of (102,127,153) over (7,10,18) ≈ (17,22,32) — dark, not white.
    expect(v.finding?.bg).toBe("#111620");
  });

  it("judges a gradient-backed text run on its WORST stop", () => {
    const fail = judgeSample(
      sample({
        fg: "rgb(0, 0, 0)",
        bgLayers: ["linear-gradient(90deg, rgb(255, 255, 255), rgb(0, 0, 0))"],
      }),
    );
    expect(fail.kind).toBe("fail");
    expect(fail.viaGradient).toBe(true);
    expect(fail.finding?.ratio).toBeLessThan(1.1);

    const pass = judgeSample(
      sample({
        fg: "rgb(255, 255, 255)",
        bgLayers: ["linear-gradient(90deg, rgb(10, 10, 10), rgb(0, 0, 0))"],
      }),
    );
    expect(pass.kind).toBe("pass");
    expect(pass.viaGradient).toBe(true);
  });

  it("reports a raster image or gradient-clip as unchecked, never as a pass", () => {
    expect(judgeSample(sample({ photoBackdrop: true })).kind).toBe("unchecked");
    expect(judgeSample(sample({ clipText: true })).kind).toBe("unchecked");
    expect(judgeSample(sample({ fg: "oklab(0.5 0 0)" })).kind).toBe("unchecked");
    expect(judgeSample(sample({ bgLayers: ["url(/hero.png)"] })).kind).toBe("unchecked");
  });

  it("applies element opacity to the text colour", () => {
    const full = judgeSample(sample({ fg: "rgb(0, 0, 0)", opacity: 1 }));
    const faded = judgeSample(sample({ fg: "rgb(0, 0, 0)", opacity: 0.45 }));
    expect(full.kind).toBe("pass");
    expect(faded.kind).toBe("fail"); // 45% black over white ≈ 3.7:1
  });
});
