/**
 * Handoff snapshot + advisory worktree lock (#0598).
 *
 * At review handoff RepoOS records the feature branch HEAD and the fact that
 * the tree was clean. Move-to-done and publish re-check that snapshot; agent
 * runners refuse to start in a locked worktree while the task is in review.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import {
  GitDirtyCheckError,
  isAncestor,
  isTaskBookkeepingPath,
  pathsChangedBetweenCommits,
  runGit,
  uncommittedWorkFiles,
  workFileFilter,
  type WorkFileFilter,
  worktreePathForBranch,
} from "../core/git.js";

/** Stable prefix for close-out / HTTP refusal reasons — grep-friendly. */
export const WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX = "worktree changed after handoff";

/** Branch HEAD + clean-tree fact captured when a task lands in `review`. */
export interface HandoffSnapshot {
  taskId: string;
  branch: string;
  sha: string;
  at: string;
  clean: true;
}

export type WorktreeReviewLockStatus = "review" | "closing-out";

/** Advisory lock written while a task is in `review` or close-out (#0598). */
export interface WorktreeReviewLock {
  status: WorktreeReviewLockStatus;
  sha: string;
  at: string;
}

export interface FileAttribution {
  path: string;
  mtimeMs: number;
}

export interface WorktreeHandoffCheckResult {
  ok: boolean;
  reason?: string;
  attribution?: FileAttribution[];
  headMoved?: boolean;
  dirtyFiles?: string[];
}

function cacheRoot(root: string, cacheDir: string): string {
  return join(root, cacheDir ?? ".repoos");
}

function snapshotPath(root: string, cacheDir: string, taskId: string): string {
  return join(cacheRoot(root, cacheDir), "handoff-snapshots", `${encodeURIComponent(taskId)}.json`);
}

function lockPath(root: string, cacheDir: string, taskId: string): string {
  return join(cacheRoot(root, cacheDir), "locks", `${encodeURIComponent(taskId)}.json`);
}

function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

function readJsonFile<T>(path: string, parse: (v: unknown) => T | null): T | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeHandoffSnapshot(
  root: string,
  cacheDir: string,
  snapshot: HandoffSnapshot,
): void {
  atomicWriteJson(snapshotPath(root, cacheDir, snapshot.taskId), snapshot);
}

export function readHandoffSnapshot(
  root: string,
  cacheDir: string,
  taskId: string,
): HandoffSnapshot | null {
  return readJsonFile(snapshotPath(root, cacheDir, taskId), (parsed) => {
    const o = parsed as Partial<HandoffSnapshot>;
    if (
      typeof o?.taskId === "string" &&
      typeof o?.branch === "string" &&
      typeof o?.sha === "string" &&
      typeof o?.at === "string" &&
      o.clean === true
    ) {
      return {
        taskId: o.taskId,
        branch: o.branch,
        sha: o.sha,
        at: o.at,
        clean: true,
      };
    }
    return null;
  });
}

export function clearHandoffSnapshot(root: string, cacheDir: string, taskId: string): void {
  try {
    unlinkSync(snapshotPath(root, cacheDir, taskId));
  } catch {
    /* gone */
  }
}

export function writeWorktreeReviewLock(
  root: string,
  cacheDir: string,
  taskId: string,
  lock: WorktreeReviewLock,
): void {
  atomicWriteJson(lockPath(root, cacheDir, taskId), lock);
}

export function readWorktreeReviewLock(
  root: string,
  cacheDir: string,
  taskId: string,
): WorktreeReviewLock | null {
  return readJsonFile(lockPath(root, cacheDir, taskId), (parsed) => {
    const o = parsed as Partial<WorktreeReviewLock>;
    if (
      (o?.status === "review" || o?.status === "closing-out") &&
      typeof o?.sha === "string" &&
      typeof o?.at === "string"
    ) {
      return { status: o.status, sha: o.sha, at: o.at };
    }
    return null;
  });
}

