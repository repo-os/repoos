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
 * A retry inside the close-out (a rerun of a failed gate, a host failover) is a
 * new attempt: {@link CloseOutProgressRecorder.beginAttempt} moves the recorder
 * onto that attempt's own log, and the log says why it started.
 *
 * Observation only: every write is best-effort and never throws into the
 * close-out. A write that does not land is kept and retried on the next poll,
 * so its step, host and log line are not lost, and `lastProgressAt` only moves
 * when the log line actually landed.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ActiveRemoteRunInfo, RemoteSlotState } from "./remote-validation.js";

/** Host label for a step that runs on the server itself. */
export const LOCAL_HOST = "local";

/** How often the recorder polls the live remote run and checks the heartbeat. */
export const PROGRESS_POLL_MS = 5_000;

/** The log and job record are refreshed at least this often while active. */
export const PROGRESS_HEARTBEAT_MS = 15_000;

/** No progress write for this long means the writer stopped (see module doc). */
export const PROGRESS_STALE_MS = 90_000;

/** Lines kept for retry while the log is unwritable; older ones are dropped. */
const MAX_PENDING_LINES = 100;

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

/**
 * Map a remote-run stage (see `ActiveRemoteRunInfo.stage`) to a close-out step.
 *
 * `run` is the combined build-and-test command on a runner: until the test
 * runner reports its first test (the stage then moves to `test`), the step is
 * the remote validation as a whole, not "running tests" (#1276 review).
 */
export function stepForRemoteStage(stage: string | null | undefined): string | null {
  switch (stage) {
    case "queue":
    case "lock":
      return CLOSE_OUT_STEP.queuedForHost;
    case "bundle":
    case "upload":
      return CLOSE_OUT_STEP.bundling;
    case "run":
      return CLOSE_OUT_STEP.remote;
    case "install":
    case "test":
    case "tests":
      return CLOSE_OUT_STEP.runningTests;
    case "build":
      return CLOSE_OUT_STEP.building;
    default:
      return null;
  }
}

/** Include structured remote test-file progress in both the log and API step. */
export function stepForRemoteRun(run: ActiveRemoteRunInfo): string {
  const step = stepForRemoteStage(run.stage) ?? CLOSE_OUT_STEP.remote;
  const progress = run.testProgress;
  if (step === CLOSE_OUT_STEP.runningTests && progress && progress.total > 0) {
    return `${step} (${progress.done}/${progress.total})`;
  }
  return step;
}

/**
 * Where a run waiting for or holding a host slot shows in the close-out
 * (#1276). A queued run has no host yet, so the record carries none; once the
 * slot is held the step names the host.
 */
export function stepForSlotState(slot: RemoteSlotState): { step: string; host: string | null } {
  if (slot.state === "queued") return { step: CLOSE_OUT_STEP.queuedForHost, host: null };
  return { step: CLOSE_OUT_STEP.remote, host: slot.host };
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
  /**
   * Persists a patch onto the job record, scoped to the attempt it is given.
   * Returns `false` when the record is final (done/failed) and must not change;
   * throws when the write did not land, which the recorder retries.
   */
  persist: (patch: CloseOutProgressPatch, attempt: number) => boolean | void;
  /** Reports observability write failures without changing close-out behavior. */
  onWriteError?: (error: unknown) => void;
  /** The task's live remote run, if one is in flight (host + stage). */
  remoteRun?: () => ActiveRemoteRunInfo | undefined;
  /**
   * Fired after every persisted write (step, host, or heartbeat), so observers
   * (the pipeline snapshot / SSE) see fresh progress and a live `lastProgressAt`
   * without waiting for a stage event (#1276). Observation only: a throwing
   * observer never disturbs the close-out.
   */
  onChange?: () => void;
  /** Clock override for tests; defaults to `Date.now`. */
  now?: () => number;
  pollMs?: number;
  heartbeatMs?: number;
}

/**
 * One attempt's progress recorder. Create one per processing run, call
 * {@link start}, report steps with {@link setStep}, move onto a retry's attempt
 * with {@link beginAttempt}, and call {@link stop} with the run's outcome when
 * it ends.
 */
export class CloseOutProgressRecorder {
  /** Repo-relative path of the current attempt's log. */
  logPath: string;
  private absPath: string;
  private attempt: number;
  private readonly now: () => number;
  private step: string | null = null;
  private host: string | null = null;
  private lastWriteMs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  /** Fields a failed job-record write did not land; sent again with the next write. */
  private pendingPatch: CloseOutProgressPatch = {};
  /** Log lines a failed append did not land; written first on the next write. */
  private pendingLines: Array<{ at: number; text: string }> = [];

  constructor(private readonly opts: CloseOutProgressOptions) {
    this.attempt = opts.attempt;
    this.logPath = progressLogPathFor(opts.taskId, opts.attempt);
    this.absPath = join(opts.root, this.logPath);
    this.now = opts.now ?? Date.now;
  }

