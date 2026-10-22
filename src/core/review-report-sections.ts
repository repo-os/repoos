/**
 * Shared parsing of review report markdown sections — used by the review
 * auto-bounce path and the approval policy gate so both agree on whether a
 * report carries blocking bugs.
 */

/**
 * Report section for environmental verification limits (#0910). It is kept
 * separate from Bugs on purpose: a sandbox that cannot reach the RepoOS server
 * or hit an ephemeral git temp-file error has not found a defect, so this
 * section must never lower the verdict or consume a review round.
 */
export const ENVIRONMENT_VERIFY_HEADING = "Could not verify (environment)";

/** Complete section bodies that mean "nothing to report", after normalization. */
const NONE_STATEMENTS = new Set([
  "none",
  "none found",
  "no bugs",
  "no bugs found",
  "no findings",
  "no issues",
  "no issues found",
  "no problems",
  "no problems found",
  "nothing",
  "nothing found",
  "nothing to report",
  "not applicable",
  "n a",
  "na",
  "nil",
]);

/**
 * Phrases that may carry a qualifier tail ("None found — see edge cases").
 * The tail must start with one of the connectors below, so a bullet such as
 * "No bugs in the parser, but the CLI crashes" still counts as a finding.
 */
const NONE_QUALIFIER_PHRASES = [
  "none found",
  "none identified",
  "no bugs",
  "no bugs found",
  "no findings",
  "no issues",
  "no issues found",
  "no problems",
  "no problems found",
  "nothing found",
  "nothing to report",
  "not applicable",
];

// Deliberately excludes "but"/"however": those usually introduce an actual
// finding in a bullet ("- None found, but the CLI crashes"), while the
// connectors below are a pointer or scope qualifier on the same "nothing here"
// statement.
const QUALIFIER_TAIL =
  /^(?:see|except|apart from|aside from|other than|regarding|beyond|elsewhere|otherwise)\b/;

const LIST_MARKER = /^\s*(?:[-+*•]|\d+[.)])\s+/;

function stripListMarker(line: string): string {
  return line.replace(LIST_MARKER, "").trim();
}

/** Lowercase, drop markdown/punctuation and collapse whitespace. */
function normalizeReviewLine(line: string): string {
  return stripListMarker(line)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the text itself says there is nothing to report. */
function isNoneStatement(text: string): boolean {
  const normalized = normalizeReviewLine(text);
  if (!normalized) return true;
  if (NONE_STATEMENTS.has(normalized)) return true;
  return NONE_QUALIFIER_PHRASES.some((phrase) => {
    if (!normalized.startsWith(`${phrase} `)) return false;
    return QUALIFIER_TAIL.test(normalized.slice(phrase.length + 1));
  });
}

/**
 * Parse a `**<label>:**` finding line (the colon may sit inside or just after
 * the bold label) and return its value. Lines without a colon are ordinary
 * prose, not labelled findings.
 */
function parseBoldLabelFinding(line: string): { value: string } | null {
  const match = /^\*\*([^*]+)\*\*\s*(.*)$/.exec(stripListMarker(line));
  if (!match) return null;
  let label = match[1].trim();
  let value = match[2].trim();
  const labelHasColon = label.endsWith(":");
  if (labelHasColon) label = label.slice(0, -1).trim();
  const valueHasColon = value.startsWith(":");
  if (valueHasColon) value = value.slice(1).trim();
  if (!label || (!labelHasColon && !valueHasColon)) return null;
  return { value };
}

/**
 * True when a review section has nothing to report. Case, punctuation,
 * markdown emphasis, backticks, bullets and whitespace are ignored, so
 * "None found.", "No bugs found", "N/A" and an empty section all read the same.
 *
 * A section is only non-empty when it lists findings: a bullet or numbered
 * item, or a bold `**<label>:**` line, whose content is not itself a "none"
 * statement. Plain prose (including a qualifier after "None found") does not
 * count, which keeps harmless reviewer phrasing from blocking a clean review.
 */
export function isEmptyReviewSection(text: string | null | undefined): boolean {
  if (!text?.trim()) return true;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const content = stripListMarker(line);
    if (!content) continue;
    if (isNoneStatement(content)) continue;
    const bold = parseBoldLabelFinding(line);
    if (bold) {
      if (!bold.value || isNoneStatement(bold.value)) continue;
      return false;
    }
    if (LIST_MARKER.test(line)) return false;
  }
  return true;
}

