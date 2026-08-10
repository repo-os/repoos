/**
 * Best-effort git facts. Everything here degrades gracefully: if git is not
 * installed, or the repo isn't a git repo, callers get safe empty values.
 * We shell out rather than depend on a git library (zero deps).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import type { TaskGitInfo } from "./types.js";
import { worktreesDir } from "./config.js";

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
  return {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
  };
}

export interface EnsureWorktreeResult {
  ok: boolean;
  /** Absolute path of the working directory the agent should use. */
  path: string;
  /** True when a brand-new worktree was created. */
  created: boolean;
  /** Human-readable failure reason (when not ok). */
  reason?: string;
}

/**
 * Branch -> worktree path for every registered linked worktree, derived from
 * `git worktree list --porcelain`. Empty map when git is missing.
 */
function worktreeList(root: string): Map<string, string> {
  const out = git(root, ["worktree", "list", "--porcelain"]);
  const map = new Map<string, string>();
  if (!out) return map;
  let cur: string | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      cur = line.slice("worktree ".length).trim();
    } else if (cur && line.startsWith("branch refs/heads/")) {
      map.set(line.slice("branch refs/heads/".length).trim(), cur);
      cur = null;
    }
  }
  return map;
}

/**
 * Absolute path of the worktree that has `branch` checked out, or null when the
 * branch has no linked worktree (or git is missing). The main checkout's own
 * branch resolves to the repo root. Uses `git worktree list --porcelain` —
 * never string concatenation — so branch names with `/` and exotic characters
 * resolve correctly.
 */
export function worktreePathForBranch(root: string, branch: string): string | null {
  return worktreeList(root).get(branch) ?? null;
}

/**
 * Make sure the agent for `branch` has a dedicated working directory WITHOUT
 * touching the main worktree's checkout. Three outcomes:
 *
 *  - branch is what the main worktree already has checked out -> use root
 *  - branch already has a linked worktree -> reuse it (idempotent)
 *  - otherwise -> `git worktree add` a sibling directory for it
 *
 * Fail-soft like the branch-switching predecessor: returns `{ ok: false,
 * reason }` when git is missing or the worktree can't be created, so agent
 * launch degrades gracefully instead of crashing the server.
 */
export function ensureWorktree(root: string, branch: string): EnsureWorktreeResult {
  if (!isGitRepo(root)) {
    return { ok: false, path: "", created: false, reason: "not a git repository" };
  }
  if (currentBranch(root) === branch) {
    return { ok: true, path: root, created: false };
  }
  const existing = worktreeList(root).get(branch);
  if (existing) return { ok: true, path: existing, created: false };

  const target = join(worktreesDir(root), branch);
  const branchExists = localBranches(root).has(branch);
  const args = branchExists
    ? ["worktree", "add", target, branch]
    : ["worktree", "add", "-b", branch, target];
  if (git(root, args) === null) {
    return {
      ok: false,
      path: target,
      created: false,
      reason: "could not create worktree",
    };
  }
  // git reports real paths (macOS /var -> /private/var); normalize the fresh
  // path so a later reuse lookup returns the identical string.
  let path = target;
  try {
    path = realpathSync(target);
  } catch {
    /* keep the composed path */
  }
  return { ok: true, path, created: true };
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

/**
 * Whether `ancestor` is an ancestor of `descendant` (i.e. a fast-forward merge
 * of `descendant` into a checkout on `ancestor` is possible). Uses
 * `git merge-base --is-ancestor` exit codes; null when git is missing or the
 * refs are invalid.
 */
export function isAncestor(
  root: string,
  ancestor: string,
  descendant: string,
): boolean | null {
  const run = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
    cwd: root,
    timeout: 4000,
  });
  if (run.status === 0) return true;
  if (run.status === 1) return false;
  return null;
}

export interface MergeBranchResult {
  /** Whether the branch was merged into the current checkout. */
  merged: boolean;
  /** Whether the merge was a fast-forward (or the branch was already in). */
  ff: boolean;
  /** Files with merge conflicts when the merge aborted. */
  conflicts: string[];
  /** Human-readable failure reason (not merged and not a conflict). */
  reason?: string;
}

/**
 * Commit a single task file in the main checkout, tracking it first when it is
 * untracked. Task files are the one path that is routinely edited on both sides
 * of a close-out merge: an untracked file aborts `git merge` outright, and a
 * dirty one aborts it with "local changes would be overwritten". Committing the
 * main copy up front (fail-soft) removes both failure modes — the content is
 * preserved in history either way. Returns false when git failed and the file
 * is not clean; callers should treat that as a merge blocker.
 */
export function commitTaskFile(root: string, absPath: string, message: string): boolean {
  const rel = relative(root, absPath);
  if (rel.startsWith("..") || isAbsolute(rel)) return false;
  const status = git(root, ["status", "--porcelain", "--", rel]);
  if (status === null) return false;
  if (status.trim() === "") return true;
  if (git(root, ["add", "--", rel]) === null) return false;
  return git(root, ["commit", "-m", message]) !== null;
}

/**
 * The tab-indented paths git lists when a merge aborts because a dirty or
 * untracked working-tree file would be overwritten, e.g.:
 *
 *   error: Your local changes to the following files would be overwritten by
 *   merge:
 *   	dist/.build-info.json
 *   Please commit your changes or stash them before you merge. Aborting
 */
function blockingFiles(stderr: string): string[] {
  return stderr
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.startsWith("\t") && l.trim() !== "")
    .map((l) => l.trim());
}

