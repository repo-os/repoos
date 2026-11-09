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
  rmSync,
  writeFileSync,
  appendFileSync,
  copyFileSync,
} from "node:fs";
import * as nodeFs from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import {
  commitFiles,
  setCheckGateCommitHook,
  setCheckGateGitRefusal,
  type CheckGateCommitVerdict,
} from "../core/git.js";
import { isCheckGateBookkeepingPath as isBookkeepingPath } from "../core/check-gate-bookkeeping.js";
import { runGit } from "../core/git.js";

export const CHECK_GATE_WRITE_REFUSAL = "A check is running; wait for it to finish.";

export type CheckGateKind = "handoff-finalize" | "merge-gate" | "engineer-self-check";

export interface CheckGateHolder {
  token: string;
  kind: CheckGateKind;
  pid: number;
  at: string;
}

/** On-disk lock state for a task worktree while one or more gates run (#1061). */
export interface CheckGateLock {
  taskId: string;
  branch: string;
  worktree: string;
  headAtStart: string;
  at: string;
  holders: CheckGateHolder[];
}

export interface DeferredBranchCommit {
  commitRoot: string;
  absPaths: string[];
  message: string;
  enqueuedAt: string;
  /** Exact write/delete operation captured when queued. */
  fileSnapshots: Record<string, DeferredFileSnapshot>;
}

export type DeferredFileSnapshot = { op: "write"; content: string } | { op: "delete" };

export type CheckGateAcquireResult =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; reason: string };

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

function stateMutexPath(root: string, cacheDir: string, taskId: string): string {
  return join(cacheRoot(root, cacheDir), "check-gate-state", encodeURIComponent(taskId));
}

