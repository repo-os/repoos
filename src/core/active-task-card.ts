/**
 * Active-task card phase resolution (#1000).
 *
 * Separates agent output silence from local check progress, remote validation
 * queue/run state, and a truly stalled worker. The CTO idle-nudge module
 * (`cto-idle-nudge.ts`) uses a similar signal stack server-side; this module
 * is the pure UI/server read-model for what the board card should say.
 */

/** Mirrors retryHints / task-watchdog default agent-silence window. */
export const DEFAULT_STUCK_SILENCE_MS = 5 * 60 * 1000;

/** Default stall window when check/remote output stops advancing (#0799). */
export const DEFAULT_CHECK_STALL_MS = 3 * 60 * 1000;

export interface ActiveTaskCheckSnapshot {
  running: boolean;
  startedAt: string | null;
  /** Updated on progress markers or output chunks while running. */
  lastProgressAt: string | null;
  progressLabel: string | null;
  scopeLabel: string | null;
  machine: string | null;
}

export interface ActiveTaskRemoteSnapshot {
  run: {
    host: string;
    kind: string;
    stage: string | null;
    startedAt: string;
    elapsedMs: number;
    lastProgressAt: string;
  } | null;
  queue: {
    host: string;
    position: number;
    waitedMs: number;
    kind: string;
  } | null;
  /**
   * Host-lock or engineer SSH wait without a matching server run registry
   * entry — abnormal idle telemetry (#0998).
   */
  telemetryMismatch: string | null;
}

export interface ActiveTaskCardInput {
  nowMs: number;
  agentSilentMs: number | null;
  check: ActiveTaskCheckSnapshot | null;
  remote: ActiveTaskRemoteSnapshot | null;
  localQueueLabel: string | null;
  localQueueTitle: string | null;
  remotePoolQueueLabel: string | null;
  remotePoolQueueTitle: string | null;
  busyChild: string | null;
  stuckSilenceMs?: number;
  checkStallMs?: number;
}

export interface ActiveTaskCardHint {
  label: string;
  title: string;
  /** Board card class suffix (tc-*). */
  cls: "tc-coding" | "tc-stuck" | "tc-moving" | "tc-queued" | "tc-reviewing";
  /** True when restart/pause must not overlap this work without cancel first. */
  blocksAgentInterrupt: boolean;
}

function msSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  const ms = nowMs - Date.parse(iso);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function formatCardDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

function checkHeartbeating(
  check: ActiveTaskCheckSnapshot,
  nowMs: number,
  stallMs: number,
): boolean {
  if (!check.running) return false;
  const idle = msSince(check.lastProgressAt, nowMs);
  return idle !== null && idle < stallMs;
}

function checkStalled(check: ActiveTaskCheckSnapshot, nowMs: number, stallMs: number): boolean {
  if (!check.running) return false;
  // A running check without a valid heartbeat cannot establish progress.
  // Fail closed so it is surfaced as stalled instead of agent silence.
  const idle = msSince(check.lastProgressAt, nowMs);
  return idle === null || idle >= stallMs;
}

function remoteRunHeartbeating(
  run: NonNullable<ActiveTaskRemoteSnapshot["run"]>,
  nowMs: number,
  stallMs: number,
): boolean {
  const idle = msSince(run.lastProgressAt, nowMs);
  return idle !== null && idle < stallMs;
}

/**
 * Resolve the live engineer card hint from independent evidence signals.
 * Order matches {@link decideIdleNudge}: queue waits and known work beat
 * agent-silence "stuck".
 */
