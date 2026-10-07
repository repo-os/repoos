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
      failedPhase: stored.failedPhase,
      enqueuedAt: stored.enqueuedAt,
      startedAt: stored.startedAt,
      baseMainSha: stored.baseMainSha,
      branchSha: stored.branchSha,
      handoffSha: stored.handoffSha ?? null,
      candidateSha: stored.candidateSha,
      failedAt: stored.failedAt,
      reason: stored.reason,
      logPath: stored.logPath,
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

      const job: IntegrationJob = {
        taskId: task.id,
        // A fresh attempt gets a new, MONOTONIC generation so a late callback
        // from the superseded attempt is refused by every attempt-scoped write
        // (#0736). The counter is read from a durable per-task file so it does
        // not reset when the previous record was removed.
        attempt: Math.max(existing?.attempt ?? 0, readGeneration(root, task.id)) + 1,
        branch: task.branch,
        phase: "queued",
        enqueuedAt: new Date().toISOString(),
        startedAt: null,
        baseMainSha: null,
        branchSha: null,
        handoffSha: opts?.handoffSha ?? null,
        candidateSha: null,
        // Continue the attempt counter across an explicit retry so each
        // attempt's durable gate log keeps a distinct filename (#0428) instead
        // of the new run clobbering the failed one's `<id>-1.log`.
        checkAttempt: existing?.checkAttempt,
        // debugTldr* must not carry over — a retry is a fresh failure episode (#0595).
      };
      writeJob(root, job);
      writeGeneration(root, task.id, job.attempt ?? 1);
      return job;
    },

    getJob(taskId: string): IntegrationJob | null {
      return readJob(root, taskId);
    },

    allJobs(): IntegrationJob[] {
      ensureJobsDir(root);
      const dir = join(root, JOBS_DIR);
      if (!existsSync(dir)) return [];

      const jobs: IntegrationJob[] = [];
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json")) continue;
        const taskId = file.slice(0, -5);
        const job = readJob(root, taskId);
        if (job) jobs.push(job);
      }
      return jobs.sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
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
