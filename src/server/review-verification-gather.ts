/**
 * Load branch diff + file contents for mechanical review verification (#0714),
 * narrowed by #0762 so non-JS/TS repos can configure which files count as
 * tests and can turn the guard negative-test check off.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { ReviewVerificationResult } from "../core/review-verification.js";
import {
  evaluateReviewVerification,
  guardsMateriallyChangedFromDiff,
  reviewVerificationWithoutWorktree,
} from "../core/review-verification.js";
import {
  isTestFilePath,
  resolvedReviewVerification,
} from "../core/review-verification-config.js";
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

function readTestFileContents(
  worktree: string,
  relPaths: string[],
  globs: string[],
): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  for (const rel of relPaths) {
    if (!isTestFilePath(rel, globs)) continue;
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

function listTrackedTestFiles(worktree: string, globs: string[]): string[] {
  try {
    // List every tracked file, then filter with the same glob compiler used
    // elsewhere, so a Swift/Python/Go test glob means exactly what its author
    // expects (a raw git pathspec would not).
    const out = execFileSync("git", ["ls-files"], {
      cwd: worktree,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => isTestFilePath(p, globs));
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

  const { guardTestCheck, testGlobs } = resolvedReviewVerification(config);

  // Only read test files when the check will actually run AND a guard changed —
  // otherwise reading every tracked test file in a large repo is wasted work.
  let changedTestFiles: { path: string; content: string }[] = [];
  let branchTestFiles: { path: string; content: string }[] = [];
  if (guardTestCheck && changedPaths !== null) {
    const guardIds = guardsMateriallyChangedFromDiff({
      changedPaths: paths,
      checkTsDiff,
      repoosTomlDiff,
    });
    if (guardIds.length > 0) {
      const changedTestPaths = paths.filter((p) => isTestFilePath(p, testGlobs));
      changedTestFiles = readTestFileContents(worktree, changedTestPaths, testGlobs);
      branchTestFiles = readTestFileContents(
        worktree,
        listTrackedTestFiles(worktree, testGlobs),
        testGlobs,
      );
    }
  }

  return evaluateReviewVerification({
    uiVerificationRequired,
    evidence,
    changedPaths,
    checkTsDiff,
    repoosTomlDiff,
    changedTestFiles,
    branchTestFiles,
    guardTestCheck,
    testGlobs,
  });
}
