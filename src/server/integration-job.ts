/**
 * Serialized, durable close-out coordination. Each repository maintains a FIFO queue of
 * integration jobs, one per task. Jobs are persisted atomically under `.repoos/` so the
 * server survives restarts and never duplicates a merge.
 *
 * Phases: queued -> syncing -> validating -> publishing -> done or failed.
 * Failures retain phase and recovery action; retry resumes safely from where it was interrupted.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import type { Task } from "../core/types.js";

export type JobPhase =
  | "queued"
  | "syncing"
  | "validating"
  | "publishing"
  | "cleanup"
  | "done"
  | "failed";

/** One elapsed close-out phase, for the drawer / pipeline bar (#0897). */
export interface IntegrationPhaseTiming {
  phase: JobPhase;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
}

export interface IntegrationJob {
  /** Unique ID: task ID */
  taskId: string;
  /**
   * Per-task execution generation (#0736). Monotonically increasing across every
   * fresh attempt at the same task; a coordinated run captures the attempt it
   * started with and every write it makes is scoped to it. When a cancelled
   * attempt is still executing and the task is requeued, the replacement must
   * become a NEW attempt — never reuse the old record — so a late callback from
   * the old attempt can be detected and refused rather than mutating the new job.
   * Absent on legacy records; treated as `1`.
   */
  attempt?: number;
  /** Feature branch to integrate (the task's `branch` field). */
  branch?: string;
  /** Current phase */
  phase: JobPhase;
  /** When the job entered {@link phase} (ISO); absent on legacy records. */
  phaseStartedAt?: string;
  /** Elapsed time per close-out phase, oldest first (#0897). */
  phaseTimings?: IntegrationPhaseTiming[];
  /** The phase the job was in when it failed (only set when `phase` is "failed"). */
  failedPhase?: JobPhase;
  /** When the job was enqueued (ISO string) */
  enqueuedAt: string;
  /** When job processing started (ISO string, null if not yet started) */
  startedAt: string | null;
  /**
   * `process.hrtime.bigint()` when `startedAt` was set (#0679). Close-out
   * budget uses monotonic elapsed time so system sleep does not consume it.
   */
  budgetMonotonicStartNs?: string | null;
  /**
   * `process.hrtime.bigint()` when the job finished validating and entered
   * `publishing` (#1275). The wait for the publish turn is measured from it on
   * the same monotonic clock as the budget, and it is cleared once used so a
   * restart can never shift the budget anchor twice.
   */
  parkedAtNs?: string | null;
  /** Main checkout SHA at validation start (null if not yet validated) */
  baseMainSha: string | null;
  /** Feature branch SHA being merged */
  branchSha: string | null;
  /**
   * Feature-branch HEAD recorded at handoff when close-out was enqueued (#0598).
   * Publish and sync re-check the live worktree against this before running the gate.
   */
  handoffSha?: string | null;
  /** Candidate merge result SHA (null until candidate is built) */
  candidateSha: string | null;
  /** When the job entered `failed` (ISO string); lets a refreshed UI re-show the error. */
  failedAt?: string;
  /** Failure reason or recovery action (when phase is "failed") */
  reason?: string;
  /**
   * Repo-relative path to the durable log of the last failed gate check's full
   * output (`.repoos/logs/integration/<id>-<attempt>.log`, #0428). Set when a
   * `validating` check fails; the reason names the failing checks, this points
   * at the untruncated transcript. Absent for non-check failures.
   */
  logPath?: string;
  /**
   * The step the running attempt is on, e.g. "queued for host slot" (#1276).
   * Written by its progress recorder (`close-out-progress.ts`); absent before the
   * attempt starts processing and on legacy records.
   */
  step?: string;
  /** Where {@link step} runs: `local` or a remote runner host (#1276). */
  host?: string;
  /** When the running attempt last wrote progress (ISO) (#1276). */
  lastProgressAt?: string;
  /** Repo-relative path to this attempt's live progress log (#1276). */
  progressLogPath?: string;
  /**
   * Why the attempt this record replaced failed, set when a retry enqueues a new
   * attempt (#1276). Lets the UI show "attempt 2 · after attempt 1 timed out".
   */
  previousFailure?: { attempt: number; reason?: string; failedAt?: string };
  /** Debugger one-line tl;dr for this failure (#0595), cleared on retry. */
  debugTldr?: string;
  /** When {@link debugTldr} was generated (ISO-8601 UTC). */
  debugTldrAt?: string;
  /** Fingerprint of (step, message, detail) this tl;dr describes (#0595). */
  debugTldrKey?: string;
  /**
   * How many gate-check runs this job has performed (#0428). Used to give each
   * attempt's durable log a distinct filename; carried across an explicit
   * retry so a later run does not overwrite the failed run's log.
   */
  checkAttempt?: number;
  /** Queue position (0-indexed; set by coordinator) */
  queuePosition?: number;
  /**
   * Consecutive publish-time "main advanced" resyncs for this job (#0386).
   * Capped at MAX_PUBLISH_DRIFT_RETRIES in integration-orchestrator.ts, same
   * shape as the other close-out retry caps — bounds a job that keeps losing
   * the race to publish on a busy board instead of resyncing forever.
   */
  publishDriftCount?: number;
  /**
   * Consecutive validate-time "main advanced" resyncs for this job (#0399).
   * Capped at MAX_VALIDATE_DRIFT_RETRIES in integration-orchestrator.ts, same
   * shape as publishDriftCount — bounds a job whose candidate keeps being
   * discarded by commits landing during validation instead of resyncing
   * forever.
   */
  validateDriftCount?: number;
  /**
   * Set by the user's "Stop MTD" action (#0459). A cooperatively-cancelled job
   * is hidden from the pipeline snapshot immediately and the orchestrator
   * aborts it at its next checkpoint — killing any running build/check child
   * and tearing down only the throwaway candidate, never the task branch.
   */
  cancelled?: boolean;
}

