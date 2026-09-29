/**
 * Repo root checkout git state for the sidebar indicator (#0584).
 *
 * One server-owned computation — branch, detached HEAD, dirty files with
 * their status column, head sha, the three most recent commits — served by
 * `GET /api/repo/status` and pushed over SSE when it changes. The sidebar on
 * every open tab reads this instead of spawning its own `git status`:
 *
 *  - `getRepoStatus` debounces and coalesces, so a burst of requests (N tabs
 *    polling on focus) costs one `git status`, not N — this repo's status
 *    already has a 4s budget and has been a load source before.
 *  - `createRepoStatusNotifier` recomputes only when something *might* have
 *    changed (watcher event, RepoOS commit/merge) and emits `repo.status`
 *    only when the state actually differs, so the event counter does not churn.
 *
 * Everything fails closed: if git cannot be read, `ok` is false and callers
 * must show `unknown`, never `clean` — the same contract `dirtyFiles` has
 * since #0211.
 */
import {
  GitDirtyCheckError,
  dirtyFilesDetailed,
  runGit,
  type DirtyFileEntry,
} from "../core/git.js";
import { listRepoLog, resolveDefaultBranch, type RepoCommit } from "../core/repo-log.js";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Whether two checkout paths name the same directory. RepoOS reports a
 * mutation against whatever spelling its caller held (a worktree path, a
 * symlinked temp root — on macOS `/var` is `/private/var`), so both sides are
 * resolved before comparing or a real change would be missed as "not ours".
 */
export function isSameCheckout(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    // A side may be gone (deleted worktree); fall back to lexical equality.
    return resolve(a) === resolve(b);
  }
}

/** One uncommitted entry: repo-relative path plus porcelain `XY` status. */
export interface RepoStatusDirtyFile {
  path: string;
  status: string;
}

/** The sidebar indicator's state for one checkout. */
export interface RepoStatus {
  /**
   * False when git could not be read (timeout, error, no repo). `branch`,
   * `head` and `dirty` are then unusable — the UI must show `unknown`.
   */
  ok: boolean;
  /** Current branch; null when HEAD is detached (see `detached`). */
  branch: string | null;
  /** True when HEAD points at a commit rather than a branch. */
  detached: boolean;
  /** Configured base branch (`main` here) — a mismatch is worth warning about. */
  baseBranch: string | null;
  /** Uncommitted files in this checkout. Empty only when genuinely clean. */
  dirty: RepoStatusDirtyFile[];
  head: string | null;
  /** The three most recent commits on the checked-out branch (History tab's shape). */
  recentCommits: RepoCommit[];
  /** Absolute path of the checkout this describes — the popup says so. */
  path: string;
  /** When this state was computed (ISO). Clients degrade to `unknown` when stale. */
  computedAt: string;
}

/** The fail-closed answer: never "clean" when we simply could not tell. */
export function unknownRepoStatus(root: string, computedAt = new Date().toISOString()): RepoStatus {
  return {
    ok: false,
    branch: null,
    detached: false,
    baseBranch: null,
    dirty: [],
    head: null,
    recentCommits: [],
    path: root,
    computedAt,
  };
}

const RECENT_COMMIT_LIMIT = 3;

/**
 * Compute the current state of `root`'s checkout. Never throws — a git
 * failure degrades the whole snapshot to `unknownRepoStatus` rather than
 * throwing into a route or an SSE emit.
 */
