/**
 * Phantom runners (#0863): an in-memory runner entry whose engineer process
 * and every child in its process group are gone. Detection waits a configurable
 * window so a turn that is exiting normally is not restarted. A live child
 * (check, vitest, remote-validation wait) is never a phantom.
 *
 * The sweep lives on the runner's existing stall timer — the same place adopted
 * PIDs are already polled — rather than a separate recovery loop.
 */

/** Default silence-after-death before an automatic restart. A few minutes. */
export const DEFAULT_PHANTOM_DETECT_MS = 3 * 60 * 1000;

/** Parser and Settings floor. Smaller values are ignored. */
export const MIN_PHANTOM_DETECT_MS = 15_000;

/** Automatic restarts per task inside this window. */
export const PHANTOM_HEAL_WINDOW_MS = 60 * 60 * 1000;

export const PHANTOM_HEAL_MAX = 3;

export const PHANTOM_RESTARTED_NOTE = "phantom runner detected: no live process, restarted";

export const PHANTOM_RATE_LIMITED_NOTE =
  "phantom runner detected: no live process, restart rate-limited";

export type PhantomClass = "live" | "watching" | "heal" | "rate-limited";

export function runnerGroupAlive(
  leaderPid: number | undefined,
  listLive: (leader: number) => number[],
): boolean {
  if (leaderPid == null || !Number.isFinite(leaderPid) || leaderPid <= 0) return false;
  return listLive(leaderPid).length > 0;
}

/** Drop heal timestamps that have aged out of the rate-limit window. */
export function recentPhantomHeals(stamps: readonly number[], nowMs: number): number[] {
  return stamps.filter((t) => nowMs - t < PHANTOM_HEAL_WINDOW_MS);
}

/**
 * Classify one runner entry. `groupAlive` is true when the engineer PID or any
 * recorded child is still alive. `deadSinceMs` is when the group was first
 * observed gone (null if it has never been seen dead).
 */
export function classifyPhantom(input: {
  hasEntry: boolean;
  groupAlive: boolean;
  deadSinceMs: number | null;
  nowMs: number;
  detectMs: number;
  healTimestampsMs: readonly number[];
}): PhantomClass {
  if (!input.hasEntry || input.groupAlive) return "live";
  const since = input.deadSinceMs ?? input.nowMs;
  if (input.nowMs - since < input.detectMs) return "watching";
  const recent = recentPhantomHeals(input.healTimestampsMs, input.nowMs);
  if (recent.length >= PHANTOM_HEAL_MAX) return "rate-limited";
  return "heal";
}
