/**
 * The close-out scheduler (#1275). It owns which queued jobs run and when:
 * up to `maxParallelValidations` validate at once, a job that is the publish
 * head may always publish, and a pressure hold stops any start beyond the first
 * concurrent run. The server runs each job through `run`; this class decides
 * when, so the same code is what the tests exercise.
 */
import {
  pendingCloseOutJobs,
  selectCloseOutStarts,
  type IntegrationJob,
} from "./integration-job.js";

/** How often a pressure hold is re-checked while queued work waits. */
const DEFAULT_HOLD_RECHECK_MS = 30_000;
/** A run that throws this many times in a row is given up on, not retried forever. */
export const MAX_RUN_CRASHES = 3;
/** Wait before restarting a run that threw: 5s, then 10s (capped at 30s). */
const CRASH_BACKOFF_BASE_MS = 5_000;
const CRASH_BACKOFF_MAX_MS = 30_000;

export interface CloseOutSchedulerOptions {
  /** Every live job record, in any order. */
  jobs: () => IntegrationJob[];
  /** Maximum validations in flight at once. */
  limit: () => number;
  /** True while the memory pressure guard holds new concurrent work. */
  pressureHeld: () => boolean;
  /**
   * Run one job to a stopping point: validated and parked, published, failed or
   * cancelled. Resolves when that run ends; the scheduler then starts whatever
   * the freed slot or the new publish head allows.
   */
  run: (taskId: string) => Promise<void>;
  /** Called after each pump, so the pipeline status can be re-emitted. */
  onChange?: () => void;
  /** Re-check interval while a pressure hold leaves queued work waiting. */
  holdRecheckMs?: number;
  /**
   * Called once when a job's run has thrown {@link MAX_RUN_CRASHES} times in a
   * row. The owner must take the job out of the queue (fail it), or publication
   * behind it would wait on a job that can never finish. If the hand-off throws
   * or rejects, the job is not abandoned: it is retried after a long backoff and
   * handed off again on its next crash.
   */
  onGiveUp?: (taskId: string, error: unknown) => void | Promise<void>;
  /** Clock, injectable for tests. */
  now?: () => number;
}

export class CloseOutScheduler {
  private readonly inFlight = new Set<string>();
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private coolTimer: ReturnType<typeof setTimeout> | null = null;
  /** Consecutive crashes per task, and when a crashed task may start again. */
  private readonly crashes = new Map<string, number>();
  private readonly coolingUntil = new Map<string, number>();
  /** Given-up tasks stay unstarted until they leave the queue (failed or re-enqueued). */
  private readonly abandoned = new Set<string>();

  constructor(private readonly options: CloseOutSchedulerOptions) {}

  /** Task ids with a run in flight. */
  get running(): ReadonlySet<string> {
    return this.inFlight;
  }

  /** Start every run the limits and publish order allow right now. */
  pump(): void {
    const jobs = this.options.jobs();
    const limit = Math.max(1, this.options.limit());
    const waiting = pendingCloseOutJobs(jobs).some((j) => !this.inFlight.has(j.taskId));
    // Consulted whenever work is waiting, not only while a run is live: with none
    // running, the first start is taken and the hold then stops every start after
    // it in this same pass. The first run is never held.
    const holdExtra = waiting && this.options.pressureHeld();
    const now = (this.options.now ?? Date.now)();
    // A given-up job that has left the queue may be enqueued again fresh later.
    const pendingIds = new Set(pendingCloseOutJobs(jobs).map((j) => j.taskId));
    for (const taskId of this.abandoned) if (!pendingIds.has(taskId)) this.abandoned.delete(taskId);
    for (const taskId of selectCloseOutStarts({
      jobs,
      running: this.inFlight,
      limit,
      holdExtra,
      unavailable: new Set(
        [...this.coolingUntil].filter(([, until]) => until > now).map(([taskId]) => taskId),
      ),
    })) {
      // A job given up on is never restarted while it still sits in the queue, so
      // a failed hand-off to `onGiveUp` cannot become an endless crash loop.
      if (this.abandoned.has(taskId)) continue;
      this.start(taskId);
    }
    this.scheduleCoolRecheck(now);
    // A pressure hold must not strand queued work: re-check on a timer.
    if (holdExtra && !this.holdTimer) {
      this.holdTimer = setTimeout(() => {
        this.holdTimer = null;
        this.pump();
      }, this.options.holdRecheckMs ?? DEFAULT_HOLD_RECHECK_MS);
      this.holdTimer.unref?.();
    }
    this.options.onChange?.();
  }

  /** Re-pump when the earliest crash backoff ends, so the retry is not stranded. */
  private scheduleCoolRecheck(now: number): void {
    if (this.coolTimer) return;
    let earliest = Infinity;
    for (const [taskId, until] of this.coolingUntil) {
      if (until <= now) this.coolingUntil.delete(taskId);
      else earliest = Math.min(earliest, until);
    }
    if (earliest === Infinity) return;
    this.coolTimer = setTimeout(() => {
      this.coolTimer = null;
      this.pump();
    }, earliest - now);
    this.coolTimer.unref?.();
  }

  private start(taskId: string): void {
    this.inFlight.add(taskId);
    // A run that throws must still free its slot, or the queue would stall. It is
    // retried after a backoff, a bounded number of times, then handed to
    // `onGiveUp` so a job that can never finish cannot block the queue (#1275).
    void this.options
      .run(taskId)
      .then(() => {
        this.crashes.delete(taskId);
        this.coolingUntil.delete(taskId);
      })
      .catch(async (error: unknown) => {
        const count = (this.crashes.get(taskId) ?? 0) + 1;
        if (count >= MAX_RUN_CRASHES) {
          this.crashes.delete(taskId);
          this.coolingUntil.delete(taskId);
          this.abandoned.add(taskId);
          try {
            await this.options.onGiveUp?.(taskId, error);
          } catch {
            // The hand-off failed, so the job is still pending in the queue.
            // Do not abandon it for good: back off long, and give up again on
            // its very next crash.
            this.abandoned.delete(taskId);
            this.crashes.set(taskId, MAX_RUN_CRASHES - 1);
            this.coolingUntil.set(taskId, (this.options.now ?? Date.now)() + CRASH_BACKOFF_MAX_MS);
          }
          return;
        }
        this.crashes.set(taskId, count);
        const backoff = Math.min(CRASH_BACKOFF_BASE_MS * 2 ** (count - 1), CRASH_BACKOFF_MAX_MS);
        this.coolingUntil.set(taskId, (this.options.now ?? Date.now)() + backoff);
      })
      .finally(() => {
        this.inFlight.delete(taskId);
        this.pump();
      });
  }
}
