/**
 * Parses the reviewer's verdict line out of a review report's markdown, for
 * the task drawer's colored verdict badge and the board card's "review
 * passed" hint, so they read the same outcome — a card previously showed
 * "review passed · ready to finish" (and pulsed the ready-to-merge glow)
 * purely because nothing was actively running, regardless of whether the
 * review actually came back clean or said "back to the drawing board".
 *
 * The label-matching itself lives in `core/review-verdict.ts`, shared with
 * the server's auto-bounce gate so the two can never silently disagree again
 * (see that file's doc comment for the #0402 incident this fixed).
 */
import {
  parseReviewVerdict as parseVerdictLabel,
  type ReviewVerdict,
} from "../../../core/review-verdict.js";

export const REVIEW_VERDICTS: readonly { label: ReviewVerdict; tone: "green" | "amber" | "red" }[] =
  [
    { label: "back to the drawing board", tone: "red" },
    { label: "needs some work", tone: "amber" },
    { label: "good to go", tone: "green" },
  ] as const;

export type ReviewVerdictTone = (typeof REVIEW_VERDICTS)[number]["tone"];

export function parseReviewVerdict(
  markdown: string | null | undefined,
): { label: string; tone: ReviewVerdictTone } | null {
  const label = parseVerdictLabel(markdown);
  if (!label) return null;
  const entry = REVIEW_VERDICTS.find((v) => v.label === label);
  return entry ? { label: entry.label, tone: entry.tone } : null;
}
