/**
 * Advisory check-gate lock + deferred branch bookkeeping commits (#1061).
 *
 * While a handoff or close-out check runs for a task, the lock blocks engineer
 * source edits and queues RepoOS bookkeeping commits on that task's worktree
 * until the gate ends. Stale locks are cleared on server boot.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import { commitFiles, setCheckGateCommitHook, type CheckGateCommitVerdict } from "../core/git.js";
import { isCheckGateBookkeepingPath as isBookkeepingPath } from "../core/check-gate-bookkeeping.js";
import { runGit } from "../core/git.js";

export const CHECK_GATE_WRITE_REFUSAL = "A check is running; wait for it to finish.";

export type CheckGateKind = "handoff-finalize" | "merge-gate" | "engineer-self-check";

export interface CheckGateLock {
  taskId: string;
  branch: string;
  worktree: string;
  headAtStart: string;
  kind: CheckGateKind;
  at: string;
  pid: number;
}

export interface DeferredBranchCommit {
  commitRoot: string;
  absPaths: string[];
  message: string;
  enqueuedAt: string;
}

let checkGateFlushInProgress = false;

export function isCheckGateFlushInProgress(): boolean {
  return checkGateFlushInProgress;
}

function cacheRoot(root: string, cacheDir: string): string {
  return join(root, cacheDir ?? ".repoos");
}

function lockPath(root: string, cacheDir: string, taskId: string): string {
  return join(cacheRoot(root, cacheDir), "check-gate-locks", `${encodeURIComponent(taskId)}.json`);
}

function deferredPath(root: string, cacheDir: string, taskId: string): string {
  return join(
    cacheRoot(root, cacheDir),
    "check-gate-deferred",
    `${encodeURIComponent(taskId)}.json`,
  );
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

function parseLock(parsed: unknown): CheckGateLock | null {
  const o = parsed as Partial<CheckGateLock>;
  if (
    typeof o?.taskId === "string" &&
    typeof o?.branch === "string" &&
    typeof o?.worktree === "string" &&
    typeof o?.headAtStart === "string" &&
    (o?.kind === "handoff-finalize" ||
      o?.kind === "merge-gate" ||
      o?.kind === "engineer-self-check") &&
    typeof o?.at === "string" &&
    typeof o?.pid === "number"
  ) {
    return {
      taskId: o.taskId,
      branch: o.branch,
      worktree: o.worktree,
      headAtStart: o.headAtStart,
      kind: o.kind,
      at: o.at,
      pid: o.pid,
    };
  }
  return null;
}

export function readCheckGateLock(
  root: string,
  cacheDir: string,
  taskId: string,
): CheckGateLock | null {
  return readJsonFile(lockPath(root, cacheDir, taskId), parseLock);
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function clearCheckGateLock(root: string, cacheDir: string, taskId: string): void {
  try {
    unlinkSync(lockPath(root, cacheDir, taskId));
  } catch {
    /* gone */
  }
}

export async function acquireCheckGateLock(args: {
  boardRoot: string;
  cacheDir: string;
  taskId: string;
  branch: string;
  worktree: string;
  kind: CheckGateKind;
}): Promise<CheckGateLock | null> {
  const head = await runGit(args.worktree, ["rev-parse", "HEAD"], 10_000);
  if (head.status !== 0) return null;
  const lock: CheckGateLock = {
    taskId: args.taskId,
    branch: args.branch,
    worktree: args.worktree,
    headAtStart: head.stdout.trim(),
    kind: args.kind,
    at: new Date().toISOString(),
    pid: process.pid,
  };
  atomicWriteJson(lockPath(args.boardRoot, args.cacheDir, args.taskId), lock);
  return lock;
}

/**
 * Release the lock and apply any queued bookkeeping commits in order.
 * `boardRoot` is the main checkout that owns `.repoos/` bookkeeping paths.
 */
export async function releaseCheckGateLock(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
): Promise<void> {
  clearCheckGateLock(boardRoot, cacheDir, taskId);
  await flushDeferredBranchCommits(boardRoot, cacheDir, taskId);
}

function samePath(a: string, b: string): boolean {
  try {
    return resolve(a) === resolve(b);
  } catch {
    return a === b;
  }
}