export function resolveActiveEngineerCardHint(input: ActiveTaskCardInput): ActiveTaskCardHint {
  const stuckMs = input.stuckSilenceMs ?? DEFAULT_STUCK_SILENCE_MS;
  const stallMs = input.checkStallMs ?? DEFAULT_CHECK_STALL_MS;

  if (input.localQueueLabel) {
    return {
      label: input.localQueueLabel,
      title: input.localQueueTitle ?? input.localQueueLabel,
      cls: "tc-queued",
      blocksAgentInterrupt: true,
    };
  }
  if (input.remotePoolQueueLabel) {
    return {
      label: input.remotePoolQueueLabel,
      title: input.remotePoolQueueTitle ?? input.remotePoolQueueLabel,
      cls: "tc-queued",
      blocksAgentInterrupt: true,
    };
  }

  const check = input.check;
  if (check?.running && checkHeartbeating(check, input.nowMs, stallMs)) {
    const elapsed = formatCardDuration(msSince(check.startedAt, input.nowMs) ?? 0);
    const progress = check.progressLabel ?? "checks running";
    const where = check.machine ? ` on ${check.machine}` : "";
    const scope = check.scopeLabel ? ` · ${check.scopeLabel}` : "";
    return {
      label: `checking · ${progress} · ${elapsed}`,
      title: `Local check is running${where}${scope} — agent output may be quiet while the gate runs.`,
      cls: "tc-reviewing",
      blocksAgentInterrupt: true,
    };
  }

  const remote = input.remote;
  if (remote?.run && remoteRunHeartbeating(remote.run, input.nowMs, stallMs)) {
    const elapsed = formatCardDuration(remote.run.elapsedMs);
    const stage = remote.run.stage ?? "running";
    return {
      label: `remote ${remote.run.kind} · ${stage} · ${elapsed}`,
      title: `Remote validation on ${remote.run.host} — ${stage} for ${elapsed}. Agent output may be quiet while waiting.`,
      cls: "tc-moving",
      blocksAgentInterrupt: true,
    };
  }
  if (remote?.run) {
    const idle = msSince(remote.run.lastProgressAt, input.nowMs);
    const silent = formatCardDuration(idle ?? stallMs);
    return {
      label: `remote validation stalled · ${silent}`,
      title: `Remote validation on ${remote.run.host} (${remote.run.kind}, ${remote.run.stage ?? "running"}) has reported no progress for ${silent}. Check the Runners page and confirm the run has ended through RepoOS before restarting.`,
      cls: "tc-stuck",
      blocksAgentInterrupt: true,
    };
  }
  if (remote?.queue) {
    const waited = formatCardDuration(remote.queue.waitedMs);
    return {
      label: `queued · runner · #${remote.queue.position} · ${waited}`,
      title: `Waiting for a remote runner${remote.queue.host ? ` on ${remote.queue.host}` : ""} — position ${remote.queue.position}, waiting ${waited}.`,
      cls: "tc-queued",
      blocksAgentInterrupt: true,
    };
  }

  if (remote?.telemetryMismatch) {
    return {
      label: "validation wait · telemetry mismatch",
      title: `${remote.telemetryMismatch} Pause the engineer if it is still running, then inspect the Runners page; start stays blocked until the host lock clears or the run is registered.`,
      cls: "tc-stuck",
      blocksAgentInterrupt: true,
    };
  }

  if (check?.running && checkStalled(check, input.nowMs, stallMs)) {
    const silent = formatCardDuration(msSince(check.lastProgressAt, input.nowMs) ?? stallMs);
    const progress = check.progressLabel ?? "no recent progress";
    return {
      label: `check stalled · ${silent}`,
      title: `The local check is still running but has not reported progress for ${silent} (last: ${progress}). Open the task's check output and verify the run has ended through RepoOS before restarting the agent.`,
      cls: "tc-stuck",
      blocksAgentInterrupt: true,
    };
  }

  if (input.busyChild) {
    const elapsed =
      input.agentSilentMs !== null ? formatCardDuration(input.agentSilentMs) : "a while";
    return {
      label: `working · ${input.busyChild} · ${elapsed}`,
      title: `Agent output is quiet but a ${input.busyChild} process is still running in this turn.`,
      cls: "tc-coding",
      blocksAgentInterrupt: true,
    };
  }

  if (input.agentSilentMs !== null && input.agentSilentMs >= stuckMs) {
    return {
      label: `stuck · silent ${formatCardDuration(input.agentSilentMs)}`,
      title:
        "Agent process is still running but has not produced output in a while — it may be hung. Click to inspect, or restart work after any check or validation has finished.",
      cls: "tc-stuck",
      blocksAgentInterrupt: false,
    };
  }

  const activity = input.agentSilentMs !== null ? formatCardDuration(input.agentSilentMs) : null;
  return {
    label: activity ? `coding · active ${activity} ago` : "coding",
    title: "Agent is making code changes — click to watch the session",
    cls: "tc-coding",
    blocksAgentInterrupt: false,
  };
}
