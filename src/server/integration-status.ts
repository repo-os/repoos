/**
 * Read-model for the integration pipeline status bar (0207).
 *
 * Turns the serialized integration jobs (queue + the in-flight job's phase) and
 * the orchestrator's live progress steps into a single snapshot the UI renders
 * without any re-architecting of the orchestrator itself: it only consumes
 * existing job data plus whichever progress `DoneStep` was last reported for
 * each task by the close-out orchestrator.
 */
import type { IntegrationJob, IntegrationPhaseTiming, JobCoordinator } from "./integration-job.js";
import type { DoneStep } from "./done.js";
import type { PipelineCheckPlan } from "./check-plan-info.js";

/** The discrete stages surfaced to the user, in pipeline order (#0207). */
export const PIPELINE_STAGES: readonly string[] = [
  "sync",
  "merge",
  "resolve-conflict",
  "build",
  "check",
  "done",
] as const;

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
    /** When this job started processing (ISO), for the live stopwatch. Falls
     *  back to the enqueue time when processing hasn't been marked started. */
    startedAt: string | null;
    /** When stage progress was last reported for this job (ISO). Used for
     *  stall detection (#0740); falls back to {@link startedAt}. */
    lastProgressAt: string | null;
    /**
     * In-stage progress detail, e.g. a slow bundle upload's size + elapsed
     * time (#0782). Null when the job has no finer-grained progress to show.
     */
    detail: string | null;
    /** Close-out phase (`queued`/`syncing`/`validating`/…) (#0897). */
    phase?: string;
    /** When the current phase began (ISO) (#0897). */
    phaseStartedAt?: string | null;
    /** Elapsed time in the current phase, computed at snapshot time (#0897). */
    phaseElapsedMs?: number | null;
    /** Time spent in every phase so far, oldest first (#0897). */
    phaseTimings?: IntegrationPhaseTiming[];
  } | null;
  /** Task ids queued behind the active job, in FIFO order. */
  queue: string[];
  /** Enqueue time (ISO) for each id in `queue`, for stale close-out UI. */
  queueEnqueuedAt?: Record<string, string>;
  /**
   * Queue position, wait time and the active job blocking each queued close-out
   * (#0897) — "why is this waiting?" in one place.
   */
  queueDetail?: {
    taskId: string;
    position: number;
    enqueuedAt: string;
    waitedMs: number;
    blockerTaskId: string | null;
    blockerPhase: string | null;
    blockerElapsedMs: number | null;
  }[];
  /**
   * The repo's resolved check plan (`repoos.toml`, #0446), so the pipeline's
   * tooltips describe the real merge-gate steps for THIS repo instead of a
   * hardcoded RepoOS flow (#0458). Resolved fresh on every snapshot, so a
   * config change mid-run is reflected on the next pipeline event.
   */
  checkPlan?: PipelineCheckPlan;
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
 * Apply one upload-heartbeat update to the live pipeline maps (#0782). A
 * detail line both shows on the card and refreshes the stall timer, so a
 * slow-but-moving transfer reads as live in a single SSE emission (no stage
 * churn). `null` clears the line — fired when the transfer lands, so
 * "uploading…" never lingers into the remote test run (#0782 review) — and
 * leaves the stall timer alone. Exported for tests.
 */
export function applyPipelineDetail(
  reportedDetail: Record<string, string>,
  reportedStageAt: Record<string, string>,
  taskId: string,
  detail: string | null,
  at = new Date().toISOString(),
): void {
  if (detail) {
    reportedDetail[taskId] = detail;
    reportedStageAt[taskId] = at;
  } else {
    delete reportedDetail[taskId];
  }
}

/**
 * Build the pipeline snapshot from the coordinator plus the last-reported
 * progress step per task id. `queue` is every non-terminal job ahead of or
 * behind the currently-in-flight one; jobs already done/failed are hidden.
 * A cooperatively-cancelled job (#0459) is hidden the moment the user asks to
 * stop it — before the orchestrator has finished tearing it down — so the UI
 * reacts immediately instead of showing a job the user just cancelled.
 */
export function buildIntegrationSnapshot(
  coordinator: JobCoordinator,
  reported: Record<string, DoneStep>,
  checkPlan?: PipelineCheckPlan,
  reportedAt: Record<string, string> = {},
  reportedDetail: Record<string, string> = {},
  at = new Date().toISOString(),
): IntegrationSnapshot {
  const live = coordinator
    .allJobs()
    .filter((job) => !job.cancelled && job.phase !== "done" && job.phase !== "failed");
  const inFlight = live[0] ?? null;
  const queue: string[] = [];
  const queueEnqueuedAt: Record<string, string> = {};
  const queuedJobs: IntegrationJob[] = [];

  for (const job of live) {
    if (inFlight && job.taskId === inFlight.taskId) continue;
    queue.push(job.taskId);
    queueEnqueuedAt[job.taskId] = job.enqueuedAt;
    queuedJobs.push(job);
  }

  if (!inFlight) {
    return {
      empty: queue.length === 0,
      active: null,
      queue,
      queueEnqueuedAt: queue.length ? queueEnqueuedAt : undefined,
      checkPlan,
      at,
    };
  }

  const failed = inFlight.phase === "failed";
  const startedAt = inFlight.startedAt ?? inFlight.enqueuedAt;
  const lastProgressAt = reportedAt[inFlight.taskId] ?? startedAt;
  const activePhaseStartedAt = inFlight.phaseStartedAt ?? startedAt;
  const nowMs = Date.parse(at);
  const activeElapsed = Number.isFinite(nowMs) ? nowMs - Date.parse(activePhaseStartedAt) : null;
  const blockerStartedAt = startedAt;
  const blockerElapsedMs = Number.isFinite(nowMs)
    ? Math.max(0, nowMs - Date.parse(blockerStartedAt))
    : null;
  const queueDetail = queuedJobs.map((job, i) => {
    const enqueuedMs = Date.parse(job.enqueuedAt);
    return {
      taskId: job.taskId,
      position: i + 1,
      enqueuedAt: job.enqueuedAt,
      waitedMs: Number.isFinite(nowMs) && Number.isFinite(enqueuedMs) ? nowMs - enqueuedMs : 0,
      // The active job holds the single close-out pipeline slot; every queued
      // job waits on it, not on the ones behind it (#0897).
      blockerTaskId: inFlight.taskId,
      blockerPhase: inFlight.phase,
      blockerElapsedMs,
    };
  });
  return {
    empty: false,
    active: {
      taskId: inFlight.taskId,
      stage: stageForJob(inFlight, reported[inFlight.taskId]),
      failed,
      error: failed ? inFlight.reason : undefined,
      startedAt,
      lastProgressAt,
      detail: reportedDetail[inFlight.taskId] ?? null,
      phase: inFlight.phase,
      phaseStartedAt: activePhaseStartedAt,
      phaseElapsedMs: activeElapsed != null && activeElapsed >= 0 ? activeElapsed : null,
      phaseTimings: inFlight.phaseTimings,
    },
    queue,
    queueEnqueuedAt: queue.length ? queueEnqueuedAt : undefined,
    queueDetail: queueDetail.length ? queueDetail : undefined,
    checkPlan,
    at,
  };
}
