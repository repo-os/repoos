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
}

export class CloseOutScheduler {
  private readonly inFlight = new Set<string>();
  private holdTimer: ReturnType<typeof setTimeout> | null = null;

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
    for (const taskId of selectCloseOutStarts({
      jobs,
      running: this.inFlight,
      limit,
      holdExtra,
    })) {
      this.start(taskId);
    }
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

  private start(taskId: string): void {
    this.inFlight.add(taskId);
    // A run that throws must still free its slot, or the queue would stall.
    void this.options
      .run(taskId)
      .catch(() => {
        /* the run reports its own failure; the slot is what matters here */
      })
      .finally(() => {
        this.inFlight.delete(taskId);
        this.pump();
      });
  }
}