/**
 * Merge `branch` into the CURRENT checkout — the main worktree, never the
 * task's worktree. Default merge semantics: fast-forward when main is an
 * ancestor of the branch, otherwise a merge commit (`--no-edit` so we never
 * block on an editor). Longer timeout than `git()`: real merges are slow.
 *
 * A dirty working tree aborts `git merge` outright (e.g. the build marker that
 * `repoos check` regenerates on every run). Rather than fail, the exact files
 * git refuses to overwrite are committed and the merge is retried once.
 *
 * On a conflict the merge is aborted (`git merge --abort`) so nothing is left
 * half-applied; the conflicted file list is returned and the branch stays
 * untouched. The exception: when every conflicted path is listed in
 * `opts.autoResolve`, the branch's version is taken (`--theirs`) and the merge
 * is completed — used for the task file, which always changes on both sides of
 * a close-out merge and whose branch version is authoritative for the task's
 * final state.
 */
export function mergeBranch(
  root: string,
  branch: string,
  opts: { autoResolve?: string[] } = {},
): MergeBranchResult {
  const head = currentBranch(root);
  let ff = head !== null && branch !== head && isAncestor(root, head, branch) === true;
  let run = spawnSync("git", ["merge", "--no-edit", branch], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (run.status !== 0 && /would be overwritten by merge/.test(run.stderr ?? "")) {
    const blocking = blockingFiles(run.stderr ?? "");
    if (blocking.length > 0) {
      for (const p of blocking) git(root, ["add", "--", p]);
      if (git(root, ["commit", "-m", "chore: sync working tree before merge"]) !== null) {
        ff = false;
        run = spawnSync("git", ["merge", "--no-edit", branch], {
          cwd: root,
          encoding: "utf8",
          timeout: 60_000,
        });
      }
    }
  }
  const stderr = `${run.stderr ?? ""}\n${run.stdout ?? ""}`;
  if (run.status === 0) {
    return { merged: true, ff, conflicts: [] };
  }
  // Authoritative conflicted paths come from the merge-in-progress index, not
  // from parsing git's prose (modify/delete and rename messages mangle easily).
  const conflicts =
    git(root, ["diff", "--name-only", "--diff-filter=U"])?.split("\n").filter(Boolean) ?? [];
  if (conflicts.length > 0) {
    // A conflicted path is auto-resolvable when it matches an `autoResolve`
    // entry exactly or sits under a directory entry (e.g. "dist/").
    const autoResolvable = (p: string): boolean =>
      (opts.autoResolve ?? []).some((r) => p === r || p.startsWith(r.endsWith("/") ? r : r + "/"));
    if (conflicts.every(autoResolvable)) {
      // Every conflicted path is regenerated output or task bookkeeping, so
      // resolve toward the branch's version wholesale. `-X theirs` handles
      // content, modify/delete and add/add conflicts; the tree is clean (dirty
      // files were committed above), so aborting and re-merging is safe.
      spawnSync("git", ["merge", "--abort"], { cwd: root, timeout: 4000 });
      const theirs = spawnSync("git", ["merge", "--no-edit", "-X", "theirs", branch], {
        cwd: root,
        encoding: "utf8",
        timeout: 60_000,
      });
      if (theirs.status === 0) {
        return { merged: true, ff: false, conflicts: [] };
      }
      // `-X theirs` still leaves rename/delete and rename/rename conflicts
      // (git never auto-resolves those). They only occur among the hashed
      // build assets inside the auto-resolvable directories, which the build
      // right after this merge regenerates anyway — keep the current
      // versions and complete the merge.
      const rest =
        git(root, ["diff", "--name-only", "--diff-filter=U"])?.split("\n").filter(Boolean) ?? [];
      for (const p of rest) git(root, ["checkout", "--ours", "--", p]);
      if (rest.length > 0) git(root, ["add", "-A", "--", ...rest]);
      if (git(root, ["commit", "--no-edit"]) !== null) {
        return { merged: true, ff: false, conflicts: [] };
      }
      spawnSync("git", ["merge", "--abort"], { cwd: root, timeout: 4000 });
    }
    // Nothing may be left half-applied: back out of the merge entirely.
    spawnSync("git", ["merge", "--abort"], { cwd: root, timeout: 4000 });
    return { merged: false, ff: false, conflicts, reason: "merge conflict" };
  }
  return {
    merged: false,
    ff: false,
    conflicts: [],
    reason: stderr.trim().split("\n").filter(Boolean).slice(0, 4).join(" ") || "merge failed",
  };
}

/**
 * Delete a local branch. The close-out flow only ever deletes a branch that
 * was just merged into main, so `-d` (refuses unless fully merged) is correct.
 * Fail-soft: false when the branch is gone, not merged, or git is missing —
 * the caller treats it as best-effort cleanup.
 */
export function deleteBranch(root: string, branch: string): boolean {
  return git(root, ["branch", "-d", branch]) !== null;
}

/**
 * Remove the linked worktree for `branch`. Forced when dirty — content is
 * preserved in the merged main, so nothing is lost. Tolerates an already-gone
 * worktree and prunes stale metadata if the first attempt fails.
 */
export function removeWorktree(root: string, branch: string): boolean {
  const path = worktreeList(root).get(branch);
  if (!path) return true;
  if (git(root, ["worktree", "remove", "--force", path]) !== null) return true;
  git(root, ["worktree", "prune"]);
  return git(root, ["worktree", "remove", "--force", path]) !== null;
}
