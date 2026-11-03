/**
 * Extract unresolved review findings for a new engineer session (#0680).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "./frontmatter.js";
import { parseReviewVerdict } from "./review-verdict.js";
import { extractReviewReportSections } from "./review-report-sections.js";
import { listReviewPasses } from "./review-passes.js";
import type { RepoOSConfig } from "./types.js";

/**
 * Newest review report available: the local latest-pass mirror first, then the
 * newest committed pass (#1013). A fresh clone has no cache mirror, so without
 * the fallback a re-handoff after review feedback would lose the findings.
 */
function latestReviewReportFile(config: RepoOSConfig, taskId: string): string | null {
  const mirror = join(config.root, config.cacheDir || ".repoos", "reviews", `${taskId}.md`);
  if (existsSync(mirror)) return mirror;
  return listReviewPasses(config, taskId).at(-1)?.file ?? null;
}

export function unresolvedReviewFindingsBlock(config: RepoOSConfig, taskId: string): string | null {
  const file = latestReviewReportFile(config, taskId);
  if (!file) return null;
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
  if (sections.bugs) {
    parts.push("### Bugs", "", sections.bugs.trim(), "");
  }
  if (sections.edgeCases) {
    parts.push("### Edge cases", "", sections.edgeCases.trim(), "");
  }
  if (sections.suggestions) {
    parts.push("### Suggestions", "", sections.suggestions.trim(), "");
  }
  if (parts.length <= 4) {
    parts.push(markdown.slice(0, 2000));
  }
  return parts.join("\n");
}