export function clearWorktreeReviewLock(root: string, cacheDir: string, taskId: string): void {
  try {
    unlinkSync(lockPath(root, cacheDir, taskId));
  } catch {
    /* gone */
  }
}

export function clearWorktreeHandoffProtection(
  root: string,
  cacheDir: string,
  taskId: string,
): void {
  clearWorktreeReviewLock(root, cacheDir, taskId);
  clearHandoffSnapshot(root, cacheDir, taskId);
}

function attributeFiles(worktreePath: string, files: string[]): FileAttribution[] {
  const out: FileAttribution[] = [];
  for (const rel of files) {
    try {
      const st = statSync(join(worktreePath, rel));
      out.push({ path: rel, mtimeMs: st.mtimeMs });
    } catch {
      out.push({ path: rel, mtimeMs: 0 });
    }
  }
  return out;
}

/** Human-readable failure with optional mtime window for session matching. */
export function formatWorktreeHandoffFailure(
  expectedSha: string,
  actualHead: string,
  dirtyFiles: string[],
  attribution: FileAttribution[],
  handoffAt?: string,
): string {
  const parts: string[] = [];
  if (actualHead !== expectedSha) {
    parts.push(`HEAD is ${actualHead.slice(0, 8)} but handoff recorded ${expectedSha.slice(0, 8)}`);
  }
  if (dirtyFiles.length > 0) {
    parts.push(`uncommitted: ${dirtyFiles.join(", ")}`);
  }
  let msg = `${WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX}: ${parts.join("; ")}.`;
  if (handoffAt) msg += ` Handoff was at ${handoffAt}.`;
  if (attribution.length > 0) {
    const window = attribution
      .map((a) => `${a.path} (mtime ${new Date(a.mtimeMs).toISOString()})`)
      .join("; ");
    msg += ` File mtimes: ${window}.`;
  }
  msg +=
    " Discard the post-handoff edits or send the task back to the engineer before Move to done.";
  return msg;
}

/**
 * Blob id at `<ref>:<path>`, or null when the path does not exist there.
 * Absent on both sides compares equal (a main-sync deletion).
 */
async function blobIdAt(wt: string, ref: string, path: string): Promise<string | null> {
  const res = await runGit(wt, ["rev-parse", "--verify", `${ref}:${path}`], 10_000);
  return res.status === 0 ? res.stdout.trim() : null;
}

/**
 * True when the drift between the handoff SHA and HEAD adds nothing beyond
 * what main already contains (#0624) — e.g. a conflict-free merge of main
 * into the task branch while the task sat in review. For every
 * non-bookkeeping drift path, both of these must hold:
 *
 * 1. HEAD carries exactly main's content for the path — the drift introduced
 *    no content that is not main's (so a merge whose conflict resolution went
 *    anywhere other than main's content fails, as does any author edit).
 * 2. The handoff snapshot carried exactly the merge-base's content for the
 *    path — the task had not modified it relative to where it and main
 *    diverged. Without this half, drift that DELETES task content main never
 *    had (e.g. a source file renamed into `work/*.md`) would pass, because
 *    absent-at-HEAD equals absent-at-main.
 *
 * This is a tree-level check that subsumes the merge-commit shape (non-first
 * parents being ancestors of main): cherry-picks or rebases of already-landed
 * main commits pass for the same reason. Fails closed when `main` or the
 * merge base is unreadable.
 */
async function isMainSyncDrift(
  wt: string,
  expectedSha: string,
  actualHead: string,
  driftPaths: string[],
  filter: WorkFileFilter,
): Promise<boolean> {
  const nonBookkeeping = driftPaths.filter((p) => !isTaskBookkeepingPath(p, filter));
  if (nonBookkeeping.length === 0) return true;
  const baseRes = await runGit(wt, ["merge-base", expectedSha, "main"], 10_000);
  if (baseRes.status !== 0) return false;
  const base = baseRes.stdout.trim();
  for (const p of nonBookkeeping) {
    if ((await blobIdAt(wt, actualHead, p)) !== (await blobIdAt(wt, "main", p))) return false;
    if ((await blobIdAt(wt, expectedSha, p)) !== (await blobIdAt(wt, base, p))) return false;
  }
  return true;
}

