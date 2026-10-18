/**
 * Evidence-only review outcomes (#0831): code is fine but handoff shots are
 * missing or wrong. These must not consume auto-bounce review rounds.
 */

import { extractReviewReportSections } from "./review-report-sections.js";
import { reviewVerdictSection, type ReviewVerdict } from "./review-verdict.js";

/** Verdict marker the reviewer includes when only evidence blocks sign-off. */
export const EVIDENCE_GAP_ONLY_MARKER = "EVIDENCE-GAP-ONLY";

/** Automatic re-capture attempts before escalating to a human. */
export const MAX_EVIDENCE_GAP_RECOVERY_ATTEMPTS = 2;

export const EVIDENCE_GAPS_EXHAUSTED_REASON = "evidence-gaps-exhausted";

function sectionHasConcreteFindings(content: string | undefined): boolean {
  if (!content?.trim()) return false;
  const first = content
    .trim()
    .split(/\r?\n/)
    .find((line) => line.trim());
  if (!first) return false;
  return !/^none found\.?$/i.test(first.trim());
}

/** True when the reviewer declared code clean and only evidence is blocking. */
export function isEvidenceGapOnlyReview(
  report: string,
  verdict: ReviewVerdict | string | null,
): boolean {
  if (!verdict || verdict === "back to the drawing board") return false;
  const section = reviewVerdictSection(report);
  if (!section || !section.includes(EVIDENCE_GAP_ONLY_MARKER)) return false;
  const { bugs, edgeCases } = extractReviewReportSections(report);
  if (sectionHasConcreteFindings(bugs) || sectionHasConcreteFindings(edgeCases)) {
    return false;
  }
  return true;
}

/** Body of `## Evidence gaps`, when present. */
export function extractEvidenceGapsSection(markdown: string): string | null {
  const heading = /^#{1,6}\s+evidence gaps\s*$/im.exec(markdown);
  if (!heading) return null;
  const body = markdown
    .slice((heading.index ?? 0) + heading[0].length)
    .split(/^#{1,6}\s+/m, 1)[0]
    .trim();
  return body || null;
}

/** One-line summary for needs_input when automatic recovery is exhausted. */
export function evidenceGapsNeedsInputDetail(reportMarkdown: string): string {
  const gaps = extractEvidenceGapsSection(reportMarkdown);
  if (gaps) {
    const first = gaps.split(/\r?\n/).find((line) => line.trim());
    if (first) return first.trim().slice(0, 500);
  }
  const verdictLine = reviewVerdictSection(reportMarkdown)
    ?.split(/\r?\n/)
    .find((line) => line.trim());
  return (
    verdictLine?.trim().slice(0, 500) ?? "UI evidence still missing after automatic re-capture."
  );
}
