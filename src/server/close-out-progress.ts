/**
 * Live progress for one close-out attempt (#1276).
 *
 * Each processing run of an attempt owns a recorder. It appends to
 * `.repoos/logs/integration/<id>-attempt-<n>.log` as the run moves through its
 * steps, and on every write it persists the current step, the host it runs on
 * and a `lastProgressAt` onto the job record. That is what
 * `GET /api/tasks/:id/integration-job` and the pipeline snapshot read, so a
 * driver can tell "running", "queued for a host slot" and "stopped writing"
 * apart.
 *
 * A heartbeat line is written at least every {@link PROGRESS_HEARTBEAT_MS} while
 * the attempt is active, so a quiet step still moves the log and the timestamp.
 * A `lastProgressAt` older than {@link PROGRESS_STALE_MS} therefore means the
 * writer itself stopped: the close-out is probably hung, not merely slow.
 *
 * Observation only: every write is best-effort and never throws into the
 * close-out.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ActiveRemoteRunInfo } from "./remote-validation.js";

/** Host label for a step that runs on the server itself. */
export const LOCAL_HOST = "local";

/** How often the recorder polls the live remote run and checks the heartbeat. */
export const PROGRESS_POLL_MS = 5_000;

/** The log and job record are refreshed at least this often while active. */
export const PROGRESS_HEARTBEAT_MS = 15_000;

/** No progress write for this long means the writer stopped (see module doc). */
export const PROGRESS_STALE_MS = 90_000;

/** The user-visible step labels the close-out reports, in pipeline order. */
export const CLOSE_OUT_STEP = {
  syncing: "syncing with main",
  building: "building candidate",
  remote: "remote validation",
  queuedForHost: "queued for host slot",
  bundling: "bundling and uploading",
  runningTests: "running tests",
  checks: "running checks",
  publishing: "publishing to main",
  cleanup: "cleaning up",
} as const;

/** Map a remote-run stage (see `ActiveRemoteRunInfo.stage`) to a close-out step. */
export function stepForRemoteStage(stage: string | null | undefined): string | null {
  switch (stage) {
    case "queue":
    case "lock":
      return CLOSE_OUT_STEP.queuedForHost;
    case "bundle":
    case "upload":
      return CLOSE_OUT_STEP.bundling;
    case "run":
    case "install":
    case "test":
      return CLOSE_OUT_STEP.runningTests;
    default:
      return null;
  }
}

/** Repo-relative path of one attempt's progress log. */
export function progressLogPathFor(taskId: string, attempt: number): string {
  return join(".repoos", "logs", "integration", `${taskId}-attempt-${attempt}.log`);
}

/**
 * Whether a progress timestamp is old enough to flag the attempt as possibly
 * stuck. A missing timestamp is not flagged: the job predates the recorder, and
 * the snapshot's own stall timer still applies.
 */
export function progressIsStale(
  lastProgressAt: string | null | undefined,
  nowMs: number,
  staleMs: number = PROGRESS_STALE_MS,
): boolean {
  if (!lastProgressAt) return false;
  const at = Date.parse(lastProgressAt);
  if (!Number.isFinite(at)) return false;
  return nowMs - at >= staleMs;
}

/**
 * Whether an attempt may still write progress to its job record (#1276). A
 * `done` or `failed` record is final, so a late heartbeat must not stamp it with
 * a live step or a fresh timestamp. A missing record is also not writable.
 */
export function progressWritable(phase: string | null | undefined): boolean {
  return phase !== undefined && phase !== null && phase !== "done" && phase !== "failed";
}

/** Fields the recorder writes onto the job record. */
export interface CloseOutProgressPatch {
  step?: string;
  host?: string;
  lastProgressAt?: string;
  progressLogPath?: string;
}

