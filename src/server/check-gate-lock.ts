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
  lstatSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  rmSync,
  writeFileSync,
  appendFileSync,
  copyFileSync,
  chmodSync,
  closeSync,
  fsyncSync,
  openSync,
} from "node:fs";
import * as nodeFs from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import {
  commitFiles,
  gitCapture,
  runGit,
  setCheckGateCommitHook,
  setCheckGateGitRefusal,
  type CheckGateCommitVerdict,
} from "../core/git.js";
import { isCheckGateBookkeepingPath as isBookkeepingPath } from "../core/check-gate-bookkeeping.js";

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
  /** The last holder exited, but deferred bookkeeping still needs replay. */
  flushPending?: boolean;
  /** Original modes for tracked non-bookkeeping files made read-only for gates. */
  protectedFileModes?: Record<string, number>;
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

interface DeferredBranchCommitQueueState {
  entries: DeferredBranchCommit[];
  replayExpected?: Record<string, DeferredFileSnapshot>;
  pending?: {
    headBefore: string;
    message: string;
    beforeSnapshots: Record<string, DeferredFileSnapshot>;
    fileSnapshots: Record<string, DeferredFileSnapshot>;
  };
}

export type CheckGateAcquireResult =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; reason: string };

let checkGateFlushInProgress = false;
let activeReplayCommit: { commitRoot: string; message: string; absPaths: string[] } | undefined;

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

