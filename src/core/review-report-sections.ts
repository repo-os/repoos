/**
 * Shared parsing of review report markdown sections — used by the review
 * auto-bounce path and the approval policy gate so both agree on whether a
 * report carries blocking bugs.
 */

function sectionContent(sectionLines: Record<string, string[]>): Record<string, string> {
  const sections: Record<string, string> = {};
  for (const [key, lines] of Object.entries(sectionLines)) {
    const content = lines.join("\n").trim();
    if (content && content !== "None found") {
      sections[key] = content;
    }
  }
  return sections;
}

/** Extract Relevance, Bugs, Edge cases, and Suggestions (same rules as review auto-bounce). */
export function extractReviewReportSections(markdown: string): {
  relevance?: string;
  bugs?: string;
  edgeCases?: string;
  suggestions?: string;
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
  };
}

/** True when the reviewer listed concrete bugs (not "None found"). */
export function reviewReportHasBlockingBugs(markdown: string | null | undefined): boolean {
  if (!markdown?.trim()) return false;
  return !!extractReviewReportSections(markdown).bugs;
}
