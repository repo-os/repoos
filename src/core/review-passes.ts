/**
 * Numbered review pass artifacts (#0680): `reviews/<taskId>/<pass>.md`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "./frontmatter.js";
import type { RepoOSConfig } from "./types.js";
import { parseReviewVerdict } from "./review-verdict.js";

export interface ReviewPassSummary {
  pass: number;
  at: string;
  state: string;
  verdict: string | null;
  /** Reviewer coding agent that produced this pass (e.g. "opencode"). */
  agent: string;
  /** Reviewer CLI family for this pass. */
  cli: string;
  /** Reviewer model for this pass, or "" when the run reported none. */
  model: string;
  file: string;
}

function reviewsDir(config: RepoOSConfig, taskId: string): string {
  return join(config.root, config.cacheDir || ".repoos", "reviews", taskId);
}

export function latestReviewPath(config: RepoOSConfig, taskId: string): string {
  return join(config.root, config.cacheDir || ".repoos", "reviews", `${taskId}.md`);
}

/** Allocate the next pass number by counting existing `<n>.md` files. */
export function allocateReviewPassNumber(config: RepoOSConfig, taskId: string): number {
  const dir = reviewsDir(config, taskId);
  if (!existsSync(dir)) return 1;
  const nums = readdirSync(dir)
    .map((f) => /^(\d+)\.md$/.exec(f))
    .filter(Boolean)
    .map((m) => parseInt(m![1]!, 10))
    .filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

export function reviewPassPath(config: RepoOSConfig, taskId: string, pass: number): string {
  return join(reviewsDir(config, taskId), `${pass}.md`);
}

/**
 * Every review pass for a task, oldest pass first. Feeds the drawer's records
 * table (#0733), which reverses this order (newest first) and shows each pass
 * once — so this summary carries the per-run reviewer agent/model too.
 */
export function listReviewPasses(config: RepoOSConfig, taskId: string): ReviewPassSummary[] {
  const dir = reviewsDir(config, taskId);
  if (!existsSync(dir)) return [];
  const out: ReviewPassSummary[] = [];
  for (const name of readdirSync(dir)) {
    const m = /^(\d+)\.md$/.exec(name);
    if (!m) continue;
    const pass = parseInt(m[1]!, 10);
    const file = join(dir, name);
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
      agent,
      cli,
      model,
      file,
    });
  }
  out.sort((a, b) => a.pass - b.pass);
  return out;
}

/** One-line summary for the task activity log. */
export function reviewPassActivitySummary(
  pass: number,
  state: string,
  verdict: string | null,
): string {
  if (state === "incomplete") {
    return `review pass ${pass}: incomplete — no verdict in report`;
  }
  if (state === "failed") {
    return `review pass ${pass}: failed — no usable report`;
  }
  const v = verdict ?? "unknown verdict";
  return `review pass ${pass}: ${v}`;
}

export function ensureReviewPassDir(config: RepoOSConfig, taskId: string): void {
  mkdirSync(reviewsDir(config, taskId), { recursive: true });
}
