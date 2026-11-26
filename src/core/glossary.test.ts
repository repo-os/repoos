import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REVIEW_VERDICTS } from "./review-verdict.js";
import { STATUSES } from "./types.js";

const glossary = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../user-docs/glossary.md"),
  "utf8",
);

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