function sectionContent(sectionLines: Record<string, string[]>): Record<string, string> {
  const sections: Record<string, string> = {};
  for (const [key, lines] of Object.entries(sectionLines)) {
    const content = lines.join("\n").trim();
    if (!content) continue;
    // Relevance is a one-line label, not a findings list: keep any substantive
    // text and only drop an explicit "none" value.
    // Environment notes are explanatory prose, not a findings list. Preserve
    // them even when they do not use bullets or other finding markers.
    const empty =
      key === "couldNotVerify"
        ? false
        : key === "relevance"
          ? isNoneStatement(content)
          : isEmptyReviewSection(content);
    if (!empty) {
      sections[key] = content;
    }
  }
  return sections;
}

/**
 * Heading for the non-blocking sandbox-limitations section (#0910). The word
 * "environment" is optional so a reviewer that writes only "Could not verify"
 * still lands here instead of in Bugs.
 */
const ENVIRONMENT_HEADING = /^##\s+could not verify(?:\s*\(environment\))?\s*$/i;

/** Extract Relevance, Bugs, Edge cases, Suggestions, Evidence and environment notes. */
export function extractReviewReportSections(markdown: string): {
  relevance?: string;
  bugs?: string;
  edgeCases?: string;
  suggestions?: string;
  evidence?: string;
  couldNotVerify?: string;
} {
  const lines = markdown.split("\n");
  let currentSection: string | null = null;
  const sectionLines: Record<string, string[]> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "## Relevance") {
      currentSection = "relevance";
      sectionLines.relevance = [];
    } else if (trimmed === "## Bugs") {
      currentSection = "bugs";
      sectionLines.bugs = [];
    } else if (trimmed === "## Edge cases") {
      currentSection = "edgeCases";
      sectionLines.edgeCases = [];
    } else if (trimmed === "## Suggestions") {
      currentSection = "suggestions";
      sectionLines.suggestions = [];
    } else if (trimmed === "## Evidence") {
      currentSection = "evidence";
      sectionLines.evidence = [];
    } else if (ENVIRONMENT_HEADING.test(trimmed)) {
      currentSection = "couldNotVerify";
      sectionLines.couldNotVerify = [];
    } else if (trimmed.startsWith("## ") && currentSection) {
      currentSection = null;
    } else if (currentSection && sectionLines[currentSection]) {
      sectionLines[currentSection].push(line);
    }
  }

  const sections = sectionContent(sectionLines);
  return {
    relevance: sections.relevance,
    bugs: sections.bugs,
    edgeCases: sections.edgeCases,
    suggestions: sections.suggestions,
    evidence: sections.evidence,
    couldNotVerify: sections.couldNotVerify,
  };
}

/** True when the reviewer listed concrete bugs (not "None found" in any spelling). */
export function reviewReportHasBlockingBugs(markdown: string | null | undefined): boolean {
  if (!markdown?.trim()) return false;
  return !!extractReviewReportSections(markdown).bugs;
}

/**
 * True when the only reason a report is not clean is that the reviewer could
 * not run something in its sandbox (#0910): it recorded a
 * `## Could not verify (environment)` note and listed no code findings.
 *
 * Environment limitations must never produce `needs some work`, bounce the
 * engineer, or burn review rounds. Edge cases and evidence gaps are excluded:
 * those are real follow-up work, not sandbox limitations. Suggestions are
 * deliberately ignored — they are non-blocking review chatter.
 */
export function reviewReportIsEnvironmentOnly(markdown: string | null | undefined): boolean {
  if (!markdown?.trim()) return false;
  const sections = extractReviewReportSections(markdown);
  return !!sections.couldNotVerify && !sections.bugs && !sections.edgeCases && !sections.evidence;
}