export async function computeRepoStatus(root: string): Promise<RepoStatus> {
  const computedAt = new Date().toISOString();
  try {
    const [headRun, abbrevRun, symRun] = await Promise.all([
      runGit(root, ["rev-parse", "HEAD"], 4000),
      runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"], 4000),
      // The one read that still names an unborn branch: until the first
      // commit exists, `rev-parse --abbrev-ref HEAD` exits 128 while
      // `symbolic-ref --short HEAD` happily answers "main".
      runGit(root, ["symbolic-ref", "--short", "HEAD"], 4000),
    ]);
    const abbrevOk = !abbrevRun.timedOut && abbrevRun.status === 0;
    const symOk = !symRun.timedOut && symRun.status === 0;
    // Fail closed on the branch read itself: if git names neither a branch
    // nor a detached HEAD, this is not a readable checkout.
    if (!abbrevOk && !symOk) return unknownRepoStatus(root, computedAt);

    const abbrev = abbrevRun.stdout.trim();
    const sym = symRun.stdout.trim();
    // `rev-parse --abbrev-ref HEAD` prints "HEAD" on a detached HEAD; when it
    // fails outright (unborn branch) the symbolic ref still names the branch.
    const branch = abbrevOk && abbrev && abbrev !== "HEAD" ? abbrev : sym || null;
    const detached = branch === null;
    // Best effort: only an unborn branch has no sha, and that is a real state
    // (`git status` above is what decides clean vs unknown, not this read).
    const head = !headRun.timedOut && headRun.status === 0 ? headRun.stdout.trim() || null : null;

    const [dirtyResult, resolvedBase] = await Promise.all([
      dirtyFilesDetailed(root)
        .then((files) => ({ ok: true as const, files }))
        .catch((err: unknown) => ({
          // GitDirtyCheckError and anything else both mean "could not tell".
          ok: false as const,
          files: [] as DirtyFileEntry[],
          cause: err instanceof GitDirtyCheckError ? err.causeKind : "error",
        })),
      resolveDefaultBranch(root).catch(() => null),
    ]);
    if (!dirtyResult.ok) return unknownRepoStatus(root, computedAt);

    // resolveDefaultBranch answers "HEAD" when no main/master ref exists yet
    // and the current branch is unborn. Compare against the symbolic ref
    // there, or a fresh repo would always warn about being off the base branch.
    const baseBranch =
      resolvedBase && resolvedBase !== "HEAD" ? resolvedBase : sym || branch || resolvedBase;

    // Deliberately the History tab's default: `docs(NNNN):` bookkeeping
    // commits are excluded, so "recent commits" means the ones a person would
    // recognise from History rather than three consecutive task-file writes.
    const page = await listRepoLog(root, {
      branch: detached ? "HEAD" : (branch ?? ""),
      limit: RECENT_COMMIT_LIMIT,
    });

    return {
      ok: true,
      branch,
      detached,
      baseBranch,
      dirty: dirtyResult.files.map((f) => ({ path: f.path, status: f.status })),
      head,
      recentCommits: page.ok ? page.commits : [],
      path: root,
      computedAt,
    };
  } catch {
    return unknownRepoStatus(root, computedAt);
  }
}

/**
 * What a `repo.status` event is *about*: everything a client renders except
 * `computedAt`, which moves on every computation. Two states with the same
 * signature are indistinguishable to the UI, so emitting again would only
 * churn the event counter.
 */
export function repoStatusSignature(status: RepoStatus): string {
  return JSON.stringify([
    status.ok,
    status.branch,
    status.detached,
    status.baseBranch,
    status.head,
    status.dirty.map((d) => [d.path, d.status]),
    status.recentCommits.map((c) => c.sha),
  ]);
}

interface StatusEntry {
  timer: ReturnType<typeof setTimeout> | null;
  inflight: Promise<RepoStatus> | null;
  /** The `gen` the in-flight computation started at — see `invalidateRepoStatus`. */
  inflightGen: number;
  /**
   * Bumped whenever something may have changed. A computation started at an
   * older generation may already be stale, so a `fresh` caller chains behind
   * it instead of joining it — a stale "clean" is worse than no indicator.
   */
  gen: number;
  result: RepoStatus | null;
  resultAt: number;
  waiters: Array<(status: RepoStatus) => void>;
}

const entries = new Map<string, StatusEntry>();

/** Joining an in-flight computation costs no git process at all. */
const COALESCE_MS = 250;
/** A snapshot younger than this answers a poll without recomputing. */
const FRESH_MS = 1500;

function entryFor(root: string): StatusEntry {
  let entry = entries.get(root);
  if (!entry) {
    entry = {
      timer: null,
      inflight: null,
      inflightGen: 0,
      gen: 0,
      result: null,
      resultAt: 0,
      waiters: [],
    };
    entries.set(root, entry);
  }
  return entry;
}

async function startCompute(root: string, entry: StatusEntry): Promise<RepoStatus> {
  const pending = computeRepoStatus(root);
  entry.inflight = pending;
  entry.inflightGen = entry.gen;
  try {
    const status = await pending;
    // Only a run that observed the newest generation may be cached as current.
    if (entry.gen === entry.inflightGen) {
      entry.result = status;
      entry.resultAt = Date.now();
    }
    const waiters = entry.waiters.splice(0, entry.waiters.length);
    for (const waiter of waiters) waiter(status);
    return status;
  } finally {
    entry.inflight = null;
  }
}

