/**
 * Read-model for the integration pipeline status bar (0207).
 *
 * Turns the serialized integration jobs (queue + the in-flight job's phase) and
 * the orchestrator's live progress steps into a single snapshot the UI renders
 * without any re-architecting of the orchestrator itself: it only consumes
 * existing job data plus whichever progress `DoneStep` was last reported for
 * each task by the close-out orchestrator.
 */
import type { IntegrationJob, JobCoordinator } from "./integration-job.js";
import type { DoneStep } from "./done.js";

/** The five discrete stages surfaced to the user, in pipeline order. */
export const PIPELINE_STAGES: readonly string[] = ["sync", "merge", "build", "check", "done"] as const;

export interface IntegrationSnapshot {
  /** True when nothing is queued or in progress — the idle empty state. */
  empty: boolean;
  /** The task currently being integrated, or null when none is in flight. */
  active: {
    taskId: string;
    /** The currently-running stage in `PIPELINE_STAGES` order, or null. */
    stage: string | null;
    /** True when the active job's phase is `failed`. */
    failed: boolean;
    /** The failure detail from the job, when failed. */
    error?: string;
  } | null;
  /** Task ids queued behind the active job, in FIFO order. */
  queue: string[];
  at: string;
}

/**
 * The stage shown for a job. Prefers the live progress step recorded by the
 * orchestrator (most accurate); falls back to a best-effort mapping from the
 * job phase so a freshly hydrated snapshot still shows a sensible stage before
 * any progress event has arrived.
 */
export function stageForJob(job: IntegrationJob, reported: DoneStep | undefined): string | null {
  if (reported !== undefined) return reported;
  switch (job.phase) {
    case "queued":
      return null;
    case "syncing":
      return "sync";
    case "validating":
      return "merge";
    case "publishing":
    case "cleanup":
    case "done":
      return "done";
    case "failed":
      return "done";
    default:
      return null;
  }
}

/** Whether a stage is considered "done" (checked) given the current stage. */
export function isStageComplete(stageIndex: number, currentIndex: number): boolean {
  return stageIndex < currentIndex;
}

/**
 * Build the pipeline snapshot from the coordinator plus the last-reported
 * progress step per task id. `queue` is every non-terminal job ahead of or
 * behind the currently-in-flight one; jobs already done/failed are hidden.
 */
export function buildIntegrationSnapshot(
  coordinator: JobCoordinator,
  reported: Record<string, DoneStep>,
  at = new Date().toISOString(),
): IntegrationSnapshot {
  const all = coordinator.allJobs();
  const inFlight = coordinator.peekNext();
  const queue: string[] = [];

  for (const job of all) {
    if (job.phase === "done" || job.phase === "failed") continue;
    if (inFlight && job.taskId === inFlight.taskId) continue;
    queue.push(job.taskId);
  }

  if (!inFlight) {
    return { empty: queue.length === 0, active: null, queue, at };
  }

  const failed = inFlight.phase === "failed";
  return {
    empty: false,
    active: {
      taskId: inFlight.taskId,
      stage: stageForJob(inFlight, reported[inFlight.taskId]),
      failed,
      error: failed ? inFlight.reason : undefined,
    },
    queue,
    at,
  };
}
