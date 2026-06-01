/**
 * Best-effort git facts. Everything here degrades gracefully: if git is not
 * installed, or the repo isn't a git repo, callers get safe empty values.
 * We shell out rather than depend on a git library (zero deps).
 */
import { execFileSync } from "node:child_process";
import type { TaskGitInfo } from "./types.js";

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    }).trim();
  } catch {
    return null;
  }
}

export function isGitRepo(root: string): boolean {
  return git(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
}

export function currentBranch(root: string): string | null {
  return git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

/** Set of local branch names, fetched once and reused across tasks. */
export function localBranches(root: string): Set<string> {
  const out = git(root, ["branch", "--format=%(refname:short)"]);
  if (!out) return new Set();
  return new Set(out.split("\n").map((s) => s.trim()).filter(Boolean));
}

/** Last commit subject + ISO date touching a specific file. */
export function lastCommitForFile(
  root: string,
  relPath: string,
): { subject: string | null; date: string | null } {
  const out = git(root, [
    "log",
    "-1",
    "--format=%s%x00%cI",
    "--",
    relPath,
  ]);
  if (!out) return { subject: null, date: null };
  const [subject, date] = out.split("\u0000");
  return { subject: subject || null, date: date || null };
}

export function emptyGitInfo(): TaskGitInfo {
  return { branchExists: false, lastCommit: null, lastCommitAt: null };
}