/**
 * Compare the feature worktree to the SHA recorded at handoff. Missing
 * worktree or unreadable git state fails closed.
 */
export async function verifyWorktreeHandoffIntegrity(
  config: Pick<RepoOSConfig, "root" | "cacheDir" | "workDir">,
  branch: string,
  expectedSha: string,
  opts: { handoffAt?: string; taskId?: string } = {},
): Promise<WorktreeHandoffCheckResult> {
  const wt = worktreePathForBranch(config.root, branch);
  if (!wt) {
    return {
      ok: false,
      reason: `${WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX}: feature worktree for ${branch} not found`,
    };
  }
  const headRes = await runGit(wt, ["rev-parse", "HEAD"], 10_000);
  if (headRes.status !== 0) {
    return {
      ok: false,
      reason: `${WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX}: could not read HEAD in the feature worktree`,
    };
  }
  const actualHead = headRes.stdout.trim();
  let dirtyFiles: string[] = [];
  try {
    dirtyFiles = await uncommittedWorkFiles(wt, workFileFilter(config as RepoOSConfig));
  } catch (err) {
    if (err instanceof GitDirtyCheckError) {
      return {
        ok: false,
        reason: `${WORKTREE_CHANGED_AFTER_HANDOFF_PREFIX}: could not verify the worktree is clean (${err.message})`,
      };
    }
    throw err;
  }
  const headMoved = actualHead !== expectedSha;
  if (!headMoved && dirtyFiles.length === 0) {
    return { ok: true };
  }
  if (headMoved && dirtyFiles.length === 0) {
    const handoffStillReachable = isAncestor(wt, expectedSha, actualHead);
    if (handoffStillReachable === true) {
      const filter = workFileFilter(config as RepoOSConfig);
      const driftPaths = await pathsChangedBetweenCommits(wt, expectedSha, actualHead);
      if (driftPaths !== null) {
        if (driftPaths.every((p) => isTaskBookkeepingPath(p, filter))) {
          return { ok: true };
        }
        // A conflict-free merge of main into the branch while the task is in
        // review (#0624) is not implementation drift: close-out merges main
        // into a fresh candidate anyway. Allow it when the drift adds nothing
        // beyond what main already contains.
        if (await isMainSyncDrift(wt, expectedSha, actualHead, driftPaths, filter)) {
          return { ok: true };
        }
      }
    }
  }
  const attribution = attributeFiles(wt, dirtyFiles);
  return {
    ok: false,
    reason: formatWorktreeHandoffFailure(
      expectedSha,
      actualHead,
      dirtyFiles,
      attribution,
      opts.handoffAt,
    ),
    attribution,
    headMoved,
    dirtyFiles,
  };
}

/**
 * Record snapshot + lock after a successful handoff. The tree must be clean;
 * callers run after the commit gate and optional check drift guard.
 */
export async function recordWorktreeHandoffProtection(
  config: RepoOSConfig,
  taskId: string,
  branch: string,
  workdir: string,
): Promise<void> {
  const headRes = await runGit(workdir, ["rev-parse", "HEAD"], 10_000);
  if (headRes.status !== 0) return;
  const sha = headRes.stdout.trim();
  let dirty: string[] = [];
  try {
    dirty = await uncommittedWorkFiles(workdir, workFileFilter(config));
  } catch {
    return;
  }
  if (dirty.length > 0) return;

  const at = new Date().toISOString();
  const cacheDir = config.cacheDir ?? ".repoos";
  writeHandoffSnapshot(config.root, cacheDir, {
    taskId,
    branch,
    sha,
    at,
    clean: true,
  });
  writeWorktreeReviewLock(config.root, cacheDir, taskId, {
    status: "review",
    sha,
    at,
  });
}

