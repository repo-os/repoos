/**
 * #0865 — do not chain automatic reviews on an unchanged tree with open findings.
 */
import { describe, expect, it } from "vitest";
import type { ReviewGuardReport } from "../../server/review-tree-identity.js";
import {
  formatReviewTreeIdentity,
  hasOpenReviewFindings,
  openFindingsSameTreeDecision,
} from "../../server/review-tree-identity.js";

describe("openFindingsSameTreeDecision (#0865)", () => {
  const table: {
    name: string;
    manual?: boolean;
    report: ReviewGuardReport | null;
    current: string | null;
    action: "run" | "skip";
  }[] = [
    {
      name: "unchanged tree with open findings",
      report: {
        state: "ok",
        markdown: "## Verdict\nneeds some work\n",
        treeIdentity: "abc:ev",
      },
      current: "abc:ev",
      action: "skip",
    },
    {
      name: "changed tree with open findings",
      report: {
        state: "ok",
        markdown: "## Verdict\nneeds some work\n",
        treeIdentity: "abc:ev",
      },
      current: "def:ev",
      action: "run",
    },
    {
      name: "queued message at handoff — unchanged tree still skips auto review",
      report: {
        state: "ok",
        markdown: "## Verdict\nneeds some work\n",
        treeIdentity: "abc:ev",
      },
      current: "abc:ev",
      action: "skip",
    },
    {
      name: "manual review again on unchanged tree",
      manual: true,
      report: {
        state: "ok",
        markdown: "## Verdict\nneeds some work\n",
        treeIdentity: "abc:ev",
      },
      current: "abc:ev",
      action: "run",
    },
    {
      name: "message during review — tree unchanged after engineer returns",
      report: {
        state: "ok",
        markdown: "## Verdict\nneeds some work\n",
        treeIdentity: "abc:ev",
      },
      current: "abc:ev",
      action: "skip",
    },
    {
      name: "crashed engineer with queued message — same guard after re-handoff",
      report: {
        state: "ok",
        markdown: "## Verdict\nneeds some work\n",
        treeIdentity: "abc:ev",
      },
      current: "abc:ev",
      action: "skip",
    },
  ];

  for (const row of table) {
    it(row.name, () => {
      const decision = openFindingsSameTreeDecision(row.report, row.current, {
        manual: row.manual,
      });
      expect(decision.action).toBe(row.action);
      if (row.action === "skip" && decision.action === "skip") {
        expect(decision.handBackToEngineer).toBe(true);
      }
    });
  }
});

describe("review tree identity helpers", () => {
  it("formats head and evidence", () => {
    expect(formatReviewTreeIdentity("abc", "ev")).toBe("abc:ev");
    expect(formatReviewTreeIdentity("abc", undefined)).toBe("abc:");
    expect(formatReviewTreeIdentity(null, "ev")).toBeNull();
  });

  it("classifies open findings", () => {
    expect(hasOpenReviewFindings("needs some work")).toBe(true);
    expect(hasOpenReviewFindings("back to the drawing board")).toBe(true);
    expect(hasOpenReviewFindings("good to go")).toBe(false);
    expect(hasOpenReviewFindings(null)).toBe(false);
  });
});
