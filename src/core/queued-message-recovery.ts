/**
 * Bounded delivery for a human message queued behind a silent engineer (#1015).
 *
 * A message sent while a turn is running is queued and delivered when that turn
 * ends (#0821). That is correct while the engineer is working — but a turn can
 * be alive and producing nothing: a hung provider call, or an engineer adopted
 * across a server restart whose process outlives the turn that spawned it.
 * Nothing else bounds that case:
 *
 * - The CTO idle nudge deliberately holds on `message-queued` — sending a
 *   reminder would only queue another message behind the first.
 * - The CTO `restart-stalled-agent` action refuses while `isRunning()` is true.
 * - The watchdog's stuck detection treats a live runner row as work.
 *
 * So the message waits indefinitely and the board only ever says "an
 * undelivered message is already queued". This module is the pure half of the
 * fix: once the message has waited past a generous window and the engineer has
 * genuinely stopped talking (no known work child running), the turn is ended so
 * the normal end-of-turn path delivers the message to the resumed engineer.
 *
 * It is deliberately conservative. A long `repoos check`, a test run, a
 * headless browser step, a remote-validation wait or a paused/handing-off turn
 * all keep the message waiting, exactly as the idle-nudge policy does.
 */

/**
 * How long the OLDEST queued message may sit behind a silent engineer before
 * its turn is ended. Matches the runner's one-hour `message_overdue` flag, so
 * the action never fires before the board has already called it overdue.
 */
export const DEFAULT_QUEUED_MESSAGE_STALL_MS = 60 * 60 * 1000;

/** Why a silent-engineer queued-message recovery did not fire. */
export type QueuedMessageRecoverySkip =
  | "not-running"
  | "no-queued-message"
  | "already-recovering"
  | "paused"
  | "handoff-in-flight"
  | "process-gone"
  | "process-busy"
  | "not-silent"
  | "not-overdue";

export interface QueuedMessageRecoverySignals {
  /** RepoOS has a live engineer turn for this task (not a review). */
  running: boolean;
  /** Messages waiting to be delivered. */
  queuedMessages: number;
  /** Milliseconds the OLDEST queued message has waited. */
  oldestQueuedMs: number;
  /** The engineer has produced no output for the runner's stall window. */
  silent: boolean;
  /** A known long-running work child alive in the process group, if any. */
  busyChild: string | null;
  /** The recorded engineer process group still has a live process. */
  processGroupAlive: boolean;
  /** The human deliberately paused this task. */
  paused: boolean;
  /** A handoff is requested or finalizing for this task. */
  handoffInFlight: boolean;
  /** This turn was already ended for the same queued message. */
  alreadyRecovering: boolean;
  /** Override for tests/config; defaults to {@link DEFAULT_QUEUED_MESSAGE_STALL_MS}. */
  thresholdMs?: number;
}

export interface QueuedMessageRecoveryDecision {
  /** True only when every signal says the turn should be ended. */
  recover: boolean;
  /** Null for a recovery; otherwise the first condition that explains the wait. */
  reason: QueuedMessageRecoverySkip | null;
}

/**
 * One verdict. Order matters: the cheapest, most direct explanations first, and
 * "not-overdue" last so a young message never ends a working turn.
 */
export function decideQueuedMessageRecovery(
  signals: QueuedMessageRecoverySignals,
): QueuedMessageRecoveryDecision {
  const skip = (reason: QueuedMessageRecoverySkip): QueuedMessageRecoveryDecision => ({
    recover: false,
    reason,
  });

  if (!signals.running) return skip("not-running");
  if (signals.queuedMessages <= 0) return skip("no-queued-message");
  if (signals.alreadyRecovering) return skip("already-recovering");
  if (signals.paused) return skip("paused");
  if (signals.handoffInFlight) return skip("handoff-in-flight");
  // A dead process group is a phantom runner (#0863), which has its own heal
  // path. Ending the turn here would fight it.
  if (!signals.processGroupAlive) return skip("process-gone");
  if (signals.busyChild) return skip("process-busy");
  if (!signals.silent) return skip("not-silent");
  const threshold = signals.thresholdMs ?? DEFAULT_QUEUED_MESSAGE_STALL_MS;
  if (signals.oldestQueuedMs < threshold) return skip("not-overdue");
  return { recover: true, reason: null };
}
