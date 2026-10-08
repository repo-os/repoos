/**
 * Load branch diff + file contents for mechanical review verification (#0714).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReviewVerificationResult } from "../core/review-verification.js";
import { evaluateReviewVerification } from "../core/review-verification.js";
import { changedPathsVsBase } from "../core/git.js";
import { execFileSync } from "node:child_process";

function gitDiff(worktree: string, baseBranch: string, path: string): string {
  try {
    const base = execFileSync("git", ["merge-base", baseBranch, "HEAD"], {
      cwd: worktree,
      encoding: "utf8",
    }).trim();
    if (!base) return "";
    return execFileSync("git", ["diff", base, "HEAD", "--", path], {
      cwd: worktree,
      encoding: "utf8",
    });
  } catch {
    return "";
  }
}
import type { RepoOSConfig, Task } from "../core/types.js";
import { readUiHandoffGateEvidence, taskNeedsUiHandoffVerification } from "./ui-handoff-gate.js";

function readChangedTestFiles(
  worktree: string,
  changedPaths: string[],
): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  for (const rel of changedPaths) {
    if (!/\.test\.(ts|tsx|js|mjs)$/.test(rel)) continue;
    const abs = join(worktree, rel);
    if (!existsSync(abs)) continue;
    try {
      out.push({ path: rel, content: readFileSync(abs, "utf8") });
    } catch {
      /* unreadable */
    }
  }
  return out;
}

/** Run mechanical verification for a task sitting in `review`. */
export function gatherReviewVerification(
  config: RepoOSConfig,
  task: Task,
  worktree: string,
  baseBranch: string,
): ReviewVerificationResult {
  const uiVerificationRequired = taskNeedsUiHandoffVerification(config, task);
  const evidence = readUiHandoffGateEvidence(config, task.id);
  const changedPaths = changedPathsVsBase(worktree, baseBranch);
  const paths = changedPaths ?? [];
  const checkTsDiff = paths.includes("src/commands/check.ts")
    ? gitDiff(worktree, baseBranch, "src/commands/check.ts")
    : "";
  const repoosTomlDiff = paths.includes("repoos.toml")
    ? gitDiff(worktree, baseBranch, "repoos.toml")
    : "";

  return evaluateReviewVerification({
    uiVerificationRequired,
    evidence,
    changedPaths,
    checkTsDiff,
    repoosTomlDiff,
    changedTestFiles: readChangedTestFiles(worktree, paths),
  });
}
