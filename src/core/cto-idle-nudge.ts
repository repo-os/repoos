/**
 * CTO idle nudge decision (#0873).
 *
 * The monitor used to nudge any active engineer whose worktree had not changed
 * for five minutes. That is not the same as idle: a long `repoos check`, a
 * remote-validation wait, a headless browser step or a thrashing machine
 * (load 90–500, swap full) all leave the worktree untouched while real work is
 * happening. Nudges queue as messages and are delivered at the end of the turn,
 * so a false nudge arrives as noise or as the engineer's next instruction, and
 * it hides the actual cause.
 *
 * This module is the pure half: config resolution and one verdict from a
 * snapshot of process, gate, queue and pressure signals. The monitor gathers
 * the signals; the decision stays table-testable with fakes.
 */

export const DEFAULT_CTO_NUDGE_IDLE_MS = 5 * 60 * 1000;
export const DEFAULT_CTO_NUDGE_COOLDOWN_MS = 60 * 60 * 1000;

/** A nudge below half a minute would just interrupt a normal tool call. */
export const MIN_CTO_NUDGE_IDLE_MS = 30_000;
/** A cooldown shorter than the idle threshold makes one idle stretch repeat. */
export const MIN_CTO_NUDGE_COOLDOWN_MS = 60_000;

/** Why the monitor deliberately did not nudge this tick. */
export type IdleNudgeSkipReason =
  | "paused"
  | "not-running"
  | "handoff-in-flight"
  | "review-running"
  | "phantom-runner"
  | "process-busy"
  | "remote-validation-running"
  | "message-queued"
  | "recent-activity"
  | "below-threshold"
  | "cooldown"
  | "machine-pressure";

export interface IdleNudgeDecision {
  /** True only when every signal says the engineer is genuinely idle. */
  nudge: boolean;
  /** Null for a nudge; otherwise the first condition that explains the silence. */
  reason: IdleNudgeSkipReason | null;
  /** Human-readable detail for logs (pressure reading, busy command, …). */
  detail: string | null;
}

export interface IdleNudgeSignals {
  /** RepoOS has a runner entry for this task. */
  runnerRunning: boolean;
  /** The engineer process group still has a live process. */
  processGroupAlive: boolean;
  /** Name of a known work child that is alive (e.g. "repoos check"), if any. */
  busyChild: string | null;
  /** The human deliberately paused this task. */
  paused: boolean;
  /** A handoff gate is finalizing (check, commit, review handoff). */
  handoffInFlight: boolean;
  /** A handoff request is retained on disk for this task. */
  pendingHandoff: boolean;
  /** A review turn is running for this task. */
  reviewRunning: boolean;
  /** A remote-validation run is waiting on / executing for this task. */
  remoteValidationRunning: boolean;
  /** A message is already queued and not yet delivered. */
  messageQueued: boolean;
  /** The worktree has been written to inside the idle window. */
  recentWorktreeActivity: boolean;
  /** Time since the task's last recorded activity. */
  idleForMs: number;
  /** Configured idle threshold. */
  idleThresholdMs: number;
  /** The task was already nudged inside the cooldown window. */
  cooldownActive: boolean;
  /** Non-null when the machine is under pressure that explains the silence. */
  pressureReason: string | null;
}

/**
 * One verdict. The order matters: a live gate or process is the most direct
 * explanation, then a phantom runner, then queue/activity/cooldown, and
 * machine pressure last — pressure should only be blamed when nothing cheaper
 * explains it.
 */
export function decideIdleNudge(signals: IdleNudgeSignals): IdleNudgeDecision {
  const skip = (reason: IdleNudgeSkipReason, detail: string | null = null): IdleNudgeDecision => ({
    nudge: false,
    reason,
    detail,
  });

  if (signals.paused) return skip("paused");
  if (!signals.runnerRunning) return skip("not-running");
  if (signals.handoffInFlight || signals.pendingHandoff) {
    return skip("handoff-in-flight", "the handoff gate is running");
  }
  if (signals.reviewRunning) return skip("review-running", "a review is running");
  // RepoOS thinks a turn is running but no process (or child) exists: the
  // phantom-runner recovery (#0863) owns this, not a nudge.
  if (!signals.processGroupAlive) {
    return skip(
      "phantom-runner",
      "RepoOS thinks the engineer is running but no process exists (phantom runner, #0863)",
    );
  }
  if (signals.busyChild) {
    return skip("process-busy", `the engineer is running ${signals.busyChild}`);
  }
  if (signals.remoteValidationRunning) {
    return skip("remote-validation-running", "a remote-validation run is active");
  }
  if (signals.messageQueued) {
    return skip("message-queued", "an undelivered message is already queued");
  }
  if (signals.recentWorktreeActivity) return skip("recent-activity");
  if (signals.idleForMs < signals.idleThresholdMs) {
    return skip("below-threshold", `idle for ${formatDuration(signals.idleForMs)}`);
  }
  if (signals.cooldownActive) return skip("cooldown", "nudged recently");
  if (signals.pressureReason) {
    return skip("machine-pressure", `machine under pressure: ${signals.pressureReason}`);
  }
  return { nudge: true, reason: null, detail: null };
}

