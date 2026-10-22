/**
 * Queued-message labels for the chat "queued" popover (#0926).
 *
 * Source is inferred from message text and queue opts — nothing new is stored on
 * disk; `.repoos/queued-messages.json` already carries enough to classify.
 */

export type QueuedMessageSource = "you" | "cto-nudge" | "board-update" | "system";

export interface QueuedMessageQueueOpts {
  resumePreamble?: string;
  skipBoardDivergence?: boolean;
  cwd?: string;
  emitHumanTurn?: boolean;
}

export interface QueuedMessageDetail {
  text: string;
  queuedAt: string;
  source: QueuedMessageSource;
}

const SOURCE_LABEL: Record<QueuedMessageSource, string> = {
  you: "You",
  "cto-nudge": "CTO nudge",
  "board-update": "Board update",
  system: "System",
};

export function queuedMessageSourceLabel(source: QueuedMessageSource): string {
  return SOURCE_LABEL[source];
}

/** Classify one queued record for display. */
export function classifyQueuedMessageSource(
  text: string,
  opts: QueuedMessageQueueOpts = {},
): QueuedMessageSource {
  if (text.startsWith("CTO check-in:")) return "cto-nudge";
  if (text.startsWith("Requirements for #")) return "board-update";
  if (opts.emitHumanTurn) return "you";
  if (opts.skipBoardDivergence) return "system";
  return "you";
}
