/**
 * #0894 — a Bugs (or Edge cases/Suggestions) section that says there is
 * nothing to report must never count as a finding, whatever harmless phrasing
 * the reviewer used.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { unresolvedReviewFindingsBlock } from "../../core/review-findings.js";
import {
  extractReviewReportSections,
  isEmptyReviewSection,
  reviewReportHasBlockingBugs,
  reviewReportIsEnvironmentOnly,
} from "../../core/review-report-sections.js";
import type { RepoOSConfig } from "../../core/types.js";
import { reviewFindingsMessage } from "../../server/review.js";

const EMPTY_PHRASINGS = [
  "",
  "None",
  "None found",
  "None found.",
  "No bugs",
  "No bugs found",
  "No issues found",
  "N/A",
  "Nothing found",
  "-",
  "**None found**",
  "`None found`",
  "- None found",
  "* _None found._",
  "None found — see edge cases",
  "None found.\n\nThe parser looks fine to me.",
  "  None found  ",
  "none FOUND!",
  "No issues found; see Edge cases.",
  "N/A — nothing to report",
  "Nothing to report.",
];

const FINDING_PHRASINGS = [
  "- Off-by-one in parser",
  "1. Crash on empty input",
  "1) Crash on empty input",
  "**Bug:** crash on empty input",
  "**Bug**: crash on empty input",
  "- **Bug:** crash on empty input",
  "None found.\n\n- Off-by-one in parser",
  "**Bugs:** None found\n- Off-by-one in parser",
  "- No bugs in the parser, but the CLI crashes",
  "None\n- Crash on empty input",
];

function reportWith(section: string, body: string): string {
  return `## Verdict\ngood to go.\n\n## ${section}\n${body}\n`;
}

describe("isEmptyReviewSection (#0894)", () => {
  it.each(EMPTY_PHRASINGS)("treats %j as empty", (phrasing) => {
    expect(isEmptyReviewSection(phrasing)).toBe(true);
  });

  it.each(FINDING_PHRASINGS)("treats %j as a finding", (phrasing) => {
    expect(isEmptyReviewSection(phrasing)).toBe(false);
  });

  it("treats missing/undefined text as empty", () => {
    expect(isEmptyReviewSection(undefined)).toBe(true);
    expect(isEmptyReviewSection(null)).toBe(true);
  });

  it("does not require a bullet under plain prose that lists no findings", () => {
    expect(isEmptyReviewSection("Reviewed the diff and it looks fine.")).toBe(true);
  });
});

describe("extractReviewReportSections (#0894)", () => {
  for (const section of ["Bugs", "Edge cases", "Suggestions"] as const) {
    const key =
      section === "Edge cases" ? "edgeCases" : (section.toLowerCase() as "bugs" | "suggestions");

    it.each(EMPTY_PHRASINGS)(`drops %j from ${section}`, (phrasing) => {
      expect(extractReviewReportSections(reportWith(section, phrasing))[key]).toBeUndefined();
    });

    it.each(FINDING_PHRASINGS)(`keeps %j in ${section}`, (phrasing) => {
      expect(extractReviewReportSections(reportWith(section, phrasing))[key]).toBe(phrasing.trim());
    });
  }

  it("keeps the relevance label even though it has no bullets", () => {
    const report =
      "## Verdict\ngood to go.\n\n## Relevance\nstill relevant — the task is not obsolete.\n";
    expect(extractReviewReportSections(report).relevance).toContain("still relevant");
  });

  it("drops a none-ish relevance value", () => {
    const report = "## Verdict\ngood to go.\n\n## Relevance\nNone found.\n";
    expect(extractReviewReportSections(report).relevance).toBeUndefined();
  });
});

describe("reviewReportHasBlockingBugs (#0894)", () => {
  it.each(EMPTY_PHRASINGS)("is false for Bugs %j", (phrasing) => {
    expect(reviewReportHasBlockingBugs(reportWith("Bugs", phrasing))).toBe(false);
  });

  it.each(FINDING_PHRASINGS)("is true for Bugs %j", (phrasing) => {
    expect(reviewReportHasBlockingBugs(reportWith("Bugs", phrasing))).toBe(true);
  });

  it("is false for an empty or missing report", () => {
    expect(reviewReportHasBlockingBugs("")).toBe(false);
    expect(reviewReportHasBlockingBugs(null)).toBe(false);
    expect(reviewReportHasBlockingBugs(undefined)).toBe(false);
  });
});

describe("environment-only review reports (#0910)", () => {
  it("recognizes sandbox limitations without findings", () => {
    expect(
      reviewReportIsEnvironmentOnly(
        [
          "## Verdict",
          "needs some work",
          "",
          "## Bugs",
          "None found.",
          "",
          "## Could not verify (environment)",
          "repoos landable could not reach server; merge-tree temp file failed.",
        ].join("\n"),
      ),
    ).toBe(true);
  });

  it("does not hide a code finding behind an environment note", () => {
    expect(
      reviewReportIsEnvironmentOnly(
        [
          "## Bugs",
          "- Broken behavior",
          "",
          "## Could not verify (environment)",
          "command failed",
        ].join("\n"),
      ),
    ).toBe(false);
  });
});

describe("review auto-bounce consumer (#0894)", () => {
  it.each(EMPTY_PHRASINGS)("sends no Bugs findings for %j", (phrasing) => {
    expect(reviewFindingsMessage(reportWith("Bugs", phrasing))).toBe("");
  });

  it.each(FINDING_PHRASINGS)("forwards a real Bugs finding %j", (phrasing) => {
    const message = reviewFindingsMessage(reportWith("Bugs", phrasing));
    expect(message).toContain("## Bugs");
    expect(message).toContain(phrasing.trim());
  });

  it("keeps the sections that do list findings and drops the none-ish ones", () => {
    const report = [
      "## Verdict",
      "needs some work",
      "",
      "## Bugs",
      "None found.",
      "",
      "## Edge cases",
      "- Rename a task while its worktree is locked",
      "",
      "## Suggestions",
      "N/A",
    ].join("\n");
    const message = reviewFindingsMessage(report);
    expect(message).not.toContain("## Bugs");
    expect(message).toContain("## Edge cases");
    expect(message).toContain("- Rename a task while its worktree is locked");
    expect(message).not.toContain("## Suggestions");
  });
});

describe("unresolvedReviewFindingsBlock (#0894)", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function configWith(report: string): RepoOSConfig {
    const root = mkdtempSync(join(tmpdir(), "repoos-review-findings-"));
    roots.push(root);
    mkdirSync(join(root, ".repoos", "reviews"), { recursive: true });
    writeFileSync(join(root, ".repoos", "reviews", "0894.md"), report);
    return { root, cacheDir: ".repoos" } as RepoOSConfig;
  }

  it("does not forward none-ish sections to the engineer", () => {
    const report = [
      "## Verdict",
      "needs some work",
      "",
      "## Bugs",
      "None found.",
      "",
      "## Edge cases",
      "No issues found",
      "",
      "## Suggestions",
      "N/A",
    ].join("\n");
    const block = unresolvedReviewFindingsBlock(configWith(report), "0894")!;
    expect(block).toContain("needs some work");
    expect(block).not.toContain("### Bugs");
    expect(block).not.toContain("### Edge cases");
    expect(block).not.toContain("### Suggestions");
  });

  it("forwards a real finding with its heading", () => {
    const report = [
      "## Verdict",
      "needs some work",
      "",
      "## Bugs",
      "- Off-by-one in parser",
      "",
      "## Edge cases",
      "None found.",
    ].join("\n");
    const block = unresolvedReviewFindingsBlock(configWith(report), "0894")!;
    expect(block).toContain("### Bugs");
    expect(block).toContain("- Off-by-one in parser");
    expect(block).not.toContain("### Edge cases");
  });
});
