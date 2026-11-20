import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import playgroundSource from "../src/components/ModelPlaygroundPanel.vue?raw";

const SRC_DIR = resolve(__dirname, "../src");

/**
 * Containers the shared rule in style.css must restore markers on. Listed here
 * as well as scanned, so removing one from the rule fails even if no scanned
 * surface happens to use it.
 */
const REQUIRED_CONTAINERS = [
  "md-rendered",
  "pm-markdown",
  "cto-markdown",
  "debugger-markdown",
  "td-markdown",
  "guide-markdown",
  "playground-markdown",
  "release-update-markdown",
];

/** Every .vue file under src/ui-app/src, recursively. */
function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return name.endsWith(".vue") ? [path] : [];
  });
}

/** Opening tags, skipping `>` inside quoted attribute values. */
const OPEN_TAG = /<([a-z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/** Imports the markdown renderer, so its output can reach any `v-html` in the file. */
const RENDERER_IMPORT = /import\s*\{[^}]*\brender(?:Chat)?Markdown\b[^}]*\}\s*from/;

/**
 * Every element whose `v-html` shows markdown, with its `class` list. A surface
 * is a `v-html` in a file that imports the markdown renderer, so both literal
 * `v-html="renderMarkdown(...)"` and computed names (`v-html="specHtml"`) are
 * covered. Preflight sets `list-style: none` on every list, so each container
 * class needs its markers restored by the shared rule in style.css. A new
 * surface fails here until its class is added to that rule (#1255 review).
 * Markdown from a child component or a prop is out of scope: the convention is
 * that each surface renders through these helpers in its own file.
 */
function markdownSurfaces(): Array<[string, string[]]> {
  const surfaces: Array<[string, string[]]> = [];
  for (const file of vueFiles(SRC_DIR)) {
    const source = readFileSync(file, "utf8");
    if (!RENDERER_IMPORT.test(source)) continue;
    for (const match of source.matchAll(OPEN_TAG)) {
      const [, tag, attrs] = match;
      if (!/\sv-html="/.test(attrs)) continue;
      const classAttr = attrs.match(/\sclass="([^"]+)"/);
      const line = source.slice(0, match.index).split("\n").length;
      const where = `${file.slice(SRC_DIR.length + 1)}:${line} <${tag}>`;
      surfaces.push([where, classAttr ? classAttr[1].split(/\s+/) : []]);
    }
  }
  return surfaces;
}

/** Selectors that a `list-style: <style>` rule applies to, across every rule in the source. */
function selectorsWithListStyle(source: string, style: "disc" | "decimal"): Set<string> {
  const selectors = new Set<string>();
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of css.matchAll(/([^{}]+)\{\s*list-style:\s*([a-z-]+);?\s*\}/g)) {
    if (match[2] !== style) continue;
    for (const selector of match[1].split(",")) selectors.add(selector.trim());
  }
  return selectors;
}

// vitest returns an empty string for a CSS `?raw` import, so read the file itself.
const styleSource = readFileSync(resolve(SRC_DIR, "style.css"), "utf8");

describe("markdown list markers", () => {
  const disc = selectorsWithListStyle(styleSource, "disc");
  const decimal = selectorsWithListStyle(styleSource, "decimal");
  const surfaces = markdownSurfaces();
  const classes = new Set(surfaces.flatMap(([, cls]) => cls));

  it("finds the markdown render sites (scan sanity check)", () => {
    expect(surfaces.length).toBeGreaterThanOrEqual(6);
    expect(classes).toContain("td-markdown");
    expect(classes).toContain("guide-markdown");
    // Computed-property surfaces: these are not written as `renderMarkdown(...)` in the template.
    expect(classes).toContain("md-rendered");
    expect(classes).toContain("release-update-markdown");
  });

  it("gives every markdown render site a container class", () => {
    const bare = surfaces.filter(([, cls]) => cls.length === 0).map(([where]) => where);
    expect(bare).toEqual([]);
  });

  it.each(surfaces)("restores disc and decimal markers in %s", (_where, cls) => {
    // A container may carry modifier classes (`md-rendered engineering-report-body`);
    // one of them needs the marker rule.
    expect(cls.some((c) => disc.has(`.${c} ul`))).toBe(true);
    expect(cls.some((c) => decimal.has(`.${c} ol`))).toBe(true);
  });

  it.each(REQUIRED_CONTAINERS)("keeps the shared marker rule for .%s", (container) => {
    expect(disc.has(`.${container} ul`)).toBe(true);
    expect(decimal.has(`.${container} ol`)).toBe(true);
  });

  it("keeps the playground list indent so restored markers sit inside the bubble", () => {
    expect(playgroundSource).toMatch(
      /\.playground-markdown\s+:deep\(ul\),\s*\.playground-markdown\s+:deep\(ol\)\s*\{[^}]*padding-left:\s*17px/s,
    );
  });
});
