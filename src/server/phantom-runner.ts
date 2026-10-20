/**
 * Decide when an in-memory runner row is a phantom: the table says the
 * engineer is running, but neither that process nor any child in its recorded
 * group is alive (#0863).
 *
 * This is an input to the existing stalled-agent recovery (clear the row,
 * then restart through the same engineer launch the CTO uses). It never
 * signals a process by name, and a live child (check, vitest, remote
 * validation wait) keeps the row.
 */

export const DEFAULT_PHANTOM_DETECT_MS = 2 * 60 * 1000;
export const MIN_PHANTOM_DETECT_MS = 15_000;
export const DEFAULT_PHANTOM_HEAL_MAX = 3;
export const DEFAULT_PHANTOM_HEAL_WINDOW_MS = 60 * 60 * 1000;

export const PHANTOM_RESTARTED_NOTE = "phantom runner detected: no live process, restarted";
export const PHANTOM_RATE_LIMITED_NOTE =
  "phantom runner detected: no live process, restart rate limited";

export type PhantomAction = "keep" | "wait" | "heal" | "rate-limited";

export interface PhantomDecisionInput {
  /** An in-memory runner row exists for this task. */
  hasEntry: boolean;
  /** Review turns are not engineer phantoms. */
  review?: boolean;
  /** A human pause must not be restarted. */
  paused?: boolean;
  /** Handoff finalization owns the task; the engineer process is already gone. */
  handoff?: boolean;
  /** The recorded engineer PID answers a liveness probe. */
  selfAlive: boolean;
  /** Live PIDs in the recorded process group other than the engineer itself. */
  liveChildren: number;
  /** When the tree was first observed fully dead, or null if it has not been. */
  deadSinceMs: number | null;
  nowMs: number;
  /** Quiet period the tree must stay dead before an automatic heal. */
  detectMs: number;
  /** Heals already recorded inside the rate-limit window. */
  recentHeals: number;
  maxHeals: number;
  /**
   * `repoos start` / the UI Start action: a dead tree is released immediately
   * so the launch is not refused as "already running".
   */
  explicitStart?: boolean;
}

export interface PhantomDecision {
  action: PhantomAction;
  /** Updated first-seen timestamp; null when the tree is live or there is no row. */
  deadSinceMs: number | null;
}

export function decidePhantom(input: PhantomDecisionInput): PhantomDecision {
  if (!input.hasEntry || input.review || input.paused || input.handoff) {
    return { action: "keep", deadSinceMs: null };
  }
  if (input.selfAlive || input.liveChildren > 0) {
    return { action: "keep", deadSinceMs: null };
  }
  const deadSinceMs = input.deadSinceMs ?? input.nowMs;
  const detectMs = Math.max(MIN_PHANTOM_DETECT_MS, input.detectMs);
  if (!input.explicitStart && input.nowMs - deadSinceMs < detectMs) {
    return { action: "wait", deadSinceMs };
  }
  // An explicit Start always clears a dead row. The cap bounds only automatic restarts.
  if (!input.explicitStart && input.recentHeals >= input.maxHeals) {
    return { action: "rate-limited", deadSinceMs: null };
  }
  return { action: "heal", deadSinceMs: null };
}
