/**
 * Best-effort git facts. Everything here degrades gracefully: if git is not
 * installed, or the repo isn't a git repo, callers get safe empty values.
 * We shell out rather than depend on a git library (zero deps).
 */
import { execFileSync } from "node:child_process";
import { isAbsolute, relative } from "node:path";
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

export interface EnsureBranchResult {
  ok: boolean;
  created: boolean;
  reason?: string;
}

/**
 * Make sure the repo is on `branch`, creating it from the current HEAD when it
 * does not exist. Fail-soft: returns `{ ok: false, reason }` when git is
 * missing or the checkout fails, so agent launch can degrade gracefully instead
 * of crashing the server.
 */
export function ensureBranch(root: string, branch: string): EnsureBranchResult {
  if (!isGitRepo(root)) {
    return { ok: false, created: false, reason: "not a git repository" };
  }
  const cur = currentBranch(root);
  if (cur === branch) return { ok: true, created: false };
  if (!localBranches(root).has(branch)) {
    if (git(root, ["checkout", "-b", branch]) === null) {
      return { ok: false, created: false, reason: "could not create branch" };
    }
    return { ok: true, created: true };
  }
  if (git(root, ["checkout", branch]) === null) {
    return { ok: false, created: false, reason: "could not check out branch" };
  }
  return { ok: true, created: false };
}

/** Whether git is installed at all (independent of being inside a repo). */
export function gitAvailable(root: string): boolean {
  return git(root, ["--version"]) !== null;
}

/** `git config --get <key>` value, or null when unset or git is missing. */
export function gitConfig(root: string, key: string): string | null {
  const out = git(root, ["config", "--get", key]);
  return out || null;
}

/** Run `git init` in root. True on success. */
export function gitInit(root: string): boolean {
  return git(root, ["init"]) !== null;
}

/**
 * Commit the ENTIRE working tree. Only for a freshly scaffolded repo where
 * nothing else is pre-staged (the guided `repoos init` flow) — do NOT use this
 * where 0023's surgical `commitNewFile` applies. Fail-soft: null on failure.
 */
export function gitCommitAll(root: string, message: string): string | null {
  if (git(root, ["add", "-A"]) === null) return null;
  if (git(root, ["commit", "-m", message]) === null) return null;
  return git(root, ["rev-parse", "--short", "HEAD"]);
}

export interface CommitNewFileResult {
  ok: boolean;
  /** Short commit hash (when committed). */
  hash?: string;
  /** Human-readable failure reason (when not committed). */
  reason?: string;
}

/**
 * Surgically commit a single new file with the user's own git identity.
 *
 * `git commit --only` refuses paths git doesn't know, so we first run
 * `git add -N` (intent-to-add): it registers the path WITHOUT staging any
 * content, then `git commit -o -m <msg> -- <file>` commits only that file's
 * working-tree content and IGNORES whatever else is staged or dirty. Never
 * `git add -A`, never a plain `git commit`, never amend/force, hooks run.
 *
 * Fail-soft: never throws, never leaves content partially staged. On any
 * problem it returns `{ ok: false, reason }` and the caller keeps the file.
 */
export function commitNewFile(
  root: string,
  absPath: string,
  message: string,
): CommitNewFileResult {
  const relPath = relative(root, absPath).split("\\").join("/");
  if (isAbsolute(relPath) || relPath.startsWith("..")) {
    return { ok: false, reason: `path is outside the repository: ${absPath}` };
  }
  if (!isGitRepo(root)) {
    return { ok: false, reason: "not a git repository (is git installed?)" };
  }
  if (git(root, ["add", "-N", "--", relPath]) === null) {
    return { ok: false, reason: "could not stage the file (mid-merge conflict?)" };
  }
  if (git(root, ["commit", "-o", "-m", message, "--", relPath]) === null) {
    return { ok: false, reason: "commit failed (unconfigured identity, conflicts, or a hook)" };
  }
  const hash = git(root, ["rev-parse", "--short", "HEAD"]);
  return hash ? { ok: true, hash } : { ok: true };
}
