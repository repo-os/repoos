import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// #1157 review: the task drawer's Review toolbar and Debug tab strip were
// non-wrapping flex rows, so a control was cut off at 320/390px. Pin the wrap.
const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

function rule(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  expect(start, `${selector} rule exists`).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf("}", start));
}

describe("task drawer control rows wrap at phone widths", () => {
  it("lets the Review toolbar wrap", () => {
    expect(rule(read("src/style.css"), ".review-toolbar")).toContain("flex-wrap: wrap");
  });

  it("lets the Debug tab strip wrap", () => {
    expect(rule(read("src/components/DebugPanel.vue"), ".debug-tabs")).toContain("flex-wrap: wrap");
  });
});
