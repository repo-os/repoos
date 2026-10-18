/**
 * Evidence-only review outcomes (#0831): the code is fine but handoff shots or
 * verification records are missing or unusable. These must not consume
 * `review_rounds` or auto-bounce the engineer; the server re-captures instead.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RepoOSConfig } from "./types.js";
import { parseReviewVerdict, reviewVerdictSection } from "./review-verdict.js";

/** Verdict-section marker the reviewer emits when only evidence is blocking. */
export const EVIDENCE_GAP_ONLY_MARKER = "EVIDENCE-GAP-ONLY";

/** Automatic re-capture attempts before escalating to a human. */
export const MAX_EVIDENCE_GAP_REPAIR_ATTEMPTS = 2;

export function isEvidenceGapOnlyReview(report: string, verdict: string | null): boolean {
  const section = reviewVerdictSection(report);
  return (
    verdict !== "good to go" &&
    verdict !== null &&
    section !== null &&
    section.includes(EVIDENCE_GAP_ONLY_MARKER)
  );
}

/** Body of the report's `## Evidence` section, or null when absent. */
export function reviewEvidenceSection(markdown: string): string | null {
  const heading = /^#{1,6}\s+evidence\s*$/im.exec(markdown);
  if (!heading) return null;
  return markdown.slice((heading.index ?? 0) + heading[0].length).split(/^#{1,6}\s+/m, 1)[0];
}

/**
 * Human-readable summary of missing or bad shots for needs_input detail and logs.
 * Falls back to the first non-empty line of ## Evidence, then a generic line.
 */
export function evidenceGapSummary(report: string): string {
  const section = reviewEvidenceSection(report);
  if (!section) {
    return "Reviewer reported missing or unusable handoff evidence (see review report).";
  }
  const lines = section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return "Reviewer reported missing or unusable handoff evidence (see review report).";
  }
  return lines.join(" ");
}

function evidenceGapAttemptsPath(config: RepoOSConfig, taskId: string): string {
  return join(config.root, config.cacheDir, "evidence-gap-repair", `${taskId}.json`);
}

export function readEvidenceGapRepairAttempts(config: RepoOSConfig, taskId: string): number {
  const path = evidenceGapAttemptsPath(config, taskId);
  if (!existsSync(path)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { attempts?: number };
    const n = parsed.attempts;
    return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

export function incrementEvidenceGapRepairAttempts(config: RepoOSConfig, taskId: string): number {
  const path = evidenceGapAttemptsPath(config, taskId);
  const next = readEvidenceGapRepairAttempts(config, taskId) + 1;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ attempts: next, at: new Date().toISOString() }));
  } catch {
    /* best-effort */
  }
  return next;
}

export function clearEvidenceGapRepairAttempts(config: RepoOSConfig, taskId: string): void {
  const path = evidenceGapAttemptsPath(config, taskId);
  try {
    if (existsSync(path))
      writeFileSync(path, JSON.stringify({ attempts: 0, clearedAt: new Date().toISOString() }));
  } catch {
    /* best-effort */
  }
}
