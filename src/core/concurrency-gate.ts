/** The caller's deadline passed while the job was still queued (#0521, #0836). */
export class QueueDeadlineError extends Error {}

/** A queued acquire: its resolve, plus the deadline timer that may cancel it. */
interface GateWaiter {
  resolve: () => void;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * FIFO concurrency limiter (#0520, #0836). A released slot is handed straight
 * to the next waiter so a burst cannot overshoot the limit.
 */
export class ConcurrencyGate {
  private active = 0;
  private readonly waiters: GateWaiter[] = [];

  constructor(readonly limit: number) {}

  /** Runs in flight plus runs waiting — what a new arrival queues behind. */
  get pending(): number {
    return this.active + this.waiters.length;
  }

  get activeCount(): number {
    return this.active;
  }

  async acquire(
    onQueued?: (ahead: number) => void,
    opts: { deadlineAt?: number } = {},
  ): Promise<() => void> {
    if (this.active < this.limit) {
      this.active++;
    } else {
      onQueued?.(this.pending);
      await new Promise<void>((resolve, reject) => {
        if (opts.deadlineAt !== undefined && opts.deadlineAt <= Date.now()) {
          reject(
            new QueueDeadlineError("the caller's deadline passed before a slot was free"),
          );
          return;
        }
        const waiter: GateWaiter = { resolve };
        if (opts.deadlineAt !== undefined) {
          waiter.timer = setTimeout(() => {
            const i = this.waiters.indexOf(waiter);
            if (i === -1) return;
            this.waiters.splice(i, 1);
            reject(
              new QueueDeadlineError(
                "the caller's deadline passed while this run was queued — it was cancelled",
              ),
            );
          }, opts.deadlineAt - Date.now());
          waiter.timer.unref?.();
        }
        this.waiters.push(waiter);
      });
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        if (next.timer) clearTimeout(next.timer);
        next.resolve();
      } else this.active--;
    };
  }
}