const STATE_MUTEX_INIT_GRACE_MS = 5_000;

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
      let ownerText: string | undefined;
      try {
        ownerText = readFileSync(join(path, "pid"), "utf8");
      } catch {
        // A crashed process can leave the directory before writing its pid.
      }
      const owner = ownerText === undefined ? Number.NaN : Number(ownerText);
      if (Number.isFinite(owner) && !isPidAlive(owner)) {
        rmSync(path, { recursive: true, force: true });
        continue;
      }
      if (!Number.isFinite(owner)) {
        try {
          if (Date.now() - statSync(path).mtimeMs >= STATE_MUTEX_INIT_GRACE_MS) {
            rmSync(path, { recursive: true, force: true });
            continue;
          }
        } catch {
          // It was removed concurrently; retry the atomic mkdir.
          continue;
        }
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
  let fd: number | undefined;
  try {
    fd = openSync(temp, "w", 0o600);
    writeFileSync(fd, JSON.stringify(value, null, 2), "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temp, path);
    const dirFd = openSync(dirname(path), "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
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
  if (holders.length === 0 && o.flushPending !== true) return null;
  return {
    taskId: o.taskId,
    branch: o.branch,
    worktree: o.worktree,
    headAtStart: o.headAtStart,
    at: o.at,
    holders,
    ...(o.protectedFileModes && typeof o.protectedFileModes === "object"
      ? { protectedFileModes: o.protectedFileModes as Record<string, number> }
      : {}),
    ...(o.flushPending === true ? { flushPending: true } : {}),
  };
}

function aliveHolders(lock: CheckGateLock): CheckGateHolder[] {
  return lock.holders.filter((h) => isPidAlive(h.pid));
}

function lockHasLiveHolder(lock: CheckGateLock): boolean {
  return lock.flushPending === true || aliveHolders(lock).length > 0;
}

function newHolderToken(): string {
  return `${process.pid}.${Date.now().toString(36)}.${Math.random().toString(16).slice(2)}`;
}

function persistPendingQueueFence(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
  existing?: CheckGateLock,
): void {
  if (existing) {
    atomicWriteJson(lockPath(boardRoot, cacheDir, taskId), {
      ...existing,
      at: new Date().toISOString(),
      holders: [],
      flushPending: true,
    });
    return;
  }
  const first = readDeferredBranchQueueState(boardRoot, cacheDir, taskId).entries[0];
  if (!first) return;
  const branch = gitCapture(first.commitRoot, ["branch", "--show-current"], 10_000);
  const head = awaitHead(first.commitRoot) ?? "unknown";
  atomicWriteJson(lockPath(boardRoot, cacheDir, taskId), {
    taskId,
    branch: branch.status === 0 ? branch.stdout.trim() : "unknown",
    worktree: first.commitRoot,
    headAtStart: head,
    at: new Date().toISOString(),
    holders: [],
    flushPending: true,
  } satisfies CheckGateLock);
}

function flushAndClearCheckGateLock(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
  lock: CheckGateLock,
): boolean {
  const flushed = flushDeferredBranchCommitsLocked(boardRoot, cacheDir, taskId);
  restoreProtectedFileModes(lock);
  if (!flushed.ok) {
    persistPendingQueueFence(boardRoot, cacheDir, taskId, lock);
    return false;
  }
  clearCheckGateLockUnlocked(boardRoot, cacheDir, taskId);
  return true;
}

/** Make tracked source files read-only while a gate is running. */
function trackedSourceFileModes(
  worktree: string,
  config: Pick<RepoOSConfig, "workDir" | "cacheDir">,
): Record<string, number> {
  const result = gitCapture(worktree, ["ls-files", "-z"], 10_000);
  if (result.status !== 0) throw new Error("could not enumerate tracked files for check gate");
  const modes: Record<string, number> = {};
  for (const rel of result.stdout.split("\0").filter(Boolean)) {
    if (isBookkeepingPath(rel, config)) continue;
    const abs = join(worktree, rel);
    try {
      const stat = lstatSync(abs);
      // chmod follows symlinks; only protect regular files so a tracked link
      // can never change permissions on a target outside this worktree.
      if (!stat.isFile()) continue;
      const mode = stat.mode & 0o777;
      if (mode & 0o222) {
        modes[abs] = mode;
      }
    } catch {
      // Deleted or unreadable tracked files are not writable source files.
    }
  }
  return modes;
}

/** Apply protection only after the recovery record is durably written. */
function applyTrackedSourceProtection(
  modes: Record<string, number>,
  chmod: typeof chmodSync = chmodSync,
): void {
  for (const [path, mode] of Object.entries(modes)) {
    try {
      if (!lstatSync(path).isFile()) continue;
      chmod(path, mode & ~0o222);
    } catch (error) {
      // Missing files need no protection; the gate drift check catches changes.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function persistLockAndProtect(
  path: string,
  lock: CheckGateLock,
  chmod: typeof chmodSync = chmodSync,
): void {
  atomicWriteJson(path, lock);
  try {
    applyTrackedSourceProtection(lock.protectedFileModes ?? {}, chmod);
  } catch (error) {
    restoreProtectedFileModes(lock);
    try {
      unlinkSync(path);
    } catch {
      // Keep the original protection error; a stale lock can be recovered.
    }
    throw error;
  }
}

function restoreProtectedFileModes(lock: CheckGateLock): void {
  for (const [path, mode] of Object.entries(lock.protectedFileModes ?? {})) {
    try {
      if (!lstatSync(path).isFile()) continue;
      chmodSync(path, mode);
    } catch {
      // A removed file needs no permission restoration.
    }
  }
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
  config?: Pick<RepoOSConfig, "workDir" | "cacheDir">;
  /** Injectable filesystem operation for deterministic protection failure tests. */
  protectionChmod?: typeof chmodSync;
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
      if (existing.flushPending) {
        return {
          ok: false,
          reason: `check-gate bookkeeping replay for #${args.taskId} is pending; retry after recovery`,
        };
      }
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
        const protectedFileModes = trackedSourceFileModes(
          args.worktree,
          args.config ?? { workDir: "work", cacheDir: args.cacheDir },
        );
        const fresh: CheckGateLock = {
          taskId: args.taskId,
          branch: args.branch,
          worktree: args.worktree,
          headAtStart,
          at: holder.at,
          holders: [holder],
          protectedFileModes,
        };
        persistLockAndProtect(path, fresh, args.protectionChmod);
      }
    } else {
      const protectedFileModes = trackedSourceFileModes(
        args.worktree,
        args.config ?? { workDir: "work", cacheDir: args.cacheDir },
      );
      const lock: CheckGateLock = {
        taskId: args.taskId,
        branch: args.branch,
        worktree: args.worktree,
        headAtStart,
        at: holder.at,
        holders: [holder],
        protectedFileModes,
      };
      persistLockAndProtect(path, lock, args.protectionChmod);
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
    flushAndClearCheckGateLock(boardRoot, cacheDir, taskId, existing);
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
    if (!existing) {
      const flushed = flushDeferredBranchCommitsLocked(boardRoot, cacheDir, taskId);
      if (!flushed.ok) persistPendingQueueFence(boardRoot, cacheDir, taskId);
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
    flushAndClearCheckGateLock(boardRoot, cacheDir, taskId, existing);
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
    // only then remove the stale protection record. On failure the empty
    // pending holder keeps the bookkeeping fence active for the next retry.
    flushAndClearCheckGateLock(boardRoot, cacheDir, lock.taskId, current);
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
  return readDeferredBranchQueueState(boardRoot, cacheDir, taskId).entries;
}

function parseDeferredEntries(parsed: unknown): DeferredBranchCommit[] | null {
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
}

function parseSnapshotMap(input: unknown): Record<string, DeferredFileSnapshot> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const snapshots: Record<string, DeferredFileSnapshot> = {};
  for (const [path, value] of Object.entries(input as Record<string, unknown>)) {
    if (
      value &&
      typeof value === "object" &&
      (value as { op?: unknown }).op === "write" &&
      typeof (value as { content?: unknown }).content === "string"
    ) {
      snapshots[path] = { op: "write", content: (value as { content: string }).content };
    } else if (value && typeof value === "object" && (value as { op?: unknown }).op === "delete") {
      snapshots[path] = { op: "delete" };
    } else if (typeof value === "string") {
      snapshots[path] = { op: "write", content: value };
    } else if (value === null) {
      snapshots[path] = { op: "delete" };
    } else {
      return null;
    }
  }
  return snapshots;
}

function readDeferredBranchQueueState(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
): DeferredBranchCommitQueueState {
  return (
    readJsonFile(deferredPath(boardRoot, cacheDir, taskId), (parsed) => {
      if (Array.isArray(parsed)) {
        const entries = parseDeferredEntries(parsed);
        return entries ? { entries } : null;
      }
      if (!parsed || typeof parsed !== "object") return null;
      const o = parsed as Record<string, unknown>;
      const entries = parseDeferredEntries(o.entries);
      if (!entries) return null;
      const replayExpected =
        o.replayExpected === undefined ? undefined : parseSnapshotMap(o.replayExpected);
      const pendingRaw = o.pending;
      let pending: DeferredBranchCommitQueueState["pending"];
      if (pendingRaw !== undefined) {
        if (!pendingRaw || typeof pendingRaw !== "object") return null;
        const p = pendingRaw as Record<string, unknown>;
        const beforeSnapshots = parseSnapshotMap(p.beforeSnapshots);
        const fileSnapshots = parseSnapshotMap(p.fileSnapshots);
        if (
          typeof p.headBefore !== "string" ||
          typeof p.message !== "string" ||
          !beforeSnapshots ||
          !fileSnapshots
        )
          return null;
        pending = { headBefore: p.headBefore, message: p.message, beforeSnapshots, fileSnapshots };
      }
      if (o.replayExpected !== undefined && !replayExpected) return null;
      return {
        entries,
        ...(replayExpected ? { replayExpected } : {}),
        ...(pending ? { pending } : {}),
      };
    }) ?? { entries: [] }
  );
}

function writeDeferredBranchQueueState(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
  state: DeferredBranchCommitQueueState,
): void {
  if (state.entries.length === 0 && !state.pending) {
    try {
      unlinkSync(deferredPath(boardRoot, cacheDir, taskId));
    } catch {
      /* gone */
    }
    return;
  }
  atomicWriteJson(deferredPath(boardRoot, cacheDir, taskId), state);
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
  const state = readDeferredBranchQueueState(boardRoot, cacheDir, taskId);
  state.entries.push({
    commitRoot,
    absPaths: [...absPaths],
    message,
    enqueuedAt: new Date().toISOString(),
    fileSnapshots: snapshotAbsPaths(absPaths),
  });
  // Once replay has made partial progress, subsequent bookkeeping writes are
  // the new live worktree contents. Advance the recovery fence to those bytes
  // so a restart does not compare the disk against an obsolete intermediate
  // snapshot and strand the remaining queue forever.
  if (state.replayExpected) {
    Object.assign(state.replayExpected, state.entries.at(-1)!.fileSnapshots);
  }
  writeDeferredBranchQueueState(boardRoot, cacheDir, taskId, state);
}

function flushDeferredBranchCommitsLocked(
  boardRoot: string,
  cacheDir: string,
  taskId: string,
): { ok: boolean; remaining: number } {
  const state = readDeferredBranchQueueState(boardRoot, cacheDir, taskId);
  let queue = state.entries;
  if (queue.length === 0) return { ok: true, remaining: 0 };
  const expectedFinal: Record<string, DeferredFileSnapshot> = {};
  for (const item of queue) Object.assign(expectedFinal, item.fileSnapshots);
  let expectedCurrent = state.replayExpected ?? expectedFinal;

  // A crash may land between git commit and the next queue-file update. The
  // durable pending record identifies that exact commit so recovery can advance
  // the queue instead of comparing an intermediate file state to the old end.
  if (state.pending) {
    const pending = state.pending;
    const first = queue[0];
    if (!first || first.message !== pending.message) return { ok: false, remaining: queue.length };
    const head = awaitHead(first.commitRoot);
    if (!head) return { ok: false, remaining: queue.length };
    try {
      if (head !== pending.headBefore) {
        const parent = gitCapture(first.commitRoot, ["rev-parse", "HEAD^"], 10_000);
        const subject = gitCapture(first.commitRoot, ["log", "-1", "--format=%s"], 10_000);
        if (
          parent.status !== 0 ||
          parent.stdout.trim() !== pending.headBefore ||
          subject.status !== 0 ||
          subject.stdout.trim() !== pending.message.split(/\r?\n/, 1)[0] ||
          !snapshotsMatchOnPaths(pending.fileSnapshots, Object.keys(pending.fileSnapshots))
        ) {
          return { ok: false, remaining: queue.length };
        }
        for (const [path, snapshot] of Object.entries(first.fileSnapshots))
          expectedCurrent[path] = snapshot;
        queue = queue.slice(1);
        state.entries = queue;
        state.replayExpected = expectedCurrent;
        state.pending = undefined;
        writeDeferredBranchQueueState(boardRoot, cacheDir, taskId, state);
      } else {
        const targetPaths = Object.keys(pending.fileSnapshots);
        if (snapshotsMatchOnPaths(pending.fileSnapshots, targetPaths)) {
          restoreSnapshotsIfUnchanged(pending.beforeSnapshots, pending.fileSnapshots);
        } else if (!snapshotsMatchOnPaths(pending.beforeSnapshots, targetPaths)) {
          return { ok: false, remaining: queue.length };
        }
        state.pending = undefined;
        writeDeferredBranchQueueState(boardRoot, cacheDir, taskId, state);
        expectedCurrent = pending.beforeSnapshots;
      }
    } catch {
      return { ok: false, remaining: queue.length };
    }
    if (queue.length === 0) return { ok: true, remaining: 0 };
  }

  if (!state.replayExpected) expectedCurrent = expectedFinal;
  const touched = Object.keys(expectedCurrent);
  try {
    if (!snapshotsMatchOnPaths(expectedCurrent, touched)) {
      return { ok: false, remaining: queue.length };
    }
  } catch {
    return { ok: false, remaining: queue.length };
  }

  checkGateFlushInProgress = true;
  try {
    while (queue.length > 0) {
      const item = queue[0]!;
      const itemPaths = Object.keys(item.fileSnapshots);
      if (
        itemPaths.length !== item.absPaths.length ||
        !item.absPaths.every((path) => item.fileSnapshots[path]) ||
        !snapshotsMatchOnPaths(expectedCurrent, Object.keys(expectedCurrent))
      ) {
        writeDeferredBranchQueueState(boardRoot, cacheDir, taskId, {
          ...state,
          entries: queue,
          replayExpected: expectedCurrent,
          pending: undefined,
        });
        return { ok: false, remaining: queue.length };
      }
      const headBefore = awaitHead(item.commitRoot);
      if (!headBefore) return { ok: false, remaining: queue.length };
      const pending = {
        headBefore,
        message: item.message,
        beforeSnapshots: { ...expectedCurrent },
        fileSnapshots: item.fileSnapshots,
      };
      const priorReplayExpected = state.replayExpected;
      state.pending = pending;
      state.entries = queue;
      if (priorReplayExpected) state.replayExpected = priorReplayExpected;
      else delete state.replayExpected;
      writeDeferredBranchQueueState(boardRoot, cacheDir, taskId, state);
      try {
        restoreSnapshots(item.fileSnapshots);
        const prevInternal = process.env.REPOOS_CHECK_GATE_INTERNAL;
        process.env.REPOOS_CHECK_GATE_INTERNAL = "1";
        activeReplayCommit = {
          commitRoot: item.commitRoot,
          message: item.message,
          absPaths: [...item.absPaths],
        };
        let committed: boolean;
        try {
          committed = commitFiles(item.commitRoot, item.absPaths, item.message);
        } finally {
          activeReplayCommit = undefined;
          if (prevInternal === undefined) delete process.env.REPOOS_CHECK_GATE_INTERNAL;
          else process.env.REPOOS_CHECK_GATE_INTERNAL = prevInternal;
        }
        if (!committed) {
          restoreSnapshotsIfUnchanged(expectedCurrent, item.fileSnapshots);
          state.pending = undefined;
          if (priorReplayExpected) state.replayExpected = priorReplayExpected;
          else delete state.replayExpected;
          writeDeferredBranchQueueState(boardRoot, cacheDir, taskId, state);
          return { ok: false, remaining: queue.length };
        }
        for (const path of itemPaths) expectedCurrent[path] = item.fileSnapshots[path]!;
        queue = queue.slice(1);
        state.entries = queue;
        state.replayExpected = expectedCurrent;
        state.pending = undefined;
        writeDeferredBranchQueueState(boardRoot, cacheDir, taskId, state);
      } catch {
        restoreSnapshotsIfUnchanged(pending.beforeSnapshots, item.fileSnapshots);
        state.pending = undefined;
        if (priorReplayExpected) state.replayExpected = priorReplayExpected;
        else delete state.replayExpected;
        writeDeferredBranchQueueState(boardRoot, cacheDir, taskId, state);
        return { ok: false, remaining: queue.length };
      }
    }
    writeDeferredBranchQueueState(boardRoot, cacheDir, taskId, state);
    return { ok: true, remaining: 0 };
  } finally {
    checkGateFlushInProgress = false;
  }
}

function awaitHead(commitRoot: string): string | null {
  const result = gitCapture(commitRoot, ["rev-parse", "HEAD"], 10_000);
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null;
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
          const flushed = flushDeferredBranchCommitsLocked(boardRoot, cacheDir, taskId);
          if (lock) {
            if (flushed.ok) clearCheckGateLockUnlocked(boardRoot, cacheDir, taskId);
            else persistPendingQueueFence(boardRoot, cacheDir, taskId, lock);
          } else if (!flushed.ok) {
            persistPendingQueueFence(boardRoot, cacheDir, taskId);
          }
        }
      } finally {
        releaseState();
      }
    }
  } catch {
    /* no deferred dir */
  }
}

