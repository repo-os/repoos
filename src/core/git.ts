/**
 * Best-effort git facts. Everything here degrades gracefully: if git is not
 * installed, or the repo isn't a git repo, callers get safe empty values.
 * We shell out rather than depend on a git library (zero deps).
 */
import { execFile, execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
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

/**
 * Non-blocking counterpart of `git()`. Lets a caller enriching many tasks
 * (e.g. `buildIndexAsync`) run their git spawns concurrently instead of
 * one at a time on the main thread — each `execFileSync` call above blocks
 * the event loop for the OS round-trip, so N tasks in a `for` loop costs N
 * full serial round-trips no matter how idle the machine is.
 */
function gitAsync(root: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd: root, encoding: "utf8", timeout: 4000 },
      (error, stdout) => {
        resolve(error ? null : stdout.trim());
      },
    );
  });
}

export interface GitRun {
  status: number | null;
  stdout: string;
  stderr: string;
  /** True when the child was SIGKILLed because it exceeded the timeout. */
  timedOut?: boolean;
}

/**
 * Non-blocking `spawn` that resolves with the exit status and captured output.
 * Never throws; a timeout kills the child. Unlike `spawnSync` this does not
 * freeze the server's event loop, so SSE progress events can flush in real
 * time while a long command (merge, build, check) is in flight.
 */
export function runGit(
  root: string,
  args: string[],
  timeout: number,
): Promise<GitRun> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd: root });
    let stdout = "";
    let stderr = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let timedOut = false;
    const finish = (status: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ status, stdout, stderr, timedOut });
    };
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (err: Error) => {
      stderr += `${err.message}\n`;
      finish(null);
    });
    child.on("close", (code: number | null) => finish(code));
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeout);
  });
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