/** Cross-process serialization for holder and deferred-queue read/modify/write. */
function acquireStateMutex(root: string, cacheDir: string, taskId: string): () => void {
  const path = stateMutexPath(root, cacheDir, taskId);
  mkdirSync(dirname(path), { recursive: true });
  const waitCell = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 120_000;
  while (true) {
    try {
      mkdirSync(path);
      writeFileSync(join(path, "pid"), String(process.pid), "utf8");
      return () => rmSync(path, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const owner = Number(readFileSync(join(path, "pid"), "utf8"));
        if (Number.isFinite(owner) && !isPidAlive(owner)) {
          rmSync(path, { recursive: true, force: true });
          continue;
        }
      } catch {
        // The directory may have been created just before its owner file.
      }
      if (Date.now() >= deadline)
        throw new Error(`timed out waiting for check-gate state lock: ${taskId}`);
      Atomics.wait(waitCell, 0, 0, 10);
    }
  }
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

function parseHolder(item: unknown): CheckGateHolder | null {
  const o = item as Partial<CheckGateHolder & { kind?: string }>;
  if (
    typeof o?.token === "string" &&
    (o?.kind === "handoff-finalize" ||
      o?.kind === "merge-gate" ||
      o?.kind === "engineer-self-check") &&
    typeof o?.pid === "number" &&
    typeof o?.at === "string"
  ) {
    return { token: o.token, kind: o.kind, pid: o.pid, at: o.at };
  }
  return null;
}

function parseLock(parsed: unknown): CheckGateLock | null {
  const o = parsed as Partial<CheckGateLock & { kind?: CheckGateKind; pid?: number }>;
  if (
    typeof o?.taskId !== "string" ||
    typeof o?.branch !== "string" ||
    typeof o?.worktree !== "string" ||
    typeof o?.headAtStart !== "string" ||
    typeof o?.at !== "string"
  ) {
    return null;
  }
  let holders: CheckGateHolder[] = [];
  if (Array.isArray(o.holders)) {
    holders = o.holders.map(parseHolder).filter((h): h is CheckGateHolder => h !== null);
  } else if (
    (o.kind === "handoff-finalize" ||
      o.kind === "merge-gate" ||
      o.kind === "engineer-self-check") &&
    typeof o.pid === "number"
  ) {
    holders = [
      {
        token: "legacy",
        kind: o.kind,
        pid: o.pid,
        at: o.at ?? new Date().toISOString(),
      },
    ];
  }
  if (holders.length === 0) return null;
  return {
    taskId: o.taskId,
    branch: o.branch,
    worktree: o.worktree,
    headAtStart: o.headAtStart,
    at: o.at,
    holders,
  };
}

function aliveHolders(lock: CheckGateLock): CheckGateHolder[] {
  return lock.holders.filter((h) => isPidAlive(h.pid));
}

function lockHasLiveHolder(lock: CheckGateLock): boolean {
  return aliveHolders(lock).length > 0;
}

function newHolderToken(): string {
  return `${process.pid}.${Date.now().toString(36)}.${Math.random().toString(16).slice(2)}`;
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

function clearCheckGateLockUnlocked(root: string, cacheDir: string, taskId: string): void {
  try {
    unlinkSync(lockPath(root, cacheDir, taskId));
  } catch {
    /* gone */
  }
}

export function clearCheckGateLock(root: string, cacheDir: string, taskId: string): void {
  const releaseState = acquireStateMutex(root, cacheDir, taskId);
  try {
    clearCheckGateLockUnlocked(root, cacheDir, taskId);
  } finally {
    releaseState();
  }
}

export async function acquireCheckGateLock(args: {
  boardRoot: string;
  cacheDir: string;
  taskId: string;
  branch: string;
  worktree: string;
  kind: CheckGateKind;
}): Promise<CheckGateAcquireResult> {
  const head = await runGit(args.worktree, ["rev-parse", "HEAD"], 10_000);
  if (head.status !== 0) {
    return { ok: false, reason: `could not read HEAD for check-gate lock (${head.stderr.trim()})` };
  }
  const headAtStart = head.stdout.trim();
  const token = newHolderToken();
  const holder: CheckGateHolder = {
    token,
    kind: args.kind,
    pid: process.pid,
    at: new Date().toISOString(),
  };
  const path = lockPath(args.boardRoot, args.cacheDir, args.taskId);
  const releaseState = acquireStateMutex(args.boardRoot, args.cacheDir, args.taskId);
  try {
    const existing = readCheckGateLock(args.boardRoot, args.cacheDir, args.taskId);
    if (existing) {
      if (!samePath(existing.worktree, args.worktree)) {
        return {
          ok: false,
          reason: `check-gate lock for #${args.taskId} is held on a different worktree`,
        };
      }
      const live = aliveHolders(existing);
      if (live.length > 0 || existing.holders.some((h) => !isPidAlive(h.pid))) {
        const merged: CheckGateLock = {
          ...existing,
          holders: [...live, holder],
        };
        atomicWriteJson(path, merged);
      } else {
        const fresh: CheckGateLock = {
          taskId: args.taskId,
          branch: args.branch,
          worktree: args.worktree,
          headAtStart,
          at: holder.at,
          holders: [holder],
        };
        atomicWriteJson(path, fresh);
      }
    } else {
      const lock: CheckGateLock = {
        taskId: args.taskId,
        branch: args.branch,
        worktree: args.worktree,
        headAtStart,
        at: holder.at,
        holders: [holder],
      };
      atomicWriteJson(path, lock);
    }
  } finally {
    releaseState();
  }
  const release = async (): Promise<void> => {
    await releaseCheckGateHolder(args.boardRoot, args.cacheDir, args.taskId, token);
  };
  return { ok: true, release };
}

async function releaseCheckGateHolder(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
  token: string,
): Promise<void> {
  const releaseState = acquireStateMutex(boardRoot, cacheDir, taskId);
  try {
    const existing = readCheckGateLock(boardRoot, cacheDir, taskId);
    if (!existing) return;
    const liveRemaining = existing.holders.filter(
      (holder) => holder.token !== token && isPidAlive(holder.pid),
    );
    if (liveRemaining.length > 0) {
      atomicWriteJson(lockPath(boardRoot, cacheDir, taskId), {
        ...existing,
        holders: liveRemaining,
      });
      return;
    }
    // Keep the lock visible and its state mutex held until queued commits are
    // flushed. A concurrent gate cannot acquire into the release window.
    flushDeferredBranchCommitsLocked(boardRoot, cacheDir, taskId);
    clearCheckGateLockUnlocked(boardRoot, cacheDir, taskId);
  } finally {
    releaseState();
  }
}

/**
 * Release every holder owned by this process (best-effort migration helper).
 * Prefer the `release` function returned from {@link acquireCheckGateLock}.
 */
export async function releaseCheckGateLock(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
): Promise<void> {
  const releaseState = acquireStateMutex(boardRoot, cacheDir, taskId);
  try {
    const existing = readCheckGateLock(boardRoot, cacheDir, taskId);
    if (!existing || !lockHasLiveHolder(existing)) {
      flushDeferredBranchCommitsLocked(boardRoot, cacheDir, taskId);
      clearCheckGateLockUnlocked(boardRoot, cacheDir, taskId);
      return;
    }
    const liveRemaining = existing.holders.filter((holder) => holder.pid !== process.pid);
    if (liveRemaining.length > 0) {
      atomicWriteJson(lockPath(boardRoot, cacheDir, taskId), {
        ...existing,
        holders: liveRemaining,
      });
      return;
    }
    flushDeferredBranchCommitsLocked(boardRoot, cacheDir, taskId);
    clearCheckGateLockUnlocked(boardRoot, cacheDir, taskId);
  } finally {
    releaseState();
  }
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
  const releaseState = acquireStateMutex(boardRoot, cacheDir, lock.taskId);
  try {
    const current = readCheckGateLock(boardRoot, cacheDir, lock.taskId);
    if (!current) return;
    const live = aliveHolders(current);
    if (live.length > 0) {
      if (live.length !== current.holders.length) {
        atomicWriteJson(lockPath(boardRoot, cacheDir, lock.taskId), { ...current, holders: live });
      }
      return;
    }
    // Serialize recovery with acquisition, flush the durable queue first, and
    // only then remove the stale protection record.
    flushDeferredBranchCommitsLocked(boardRoot, cacheDir, lock.taskId);
    clearCheckGateLockUnlocked(boardRoot, cacheDir, lock.taskId);
  } finally {
    releaseState();
  }
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
    if (!lockHasLiveHolder(lock)) {
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
          const fileSnapshots: Record<string, DeferredFileSnapshot> = {};
          if (o.fileSnapshots && typeof o.fileSnapshots === "object") {
            for (const [k, v] of Object.entries(o.fileSnapshots as Record<string, unknown>)) {
              if (
                v &&
                typeof v === "object" &&
                (v as { op?: unknown }).op === "write" &&
                typeof (v as { content?: unknown }).content === "string"
              ) {
                fileSnapshots[k] = { op: "write", content: (v as { content: string }).content };
              } else if (v && typeof v === "object" && (v as { op?: unknown }).op === "delete") {
                fileSnapshots[k] = { op: "delete" };
              } else if (typeof v === "string") {
                // Read older queued snapshots written before the explicit operation tag.
                fileSnapshots[k] = { op: "write", content: v };
              } else if (v === null) {
                fileSnapshots[k] = { op: "delete" };
              }
            }
          }
          out.push({
            commitRoot: o.commitRoot,
            absPaths: o.absPaths,
            message: o.message,
            enqueuedAt: o.enqueuedAt,
            fileSnapshots,
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

function snapshotAbsPaths(absPaths: string[]): Record<string, DeferredFileSnapshot> {
  const fileSnapshots: Record<string, DeferredFileSnapshot> = {};
  for (const abs of absPaths) {
    try {
      if (existsSync(abs)) {
        fileSnapshots[abs] = { op: "write", content: readFileSync(abs, "utf8") };
      } else {
        fileSnapshots[abs] = { op: "delete" };
      }
    } catch (error) {
      throw new Error(
        `could not snapshot queued bookkeeping path ${abs}: ${(error as Error).message}`,
      );
    }
  }
  return fileSnapshots;
}

function restoreSnapshots(snapshots: Record<string, DeferredFileSnapshot>): void {
  for (const [path, snapshot] of Object.entries(snapshots)) {
    if (snapshot.op === "delete") {
      try {
        unlinkSync(path);
      } catch {
        /* already absent */
      }
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, snapshot.content, "utf8");
    }
  }
}

function sameSnapshot(
  a: DeferredFileSnapshot | undefined,
  b: DeferredFileSnapshot | undefined,
): boolean {
  return a?.op === b?.op && (a?.op !== "write" || (b?.op === "write" && a.content === b.content));
}

function snapshotsMatchOnPaths(
  expected: Record<string, DeferredFileSnapshot>,
  paths: string[],
): boolean {
  const actual = snapshotAbsPaths(paths);
  return paths.every((path) => sameSnapshot(actual[path], expected[path]));
}

function restoreSnapshotsIfUnchanged(
  expectedCurrent: Record<string, DeferredFileSnapshot>,
  written: Record<string, DeferredFileSnapshot>,
): void {
  const safe: Record<string, DeferredFileSnapshot> = {};
  const paths = Object.keys(written);
  const actual = snapshotAbsPaths(paths);
  for (const path of paths) {
    if (sameSnapshot(actual[path], written[path]) && expectedCurrent[path]) {
      safe[path] = expectedCurrent[path]!;
    }
  }
  restoreSnapshots(safe);
}

export function enqueueDeferredBranchCommit(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
  commitRoot: string,
  absPaths: string[],
  message: string,
): void {
  const releaseState = acquireStateMutex(boardRoot, cacheDir, taskId);
  try {
    enqueueDeferredBranchCommitLocked(boardRoot, cacheDir, taskId, commitRoot, absPaths, message);
  } finally {
    releaseState();
  }
}

function enqueueDeferredBranchCommitLocked(
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
    fileSnapshots: snapshotAbsPaths(absPaths),
  });
  writeDeferredBranchCommits(boardRoot, cacheDir, taskId, existing);
}

function flushDeferredBranchCommitsLocked(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
): { ok: boolean; remaining: number } {
  const queue = readDeferredBranchCommits(boardRoot, cacheDir, taskId);
  if (queue.length === 0) return { ok: true, remaining: 0 };
  const expectedFinal: Record<string, DeferredFileSnapshot> = {};
  for (const item of queue) Object.assign(expectedFinal, item.fileSnapshots);
  const touched = Object.keys(expectedFinal);
  try {
    // Never replay stale snapshots over later edits. Keep every queue entry for
    // recovery if the worktree no longer matches the last queued state.
    if (!snapshotsMatchOnPaths(expectedFinal, touched)) {
      return { ok: false, remaining: queue.length };
    }
  } catch {
    return { ok: false, remaining: queue.length };
  }

  checkGateFlushInProgress = true;
  const prev = process.env.REPOOS_CHECK_GATE_INTERNAL;
  process.env.REPOOS_CHECK_GATE_INTERNAL = "1";
  const remaining: DeferredBranchCommit[] = [];
  const expectedCurrent = { ...expectedFinal };
  try {
    let failed = false;
    for (const [index, item] of queue.entries()) {
      if (failed) {
        remaining.push(item);
        continue;
      }
      const itemPaths = Object.keys(item.fileSnapshots);
      if (
        itemPaths.length !== item.absPaths.length ||
        !item.absPaths.every((path) => item.fileSnapshots[path]) ||
        !snapshotsMatchOnPaths(expectedCurrent, Object.keys(expectedCurrent))
      ) {
        remaining.push(...queue.slice(index));
        failed = true;
        continue;
      }
      const prior = { ...expectedCurrent };
      try {
        restoreSnapshots(item.fileSnapshots);
        const committed = commitFiles(item.commitRoot, item.absPaths, item.message);
        if (!committed) {
          restoreSnapshotsIfUnchanged(prior, item.fileSnapshots);
          remaining.push(...queue.slice(index));
          failed = true;
          continue;
        }
        for (const path of itemPaths) expectedCurrent[path] = item.fileSnapshots[path]!;
      } catch {
        restoreSnapshotsIfUnchanged(prior, item.fileSnapshots);
        remaining.push(...queue.slice(index));
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

export async function flushDeferredBranchCommits(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
): Promise<{ ok: boolean; remaining: number }> {
  const releaseState = acquireStateMutex(boardRoot, cacheDir, taskId);
  try {
    return flushDeferredBranchCommitsLocked(boardRoot, cacheDir, taskId);
  } finally {
    releaseState();
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
    if (aliveHolders(lock).length > 0) continue;
    await reconcileDeadCheckGateLock(boardRoot, cacheDir, lock);
  }
  const deferDir = join(cacheRoot(boardRoot, cacheDir), "check-gate-deferred");
  try {
    for (const name of readdirSync(deferDir).filter((n) => n.endsWith(".json"))) {
      const taskId = decodeURIComponent(name.replace(/\.json$/, ""));
      const releaseState = acquireStateMutex(boardRoot, cacheDir, taskId);
      try {
        const lock = readCheckGateLock(boardRoot, cacheDir, taskId);
        if (!lock || !lockHasLiveHolder(lock)) {
          flushDeferredBranchCommitsLocked(boardRoot, cacheDir, taskId);
          if (lock) clearCheckGateLockUnlocked(boardRoot, cacheDir, taskId);
        }
      } finally {
        releaseState();
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

/** Repo-relative path spec segments from a git argv (after `--` when present). */
export function gitArgvPathspec(args: readonly string[]): string[] {
  const dash = args.indexOf("--");
  const tail = dash >= 0 ? args.slice(dash + 1) : args.slice(1);
  return tail.filter((p) => p && !p.startsWith("-"));
}

function gateEnvBoardRoot(config: RepoOSConfig): string {
  return process.env.REPOOS_CHECK_STORE_ROOT?.trim() || config.root;
}

function gateEnvCacheDir(config: RepoOSConfig): string {
  return process.env.REPOOS_CACHE_DIR?.trim() || config.cacheDir || ".repoos";
}

function checkGateGitCommandRefusal(
  cwd: string,
  args: readonly string[],
  config: RepoOSConfig,
): string | undefined {
  if (process.env.REPOOS_CHECK_GATE_INTERNAL === "1") return undefined;
  const verb = args[0];
  if (!verb || !["add", "commit", "restore", "checkout", "switch"].includes(verb)) {
    return undefined;
  }
  const boardRoot = gateEnvBoardRoot(config);
  const cacheDir = gateEnvCacheDir(config);
  if (!aliveCheckGateLockForWorktree(boardRoot, cacheDir, cwd)) return undefined;
  if (verb === "commit") return CHECK_GATE_WRITE_REFUSAL;
  const paths = gitArgvPathspec(args);
  if (paths.length === 0 && (verb === "checkout" || verb === "switch" || verb === "restore")) {
    return CHECK_GATE_WRITE_REFUSAL;
  }
  return refuseCheckGateSourcePaths(boardRoot, cacheDir, cwd, paths, config);
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
  if (checkGateFlushInProgress || process.env.REPOOS_CHECK_GATE_INTERNAL === "1") return "proceed";
  // Check the holder and enqueue under the same mutex as release/flush. This
  // closes the race where release cleared the lock after lookup but before the
  // queue write, leaving a late bookkeeping entry stranded out of order.
  for (const name of listLockFiles(boardRoot, cacheDir)) {
    const lock = readLockFile(boardRoot, cacheDir, name);
    if (!lock || !samePath(lock.worktree, commitRoot)) continue;
    const releaseState = acquireStateMutex(boardRoot, cacheDir, lock.taskId);
    try {
      const current = readCheckGateLock(boardRoot, cacheDir, lock.taskId);
      if (!current || !lockHasLiveHolder(current)) continue;
      if (!relPaths.every((p) => isBookkeepingPath(p, config))) return "refuse";
      enqueueDeferredBranchCommitLocked(
        boardRoot,
        cacheDir,
        current.taskId,
        commitRoot,
        absPaths,
        message,
      );
      return "defer";
    } finally {
      releaseState();
    }
  }
  return "proceed";
}

/** Register commit and git-command guards for check-gate bookkeeping (#1061). */
export function installCheckGateCommitHook(config: RepoOSConfig): void {
  const boardRoot = config.root;
  const cacheDir = config.cacheDir ?? ".repoos";
  if (!process.env.REPOOS_CACHE_DIR) process.env.REPOOS_CACHE_DIR = cacheDir;
  process.env.REPOOS_BOARD_ROOT = boardRoot;
  const scope = config;
  setCheckGateCommitHook((args) =>
    resolveCommitHook(
      args.boardRoot.trim() || boardRoot,
      args.cacheDir.trim() || cacheDir,
      args.commitRoot,
      args.relPaths,
      args.absPaths,
      args.message,
      scope,
    ),
  );
  setCheckGateGitRefusal((cwd, args) => checkGateGitCommandRefusal(cwd, args, scope));
}
