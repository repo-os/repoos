/**
 * Parses a review report's verdict/relevance labels out of its markdown.
 *
 * The review prompt (`src/server/review.ts`) asks the agent to wrap its
 * verdict/relevance in backticks, but not every CLI/model follows that
 * exactly — a real review of #0402 (opencode-go/mimo-v2.5) wrote
 * `**needs some work**` (markdown bold) instead of `` `needs some work` ``.
 *
 * This used to be two independently-hand-rolled parsers that drifted apart:
 * the server's auto-bounce gate required the literal backtick-wrapped
 * string and silently did nothing when a model didn't comply, while the UI's
 * verdict badge (`reviewVerdict.ts`) already did a lenient, formatting-
 * agnostic substring search and displayed the verdict correctly regardless.
 * The UI was right and the server's gate was wrong — this is now the single
 * shared implementation both sides use, so they can never disagree again.
 *
 * Order matters: each list is checked most-specific-first so a report that
 * mentions a milder verdict in passing while explaining a worse one (e.g.
 * "back to the drawing board" text discussing what would merely "need some
 * work") doesn't get misread as the mild outcome.
 */

export type ReviewVerdict = "good to go" | "needs some work" | "back to the drawing board";
export type ReviewRelevance = "still relevant" | "no longer needed" | "needs rescoping";

const VERDICT_ORDER: ReviewVerdict[] = [
  "back to the drawing board",
  "needs some work",
  "good to go",
];

const RELEVANCE_ORDER: ReviewRelevance[] = [
  "no longer needed",
  "needs rescoping",
  "still relevant",
];

export function parseReviewVerdict(markdown: string | null | undefined): ReviewVerdict | null {
  if (!markdown) return null;
  const lower = markdown.toLowerCase();
  for (const label of VERDICT_ORDER) {
    if (lower.includes(label)) return label;
  }
  return null;
}

export function parseReviewRelevance(markdown: string | null | undefined): ReviewRelevance | null {
  if (!markdown) return null;
  const lower = markdown.toLowerCase();
  for (const label of RELEVANCE_ORDER) {
    if (lower.includes(label)) return label;
  }
  return null;
}