/**
 * How long a server git step waits for a running self-check to release the
 * gate before it gives up (#1082). Matches the local check queue timeout, so a
 * check that is allowed to run that long is never cut short by its own waiter.
 */
export const CHECK_GATE_WAIT_MS = 45 * 60_000;
const CHECK_GATE_POLL_MS = 1_000;

export interface CheckGateWaitOptions {
  boardRoot: string;
  cacheDir: string;
  /** Upper bound on total waiting. Defaults to `CHECK_GATE_WAIT_MS`. */
  timeoutMs?: number;
  /** Delay between re-checks. Defaults to one second. */
  pollMs?: number;
  /** Called once, the first time an attempt is refused by a live gate. */
  onWait?: () => void;
}

export interface CheckGateWaitResult<T> {
  result: T;
  /** True when at least one attempt was refused by a live gate. */
  waited: boolean;
  /** True when the gate was still held at the deadline; `result` is the last refusal. */
  timedOut: boolean;
}

/**
 * Did git refuse this command only because a self-check holds the gate
 * (#1082)? That refusal is transient, so callers wait it out instead of
 * failing. Any other failure is not busy.
 */
export function checkGateBusyRun(run: { status: number | null; stderr: string }): boolean {
  return run.status !== 0 && CHECK_GATE_BUSY_TEXT.test(run.stderr);
}

