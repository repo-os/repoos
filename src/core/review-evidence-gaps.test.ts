import { describe, expect, it } from "vitest";
import {
  EVIDENCE_GAP_ONLY_MARKER,
  evidenceGapSummary,
  isEvidenceGapOnlyReview,
} from "./review-evidence-gaps.js";

describe("review-evidence-gaps", () => {
  it("detects EVIDENCE-GAP-ONLY in the verdict section", () => {
    const report = [
      "## Verdict",
      "`needs some work` — EVIDENCE-GAP-ONLY",
      "",
      "## Evidence",
      "- Settings tab shot missing",
    ].join("\n");
    expect(isEvidenceGapOnlyReview(report, "needs some work")).toBe(true);
    expect(isEvidenceGapOnlyReview(report, "good to go")).toBe(false);
  });

  it("summarizes the Evidence section for escalation detail", () => {
    const report = [
      "## Verdict",
      EVIDENCE_GAP_ONLY_MARKER,
      "",
      "## Evidence",
      "- `/settings?tab=general` — no capture",
    ].join("\n");
    expect(evidenceGapSummary(report)).toContain("/settings?tab=general");
  });
});