/** Reasons worth recording on the task's activity log once per idle stretch. */
const RECORDED_SKIP_REASONS = new Set<IdleNudgeSkipReason>([
  "handoff-in-flight",
  "review-running",
  "phantom-runner",
  "process-busy",
  "remote-validation-running",
  "message-queued",
  "machine-pressure",
]);

export function shouldRecordIdleSkip(reason: IdleNudgeSkipReason | null): boolean {
  return reason !== null && RECORDED_SKIP_REASONS.has(reason);
}

/** One-line activity/log text for a skip, or null when nothing should be said. */
export function describeIdleSkip(
  reason: IdleNudgeSkipReason,
  detail: string | null,
): string | null {
  if (!shouldRecordIdleSkip(reason)) return null;
  const label: Record<string, string> = {
    "handoff-in-flight": "handoff gate is running",
    "review-running": "review is running",
    "phantom-runner": "phantom runner — no live process exists",
    "process-busy": "engineer process is busy",
    "remote-validation-running": "remote validation is running",
    "message-queued": "an undelivered message is already queued",
    "machine-pressure": "machine pressure is holding the nudge",
  };
  const base = label[reason] ?? reason;
  return detail && detail !== base ? `${base} (${detail})` : base;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 6) / 10;
  return `${hours}h`;
}

/** The idle threshold in force, falling back to the default on a bad value. */
export function resolveCtoNudgeIdleMs(config?: { cto?: { nudgeIdleMs?: number } }): number {
  const raw = config?.cto?.nudgeIdleMs;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= MIN_CTO_NUDGE_IDLE_MS
    ? Math.floor(raw)
    : DEFAULT_CTO_NUDGE_IDLE_MS;
}

/** The cooldown in force, falling back to the default on a bad value. */
export function resolveCtoNudgeCooldownMs(config?: { cto?: { nudgeCooldownMs?: number } }): number {
  const raw = config?.cto?.nudgeCooldownMs;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= MIN_CTO_NUDGE_COOLDOWN_MS
    ? Math.floor(raw)
    : DEFAULT_CTO_NUDGE_COOLDOWN_MS;
}

/** Process snapshot the monitor polls for one task. */
export interface EngineerProcessState {
  /** RepoOS has a runner entry for the task. */
  tracked: boolean;
  /** The recorded engineer process group still has at least one live process. */
  groupAlive: boolean;
  /** Known long-running work child alive in the group (check, tests, browser). */
  busyChild: string | null;
}

export const NO_ENGINEER_PROCESS: EngineerProcessState = {
  tracked: false,
  groupAlive: false,
  busyChild: null,
};

/**
 * Name a known work child from its command line, or null when the command is
 * not one of the long-running steps an idle nudge must never interrupt.
 * Deliberately narrow: it labels a *known* step, not every descendant.
 */
export function knownWorkProcessLabel(command: string | null | undefined): string | null {
  if (!command) return null;
  const cmd = command.trim();
  if (!cmd) return null;
  if (/(?:^|[\s/])repoos(?:\.js)?\s+check(?:\s|$)/.test(cmd)) return "repoos check";
  if (/\bvitest\b/.test(cmd) || /\brun-tests\.mjs\b/.test(cmd)) return "vitest";
  if (/\bplaywright\b|\bheadless\b|\bchrome\b|\bchromium\b/i.test(cmd)) return "headless browser";
  if (/\bvalidate\.sh\b/.test(cmd)) return "remote validation";
  if (/\bbun(?:x)?\s+run\b/.test(cmd) || /\bbun\s+test\b/.test(cmd)) return "bun";
  if (/(?:^|[\s/])tsc(?:\s|$)/.test(cmd) && /\bbuild\b/.test(cmd)) return "build";
  return null;
}
