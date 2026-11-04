/**
 * Copy shared by the board card and the task panel's status region (#1023).
 *
 * A task's live state must read the same on both surfaces: the panel heading is
 * the card's label, not a second paraphrase. Keep these strings here so the two
 * surfaces cannot drift apart again.
 */

/** The card's label while a handoff gate is running. */
export const RUNNING_CHECKS_LABEL = "running checks";

/** The card's label while a handoff gate is running unusually slowly. */
export const RUNNING_CHECKS_SLOW_LABEL = "running checks · slow";

/** The card's label when the visible review predates the latest handoff. */
export const AWAITING_FRESH_REVIEW_LABEL = "awaiting fresh review";

/** The card's label while the automatic reviewer is working. */
export const REVIEWER_RUNNING_LABEL = "Reviewing…";

/** The card's label while a PM run is live on the task. */
export const PM_WORKING_LABEL = "PM is working";

/** The card's label while a ready task's start work is being accepted. */
export const STARTING_LABEL = "Starting…";

/** Handoff check label with the same slow suffix the card appends. */
export function runningChecksLabel(slow: boolean): string {
  return slow ? RUNNING_CHECKS_SLOW_LABEL : RUNNING_CHECKS_LABEL;
}
