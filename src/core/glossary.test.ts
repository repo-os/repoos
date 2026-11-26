import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REVIEW_VERDICTS } from "./review-verdict.js";
import { STATUSES } from "./types.js";

const glossary = readFileSync(resolve(import.meta.dir, "../../user-docs/glossary.md"), "utf8");

describe("user glossary coverage", () => {
  it("defines every task status and review verdict", () => {
    const terms = new Set(
      [...glossary.matchAll(/^\|\s*([^|]+?)\s*\|/gm)].map(([, term]) => term.trim()),
    );

    for (const status of STATUSES) {
      expect(terms, `missing glossary entry for task status: ${status}`).toContain(status);
    }
    for (const verdict of REVIEW_VERDICTS) {
      expect(terms, `missing glossary entry for review verdict: ${verdict}`).toContain(verdict);
    }
  });
});