/**
 * Re-record the handoff snapshot at the worktree's current HEAD after a
 * human-approved close-out commit (#0598). Keeps advisory lock status but
 * updates its SHA so the integrity check matches what will be merged.
 */
export async function refreshHandoffSnapshotFromWorktree(
  config: RepoOSConfig,
  taskId: string,
  branch: string,
  workdir: string,
): Promise<{ ok: true; sha: string } | { ok: false; reason: string }> {
  const headRes = await runGit(workdir, ["rev-parse", "HEAD"], 10_000);
  if (headRes.status !== 0) {
    return { ok: false, reason: "could not read HEAD after close-out commit" };
  }
  const sha = headRes.stdout.trim();
  let dirty: string[] = [];
  try {
    dirty = await uncommittedWorkFiles(workdir, workFileFilter(config));
  } catch (err) {
    const message = err instanceof GitDirtyCheckError ? err.message : String(err);
    return { ok: false, reason: `worktree not clean after close-out commit (${message})` };
  }
  if (dirty.length > 0) {
    return {
      ok: false,
      reason: `worktree still has uncommitted files after close-out commit: ${dirty.join(", ")}`,
    };
  }
  const at = new Date().toISOString();
  const cacheDir = config.cacheDir ?? ".repoos";
  writeHandoffSnapshot(config.root, cacheDir, {
    taskId,
    branch,
    sha,
    at,
    clean: true,
  });
  const lock = readWorktreeReviewLock(config.root, cacheDir, taskId);
  writeWorktreeReviewLock(config.root, cacheDir, taskId, {
    status: lock?.status === "closing-out" ? "closing-out" : "review",
    sha,
    at,
  });
  return { ok: true, sha };
}

/** After a failed close-out, drop the lock back to `review` (not `closing-out`). */
export function restoreWorktreeReviewLockAfterFailedCloseOut(
  root: string,
  cacheDir: string,
  taskId: string,
): void {
  const snap = readHandoffSnapshot(root, cacheDir, taskId);
  if (!snap) return;
  writeWorktreeReviewLock(root, cacheDir, taskId, {
    status: "review",
    sha: snap.sha,
    at: snap.at,
  });
}

/** Reset the feature worktree to the handoff snapshot SHA (discard post-handoff edits). */
export async function discardWorktreeHandoffChanges(
  config: RepoOSConfig,
  taskId: string,
  branch: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cacheDir = config.cacheDir ?? ".repoos";
  const snap = readHandoffSnapshot(config.root, cacheDir, taskId);
  if (!snap || snap.branch !== branch) {
    return { ok: false, reason: "no handoff snapshot for this task" };
  }
  const wt = worktreePathForBranch(config.root, branch);
  if (!wt) {
    return { ok: false, reason: `worktree for ${branch} not found` };
  }
  const reset = await runGit(wt, ["reset", "--hard", snap.sha], 30_000);
  if (reset.status !== 0) {
    return {
      ok: false,
      reason: `could not reset worktree to handoff SHA: ${reset.stderr.trim()}`,
    };
  }
  return { ok: true };
}

/**
 * Runner gate: refuse engineer/helper spawns in a locked worktree (#0598).
 * Review agents and tasks already `active` are unaffected.
 */
export function worktreeReviewLockRefusal(
  root: string,
  cacheDir: string,
  cwd: string,
  taskId: string | undefined,
  taskStatus: string | undefined,
  branch?: string,
): string | undefined {
  if (!taskId || taskStatus !== "review") return undefined;
  const lock = readWorktreeReviewLock(root, cacheDir ?? ".repoos", taskId);
  if (!lock) return undefined;
  if (cwd === root) return undefined;
  if (branch) {
    const expected = worktreePathForBranch(root, branch);
    if (expected && cwd !== expected) return undefined;
  }
  return (
    "This task's worktree is locked while it is in review — send it back to the engineer " +
    "through RepoOS before editing or starting an agent here."
  );
}
