/**
 * Reconnect delay for the board's SSE client (#1018).
 *
 * `EventSource` reconnects on its own at the server's `retry:` interval, which
 * is the same for every tab. When the server restarts (or a proxy drops the
 * stream), every open tab therefore retries in lockstep: a reconnect storm can
 * arrive inside the server's own boot window, and each successful reconnect
 * still triggers a full board refresh. Taking the reconnect into our own hands
 * lets us back off exponentially with full jitter, spreading the herd out.
 *
 * Full jitter: `random(cap/2, cap)`. The delay never drops below half the
 * current cap, so a flapping server still gets breathing room instead of a
 * tight retry loop, while the randomness keeps two tabs from syncing up again.
 */

/** First retry window. Deliberately short: a one-off blip should recover fast. */
export const SSE_RECONNECT_BASE_MS = 1_000;
/** Ceiling for the retry window. */
export const SSE_RECONNECT_MAX_MS = 30_000;

/** Exponential cap for the given (zero-based) failed-attempt count. */
export function sseReconnectCap(attempt: number): number {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  return Math.min(SSE_RECONNECT_MAX_MS, SSE_RECONNECT_BASE_MS * 2 ** n);
}

/**
 * Delay before the next reconnect. `random` is injectable so tests can pin the
 * jitter without stubbing Math.random globally.
 */
export function sseReconnectDelay(attempt: number, random: () => number = Math.random): number {
  const cap = sseReconnectCap(attempt);
  const floor = cap / 2;
  const unit = Math.min(1, Math.max(0, random()));
  return Math.round(floor + unit * floor);
}
