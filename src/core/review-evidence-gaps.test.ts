import { describe, expect, it } from "vitest";
import {
  EVIDENCE_GAP_ONLY_MARKER,
  evidenceGapsNeedsInputDetail,
  extractEvidenceGapsSection,
  isEvidenceGapOnlyReview,
} from "./review-evidence-gaps.js";

describe("isEvidenceGapOnlyReview (#0831)", () => {
  const gapReport = [
    "## Verdict",
    `\`good to go\` — evidence missing. ${EVIDENCE_GAP_ONLY_MARKER}`,
    "",
    "## Evidence gaps",
    "- Missing highlight on Settings tab shot",
    "",
    "## Bugs",
    "None found",
  ].join("\n");

  it("accepts good-to-go with marker and no code findings", () => {
    expect(isEvidenceGapOnlyReview(gapReport, "good to go")).toBe(true);
  });

  it("rejects when concrete bugs are listed", () => {
    const report = gapReport.replace("None found", "- src/x.ts: off-by-one");
    expect(isEvidenceGapOnlyReview(report, "good to go")).toBe(false);
  });

  it("rejects without the marker", () => {
    expect(
      isEvidenceGapOnlyReview("## Verdict\n`good to go` — ship it.\n", "good to go"),
    ).toBe(false);
  });

  it("extracts evidence gap detail for needs_input", () => {
    expect(extractEvidenceGapsSection(gapReport)).toContain("Missing highlight");
    expect(evidenceGapsNeedsInputDetail(gapReport)).toContain("Missing highlight");
  });
});