const CHECK_GATE_BUSY_TEXT = /A check is running/;

/**
 * Run `attempt` and, while `held` says the result was refused only because a
 * self-check holds the gate, poll again until it clears or the bound runs out
 * (#1082). Stale or dead-holder locks are reconciled before each re-check, so
 * a crashed check never keeps a handoff waiting. Only the refusal is retried:
 * any other result is returned as-is on the first attempt.
 */
export async function waitForCheckGateRelease<T>(
  attempt: () => Promise<T>,
  held: (result: T) => boolean,
  opts: CheckGateWaitOptions,
): Promise<CheckGateWaitResult<T>> {
  const deadline = Date.now() + (opts.timeoutMs ?? CHECK_GATE_WAIT_MS);
  const pollMs = opts.pollMs ?? CHECK_GATE_POLL_MS;
  let result = await attempt();
  if (!held(result)) return { result, waited: false, timedOut: false };
  opts.onWait?.();
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { result, waited: true, timedOut: true };
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, remaining)));
    await recoverStaleCheckGateLocks(opts.boardRoot, opts.cacheDir);
    result = await attempt();
    if (!held(result)) return { result, waited: true, timedOut: false };
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
  if (
    activeReplayCommit &&
    samePath(activeReplayCommit.commitRoot, commitRoot) &&
    activeReplayCommit.message === message &&
    activeReplayCommit.absPaths.length === absPaths.length &&
    activeReplayCommit.absPaths.every((path) => absPaths.includes(path))
  ) {
    return "proceed";
  }
  // Check the holder and enqueue under the same mutex as release/flush. This
  // closes the race where release cleared the lock after lookup but before the
  // queue write, leaving a late bookkeeping entry stranded out of order.
  for (const name of listLockFiles(boardRoot, cacheDir)) {
    const taskId = decodeURIComponent(name.replace(/\.json$/, ""));
    const releaseState = acquireStateMutex(boardRoot, cacheDir, taskId);
    try {
      const current = readCheckGateLock(boardRoot, cacheDir, taskId);
      if (!current || !samePath(current.worktree, commitRoot) || !lockHasLiveHolder(current))
        continue;
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
