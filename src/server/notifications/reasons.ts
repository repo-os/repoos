/**
 * Structured `needsInputReason` values that mean an agent/run failure rather
 * than a human decision prompt. Keep in sync with watchdog / runner writers.
 */
export const AGENT_FAILURE_NEEDS_INPUT_REASONS = new Set([
  "watchdog-stuck",
  "check-failed-after-retries",
  "dev-error",
]);

export function isAgentFailureNeedsInputReason(reason: string | undefined): boolean {
  if (!reason) return false;
  return AGENT_FAILURE_NEEDS_INPUT_REASONS.has(reason.trim());
}