/** Async counterpart of lastCommitForFile - see gitAsync. */
export async function lastCommitForFileAsync(
  root: string,
  relPath: string,
): Promise<{ subject: string | null; date: string | null }> {
  const out = await gitAsync(root, [
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

/**
 * True when git tracks `relPath` in the checkout at `root` and its working
 * copy matches HEAD — i.e. whatever the file currently shows is backed by a
 * commit, not a stray mid-edit. Untracked or dirty files return false.
 * Used to prove a worktree's committed task-file state before trusting it.
 */
export function fileCommittedClean(root: string, relPath: string): boolean {
  const status = git(root, ["status", "--porcelain", "--", relPath]);
  if (status === null || status !== "") return false;
  return lastCommitForFile(root, relPath).subject !== null;
}

export function emptyGitInfo(): TaskGitInfo {
  return {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
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
 * `git worktree list --porcelain`. Empty map when git is missing. Callers that
 * resolve several branches at once (indexer, live index) should call this ONCE
 * and reuse the map — every call shells out to git.
 */
export function worktreePaths(root: string): Map<string, string> {
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
  return worktreePaths(root).get(branch) ?? null;
}

/**
 * Copy `taskRelPath` from `root` into an already-resolved `worktreePath` and
 * commit it there, ONLY when the worktree is missing it. This heals a
 * specific, narrow race: `ensureWorktree` cuts (or reuses) a worktree from
 * whatever main's HEAD was at that moment, but the task's own file can be
 * absent from that HEAD if its creation commit hadn't landed yet (e.g.
 * `commitTaskFile` silently failed at creation time) or the worktree/branch
 * is a leftover from an earlier start attempt that raced task creation. Once
 * a worktree exists, plain reuse (see `ensureWorktree`) never re-checks
 * freshness, so without this the task is stuck forever: every resume reuses
 * the same file-less worktree and finalization keeps failing validation.
 *
 * Best-effort and narrowly scoped to the ONE file — never touches unrelated
 * in-progress work in the worktree, and never runs when the worktree already
 * has its own copy (including a stale/older one; that is a different,
 * legitimate divergence left to the normal review/merge flow).
 */
function healMissingTaskFile(root: string, worktreePath: string, taskRelPath: string): void {
  if (root === worktreePath) return; // the main checkout is never a task worktree
  const worktreeFile = join(worktreePath, taskRelPath);
  if (existsSync(worktreeFile)) return;
  const mainFile = join(root, taskRelPath);
  if (!existsSync(mainFile)) return; // nothing to heal from
  try {
    mkdirSync(dirname(worktreeFile), { recursive: true });
    copyFileSync(mainFile, worktreeFile);
    if (git(worktreePath, ["add", "--", taskRelPath]) === null) return;
    git(worktreePath, [
      "commit",
      "-m",
      `chore: restore task file missing from worktree (self-heal)`,
    ]);
  } catch {
    /* best-effort; handoff validation still catches an unhealed worktree */
  }
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
 *
 * `taskRelPath`, when given, is the task's own file path relative to `root`
 * (e.g. `work/0151-....md`). Whichever worktree is resolved — new or reused —
 * is healed if that file is missing from it; see `healMissingTaskFile`.
 */
export function ensureWorktree(
  root: string,
  branch: string,
  taskRelPath?: string,
): EnsureWorktreeResult {
  if (!isGitRepo(root)) {
    return { ok: false, path: "", created: false, reason: "not a git repository" };
  }
  if (currentBranch(root) === branch) {
    return { ok: true, path: root, created: false };
  }
  const existing = worktreePaths(root).get(branch);
  if (existing) {
    if (taskRelPath) healMissingTaskFile(root, existing, taskRelPath);
    return { ok: true, path: existing, created: false };
  }

  const target = join(worktreesDir(root), branch);
  const branchExists = localBranches(root).has(branch);
  const args = branchExists
    ? ["worktree", "add", target, branch]
    : ["worktree", "add", "-b", branch, target];
  if (git(root, args) === null) {
    // An orphaned directory (leftover from a prior interrupted close-out) blocks
    // `git worktree add`.  Remove it once and retry — the branch is still valid,
    // only the worktree registration (gitdir) is missing.
    if (existsSync(target)) {
      try { rmSync(target, { recursive: true, force: true }); } catch { /* best-effort */ }
      if (git(root, args) !== null) {
        let path = target;
        try { path = realpathSync(target); } catch { /* keep */ }
        if (taskRelPath) healMissingTaskFile(root, path, taskRelPath);
        return { ok: true, path, created: true };
      }
    }
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
  if (taskRelPath) healMissingTaskFile(root, path, taskRelPath);
  return { ok: true, path, created: true };
}

export interface WorktreeStatus {
  /** Absolute path of the linked worktree for `branch`, or null. */
  path: string | null;
  /**
   * Whether a clean restart would discard prior work: the linked worktree has
   * uncommitted changes, or the branch has commits not in the main checkout's
   * branch. False when no linked worktree exists — the main checkout itself
   * is never a task worktree.
   */
  dirty: boolean;
}

/**
 * Best-effort facts about a task's worktree, derived from `git worktree list`
 * plus a status check inside the worktree. Fail-soft: any git failure yields
 * a safe `{ path: null, dirty: false }`.
 *
 * `opts.worktrees`/`opts.baseBranch` let a caller looping over many tasks
 * against the same repo (e.g. `buildIndex`) pass in a `worktreePaths`/
 * `currentBranch` result it already fetched once, instead of this function
 * re-running those two `git` spawns on every single task (#0271 follow-up:
 * this redundancy was a large share of RepoOS's slow boot with 260+ tasks).
 * Omit them and behavior is unchanged — each call fetches fresh.
 */
export function worktreeStatus(
  root: string,
  branch: string,
  opts: { worktrees?: Map<string, string>; baseBranch?: string | null } = {},
): WorktreeStatus {
  const worktrees = opts.worktrees ?? worktreePaths(root);
  const path = worktrees.get(branch) ?? null;
  if (!path) return { path: null, dirty: false };
  // git reports the main checkout as a worktree too; only a LINKED worktree
  // counts, otherwise the whole repo's dirt would mark tasks dirty.
  let realRoot = root;
  let realPath = path;
  try {
    realRoot = realpathSync(root);
  } catch {
    /* keep the composed path */
  }
  try {
    realPath = realpathSync(path);
  } catch {
    /* keep the reported path */
  }
  if (realPath === realRoot) return { path: null, dirty: false };

  const status = git(path, ["status", "--porcelain"]);
  const uncommitted = status !== null && status !== "";
  const base = opts.baseBranch !== undefined ? opts.baseBranch : currentBranch(root);
  const count = base && base !== branch
    ? git(root, ["rev-list", "--count", `${base}..${branch}`])
    : null;
  const ahead = count !== null && Number(count) > 0;
  return { path, dirty: uncommitted || ahead };
}

/** Async counterpart of `worktreeStatus` — see `gitAsync`. */
export async function worktreeStatusAsync(
  root: string,
  branch: string,
  opts: { worktrees?: Map<string, string>; baseBranch?: string | null } = {},
): Promise<WorktreeStatus> {
  const worktrees = opts.worktrees ?? worktreePaths(root);
  const path = worktrees.get(branch) ?? null;
  if (!path) return { path: null, dirty: false };
  let realRoot = root;
  let realPath = path;
  try {
    realRoot = realpathSync(root);
  } catch {
    /* keep the composed path */
  }
  try {
    realPath = realpathSync(path);
  } catch {
    /* keep the reported path */
  }
  if (realPath === realRoot) return { path: null, dirty: false };

  const base = opts.baseBranch !== undefined ? opts.baseBranch : currentBranch(root);
  const [status, count] = await Promise.all([
    gitAsync(path, ["status", "--porcelain"]),
    base && base !== branch
      ? gitAsync(root, ["rev-list", "--count", `${base}..${branch}`])
      : Promise.resolve(null),
  ]);
  const uncommitted = status !== null && status !== "";
  const ahead = count !== null && Number(count) > 0;
  return { path, dirty: uncommitted || ahead };
}

/**
 * Discard a task's worktree AND its branch so the next `ensureWorktree`
 * re-creates both from the main checkout's HEAD — a clean restart. The main
 * checkout itself is never touched. Fail-soft: false when git is missing,
 * the branch is the main checkout, or a removal step failed.
 */
export function resetWorktree(root: string, branch: string): boolean {
  const path = worktreePaths(root).get(branch);
  if (path) {
    let realRoot = root;
    let realPath = path;
    try {
      realRoot = realpathSync(root);
    } catch {
      /* keep the composed path */
    }
    try {
      realPath = realpathSync(path);
    } catch {
      /* keep the reported path */
    }
    if (realPath === realRoot) return false;
    if (!removeWorktree(root, branch)) return false;
  }
  if (localBranches(root).has(branch)) {
    // Force: the branch may carry commits a clean restart is meant to discard.
    if (git(root, ["branch", "-D", branch]) === null) return false;
  }
  return true;
}

export interface BranchChangesSinceBase {
  /** Short ref of the branch point (merge-base), or null when undeterminable. */
  base: string | null;
  /** Paths that differ from the branch point, committed or uncommitted. */
  paths: string[];
}

/**
 * What the branch checked out in `worktree` has changed relative to its branch
 * point — the merge-base with `baseBranch` — combining already-committed
 * changes with the current uncommitted working-tree diff. This is the correct
 * base for "did the agent implement anything": diffing against `baseBranch`
 * itself would count unrelated main drift as the branch's own work. When the
 * base cannot be resolved (no git, or the two branches share no ancestor)
 * returns `{ base: null, paths: [] }` so callers can fail soft rather than
 * block on a false positive.
 */
export function branchChangesSinceBase(
  worktree: string,
  baseBranch: string,
): BranchChangesSinceBase {
  const baseFull = git(worktree, ["merge-base", baseBranch, "HEAD"]);
  if (!baseFull) return { base: null, paths: [] };
  const base = git(worktree, ["rev-parse", "--short", baseFull]) ?? baseFull;
  const committed =
    git(worktree, ["diff", "--name-only", baseFull, "HEAD"])
      ?.split("\n")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const uncommitted =
    git(worktree, ["diff", "--cached", "--name-only"])
      ?.split("\n")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return { base, paths: [...new Set([...committed, ...uncommitted])] };
}

export interface DiffStats {
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface DiffResult {
  patch: string;
  truncated: boolean;
}

const MAX_DIFF_BYTES = 256_000;
const DIFF_SOURCE_PATHS = ["--", ".", ":(exclude)dist", ":(exclude)screenshots"];

/** Parse `git diff --numstat` output into file/line counts (shared by the sync and async variants below). */
function parseNumstat(statOutput: string): DiffStats {
  let filesChanged = 0;
  let additions = 0;
  let deletions = 0;

  // Parse output like: "278\t7\tsrc/file.ts" ("-\t-\tpath" for binary files)
  for (const line of statOutput.split("\n")) {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t/);
    if (match) {
      filesChanged++;
      if (match[1] !== "-") additions += parseInt(match[1]!, 10);
      if (match[2] !== "-") deletions += parseInt(match[2]!, 10);
    }
  }

  return { filesChanged, additions, deletions };
}

/**
 * Get diff statistics comparing a branch point to the current worktree.
 * This deliberately includes committed, staged, and unstaged source edits so
 * the task drawer can show an agent's work before its handoff commit.
 * Generated build output is excluded because it is not task source.
 * Returns file count and line additions/deletions.
 */
export function getDiffStats(
  worktree: string,
  baseBranch: string,
): DiffStats {
  const baseFull = git(worktree, ["merge-base", baseBranch, "HEAD"]);
  if (!baseFull) return { filesChanged: 0, additions: 0, deletions: 0 };

  // --numstat gives exact per-file added/removed line counts, unlike --stat's
  // ASCII bar (which git scales/truncates to fit terminal width and which
  // this code previously had to reverse-engineer by proportional guessing —
  // lossy and prone to drifting from the real totals, see 0248).
  const statOutput = git(worktree, ["diff", "--numstat", baseFull, ...DIFF_SOURCE_PATHS]);
  if (!statOutput) return { filesChanged: 0, additions: 0, deletions: 0 };
  return parseNumstat(statOutput);
}

/**
 * Non-blocking counterpart to `getDiffStats`, built on `runGit` (`spawn`)
 * instead of `git`'s `execFileSync`. Every task card on the Work board fetches
 * its diff stats on mount (`TaskCard.vue`), so a board with N cards fires N
 * of these on every reload/tab-switch; the synchronous version froze the
 * entire server's event loop for the duration of all of them serially —
 * including whatever `GET /api/tasks/:id` a drawer-opening click was waiting
 * on — which is what made the drawer take several seconds to appear.
 */
export async function getDiffStatsAsync(
  worktree: string,
  baseBranch: string,
): Promise<DiffStats> {
  const base = await runGit(worktree, ["merge-base", baseBranch, "HEAD"], 4000);
  const baseFull = base.status === 0 && !base.timedOut ? base.stdout.trim() : null;
  if (!baseFull) return { filesChanged: 0, additions: 0, deletions: 0 };

  const diff = await runGit(worktree, ["diff", "--numstat", baseFull, ...DIFF_SOURCE_PATHS], 4000);
  const statOutput = diff.status === 0 && !diff.timedOut ? diff.stdout.trim() : null;
  if (!statOutput) return { filesChanged: 0, additions: 0, deletions: 0 };
  return parseNumstat(statOutput);
}

/**
 * Get the full patch diff from a branch point to the current worktree.
 * This includes committed, staged, and unstaged source edits, while leaving
 * generated build output out of the task-facing code review view.
 * Bounded at MAX_DIFF_BYTES to avoid sending giant payloads.
 */
export async function getDiff(
  worktree: string,
  baseBranch: string,
): Promise<DiffResult> {
  const baseFull = git(worktree, ["merge-base", baseBranch, "HEAD"]);
  if (!baseFull) return { patch: "", truncated: false };

  const run = await runGit(worktree, ["diff", "--patch", baseFull, ...DIFF_SOURCE_PATHS], 15000);
  if (run.status !== 0 && run.stdout === "") return { patch: "", truncated: false };

  const buf = Buffer.from(run.stdout, "utf8");
  if (buf.byteLength <= MAX_DIFF_BYTES) return { patch: run.stdout, truncated: false };

  let truncated = run.stdout;
  while (Buffer.from(truncated, "utf8").byteLength > MAX_DIFF_BYTES) {
    truncated = truncated.slice(0, -1024);
  }
  truncated += `\n\n--- diff truncated (${(buf.byteLength / 1024).toFixed(0)} kB total) ---`;
  return { patch: truncated, truncated: true };
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

export interface PreflightMergeResult {
  /** True when the merge would complete without source conflicts. */
  ok: boolean;
  /** True when main is not an ancestor of the branch (a merge commit would be required). */
  drifted: boolean;
  /** Conflicted source file paths when `ok` is false. */
  conflicts: string[];
  /** Human-readable failure reason. */
  reason?: string;
}

/**
 * Cheap, non-destructive pre-flight for merging `branch` into the CURRENT
 * checkout. Uses `git merge --no-commit` and always aborts, so the working
 * tree is left untouched (blocking files may be committed first, as the real
 * `mergeBranch` does, to keep the pre-flight honest).
 *
 * Returns `ok: true` for a clean merge (fast-forward or merge commit), and
 * `ok: false` with the conflict file list when source files would conflict.
 * `drifted` is true whenever main is not an ancestor of the branch.
 */
export async function preflightMerge(
  root: string,
  branch: string,
  opts: { autoResolve?: string[] } = {},
): Promise<PreflightMergeResult> {
  const head = currentBranch(root);
  const drifted = head !== null && branch !== head && isAncestor(root, head, branch) !== true;

  // A missing branch used to "pass" pre-flight (a `git merge` of a nonexistent
  // ref fails without producing conflicts), so a branch that was already
  // merged and cleaned up was mislabelled as a fresh failed merge. Fail fast
  // with an explicit reason instead — the close-out's `alreadyMerged` handling
  // resumes those retries before this is ever reached (#0130).
  if (!localBranches(root).has(branch)) {
    return { ok: false, drifted, conflicts: [], reason: `branch \`${branch}\` does not exist` };
  }

  let run = await runGit(root, ["merge", "--no-commit", "--no-ff", branch], 60_000);
  if (run.status !== 0 && /would be overwritten by merge/.test(run.stderr)) {
    const blocking = blockingFiles(run.stderr);
    if (blocking.length > 0) {
      for (const p of blocking) git(root, ["add", "--", p]);
      if (git(root, ["commit", "-m", "chore: sync working tree before merge"]) !== null) {
        run = await runGit(root, ["merge", "--no-commit", "--no-ff", branch], 60_000);
      }
    }
  }

  if (run.status === 0) {
    await runGit(root, ["merge", "--abort"], 4000);
    return { ok: true, drifted, conflicts: [] };
  }

  const conflicts =
    git(root, ["diff", "--name-only", "--diff-filter=U"])?.split("\n").filter(Boolean) ?? [];

  // Respect autoResolve semantics so generated files never surface as
  // "conflicts" to the user.
  const autoResolvable = (p: string): boolean =>
    (opts.autoResolve ?? []).some((r) => p === r || p.startsWith(r.endsWith("/") ? r : r + "/"));
  const unresolved = conflicts.filter((p) => !autoResolvable(p));

  await runGit(root, ["merge", "--abort"], 4000);

  if (unresolved.length > 0) {
    return {
      ok: false,
      drifted,
      conflicts: unresolved,
      reason: `merge conflict: ${unresolved.join(", ")}`,
    };
  }

  return { ok: true, drifted, conflicts: [] };
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
 * The dirty/uncommitted file paths in a checkout (`git status --porcelain`),
 * including tracked modifications and untracked files, in repo-relative form.
 * Used by the close-out flow to check `main` before merging: a dirty tree
 * aborts `git merge`, so the UI surfaces these so it can offer to commit them.
 *
 * FAILS CLOSED: returns `[]` only for a genuinely clean tree (git exit 0 with
 * empty output). Any git failure — a non-zero exit, a timeout, or git being
 * unavailable — throws `GitDirtyCheckError` instead, so a caller cannot
 * mistake an unknown state for a clean tree and silently proceed into a merge
 * that git will abort. This is the fix for #0211, where the old fail-open
 * behaved that way under load.
 */
export class GitDirtyCheckError extends Error {
  readonly causeKind: "timeout" | "git-error" | "no-repo";
  constructor(causeKind: "timeout" | "git-error" | "no-repo", detail?: string) {
    super(
      `could not determine the dirty state of the checkout${detail ? `: ${detail}` : ""}`,
    );
    this.name = "GitDirtyCheckError";
    this.causeKind = causeKind;
  }
}

export async function dirtyFiles(root: string): Promise<string[]> {
  const out = await runGit(root, ["status", "--porcelain"], 4000);
  // A genuinely clean tree is git exit 0 with empty output.
  if (out.status === 0 && (!out.stdout || out.stdout.trim() === "")) return [];
  // Fail closed: a timeout, a spawn failure (status null), or a non-zero exit
  // all mean "unknown", not "clean". Surface which so the caller can explain.
  if (out.timedOut) {
    throw new GitDirtyCheckError("timeout", "git status exceeded its time budget");
  }
  if (out.status === 0) {
    // Exit 0 with non-empty output: genuinely dirty files to list.
    return out.stdout
      .split("\n")
      .map((l) => l.replace(/\r$/, ""))
      .map((l) => {
        // Porcelain v1 short format is two status columns, a separator space,
        // then the repo-relative path (`XY path`). We read the raw stdout here
        // (not the shared `git()` helper, whose `.trim()` eats the first line's
        // leading status column) so the fixed-width parse stays column-accurate.
        const stripped = l.slice(3).trim();
        // Renames/renames-with-changes encode the old path before the new one.
        const arrow = stripped.indexOf(" -> ");
        return arrow === -1 ? stripped : stripped.slice(arrow + 4);
      })
      .filter(Boolean);
  }
  const detail =
    out.stderr.split("\n").filter(Boolean).slice(0, 2).join(" ").trim() ||
    (out.status === null ? "git did not run" : `git exited ${out.status}`);
  throw new GitDirtyCheckError(out.status === null ? "no-repo" : "git-error", detail);
}

/**
 * Stage and commit every dirty/uncommitted file in a checkout with a single
 * checkpoint commit so the tree is left clean and mergeable. Used before a
 * close-out merge when the user opts in ("Commit & continue"). Returns the
 * list of committed dirty files on success (matching `dirtyFiles`), or an
 * empty array when the tree was clean or the commit failed.
 */
export async function commitDirtyFiles(root: string, message: string): Promise<string[]> {
  const files = await dirtyFiles(root);
  if (files.length === 0) return [];
  const add = await runGit(root, ["add", "-A"], 15_000);
  if (add.status !== 0) return [];
  const commit = await runGit(root, ["commit", "-m", message], 15_000);
  return commit.status === 0 ? files : [];
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
export async function mergeBranch(
  root: string,
  branch: string,
  opts: { autoResolve?: string[]; autoResolveOurs?: string[] } = {},
): Promise<MergeBranchResult> {
  const head = currentBranch(root);
  let ff = head !== null && branch !== head && isAncestor(root, head, branch) === true;
  let run = await runGit(root, ["merge", "--no-edit", branch], 60_000);
  if (run.status !== 0 && /would be overwritten by merge/.test(run.stderr)) {
    const blocking = blockingFiles(run.stderr);
    if (blocking.length > 0) {
      for (const p of blocking) git(root, ["add", "--", p]);
      if (git(root, ["commit", "-m", "chore: sync working tree before merge"]) !== null) {
        ff = false;
        run = await runGit(root, ["merge", "--no-edit", branch], 60_000);
      }
    }
  }
  const stderr = `${run.stderr}\n${run.stdout}`;
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
    const keepOurs = (p: string): boolean =>
      (opts.autoResolveOurs ?? []).some((r) => p === r || p.startsWith(r.endsWith("/") ? r : r + "/"));
    const blocking = conflicts.filter((p) => !autoResolvable(p) && !keepOurs(p));
    if (conflicts.every((p) => autoResolvable(p) || keepOurs(p))) {
      // Task metadata may be updated concurrently. The closing task's branch
      // copy is authoritative, while unrelated task files must retain main's
      // newer activity/status. Resolve each direction explicitly rather than
      // applying `-X theirs` to every task file wholesale.
      for (const p of conflicts) {
        const side = autoResolvable(p) ? "--theirs" : "--ours";
        const resolved = await runGit(root, ["checkout", side, "--", p], 10_000);
        if (resolved.status !== 0) break;
      }
      const staged = await runGit(root, ["add", "-A", "--", ...conflicts], 10_000);
      if (staged.status === 0 && git(root, ["commit", "--no-edit"]) !== null) {
        return { merged: true, ff: false, conflicts: [] };
      }
      await runGit(root, ["merge", "--abort"], 4000);
      // Every conflicted path was auto-resolvable, but the resolution itself
      // failed to commit. Report that explicitly rather than a generic failure —
      // the auto-resolvable paths are not the real culprit, so they are excluded
      // from `conflicts` (nothing there genuinely blocks a hand-led resolution).
      return {
        merged: false,
        ff: false,
        conflicts: [],
        reason: `auto-resolve failed for ${conflicts.join(", ")}`,
      };
    }
    // A genuine, non-auto-resolvable conflict (or a mix of one with auto-
    // resolvable bookkeeping, e.g. the task's own file). Return ONLY the paths
    // that genuinely block the merge so a hand-led resolution — and the debugger
    // the user is routed to — sees the real culprit, never the task-file
    // bookkeeping that the close-out is supposed to auto-resolve anyway (#0271).
    // This is consistent with `preflightMerge`, which already filters to the
    // unresolved (non-auto-resolvable) paths.
    // Nothing may be left half-applied: back out of the merge entirely.
    await runGit(root, ["merge", "--abort"], 4000);
    return { merged: false, ff: false, conflicts: blocking, reason: "merge conflict" };
  }
  return {
    merged: false,
    ff: false,
    conflicts: [],
    reason: stderr.trim().split("\n").filter(Boolean).slice(0, 4).join(" ") || "merge failed",
  };
}

export interface SyncBranchResult {
  /** Whether the branch was synced (main merged into its worktree). */
  ok: boolean;
  /** Files that conflicted when the sync merge was aborted. */
  conflicts: string[];
  /** Human-readable failure reason (when not ok). */
  reason?: string;
}

/**
 * Sync `branch` with main: merge the main checkout's current branch into
 * `branch`'s linked worktree. This is the repository's existing "sync with
 * main" operation — the same `mergeBranch` semantics the review-transition
 * auto-sync uses, so the automatic done-flow fallback and the manual route
 * never diverge. On conflict the merge is aborted (nothing half-applied) and
 * the conflict list is returned. Fail-soft: false when the branch has no
 * linked worktree or git is missing.
 */
export async function syncBranchWithMain(
  root: string,
  branch: string,
  opts: { autoResolve?: string[] } = {},
): Promise<SyncBranchResult> {
  const wtPath = worktreePathForBranch(root, branch);
  if (!wtPath) {
    return { ok: false, conflicts: [], reason: "no worktree for branch" };
  }
  const baseBranch = currentBranch(root) ?? "main";
  const result = await mergeBranch(wtPath, baseBranch, opts);
  if (result.merged) return { ok: true, conflicts: [] };
  return {
    ok: false,
    conflicts: result.conflicts,
    reason: result.conflicts.length
      ? `merge conflict: ${result.conflicts.join(", ")}`
      : result.reason ?? "sync failed",
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
  const path = worktreePaths(root).get(branch);
  if (!path) return true;
  if (git(root, ["worktree", "remove", "--force", path]) !== null) return true;
  git(root, ["worktree", "prune"]);
  return git(root, ["worktree", "remove", "--force", path]) !== null;
}

export interface EnsureHotfixResult {
  ok: boolean;
  /** Always config.root — the hotfix runs in the main checkout. */
  path: string;
  /** The branch created or reused. */
  branch: string;
  /** Human-readable failure reason. */
  reason?: string;
}

/**
 * Prepare the main checkout for a hotfix task.
 *
 * 1. Create a `hotfix/<id>-<slug>` branch from main (when hotfixTarget is
 *    "branch") or stay on main (when target is "main").
 * 2. Refuse if the main checkout is dirty.
 * 3. Return config.root as the working directory — the agent runs here.
 */
export function ensureHotfix(
  root: string,
  branch: string,
  hotfixTarget: "branch" | "main",
): EnsureHotfixResult {
  if (!isGitRepo(root)) {
    return { ok: false, path: root, branch, reason: "not a git repository" };
  }
  const head = currentBranch(root);
  if (!head) {
    return { ok: false, path: root, branch, reason: "could not determine current branch" };
  }

  // For branch-mode hotfixes: create the hotfix branch if it doesn't exist,
  // then check it out. For main-mode: verify we're already on main.
  if (hotfixTarget === "branch") {
    if (head !== branch) {
      if (!localBranches(root).has(branch)) {
        if (git(root, ["checkout", "-b", branch]) === null) {
          return { ok: false, path: root, branch, reason: `could not create branch ${branch}` };
        }
      } else {
        if (git(root, ["checkout", branch]) === null) {
          return { ok: false, path: root, branch, reason: `could not checkout branch ${branch}` };
        }
      }
    }
  } else {
    if (head !== "main") {
      return { ok: false, path: root, branch, reason: "main-mode hotfix requires the main checkout to be on main" };
    }
  }

  return { ok: true, path: root, branch };
}

/**
 * Reset the main checkout back to `main` after a hotfix, discarding any
 * in-flight work. Only touches root when it's on a hotfix branch.
 */
export function resetHotfix(root: string, branch: string): boolean {
  // Only safe to reset if we're on the hotfix branch and it's not main.
  const head = currentBranch(root);
  if (!head || head === "main") return false;
  if (head !== branch) return false;
  return git(root, ["checkout", "main"]) !== null;
}

/**
 * Get agent-touched files in the working directory: the union of tracked
 * worktree-changed files and newly-added files since the last ref, excluding
 * dist/ and screenshots/. Returns an empty list on git failure.
 */
export function agentTouchedFiles(root: string, sinceRef: string): string[] {
  // Staged + unstaged changes (tracked files)
  const diff =
    git(root, ["diff", "--name-only", sinceRef, "--", "."])
      ?.split("\n")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  // Untracked files that aren't in dist/ or screenshots/
  const untracked =
    git(root, ["ls-files", "--others", "--exclude-standard"])
      ?.split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !p.startsWith("dist/") && !p.startsWith("screenshots/")) ?? [];
  return [...new Set([...diff, ...untracked])];
}
