import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import playgroundSource from "../src/components/ModelPlaygroundPanel.vue?raw";

const SRC_DIR = resolve(__dirname, "../src");

/** Every .vue file under src/ui-app/src, recursively. */
function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return name.endsWith(".vue") ? [path] : [];
  });
}

/**
 * Every element whose `v-html` renders markdown directly, with its `class`.
 * Preflight sets `list-style: none` on all lists, so each container class needs
 * its markers restored by the shared rule in style.css. Scanning the source
 * means a new surface fails here until it is added to that rule (#1255 review).
 */
function markdownSurfaces(): Map<string, string[]> {
  const surfaces = new Map<string, string[]>();
  const site = /<([a-z][\w-]*)\b([^>]*?)v-html="render(?:Chat)?Markdown\(/g;
  for (const file of vueFiles(SRC_DIR)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(site)) {
      const classAttr = match[2].match(/\sclass="([^"]+)"/);
      const where = `${file.slice(SRC_DIR.length + 1)} <${match[1]}>`;
      surfaces.set(where, classAttr ? classAttr[1].split(/\s+/) : []);
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
  const classes = new Set([...surfaces.values()].flat());

  it("finds the markdown render sites (scan sanity check)", () => {
    expect(surfaces.size).toBeGreaterThanOrEqual(6);
    expect(classes).toContain("td-markdown");
    expect(classes).toContain("guide-markdown");
  });

  it("gives every markdown render site a container class", () => {
    const bare = [...surfaces].filter(([, cls]) => cls.length === 0).map(([where]) => where);
    expect(bare).toEqual([]);
  });

  it.each([...surfaces])("restores disc and decimal markers in %s", (_where, cls) => {
    // A container may carry modifier classes (`md-rendered engineering-report-body`);
    // one of them needs the marker rule.
    expect(cls.some((c) => disc.has(`.${c} ul`))).toBe(true);
    expect(cls.some((c) => decimal.has(`.${c} ol`))).toBe(true);
  });

  it("keeps the playground list indent so restored markers sit inside the bubble", () => {
    expect(playgroundSource).toMatch(
      /\.playground-markdown\s+:deep\(ul\),\s*\.playground-markdown\s+:deep\(ol\)\s*\{[^}]*padding-left:\s*17px/s,
    );
  });
});
