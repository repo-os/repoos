/**
 * Numbered review pass artifacts (#0680).
 *
 * Review reports are committed with the task under
 * `<workDir>/reports/<taskId>/review-<pass>.md` (#1013), beside the engineering
 * rounds. Older checkouts kept them in the gitignored cache at
 * `<cacheDir>/reviews/<taskId>/<pass>.md`; that location is still read (and kept
 * as a local mirror while a task is in review) so history survives the upgrade.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "./frontmatter.js";
import type { RepoOSConfig } from "./types.js";
import { parseReviewVerdict, reviewVerdictSection } from "./review-verdict.js";
import { reportsTaskDir, reviewReportRelPath } from "./report-paths.js";

export interface ReviewPassSummary {
  pass: number;
  at: string;
  state: string;
  verdict: string | null;
  /** `## Verdict` body the drawer shows, trimmed. Null when that heading is absent. */
  verdictText: string | null;
  /** Reviewer coding agent that produced this pass (e.g. "opencode"). */
  agent: string;
  /** Reviewer CLI family for this pass. */
  cli: string;
  /** Reviewer model for this pass, or "" when the run reported none. */
  model: string;
  file: string;
}

export function trackedReviewsDir(config: RepoOSConfig, taskId: string): string {
  return reportsTaskDir(config, taskId);
}

function legacyReviewsDir(config: RepoOSConfig, taskId: string): string {
  return join(config.root, config.cacheDir || ".repoos", "reviews", taskId);
}

/** Local latest-pass mirror kept for the Dev/Review tabs while a task is in review. */
export function latestReviewPath(config: RepoOSConfig, taskId: string): string {
  return join(config.root, config.cacheDir || ".repoos", "reviews", `${taskId}.md`);
}

/**
 * Canonical pass path: the tracked report committed with the task branch.
 * `listReviewPasses` still finds a legacy cache-only pass.
 */
export function reviewPassPath(config: RepoOSConfig, taskId: string, pass: number): string {
  return join(config.root, reviewReportRelPath(config, taskId, pass));
}

/** Legacy pass path in the gitignored cache. Read-only compatibility. */
export function legacyReviewPassPath(config: RepoOSConfig, taskId: string, pass: number): string {
  return join(legacyReviewsDir(config, taskId), `${pass}.md`);
}

/** Canonical path in a specific worktree (the writer's view). */
export function worktreeReviewPassPath(
  worktree: string,
  config: RepoOSConfig,
  taskId: string,
  pass: number,
): string {
  return join(worktree, reviewReportRelPath(config, taskId, pass));
}

/** Tracked or legacy pass file for `pass`, preferring the committed copy. */
export function findReviewPassFile(
  config: RepoOSConfig,
  taskId: string,
  pass: number,
): string | null {
  const tracked = reviewPassPath(config, taskId, pass);
  if (existsSync(tracked)) return tracked;
  const legacy = legacyReviewPassPath(config, taskId, pass);
  return existsSync(legacy) ? legacy : null;
}

/** All pass numbers present in either location. */
function reviewPassNumbers(config: RepoOSConfig, taskId: string): number[] {
  const numbers = new Set<number>();
  const tracked = trackedReviewsDir(config, taskId);
  if (existsSync(tracked)) {
    for (const name of readdirSync(tracked)) {
      const m = /^review-(\d+)\.md$/.exec(name);
      if (m) numbers.add(parseInt(m[1]!, 10));
    }
  }
  const legacy = legacyReviewsDir(config, taskId);
  if (existsSync(legacy)) {
    for (const name of readdirSync(legacy)) {
      const m = /^(\d+)\.md$/.exec(name);
      if (m) numbers.add(parseInt(m[1]!, 10));
    }
  }
  return [...numbers].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
}

/** Allocate the next pass number by counting existing pass files in both locations. */
export function allocateReviewPassNumber(config: RepoOSConfig, taskId: string): number {
  const nums = reviewPassNumbers(config, taskId);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/**
 * Every review pass for a task, oldest pass first. Feeds the drawer's records
 * table (#0733), which reverses this order (newest first) and shows each pass
 * once — so this summary carries the per-run reviewer agent/model too.
 */
export function listReviewPasses(config: RepoOSConfig, taskId: string): ReviewPassSummary[] {
  const out: ReviewPassSummary[] = [];
  for (const pass of reviewPassNumbers(config, taskId)) {
    const file = findReviewPassFile(config, taskId, pass);
    if (!file) continue;
    let at = "";
    let state = "ok";
    let markdown = "";
    let agent = "";
    let cli = "";
    let model = "";
    try {
      const doc = parseDocument(readFileSync(file, "utf8"));
      at = String(doc.data.at ?? "");
      state = String(doc.data.state ?? "ok");
      agent = String(doc.data.agent ?? "");
      cli = String(doc.data.cli ?? "");
      model = String(doc.data.model ?? "");
      markdown = doc.body.trim();
    } catch {
      continue;
    }
    out.push({
      pass,
      at,
      state,
      verdict: parseReviewVerdict(markdown),
      verdictText: reviewVerdictSection(markdown)?.trim() || null,
      agent,
      cli,
      model,
      file,
    });
  }
  return out;
}

/** One-line summary for the task activity log. */
export function reviewPassActivitySummary(
  pass: number,
  state: string,
  verdict: string | null,
  clampReason?: string,
): string {
  if (state === "incomplete") {
    return `review pass ${pass}: incomplete — no verdict in report`;
  }
  if (state === "failed") {
    return `review pass ${pass}: failed — no usable report`;
  }
  const v = verdict ?? "unknown verdict";
  // #0762: when mechanical verification clamped a clean verdict, say WHY on the
  // task itself — the engineer agent can read its activity note but not the
  // review drawer.
  if (clampReason) {
    return `review pass ${pass}: ${v} — clamped by automated verification: ${clampReason}`;
  }
  return `review pass ${pass}: ${v}`;
}

/** Create the tracked pass directory (and the local cache mirror's on demand). */
export function ensureReviewPassDir(config: RepoOSConfig, taskId: string): void {
  mkdirSync(trackedReviewsDir(config, taskId), { recursive: true });
  mkdirSync(legacyReviewsDir(config, taskId), { recursive: true });
}
