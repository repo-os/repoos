/**
 * Parses the reviewer's verdict line out of a review report's markdown.
 * Shared so the task drawer's colored verdict badge and the board card's
 * "review passed" hint read the same outcome — a card previously showed
 * "review passed · ready to finish" (and pulsed the ready-to-merge glow)
 * purely because nothing was actively running, regardless of whether the
 * review actually came back clean or said "back to the drawing board".
 */
export const REVIEW_VERDICTS = [
  { label: "back to the drawing board", tone: "red" },
  { label: "needs some work", tone: "amber" },
  { label: "good to go", tone: "green" },
] as const;

export type ReviewVerdictTone = (typeof REVIEW_VERDICTS)[number]["tone"];

export function parseReviewVerdict(markdown: string | null | undefined): { label: string; tone: ReviewVerdictTone } | null {
  if (!markdown) return null;
  const lower = markdown.toLowerCase();
  for (const v of REVIEW_VERDICTS) {
    if (lower.includes(v.label)) return { label: v.label, tone: v.tone };
  }
  return null;
}
