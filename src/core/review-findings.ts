/**
 * Extract unresolved review findings for a new engineer session (#0680).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "./frontmatter.js";
import { parseReviewVerdict } from "./review-verdict.js";
import { extractReviewReportSections } from "./review-report-sections.js";
import type { RepoOSConfig } from "./types.js";

export function unresolvedReviewFindingsBlock(config: RepoOSConfig, taskId: string): string | null {
  const file = join(config.root, config.cacheDir || ".repoos", "reviews", `${taskId}.md`);
  if (!existsSync(file)) return null;
  let markdown: string;
  try {
    markdown = parseDocument(readFileSync(file, "utf8")).body.trim();
  } catch {
    return null;
  }
  const verdict = parseReviewVerdict(markdown);
  if (!verdict || verdict === "good to go") return null;
  const sections = extractReviewReportSections(markdown);
  const parts = [
    "## Unresolved review findings",
    "",
    `The latest review ended with verdict **${verdict}**. Address these before re-handoff:`,
    "",
  ];
  if (sections.bugs?.trim() && !/^none found$/i.test(sections.bugs.trim())) {
    parts.push("### Bugs", "", sections.bugs.trim(), "");
  }
  if (sections.edgeCases?.trim() && !/^none found$/i.test(sections.edgeCases.trim())) {
    parts.push("### Edge cases", "", sections.edgeCases.trim(), "");
  }
  if (sections.suggestions?.trim() && !/^none found$/i.test(sections.suggestions.trim())) {
    parts.push("### Suggestions", "", sections.suggestions.trim(), "");
  }
  if (parts.length <= 4) {
    parts.push(markdown.slice(0, 2000));
  }
  return parts.join("\n");
}