/** Close-out jobs that still occupy the FIFO queue (excludes terminal done/failed). */
export function pendingCloseOutJobs(jobs: IntegrationJob[]): IntegrationJob[] {
  return jobs.filter((j) => j.phase !== "done" && j.phase !== "failed");
}

/**
 * The task id that holds the publish turn (#1275): the head of the pending
 * queue. Publishing to main is strictly serial in queue order, so only this job
 * may merge; jobs behind it validate in parallel but park until they reach the
 * head. A failed or done job leaves the queue, so a failure never blocks the
 * jobs behind it.
 */
export function publishTurnTaskId(jobs: IntegrationJob[]): string | null {
  const pending = pendingCloseOutJobs(jobs);
  return pending.length > 0 ? pending[0].taskId : null;
}

/** Whether `taskId` may publish now (see {@link publishTurnTaskId}). */
/**
 * A job that finished validating and waits for its publish turn writes no
 * progress on purpose, so it must never be judged stalled (#1275 review).
 */
export function isParkedPublisher(jobs: IntegrationJob[], job: IntegrationJob): boolean {
  return job.phase === "publishing" && !hasPublishTurn(jobs, job.taskId);
}

export function hasPublishTurn(jobs: IntegrationJob[], taskId: string): boolean {
  return publishTurnTaskId(jobs) === taskId;
}

/**
 * Which queued close-outs to start now (#1275). Pure, so the server's scheduler
 * and the tests share one definition of the rules:
 *
 * - Jobs start in queue order, so the head is never starved by later jobs.
 * - At most `limit` runs are in flight. A task already in `running` keeps its slot.
 * - A `publishing` job starts only when it holds the publish turn. Anything
 *   behind the head that has finished validating parks until its turn comes and
 *   is picked up again when the head's run ends.
 * - `holdExtra` (the memory pressure guard is holding new work) stops any start
 *   beyond the first concurrent run. The first run is never held, as before.
 * - A cancelled job is only torn down (its candidate and record), never
 *   validated. It starts whatever the limit or hold says, so a stop request
 *   never waits behind a stalled head or a pressure hold, and it takes no slot.
 */
export function selectCloseOutStarts(input: {
  jobs: IntegrationJob[];
  running: ReadonlySet<string>;
  limit: number;
  holdExtra: boolean;
  unavailable?: ReadonlySet<string>;
}): string[] {
  const picks: string[] = [];
  const turn = publishTurnTaskId(input.jobs);
  const max = Math.max(1, input.limit);
  let inFlight = input.running.size;
  for (const job of pendingCloseOutJobs(input.jobs)) {
    if (input.running.has(job.taskId)) continue;
    if (job.cancelled) {
      picks.push(job.taskId);
      continue;
    }
    if (input.unavailable?.has(job.taskId)) continue;
    if (job.phase === "publishing" && job.taskId !== turn) continue;
    // The head that is ready to publish validates nothing, so it takes no
    // validation slot and the pressure guard does not hold it. Otherwise a slow
    // validation could block the publish behind it (#1275).
    if (job.phase === "publishing") {
      picks.push(job.taskId);
      continue;
    }
    // Scan rather than break: the limit and hold are the same for every job
    // here, so this picks the same jobs, but a cancelled job later in the queue
    // still gets its teardown.
    if (inFlight >= max) continue;
    if (inFlight >= 1 && input.holdExtra) continue;
    picks.push(job.taskId);
    inFlight++;
  }
  return picks;
}

