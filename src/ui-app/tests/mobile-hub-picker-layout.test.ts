/**
 * Hub server picker layout at phone width (#1171).
 *
 * jsdom cannot lay anything out, so these pin the rules the fixture QA pass
 * found necessary. At 375px a long server name (the `many` fixture with a
 * 60-character name) used to push its row past the card, clipping the ⋮ button
 * off the right edge. A `<button>` is a flex item with `min-width: auto`, so the
 * row needs `min-width: 0` to shrink and let the name truncate.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../../mobile/src/style.css"), "utf8");

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(^|\\n)${escaped} \\{([^}]*)\\}`));
  expect(match, `style.css must keep the ${selector} rule`).not.toBeNull();
  return match?.[2] ?? "";
}

describe("mobile hub server picker at phone width", () => {
  it.each([
    [".server-row", "min-width: 0"],
    [".server-meta", "min-width: 0"],
  ])("%s may shrink below its long content", (selector, declaration) => {
    expect(ruleBody(selector)).toContain(declaration);
  });

  it.each([".more-btn", ".chevron", ".server-avatar"])(
    "%s keeps its size so it stays on the card",
    (selector) => {
      expect(ruleBody(selector)).toContain("flex-shrink: 0");
    },
  );

  it.each([".server-name", ".server-host"])("%s truncates instead of wrapping", (selector) => {
    const body = ruleBody(selector);
    expect(body).toContain("white-space: nowrap");
    expect(body).toContain("text-overflow: ellipsis");
  });
});
