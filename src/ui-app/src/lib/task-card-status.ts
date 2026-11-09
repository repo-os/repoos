import { DEFAULT_CHECK_STALL_MS } from "../../../core/active-task-card.js";
import type { CheckProgress } from "./check-progress.js";
import { formatChecksCardLine } from "./checks-card-status.js";

export interface SharedTaskCardStatusInput {
  handoffInFlight: boolean;
  handoffState?: string | null;
  handoffStep?: string | null;
  handoffRequested?: boolean;
  checkInFlight: boolean;
  remoteValidationInFlight: boolean;
  checkProgress?: CheckProgress | null;
  checkStartedAt?: string | null;
  checkSlotAgeMs?: number | null;
  checkOutput?: string | null;
  slowCheck?: boolean;
  queued: boolean;
  queuedLabel?: string | null;
  running: boolean;
  paused: boolean;
  needsInput?: boolean;
  needsInputLabel?: string | null;
  pmWorking?: boolean;
  stuckSignal: boolean;
  quietForMs: number | null;
  nowMs: number;
  remoteActivityLabel?: string | null;
  codingLabel?: string | null;
}

export interface SharedTaskCardStatus {
  kind: "checks" | "queued" | "coding" | "stuck" | "paused" | "needs-input" | "pm-working";
  label: string;
  inFlight: boolean;
  stuck: boolean;
  action: "pause" | "restart" | null;
}

/**
 * Shared Board/Pipeline lifecycle state for an active task. Live server work
 * wins over stale telemetry, while prolonged silence can surface as stuck
 * even when the agent process still appears to be running.
 */
export function resolveSharedTaskCardStatus(
  input: SharedTaskCardStatusInput,
): SharedTaskCardStatus {
  const handoffRunning = input.handoffInFlight || input.handoffState === "running";
  if (input.handoffRequested && !handoffRunning) {
    return {
      kind: "checks",
      label: "Confirming handoff",
      inFlight: true,
      stuck: false,
      action: null,
    };
  }
  if (handoffRunning || input.checkInFlight) {
    return {
      kind: "checks",
      label: formatChecksCardLine({
        nowMs: input.nowMs,
        startedAt: input.checkStartedAt,
        progress: input.checkProgress,
        handoffStep: input.handoffStep,
        checkOutput: input.checkOutput,
        slow: input.slowCheck,
        slotAgeMs: input.checkSlotAgeMs,
      }),
      inFlight: true,
      stuck: false,
      action: null,
    };
  }

  if (input.remoteValidationInFlight) {
    return {
      kind: "checks",
      label: input.remoteActivityLabel ?? "Running checks",
      inFlight: true,
      stuck: false,
      action: null,
    };
  }

  if (input.queued) {
    return {
      kind: "queued",
      label: input.queuedLabel ?? "Queued",
      inFlight: false,
      stuck: false,
      action: null,
    };
  }

  const quietPastThreshold = input.quietForMs != null && input.quietForMs >= DEFAULT_CHECK_STALL_MS;
  if (!input.paused && input.stuckSignal && quietPastThreshold) {
    return { kind: "stuck", label: "Stuck", inFlight: false, stuck: true, action: "restart" };
  }

  if (input.running) {
    return {
      kind: "coding",
      label: input.codingLabel ?? "Coding",
      inFlight: true,
      stuck: false,
      action: "pause",
    };
  }

  if (input.needsInput) {
    return {
      kind: "needs-input",
      label: input.needsInputLabel ?? "Waiting for you",
      inFlight: false,
      stuck: false,
      action: "restart",
    };
  }

  if (input.pmWorking) {
    return {
      kind: "pm-working",
      label: "PM is working",
      inFlight: true,
      stuck: false,
      action: null,
    };
  }

  // An active task with no live, queued or check work is idle. The explicit
  // pause signal protects a human pause from stale telemetry after the same
  // quiet interval.
  return { kind: "paused", label: "Paused", inFlight: false, stuck: false, action: "restart" };
}
