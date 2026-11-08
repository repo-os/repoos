import { describe, expect, it } from "vitest";
import { isDocsOnlyCheck } from "./check-docs-only.js";

describe("docs/bookkeeping check classification", () => {
  it("accepts only the conservative paths", () => {
    expect(isDocsOnlyCheck(["work/reports/9999/x.md", "docs/a.md", "inputs/file.txt"])).toBe(true);
    for (const paths of [
      ["src/a.ts", "work/a.md"],
      ["package.json"],
      ["repoos.toml"],
      ["user-docs/package.json"],
      ["docs/bun.lock"],
      ["src/a.md"],
      ["scripts/a.md"],
    ]) {
      expect(isDocsOnlyCheck(paths)).toBe(false);
    }
  });
  it("fails closed on missing paths or when disabled", () => {
    expect(isDocsOnlyCheck(null)).toBe(false);
    expect(isDocsOnlyCheck(["work/x.md"], false)).toBe(false);
    // An empty list must not match: Array.every on [] is vacuously true.
    expect(isDocsOnlyCheck([])).toBe(false);
    expect(isDocsOnlyCheck([], true, { allowEmpty: true })).toBe(true);
  });
});
