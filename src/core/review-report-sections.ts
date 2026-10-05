/**
 * Shared parsing of review report markdown sections — used by the review
 * auto-bounce path and the approval policy gate so both agree on whether a
 * report carries blocking bugs.
 */

/** Extract non-empty Bugs / Relevance sections (same rules as review.ts). */
export function extractReviewReportSections(markdown: string): {
  bugs?: string;
} {
  const sections: Record<string, string> = {};
  const lines = markdown.split("\n");
  let currentSection: string | null = null;
  const sectionLines: Record<string, string[]> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "## Bugs") {
      currentSection = "bugs";
      sectionLines.bugs = [];
    } else if (trimmed.startsWith("## ") && currentSection) {
      currentSection = null;
    } else if (currentSection === "bugs" && sectionLines.bugs) {
      sectionLines.bugs.push(line);
    }
  }

  for (const [key, sectLines] of Object.entries(sectionLines)) {
    const content = sectLines.join("\n").trim();
    if (content && content !== "None found") {
      sections[key] = content;
    }
  }

  return { bugs: sections.bugs };
}

/** True when the reviewer listed concrete bugs (not "None found"). */
export function reviewReportHasBlockingBugs(markdown: string | null | undefined): boolean {
  if (!markdown?.trim()) return false;
  return !!extractReviewReportSections(markdown).bugs;
}
