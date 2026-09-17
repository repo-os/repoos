/**
 * TOML syntax highlighter (#0375). The overlay editor renders this HTML behind
 * a transparent textarea, so the one hard requirement is that the highlighted
 * output's text content is exactly the input — any character gained or lost
 * would misalign the two layers and the visible caret. A couple of class
 * assertions guard that the tokens are actually styled.
 */
import { describe, expect, it } from "vitest";
import { highlightToml } from "../src/lib/toml-highlight";

/** Strip the span wrappers to compare text content. */
function textOf(html: string): string {
  return html
    .replace(/<span class="[^"]*">/g, "")
    .replace(/<\/span>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const SAMPLE = [
  "# RepoOS configuration",
  'workDir = "work"',
  "maxActiveTasks = 3",
  "autoEngineeringMode = false",
  "",
  "[check]",
  'uiStylesheet = "src/ui-app/src/style.css"',
  'gradientTokens = ["--btn-primary-bg", "--btn-new-bg"]',
  "",
  "[[deployments]]",
  'name = "Landing (prod)"',
  "selector = '[data-theme=\"light\"]' # tricky",
].join("\n");

describe("highlightToml", () => {
  it("preserves the exact text content", () => {
    expect(textOf(highlightToml(SAMPLE))).toBe(SAMPLE);
  });

  it("returns empty for empty input", () => {
    expect(highlightToml("")).toBe("");
  });

  it("tags comments, tables, keys, strings and numbers", () => {
    const html = highlightToml(SAMPLE);
    expect(html).toContain('<span class="toml-comment"># RepoOS configuration</span>');
    expect(html).toContain('<span class="toml-table">check</span>');
    expect(html).toContain('<span class="toml-table">deployments</span>');
    expect(html).toContain('<span class="toml-key">workDir </span>');
    expect(html).toContain('<span class="toml-string">"work"</span>');
    expect(html).toContain('<span class="toml-number">3</span>');
    expect(html).toContain('<span class="toml-bool">false</span>');
  });

  it("escapes HTML without dropping characters", () => {
    const source = 'a = "<b>&"\n';
    expect(textOf(highlightToml(source))).toBe(source);
    expect(highlightToml(source)).toContain("&lt;b&gt;&amp;");
  });
});
