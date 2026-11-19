import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import playgroundSource from "../src/components/ModelPlaygroundPanel.vue?raw";

/**
 * Every surface that renders markdown through renderMarkdown() or
 * renderChatMarkdown(). Preflight sets `list-style: none` on all lists, so each
 * surface needs its markers restored by the shared rule in style.css (#1255
 * review). Add a new markdown container here when you add one.
 */
const MARKDOWN_SURFACES = [
  "md-rendered",
  "pm-markdown",
  "cto-markdown",
  "debugger-markdown",
  "playground-markdown",
  "release-update-markdown",
];

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
const styleSource = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");

describe("markdown list markers", () => {
  const disc = selectorsWithListStyle(styleSource, "disc");
  const decimal = selectorsWithListStyle(styleSource, "decimal");

  it.each(MARKDOWN_SURFACES)("restores disc and decimal markers on .%s", (surface) => {
    expect(disc.has(`.${surface} ul`)).toBe(true);
    expect(decimal.has(`.${surface} ol`)).toBe(true);
  });

  it("keeps the playground list indent so restored markers sit inside the bubble", () => {
    expect(playgroundSource).toMatch(
      /\.playground-markdown\s+:deep\(ul\),\s*\.playground-markdown\s+:deep\(ol\)\s*\{[^}]*padding-left:\s*17px/s,
    );
  });
});
