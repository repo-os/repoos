import { describe, expect, it } from "vitest";
import { isDocsOnlyCheck } from "./check-docs-only.js";

describe("docs/bookkeeping check classification", () => {
  it("accepts only the conservative paths", () => {
    expect(isDocsOnlyCheck(["work/reports/9999/x.md", "docs/a.md", "inputs/file.txt"])).toBe(true);
    for (const paths of [
      ["src/a.ts", "work/a.md"],
      ["package.json"],
      ["repoos.toml"],
      ["src/a.md"],
      ["scripts/a.md"],
    ]) {
      expect(isDocsOnlyCheck(paths)).toBe(false);
    }
  });
  it("fails closed on missing paths or when disabled", () => {
    expect(isDocsOnlyCheck(null)).toBe(false);
    expect(isDocsOnlyCheck(["work/x.md"], false)).toBe(false);
  });
});
