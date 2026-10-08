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
 * When the report has a `## Verdict` section, only that section is read (the
 * first non-empty line there). Review prose often names the other outcomes
 * while discussing tests or alternatives; scanning the entire report can turn
 * a declared "good to go" into a false rejection. Reports without that heading
 * (legacy) still use a whole-document scan so older stored reports keep working.
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

function verdictFromText(text: string): ReviewVerdict | null {
  const lower = text.toLowerCase();
  for (const label of VERDICT_ORDER) {
    if (lower.includes(label)) return label;
  }
  return null;
}

export function parseReviewVerdict(markdown: string | null | undefined): ReviewVerdict | null {
  if (!markdown) return null;
  const heading = /^#{1,6}\s+verdict\s*$/im.exec(markdown);
  if (heading) {
    const section = markdown
      .slice((heading.index ?? 0) + heading[0].length)
      .split(/^#{1,6}\s+/m, 1)[0];
    const line = section.split(/\r?\n/).find((value) => value.trim());
    return line ? verdictFromText(line) : null;
  }
  // Legacy reports without a Verdict heading: scan the full body.
  return verdictFromText(markdown);
}

export function parseReviewRelevance(markdown: string | null | undefined): ReviewRelevance | null {
  if (!markdown) return null;
  const lower = markdown.toLowerCase();
  for (const label of RELEVANCE_ORDER) {
    if (lower.includes(label)) return label;
  }
  return null;
}

/**
 * Replace the verdict label in a report's `## Verdict` section (#0714 mechanical
 * clamp). Leaves the rest of the section intact.
 */
export function replaceReviewVerdict(markdown: string, verdict: ReviewVerdict): string {
  const heading = /^#{1,6}\s+verdict\s*$/im.exec(markdown);
  if (!heading) return markdown;
  const start = (heading.index ?? 0) + heading[0].length;
  const rest = markdown.slice(start);
  const nextHeading = /^#{1,6}\s+/m.exec(rest);
  const sectionEnd = nextHeading ? start + (nextHeading.index ?? 0) : markdown.length;
  const section = markdown.slice(start, sectionEnd);
  const lines = section.split(/\r?\n/);
  let replaced = false;
  const out = lines.map((line) => {
    if (replaced || !line.trim()) return line;
    replaced = true;
    for (const label of VERDICT_ORDER) {
      if (line.toLowerCase().includes(label)) {
        return line.replace(new RegExp(label, "i"), verdict);
      }
    }
    return `\`${verdict}\` — mechanical review verification blocked approval.`;
  });
  return markdown.slice(0, start) + out.join("\n") + markdown.slice(sectionEnd);
}