/** The attempt generation of a job, defaulting legacy records to the first attempt. */
export function jobAttempt(job: IntegrationJob | null | undefined): number {
  return job?.attempt ?? 1;
}

/**
 * Whether an attempt has left the queue and is (or was) actively executing, so
 * replacing its record would orphan a live callback (#0736). A queued attempt
 * that never started (`startedAt` null) is safe to replace; a terminal
 * `done`/`failed` attempt is finished and safe to replace.
 */
export function attemptIsExecuting(job: IntegrationJob): boolean {
  if (job.phase === "done" || job.phase === "failed") return false;
  return job.startedAt !== null && job.startedAt !== undefined;
}

export interface JobCoordinator {
  /**
   * Enqueue a close-out job for the task. Returns the job if enqueued/already
   * queued, or null if the task doesn't have a branch. Idempotent per task ID.
   *
   * A cancelled attempt that is still EXECUTING is never replaced here (#0736):
   * its record is returned as-is (still `cancelled`), so the caller can defer
   * the requeue until the old run reaches a terminal phase. Replacing it would
   * orphan the live callback, which would then mutate the new job.
   */
  enqueue(task: Task, opts?: { handoffSha?: string | null }): IntegrationJob | null;

  /**
   * Get the current job for a task ID, or null if no job exists.
   */
  getJob(taskId: string): IntegrationJob | null;

  /** Get all jobs in FIFO order. */
  allJobs(): IntegrationJob[];

  /**
   * Peek at the next job to process (at front of queue), or null if queue is empty.
   * Does not dequeue or change phase.
   */
  peekNext(): IntegrationJob | null;

  /**
   * Update a job's phase and state. Persists atomically. Called by the close-out
   * orchestrator as each phase completes.
   *
   * When `expectedAttempt` is given, the write is refused (returns null) if the
   * on-disk job's attempt generation differs — a late callback from a
   * superseded attempt must never mutate the task's current job (#0736).
   */
  updateJob(
    taskId: string,
    update: Partial<IntegrationJob>,
    expectedAttempt?: number,
  ): IntegrationJob | null;

  /**
   * Start the next attempt inside a running close-out (#1276). Returns the new
   * record, or `null` when `fromAttempt` is no longer the task's current attempt.
   */
  advanceAttempt(taskId: string, fromAttempt: number, reason: string): IntegrationJob | null;

  /**
   * Remove a job from the queue (after successful cleanup, explicit
   * cancellation, or a moot/reconciled failure). With `expectedAttempt`, the
   * removal is refused when the current job has been superseded (#0736).
   */
  removeJob(taskId: string, expectedAttempt?: number): void;

  /**
   * Mark an in-flight/queued job cancelled (#0459). Returns false when no job
   * exists or it already reached a terminal phase. The orchestrator observes
   * the flag and aborts at its next checkpoint; the pipeline snapshot hides
   * the job immediately so the UI reacts without waiting for that abort.
   *
   * With `expectedAttempt`, a superseded job is left untouched (#0736) and the
   * call returns false.
   */
  requestCancel(taskId: string, expectedAttempt?: number): boolean;

  /**
   * Recover a job from an interrupted phase. Called on server startup to find
   * jobs that were interrupted and need resumption or cleanup.
   */
  findInterruptedJobs(): IntegrationJob[];
}

const JOBS_DIR = ".repoos/integration-jobs";
const VERSION = 1;

interface StoredJob extends IntegrationJob {
  version: number;
}

/** Every job record on disk, unsorted. */
function readAllJobs(root: string): IntegrationJob[] {
  ensureJobsDir(root);
  const dir = join(root, JOBS_DIR);
  if (!existsSync(dir)) return [];
  const jobs: IntegrationJob[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const job = readJob(root, file.slice(0, -5));
    if (job) jobs.push(job);
  }
  return jobs;
}

function jobPath(root: string, taskId: string): string {
  return join(root, JOBS_DIR, `${taskId}.json`);
}

/**
 * Monotonic per-task attempt counter (#0736). Kept separately from the job
 * record so the generation never resets when a cancelled/terminal job's record
 * is removed — otherwise a requeue after removal would reuse the same
 * generation and a late callback from the old run would still match.
 */