export interface CloseOutProgressOptions {
  root: string;
  taskId: string;
  attempt: number;
  /** Persists a patch onto this attempt's job record (scoped to the attempt). */
  persist: (patch: CloseOutProgressPatch) => void;
  /** The task's live remote run, if one is in flight (host + stage). */
  remoteRun?: () => ActiveRemoteRunInfo | undefined;
  /**
   * Fired after a step or host change is persisted, so observers (the pipeline
   * snapshot / SSE) see the new step without waiting for a stage event (#1276).
   * Observation only: a throwing observer never disturbs the close-out.
   */
  onChange?: () => void;
  /** Clock override for tests; defaults to `Date.now`. */
  now?: () => number;
  pollMs?: number;
  heartbeatMs?: number;
}

/**
 * One attempt's progress recorder. Create one per processing run, call
 * {@link start}, report steps with {@link setStep}, and call {@link stop} with
 * the run's outcome when it ends.
 */
export class CloseOutProgressRecorder {
  /** Repo-relative path of this attempt's log. */
  readonly logPath: string;
  private readonly absPath: string;
  private readonly now: () => number;
  private step: string | null = null;
  private host: string | null = null;
  private lastWriteMs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(private readonly opts: CloseOutProgressOptions) {
    this.logPath = progressLogPathFor(opts.taskId, opts.attempt);
    this.absPath = join(opts.root, this.logPath);
    this.now = opts.now ?? Date.now;
  }

  /** Open the log, record the attempt's start, and begin polling. */
  start(): void {
    if (this.stopped) return;
    this.record(`attempt ${this.opts.attempt} started`, { progressLogPath: this.logPath });
    this.timer = setInterval(() => this.tick(), this.opts.pollMs ?? PROGRESS_POLL_MS);
    this.timer.unref?.();
  }

  /** Report the step the attempt is on, and the host it runs on. */
  setStep(step: string, host: string = LOCAL_HOST): void {
    if (this.stopped) return;
    if (step === this.step && host === this.host) return;
    this.step = step;
    this.host = host;
    this.record(`step: ${step} · host: ${host}`, { step, host });
    try {
      this.opts.onChange?.();
    } catch {
      /* an observer must never disturb the close-out */
    }
  }

  /**
   * One poll: follow the live remote run's host and stage, and write a heartbeat
   * if the last write is older than the heartbeat interval. Exposed for tests;
   * the timer calls it.
   */
  tick(): void {
    if (this.stopped) return;
    const run = this.remoteRunSafely();
    if (run) {
      this.setStep(stepForRemoteStage(run.stage) ?? CLOSE_OUT_STEP.remote, run.host);
    }
    const heartbeatMs = this.opts.heartbeatMs ?? PROGRESS_HEARTBEAT_MS;
    if (this.now() - this.lastWriteMs >= heartbeatMs) {
      this.record(
        `heartbeat · step: ${this.step ?? "none"} · host: ${this.host ?? LOCAL_HOST}`,
        {},
      );
    }
  }

  /** Close the log with the run's outcome and stop polling. Never persists. */
  stop(outcome?: string): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const note = outcome ? ` · ${outcome.split("\n")[0]}` : "";
    this.appendLine(`attempt ${this.opts.attempt} ended${note}`);
  }

  private remoteRunSafely(): ActiveRemoteRunInfo | undefined {
    try {
      return this.opts.remoteRun?.();
    } catch {
      return undefined;
    }
  }

  /** Append a line to the log and persist a patch stamped with the same instant. */
  private record(line: string, patch: CloseOutProgressPatch): void {
    const nowMs = this.now();
    this.lastWriteMs = nowMs;
    this.appendLine(line, nowMs);
    try {
      this.opts.persist({ ...patch, lastProgressAt: new Date(nowMs).toISOString() });
    } catch {
      /* a progress write must never disturb the close-out */
    }
  }

  private appendLine(line: string, nowMs: number = this.now()): void {
    try {
      mkdirSync(dirname(this.absPath), { recursive: true });
      appendFileSync(this.absPath, `${new Date(nowMs).toISOString()}  ${line}\n`);
    } catch {
      /* best effort: the job record still carries the live step */
    }
  }
}
