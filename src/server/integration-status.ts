/**
 * Read-model for the integration pipeline status bar (0207).
 *
 * Turns the serialized integration jobs (queue + the in-flight job's phase) and
 * the orchestrator's live progress steps into a single snapshot the UI renders
 * without any re-architecting of the orchestrator itself: it only consumes
 * existing job data plus whichever progress `DoneStep` was last reported for
 * each task by the close-out orchestrator.
 */
import {
  attemptIsExecuting,
  jobAttempt,
  type IntegrationJob,
  type IntegrationPhaseTiming,
  type JobCoordinator,
} from "./integration-job.js";
import type { DoneStep } from "./done.js";
import type { PipelineCheckPlan } from "./check-plan-info.js";
import { progressIsStale } from "./close-out-progress.js";

/** The later of two optional ISO timestamps (ignores a missing or unparsable one). */
function latestIso(a: string | undefined | null, b: string | undefined | null): string | undefined {
  const aMs = a ? Date.parse(a) : Number.NaN;
  const bMs = b ? Date.parse(b) : Number.NaN;
  if (!Number.isFinite(aMs)) return Number.isFinite(bMs) ? (b ?? undefined) : undefined;
  if (!Number.isFinite(bMs)) return a ?? undefined;
  return bMs > aMs ? (b ?? undefined) : (a ?? undefined);
}

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
    /** The attempt generation this run belongs to, for retries (#1276). */
    attempt?: number;
    /** Fine-grained step, e.g. "queued for host slot" (#1276). */
    step?: string | null;
    /** Where {@link step} runs: `local` or a remote host (#1276). */
    host?: string | null;
    /**
     * True when the attempt's last progress write is older than
     * PROGRESS_STALE_MS: the writer stopped, so the run may be stuck (#1276).
     */
    progressStale?: boolean;
    /** Why the attempt this one replaced failed, for a retry (#1276). */
    previousFailure?: { attempt: number; reason?: string; failedAt?: string } | null;
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
  // The active job is the one that has left the queue: `startedAt` is set when
  // its validation starts (queued → syncing in the orchestrator). A job still
  // waiting has no start, so it is listed in the queue with its position and
  // never shown as active with a clock running from its enqueue time (#1272).
  const inFlight =
    live.find((job): job is IntegrationJob & { startedAt: string } => attemptIsExecuting(job)) ??
    null;
  const queue: string[] = [];
  const queueEnqueuedAt: Record<string, string> = {};
  const queuedJobs: IntegrationJob[] = [];

  for (const job of live) {
    if (inFlight && job.taskId === inFlight.taskId) continue;
    queue.push(job.taskId);
    queueEnqueuedAt[job.taskId] = job.enqueuedAt;
    queuedJobs.push(job);
  }

  const nowMs = Date.parse(at);
  const blockerElapsedMs =
    inFlight && Number.isFinite(nowMs) ? Math.max(0, nowMs - Date.parse(inFlight.startedAt)) : null;
  const queueDetail = queuedJobs.map((job, i) => {
    const enqueuedMs = Date.parse(job.enqueuedAt);
    return {
      taskId: job.taskId,
      position: i + 1,
      enqueuedAt: job.enqueuedAt,
      waitedMs: Number.isFinite(nowMs) && Number.isFinite(enqueuedMs) ? nowMs - enqueuedMs : 0,
      // The active job holds the single close-out pipeline slot; every queued
      // job waits on it, not on the ones behind it (#0897). With no active job
      // yet there is no blocker clock either (#1272).
      blockerTaskId: inFlight?.taskId ?? null,
      blockerPhase: inFlight?.phase ?? null,
      blockerElapsedMs,
    };
  });
  const queueFields = {
    queue,
    queueEnqueuedAt: queue.length ? queueEnqueuedAt : undefined,
    queueDetail: queueDetail.length ? queueDetail : undefined,
  };

  if (!inFlight) {
    return { empty: queue.length === 0, active: null, ...queueFields, checkPlan, at };
  }

  const failed = inFlight.phase === "failed";
  const startedAt = inFlight.startedAt;
  // The newest of the stage events and the attempt's own progress writes is the
  // "last seen alive" shown to the user (#1276). Staleness is judged on the
  // attempt's own progress writer alone: a fresh stage event must not mask a
  // recorder that stopped writing. Staleness is only judged once the recorder
  // has written, so a legacy record without progress is not flagged.
  const lastProgressAt =
    latestIso(reportedAt[inFlight.taskId], inFlight.lastProgressAt) ?? startedAt;
  // A recorder-attached attempt (it has a progress log) that never wrote a
  // timestamp means its first write failed: judge it from the attempt start so
  // the card cannot look healthy forever (#1276). A legacy record without a
  // progress log is still not flagged.
  const progressStale = progressIsStale(
    inFlight.lastProgressAt ?? (inFlight.progressLogPath ? startedAt : null),
    nowMs,
  );
  const activePhaseStartedAt = inFlight.phaseStartedAt ?? startedAt;
  const activeElapsed = Number.isFinite(nowMs) ? nowMs - Date.parse(activePhaseStartedAt) : null;
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
      attempt: jobAttempt(inFlight),
      step: inFlight.step ?? null,
      host: inFlight.host ?? null,
      progressStale,
      previousFailure: inFlight.previousFailure ?? null,
    },
    ...queueFields,
    checkPlan,
    at,
  };
}