function genPath(root: string, taskId: string): string {
  return join(root, JOBS_DIR, `${taskId}.gen`);
}

function readGeneration(root: string, taskId: string): number {
  try {
    const raw = readFileSync(genPath(root, taskId), "utf8");
    const parsed = JSON.parse(raw) as { attempt?: unknown };
    return typeof parsed.attempt === "number" && parsed.attempt > 0 ? parsed.attempt : 0;
  } catch {
    return 0;
  }
}

function writeGeneration(root: string, taskId: string, attempt: number): void {
  ensureJobsDir(root);
  try {
    writeFileSync(genPath(root, taskId), JSON.stringify({ attempt }));
  } catch {
    /* best-effort: the job record's own `attempt` is the primary source */
  }
}

function ensureJobsDir(root: string): void {
  const dir = join(root, JOBS_DIR);
  mkdirSync(dir, { recursive: true });
}

function readJob(root: string, taskId: string): IntegrationJob | null {
  const path = jobPath(root, taskId);
  if (!existsSync(path)) return null;
  try {
    const stored = JSON.parse(readFileSync(path, "utf8")) as StoredJob;
    if (stored.version !== VERSION) return null;
    return {
      taskId: stored.taskId,
      attempt: stored.attempt ?? 1,
      branch: stored.branch,
      phase: stored.phase,
      phaseStartedAt: stored.phaseStartedAt,
      phaseTimings: stored.phaseTimings,
      failedPhase: stored.failedPhase,
      enqueuedAt: stored.enqueuedAt,
      startedAt: stored.startedAt,
      // The monotonic budget anchor must survive every read-modify-write, or a
      // retry (advanceAttempt, resync) would restart the close-out deadline (#0573, #1276).
      budgetMonotonicStartNs: stored.budgetMonotonicStartNs,
      parkedAtNs: stored.parkedAtNs,
      baseMainSha: stored.baseMainSha,
      branchSha: stored.branchSha,
      handoffSha: stored.handoffSha ?? null,
      candidateSha: stored.candidateSha,
      failedAt: stored.failedAt,
      reason: stored.reason,
      logPath: stored.logPath,
      step: stored.step,
      host: stored.host,
      lastProgressAt: stored.lastProgressAt,
      progressLogPath: stored.progressLogPath,
      previousFailure: stored.previousFailure,
      debugTldr: stored.debugTldr,
      debugTldrAt: stored.debugTldrAt,
      debugTldrKey: stored.debugTldrKey,
      checkAttempt: stored.checkAttempt,
      publishDriftCount: stored.publishDriftCount,
      validateDriftCount: stored.validateDriftCount,
      cancelled: stored.cancelled,
    };
  } catch {
    return null;
  }
}

function writeJob(root: string, job: IntegrationJob): void {
  ensureJobsDir(root);
  const path = jobPath(root, job.taskId);
  const stored: StoredJob = { ...job, version: VERSION };
  writeFileSync(path, JSON.stringify(stored, null, 2));
}

/**
 * Create a job coordinator for a repository root.
 */
