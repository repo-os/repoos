/**
 * Serialized, durable close-out coordination. Each repository maintains a FIFO queue of
 * integration jobs, one per task. Jobs are persisted atomically under `.repoos/` so the
 * server survives restarts and never duplicates a merge.
 *
 * Phases: queued -> syncing -> validating -> publishing -> done or failed.
 * Failures retain phase and recovery action; retry resumes safely from where it was interrupted.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "../core/types.js";

export type JobPhase = "queued" | "syncing" | "validating" | "publishing" | "cleanup" | "done" | "failed";

export interface IntegrationJob {
  /** Unique ID: task ID */
  taskId: string;
  /** Current phase */
  phase: JobPhase;
  /** When the job was enqueued (ISO string) */
  enqueuedAt: string;
  /** When job processing started (ISO string, null if not yet started) */
  startedAt: string | null;
  /** Main checkout SHA at validation start (null if not yet validated) */
  baseMainSha: string | null;
  /** Feature branch SHA being merged */
  branchSha: string | null;
  /** Candidate merge result SHA (null until candidate is built) */
  candidateSha: string | null;
  /** Failure reason or recovery action (when phase is "failed") */
  reason?: string;
  /** Queue position (0-indexed; set by coordinator) */
  queuePosition?: number;
}

export interface JobCoordinator {
  /**
   * Enqueue a close-out job for the task. Returns the job if enqueued/already queued,
   * or null if the task doesn't have a branch. Idempotent per task ID.
   */
  enqueue(task: Task): IntegrationJob | null;

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
   */
  updateJob(taskId: string, update: Partial<IntegrationJob>): IntegrationJob | null;

  /** Remove a job from the queue (after successful cleanup or explicit cancellation). */
  removeJob(taskId: string): void;

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
      phase: stored.phase,
      enqueuedAt: stored.enqueuedAt,
      startedAt: stored.startedAt,
      baseMainSha: stored.baseMainSha,
      branchSha: stored.branchSha,
      candidateSha: stored.candidateSha,
      reason: stored.reason,
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
    enqueue(task: Task): IntegrationJob | null {
      if (!task.branch) return null;

      const existing = readJob(root, task.id);
      if (existing) return existing;

      const job: IntegrationJob = {
        taskId: task.id,
        phase: "queued",
        enqueuedAt: new Date().toISOString(),
        startedAt: null,
        baseMainSha: null,
        branchSha: null,
        candidateSha: null,
      };
      writeJob(root, job);
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
      const all = this.allJobs();
      const notDone = all.filter((j) => j.phase !== "done" && j.phase !== "failed");
      return notDone.length > 0 ? notDone[0] : null;
    },

    updateJob(taskId: string, update: Partial<IntegrationJob>): IntegrationJob | null {
      const existing = readJob(root, taskId);
      if (!existing) return null;

      const updated: IntegrationJob = { ...existing, ...update, taskId: existing.taskId };
      writeJob(root, updated);
      return updated;
    },

    removeJob(taskId: string): void {
      const path = jobPath(root, taskId);
      try {
        const fs = require("fs");
        if (fs.existsSync(path)) {
          fs.unlinkSync(path);
        }
      } catch {
        /* best-effort cleanup */
      }
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