/**
 * The current state of `root`, coalesced and debounced.
 *
 * Concurrent callers share one computation; a burst arriving within
 * `COALESCE_MS` of the first request runs one `git status` for all of them,
 * and a snapshot younger than `FRESH_MS` is served from cache.
 *
 * `fresh` skips the freshness cache: use it when something just changed and a
 * stale answer would be wrong — the push path's recompute after a watcher
 * event or a RepoOS commit. A `fresh` caller only joins an in-flight run that
 * started *after* the last change; otherwise it waits and computes again.
 */
export function getRepoStatus(root: string, opts: { fresh?: boolean } = {}): Promise<RepoStatus> {
  const entry = entryFor(root);
  if (entry.inflight) {
    if (!opts.fresh || entry.inflightGen >= entry.gen) return entry.inflight;
    return entry.inflight.then(() => getRepoStatus(root, opts));
  }
  if (!opts.fresh && entry.result && Date.now() - entry.resultAt < FRESH_MS) {
    return Promise.resolve(entry.result);
  }
  if (entry.timer) {
    return new Promise<RepoStatus>((resolve) => entry.waiters.push(resolve));
  }
  return new Promise<RepoStatus>((resolve) => {
    entry.waiters.push(resolve);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void startCompute(root, entry).catch(() => {
        /* computeRepoStatus never rejects; belt and braces for the waiters */
        const fallback = unknownRepoStatus(root);
        const waiters = entry.waiters.splice(0, entry.waiters.length);
        for (const waiter of waiters) waiter(fallback);
      });
    }, COALESCE_MS);
    entry.timer.unref?.();
  });
}

/**
 * Something may have changed: drop the cached snapshot and mark any
 * in-flight computation as started-before-the-change.
 */
export function invalidateRepoStatus(root: string): void {
  const entry = entryFor(root);
  entry.gen += 1;
  entry.result = null;
  entry.resultAt = 0;
}

/** Test hook: forget every root's cached/computed state. */
export function resetRepoStatusCache(): void {
  for (const entry of entries.values()) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.waiters = [];
    entry.result = null;
    entry.resultAt = 0;
    entry.gen += 1;
  }
  entries.clear();
}

export interface RepoStatusNotifier {
  /** Something that *may* have changed git state — schedule a recompute. */
  notify(): void;
  /** Force a recompute now (used by tests and by an explicit client refetch). */
  flush(): Promise<RepoStatus>;
  stop(): void;
}

/**
 * Debounced "recompute and emit when it differs" for the SSE stream.
 *
 * Triggers arrive in bursts — a single `git commit` touches HEAD, the index,
 * the ref and the reflog within milliseconds, and every open tab's watcher
 * reports the same write — so notifications are debounced into one
 * computation, and only a signature change produces an event.
 */
export function createRepoStatusNotifier(opts: {
  root: string;
  emit: (status: RepoStatus) => void;
  debounceMs?: number;
  /** Minimum spacing between recomputes — bounds `git status` rate under a write storm. */
  minGapMs?: number;
}): RepoStatusNotifier {
  const { root, emit } = opts;
  const debounceMs = opts.debounceMs ?? 400;
  const minGapMs = opts.minGapMs ?? 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastStartedAt = 0;
  let lastSignature: string | null = null;
  let stopped = false;

  const recompute = async (): Promise<RepoStatus> => {
    lastStartedAt = Date.now();
    const status = await getRepoStatus(root, { fresh: true });
    if (stopped) return status;
    const signature = repoStatusSignature(status);
    if (signature !== lastSignature) {
      lastSignature = signature;
      emit(status);
    }
    return status;
  };

  const schedule = (delay: number): void => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    const wait = Math.max(delay, lastStartedAt + minGapMs - Date.now());
    timer = setTimeout(
      () => {
        timer = null;
        void recompute().catch(() => {
          /* computeRepoStatus never rejects */
        });
      },
      Math.max(wait, 0),
    );
    timer.unref?.();
  };

  return {
    notify(): void {
      if (stopped) return;
      // Mark any in-flight computation as pre-change so a `fresh` recompute
      // never joins it and reports the state from before this trigger.
      invalidateRepoStatus(root);
      schedule(debounceMs);
    },
    flush(): Promise<RepoStatus> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      return recompute();
    },
    stop(): void {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