export function createJobCoordinator(root: string): JobCoordinator {
  return {
    enqueue(task: Task, opts?: { handoffSha?: string | null }): IntegrationJob | null {
      if (!task.branch) return null;

      const existing = readJob(root, task.id);
      // A job that already completed or is in flight is left alone; a FAILED
      // job is stale (the earlier attempt ended without publishing), so it is
      // re-enqueued as a fresh queued job — this is how a "Move to done" retry
      // unblocks a task stuck behind an old failure.
      //
      // A DONE job is stale too, in exactly one case: the task itself is no
      // longer `done` (#0195, 2026-08-15 — nothing blocks a task leaving
      // `done` via a plain PATCH, and once it does, the old job record never
      // gets cleared. Without this check, `enqueue()` hands back the same
      // finished job forever and "Move to done" silently does nothing —
      // `ok: true` with a job whose phase is already terminal). The task's
      // own current status is the authority here, same principle as #0210:
      // a job record must never outrank observable task state.
      const staleDoneJob = existing?.phase === "done" && task.status !== "done";
      // A CANCELLED job is stale too (#0459): the user stopped the close-out
      // and a fresh "Move to done" must enqueue a brand-new run rather than
      // hand back the cancelled record and refuse to start.
      //
      // But a cancelled attempt that is STILL EXECUTING is not stale yet
      // (#0736): its callback is alive and may resolve late. Replacing the
      // record now would orphan that callback, which would then mutate the
      // replacement. Return the cancelled record unchanged so the caller can
      // refuse/defer the requeue until the old run reaches a terminal phase
      // (it removes its own record then), and only then start a new attempt.
      if (existing?.cancelled && attemptIsExecuting(existing)) {
        return existing;
      }
      if (existing && existing.phase !== "failed" && !existing.cancelled && !staleDoneJob) {
        if (opts?.handoffSha && !existing.handoffSha) {
          const patched = { ...existing, handoffSha: opts.handoffSha };
          writeJob(root, patched);
          return patched;
        }
        return existing;
      }

      // Strictly after the newest queued job, so two requests in the same
      // millisecond keep their order instead of tying on the timestamp (#1275).
      const newest = Math.max(
        0,
        ...readAllJobs(root)
          .map((j) => Date.parse(j.enqueuedAt))
          .filter(Number.isFinite),
      );
      const enqueuedAt = new Date(Math.max(Date.now(), newest + 1)).toISOString();
      const job: IntegrationJob = {
        taskId: task.id,
        // A fresh attempt gets a new, MONOTONIC generation so a late callback
        // from the superseded attempt is refused by every attempt-scoped write
        // (#0736). The counter is read from a durable per-task file so it does
        // not reset when the previous record was removed.
        attempt: Math.max(existing?.attempt ?? 0, readGeneration(root, task.id)) + 1,
        branch: task.branch,
        phase: "queued",
        phaseStartedAt: enqueuedAt,
        phaseTimings: [{ phase: "queued", startedAt: enqueuedAt }],
        enqueuedAt,
        startedAt: null,
        baseMainSha: null,
        branchSha: null,
        handoffSha: opts?.handoffSha ?? null,
        candidateSha: null,
        // Continue the attempt counter across an explicit retry so each
        // attempt's durable gate log keeps a distinct filename (#0428) instead
        // of the new run clobbering the failed one's `<id>-1.log`.
        checkAttempt: existing?.checkAttempt,
        // The failed attempt this one replaces, so the new attempt can show why
        // it is running again (#1276). Only a failure is a retry; a cancelled or
        // finished record is not.
        ...(existing?.phase === "failed"
          ? {
              previousFailure: {
                attempt: jobAttempt(existing),
                reason: existing.reason,
                failedAt: existing.failedAt,
              },
            }
          : {}),
        // debugTldr* must not carry over — a retry is a fresh failure episode (#0595).
      };
      writeJob(root, job);
      writeGeneration(root, task.id, job.attempt ?? 1);
      return job;
    },

    /**
     * Start the next attempt inside a running close-out (#1276): a rerun after a
     * failed gate or a host failover is a new attempt that records why, not a
     * silent second pass. The attempt's own start (`startedAt`) moves to now; the
     * timeout budget (`budgetMonotonicStartNs`) does not, so a retry still spends
     * the same budget (#0573). Fenced like every attempt write: returns `null`
     * when `fromAttempt` is no longer the task's current attempt, or when the
     * attempt was cancelled: a cancel stops the run, it never starts another
     * attempt on the same record (#0736).
     */
    advanceAttempt(taskId: string, fromAttempt: number, reason: string): IntegrationJob | null {
      const existing = readJob(root, taskId);
      if (!existing || existing.cancelled || jobAttempt(existing) !== fromAttempt) return null;
      const now = new Date().toISOString();
      const next: IntegrationJob = {
        ...existing,
        attempt: Math.max(fromAttempt, readGeneration(root, taskId)) + 1,
        startedAt: now,
        previousFailure: { attempt: fromAttempt, reason, failedAt: now },
        step: undefined,
        host: undefined,
        lastProgressAt: undefined,
        progressLogPath: undefined,
      };
      writeJob(root, next);
      writeGeneration(root, taskId, next.attempt ?? fromAttempt + 1);
      return next;
    },

    getJob(taskId: string): IntegrationJob | null {
      return readJob(root, taskId);
    },

    allJobs(): IntegrationJob[] {
      const jobs = readAllJobs(root);
      // Publish order is enqueue order. Stamps are strictly increasing (see
      // `enqueue`), so the id is only a deterministic tie-break (#1275).
      return jobs.sort(
        (a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt) || a.taskId.localeCompare(b.taskId),
      );
    },

    peekNext(): IntegrationJob | null {
      const pending = pendingCloseOutJobs(this.allJobs());
      return pending.length > 0 ? pending[0] : null;
    },

    updateJob(
      taskId: string,
      update: Partial<IntegrationJob>,
      expectedAttempt?: number,
    ): IntegrationJob | null {
      const existing = readJob(root, taskId);
      if (!existing) return null;
      // Ownership guard (#0736): a write from a superseded attempt must never
      // land on the task's current job. `undefined` means "no ownership claim"
      // (callers that predate generations, and non-orchestrator writers).
      if (expectedAttempt !== undefined && jobAttempt(existing) !== expectedAttempt) {
        return null;
      }

      const updated: IntegrationJob = { ...existing, ...update, taskId: existing.taskId };
      updated.attempt = expectedAttempt ?? jobAttempt(existing);
      if (update.phase && update.phase !== existing.phase) {
        // Record the phase boundary (#0897) so the UI can show where a
        // close-out spent its time (queued / syncing / validating / …
        // publishing) instead of one opaque elapsed number.
        const now = new Date().toISOString();
        const timings = (existing.phaseTimings ?? []).map((t) => ({ ...t }));
        const last = timings[timings.length - 1];
        if (last && !last.endedAt) {
          last.endedAt = now;
          last.durationMs = Math.max(0, Date.parse(now) - Date.parse(last.startedAt));
        }
        timings.push({ phase: update.phase, startedAt: now });
        updated.phaseStartedAt = now;
        updated.phaseTimings = timings;
      }
      if (update.phase === "failed") updated.failedAt ??= new Date().toISOString();
      else if (update.phase) delete updated.failedAt;
      writeJob(root, updated);
      return updated;
    },

    removeJob(taskId: string, expectedAttempt?: number): void {
      const existing = readJob(root, taskId);
      if (expectedAttempt !== undefined && jobAttempt(existing) !== expectedAttempt) {
        // The record now belongs to a newer attempt; leave it alone (#0736).
        return;
      }
      const path = jobPath(root, taskId);
      try {
        if (existsSync(path)) {
          unlinkSync(path);
        }
      } catch {
        /* best-effort cleanup */
      }
    },

    requestCancel(taskId: string, expectedAttempt?: number): boolean {
      const existing = readJob(root, taskId);
      if (!existing || existing.phase === "done" || existing.phase === "failed") return false;
      // A superseded attempt must not cancel the task's current job (#0736).
      if (expectedAttempt !== undefined && jobAttempt(existing) !== expectedAttempt) return false;
      if (existing.cancelled) return true;
      writeJob(root, { ...existing, cancelled: true });
      return true;
    },

    findInterruptedJobs(): IntegrationJob[] {
      const jobs = this.allJobs();
      return jobs.filter((j) => {
        if (j.phase === "done" || j.phase === "failed") return false;
        if (j.phase === "queued" && !j.startedAt) return false;
        return true;
      });
    },
  };
}

