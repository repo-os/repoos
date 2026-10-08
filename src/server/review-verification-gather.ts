/**
 * Load branch diff + file contents for mechanical review verification (#0714).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { ReviewVerificationResult } from "../core/review-verification.js";
import {
  evaluateReviewVerification,
  reviewVerificationWithoutWorktree,
} from "../core/review-verification.js";
import { changedPathsVsBase } from "../core/git.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import { readUiHandoffGateEvidence, taskNeedsUiHandoffVerification } from "./ui-handoff-gate.js";

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

const TEST_FILE_GLOBS = ["*.test.ts", "*.test.tsx", "*.test.js", "*.test.mjs"];

function readTestFileContents(
  worktree: string,
  relPaths: string[],
): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  for (const rel of relPaths) {
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

function listTrackedTestFiles(worktree: string): string[] {
  try {
    const out = execFileSync("git", ["ls-files", "--", ...TEST_FILE_GLOBS], {
      cwd: worktree,
      encoding: "utf8",
    });
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Mechanical verification when the branch worktree is missing (still appends the section). */
export function gatherReviewVerificationWithoutWorktree(
  config: RepoOSConfig,
  task: Task,
): ReviewVerificationResult {
  const uiVerificationRequired = taskNeedsUiHandoffVerification(config, task);
  const evidence = readUiHandoffGateEvidence(config, task.id);
  return reviewVerificationWithoutWorktree({ uiVerificationRequired, evidence });
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

  const allTestPaths = listTrackedTestFiles(worktree);
  const changedTestPaths = paths.filter((p) => /\.test\.(ts|tsx|js|mjs)$/.test(p));

  return evaluateReviewVerification({
    uiVerificationRequired,
    evidence,
    changedPaths,
    checkTsDiff,
    repoosTomlDiff,
    changedTestFiles: readTestFileContents(worktree, changedTestPaths),
    branchTestFiles: readTestFileContents(worktree, allTestPaths),
  });
}