function listLockFiles(boardRoot: string, cacheDir: string): string[] {
  const dir = join(cacheRoot(boardRoot, cacheDir), "check-gate-locks");
  try {
    return readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
}

function readLockFile(boardRoot: string, cacheDir: string, name: string): CheckGateLock | null {
  return readJsonFile(join(cacheRoot(boardRoot, cacheDir), "check-gate-locks", name), parseLock);
}

/** Clear a dead lock and flush its deferred queue (best-effort, in-process). */
export async function reconcileDeadCheckGateLock(
  boardRoot: string,
  cacheDir: string,
  lock: CheckGateLock,
): Promise<void> {
  if (isPidAlive(lock.pid)) return;
  clearCheckGateLock(boardRoot, cacheDir, lock.taskId);
  await flushDeferredBranchCommits(boardRoot, cacheDir, lock.taskId);
}

/** Live lock for `worktree`, reconciling dead holders first. */
export function aliveCheckGateLockForWorktree(
  boardRoot: string,
  cacheDir: string,
  worktree: string,
): CheckGateLock | null {
  for (const name of listLockFiles(boardRoot, cacheDir)) {
    const lock = readLockFile(boardRoot, cacheDir, name);
    if (!lock || !samePath(lock.worktree, worktree)) continue;
    if (!isPidAlive(lock.pid)) {
      void reconcileDeadCheckGateLock(boardRoot, cacheDir, lock);
      return null;
    }
    return lock;
  }
  return null;
}

/** Active lock whose worktree matches `commitRoot`, if the holder process is alive. */
export function activeCheckGateForCommitRoot(
  boardRoot: string,
  cacheDir: string,
  commitRoot: string,
): CheckGateLock | null {
  return aliveCheckGateLockForWorktree(boardRoot, cacheDir, commitRoot);
}

export function readDeferredBranchCommits(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
): DeferredBranchCommit[] {
  return (
    readJsonFile(deferredPath(boardRoot, cacheDir, taskId), (parsed) => {
      if (!Array.isArray(parsed)) return null;
      const out: DeferredBranchCommit[] = [];
      for (const item of parsed) {
        const o = item as Partial<DeferredBranchCommit>;
        if (
          typeof o?.commitRoot === "string" &&
          Array.isArray(o?.absPaths) &&
          o.absPaths.every((p) => typeof p === "string") &&
          typeof o?.message === "string" &&
          typeof o?.enqueuedAt === "string"
        ) {
          out.push({
            commitRoot: o.commitRoot,
            absPaths: o.absPaths,
            message: o.message,
            enqueuedAt: o.enqueuedAt,
          });
        }
      }
      return out;
    }) ?? []
  );
}

function writeDeferredBranchCommits(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
  items: DeferredBranchCommit[],
): void {
  if (items.length === 0) {
    try {
      unlinkSync(deferredPath(boardRoot, cacheDir, taskId));
    } catch {
      /* gone */
    }
    return;
  }
  atomicWriteJson(deferredPath(boardRoot, cacheDir, taskId), items);
}

export function enqueueDeferredBranchCommit(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
  commitRoot: string,
  absPaths: string[],
  message: string,
): void {
  const existing = readDeferredBranchCommits(boardRoot, cacheDir, taskId);
  existing.push({
    commitRoot,
    absPaths: [...absPaths],
    message,
    enqueuedAt: new Date().toISOString(),
  });
  writeDeferredBranchCommits(boardRoot, cacheDir, taskId, existing);
}

export async function flushDeferredBranchCommits(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
): Promise<{ ok: boolean; remaining: number }> {
  const queue = readDeferredBranchCommits(boardRoot, cacheDir, taskId);
  if (queue.length === 0) return { ok: true, remaining: 0 };
  checkGateFlushInProgress = true;
  const prev = process.env.REPOOS_CHECK_GATE_INTERNAL;
  process.env.REPOOS_CHECK_GATE_INTERNAL = "1";
  const remaining: DeferredBranchCommit[] = [];
  try {
    let failed = false;
    for (const item of queue) {
      if (failed) {
        remaining.push(item);
        continue;
      }
      const committed = commitFiles(item.commitRoot, item.absPaths, item.message);
      if (!committed) {
        remaining.push(item);
        failed = true;
      }
    }
    writeDeferredBranchCommits(boardRoot, cacheDir, taskId, remaining);
    return { ok: remaining.length === 0, remaining: remaining.length };
  } finally {
    if (prev === undefined) delete process.env.REPOOS_CHECK_GATE_INTERNAL;
    else process.env.REPOOS_CHECK_GATE_INTERNAL = prev;
    checkGateFlushInProgress = false;
  }
}

/**
 * Refuse non-bookkeeping commits on a locked worktree unless we're flushing the
 * deferred queue ourselves.
 */
export function checkGateCommitRefusal(
  boardRoot: string,
  cacheDir: string,
  commitRoot: string,
  relPaths: string[],
  config: Pick<RepoOSConfig, "workDir" | "cacheDir">,
): string | undefined {
  if (checkGateFlushInProgress) return undefined;
  if (process.env.REPOOS_CHECK_GATE_INTERNAL === "1") return undefined;
  const lock = activeCheckGateForCommitRoot(boardRoot, cacheDir, commitRoot);
  if (!lock) return undefined;
  if (relPaths.every((p) => isBookkeepingPath(p, config))) {
    return undefined;
  }
  return CHECK_GATE_WRITE_REFUSAL;
}

/** Clear dead locks and flush any deferred commits they left behind. */
export async function recoverStaleCheckGateLocks(
  boardRoot: string,
  cacheDir: string,
): Promise<void> {
  for (const name of listLockFiles(boardRoot, cacheDir)) {
    const lock = readLockFile(boardRoot, cacheDir, name);
    if (!lock) continue;
    if (isPidAlive(lock.pid)) continue;
    await reconcileDeadCheckGateLock(boardRoot, cacheDir, lock);
  }
  const deferDir = join(cacheRoot(boardRoot, cacheDir), "check-gate-deferred");
  try {
    for (const name of readdirSync(deferDir).filter((n) => n.endsWith(".json"))) {
      const taskId = decodeURIComponent(name.replace(/\.json$/, ""));
      if (!readCheckGateLock(boardRoot, cacheDir, taskId)) {
        await flushDeferredBranchCommits(boardRoot, cacheDir, taskId);
      }
    }
  } catch {
    /* no deferred dir */
  }
}

/** Engineer tool write guard: block source paths while the gate lock is held. */
export function checkGateSourceWriteRefusal(
  boardRoot: string,
  cacheDir: string,
  worktree: string,
  relPath: string,
  config: Pick<RepoOSConfig, "workDir" | "cacheDir">,
): string | undefined {
  const lock = aliveCheckGateLockForWorktree(boardRoot, cacheDir, worktree);
  if (!lock) return undefined;
  if (isBookkeepingPath(relPath.replace(/\\/g, "/"), config)) return undefined;
  return CHECK_GATE_WRITE_REFUSAL;
}

/** Refuse when any repo-relative path is a source write during an active gate. */
export function refuseCheckGateSourcePaths(
  boardRoot: string,
  cacheDir: string,
  worktree: string,
  relPaths: string[],
  config: Pick<RepoOSConfig, "workDir" | "cacheDir">,
): string | undefined {
  for (const rel of relPaths) {
    const refusal = checkGateSourceWriteRefusal(boardRoot, cacheDir, worktree, rel, config);
    if (refusal) return refusal;
  }
  return undefined;
}

/** Refuse starting another engineer turn while a check gate owns the worktree. */
export function checkGateEngineerBusyRefusal(
  boardRoot: string,
  cacheDir: string,
  worktree: string,
): string | undefined {
  const lock = aliveCheckGateLockForWorktree(boardRoot, cacheDir, worktree);
  if (!lock) return undefined;
  return CHECK_GATE_WRITE_REFUSAL;
}

/** Resolve board root from a task worktree when the process cwd is the worktree. */
export function boardRootForWorktreeCommit(
  commitRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.REPOOS_BOARD_ROOT?.trim() || commitRoot;
}

/** Whether every path in a commit is bookkeeping-only for deferral. */
export function commitPathsAreGateBookkeeping(
  relPaths: string[],
  config: Pick<RepoOSConfig, "workDir" | "cacheDir">,
): boolean {
  return relPaths.length > 0 && relPaths.every((p) => isBookkeepingPath(p, config));
}

export function relPathsUnderRoot(commitRoot: string, absPaths: string[]): string[] {
  return absPaths.map((p) => relative(commitRoot, p).replace(/\\/g, "/"));
}

function resolveCommitHook(
  boardRoot: string,
  cacheDir: string,
  commitRoot: string,
  relPaths: string[],
  absPaths: string[],
  message: string,
  config: Pick<RepoOSConfig, "workDir" | "cacheDir">,
): CheckGateCommitVerdict {
  const lock = activeCheckGateForCommitRoot(boardRoot, cacheDir, commitRoot);
  if (!lock) return "proceed";
  if (!relPaths.every((p) => isBookkeepingPath(p, config))) {
    return "refuse";
  }
  enqueueDeferredBranchCommit(boardRoot, cacheDir, lock.taskId, commitRoot, absPaths, message);
  return "defer";
}

/** Register the shared hook used by `commitFiles` during server lifetime. */
export function installCheckGateCommitHook(config: RepoOSConfig): void {
  const boardRoot = config.root;
  const cacheDir = config.cacheDir ?? ".repoos";
  if (!process.env.REPOOS_CACHE_DIR) process.env.REPOOS_CACHE_DIR = cacheDir;
  setCheckGateCommitHook((args) =>
    resolveCommitHook(
      args.boardRoot.trim() || boardRoot,
      args.cacheDir.trim() || cacheDir,
      args.commitRoot,
      args.relPaths,
      args.absPaths,
      args.message,
      config,
    ),
  );
}