/**
 * Whether auto-reload must stand down for the close-out pipeline: the lock is
 * held (a job is being processed) OR a job is still queued/in flight on disk.
 *
 * The lock alone has a gap: it is released when one job finishes and re-acquired
 * when the next starts. A reload decided in that gap (the finished job's own
 * rebuild of `dist/` is what trips the poll) spawns a replacement that boots,
 * finds the next job already past `queued`, and "resumes" it while the old
 * process is still running it — two processes on one candidate worktree, whose
 * failure cleanup removes the directory under the other (#0518, 2026-09-27:
 * `Script not found "build"`, then `ENOENT posix_spawn 'git'`). A queued job is
 * evidence the pipeline is not idle even when nothing holds the lock this
 * instant.
 *
 * A disk read that fails is treated as "no pending job": that restores the
 * lock-only behaviour rather than parking every build on a filesystem hiccup.
 */
/**
 * True while THIS task's close-out job is queued or running (#1277). The global
 * lock check above is a repo-wide answer: a queued job for another task must
 * not block this one, but a queued job for this task must, because a fresh
 * review or capture started now would race its merge.
 */
export function taskCloseOutPending(
  coordinator: Pick<JobCoordinator, "getJob">,
  taskId: string,
): boolean {
  const job = coordinator.getJob(taskId);
  return job !== null && job.phase !== "done" && job.phase !== "failed";
}

export function closeOutPending(
  lock: { closingOut: () => boolean },
  coordinator: Pick<JobCoordinator, "peekNext">,
): boolean {
  if (lock.closingOut()) return true;
  try {
    return coordinator.peekNext() !== null;
  } catch {
    return false;
  }
}