  /** Open the log, record the attempt's start, and begin polling. */
  start(): void {
    if (this.stopped) return;
    this.record(`attempt ${this.attempt} started`, { progressLogPath: this.logPath });
    this.timer = setInterval(() => this.tick(), this.opts.pollMs ?? PROGRESS_POLL_MS);
    this.timer.unref?.();
  }

  /**
   * Report the step the attempt is on, and the host it runs on (`null` while no
   * host is held yet).
   */
  setStep(step: string, host: string | null = LOCAL_HOST): void {
    if (this.stopped) return;
    if (step === this.step && host === this.host) return;
    this.step = step;
    this.host = host;
    this.record(`step: ${step}${host ? ` · host: ${host}` : ""}`, {
      step,
      host: host ?? undefined,
    });
  }

  /**
   * Move this run onto a retry's attempt (#1276). The old attempt's log is
   * closed with the reason, the new attempt's log is opened, and the step and
   * host start over until the next {@link setStep}.
   */
  beginAttempt(attempt: number, reason: string): void {
    if (this.stopped || attempt === this.attempt) return;
    const previous = this.attempt;
    const firstLine = reason.split("\n")[0]?.trim() ?? "";
    this.writeLine(`attempt ${previous} ended · retried as attempt ${attempt}: ${firstLine}`);
    this.pendingLines = [];
    this.pendingPatch = {};
    this.attempt = attempt;
    this.logPath = progressLogPathFor(this.opts.taskId, attempt);
    this.absPath = join(this.opts.root, this.logPath);
    this.step = null;
    this.host = null;
    this.lastWriteMs = 0;
    this.record(`attempt ${attempt} started · retry of attempt ${previous}: ${firstLine}`, {
      progressLogPath: this.logPath,
    });
  }

  /**
   * One poll: follow the live remote run's host and stage, and write a heartbeat
   * if the last write is older than the heartbeat interval. A write that failed
   * leaves `lastWriteMs` behind, so the next poll retries it. Exposed for tests;
   * the timer calls it.
   */
  tick(): void {
    if (this.stopped) return;
    const run = this.remoteRunSafely();
    if (run) {
      this.setStep(stepForRemoteRun(run), run.host);
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
    this.writeLine(`attempt ${this.attempt} ended${note}`);
  }

  private remoteRunSafely(): ActiveRemoteRunInfo | undefined {
    try {
      return this.opts.remoteRun?.();
    } catch {
      return undefined;
    }
  }

  /**
   * Append a line and persist a patch, both stamped with the same instant. The
   * log line and the patch are retried independently: `lastProgressAt` is sent
   * only when the log line landed, and `lastWriteMs` (which paces heartbeats)
   * only moves when the job record took the write too.
   */
  private record(text: string, patch: CloseOutProgressPatch): void {
    const nowMs = this.now();
    this.pendingLines.push({ at: nowMs, text });
    this.pendingLines = this.pendingLines.slice(-MAX_PENDING_LINES);
    this.pendingPatch = { ...this.pendingPatch, ...patch };
    const logWritten = this.drainLines();
    let persisted = false;
    let failed = false;
    try {
      const result = this.opts.persist(
        {
          ...this.pendingPatch,
          ...(logWritten ? { lastProgressAt: new Date(nowMs).toISOString() } : {}),
        },
        this.attempt,
      );
      // A `false` answer means the record is final: nothing more will land, so
      // the fields are dropped rather than retried forever.
      persisted = result !== false;
      this.pendingPatch = {};
    } catch (error) {
      failed = true;
      this.reportWriteError(error);
    }
    if (!failed && logWritten) this.lastWriteMs = nowMs;
    if (!logWritten) this.reportWriteError(new Error(`Could not append ${this.logPath}`));
    if (persisted) this.notifyChange();
  }

  /** Append one line now (or retry the pending ones first); returns whether it landed. */
  private writeLine(text: string): boolean {
    this.pendingLines.push({ at: this.now(), text });
    return this.drainLines();
  }

  /** Append every pending line in order; keeps them all when the append fails. */
  private drainLines(): boolean {
    if (this.pendingLines.length === 0) return true;
    try {
      mkdirSync(dirname(this.absPath), { recursive: true });
      appendFileSync(
        this.absPath,
        this.pendingLines.map((l) => `${new Date(l.at).toISOString()}  ${l.text}\n`).join(""),
      );
      this.pendingLines = [];
      return true;
    } catch {
      return false;
    }
  }

  private notifyChange(): void {
    try {
      this.opts.onChange?.();
    } catch {
      /* an observer must never disturb the close-out */
    }
  }

  private reportWriteError(error: unknown): void {
    try {
      this.opts.onWriteError?.(error);
    } catch {
      /* observer only */
    }
  }
}
