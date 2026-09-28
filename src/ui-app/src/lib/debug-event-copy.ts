/**
 * Plain-text extraction for task debug log entries, so clicking a card in the
 * Debug tab can copy its full content the same way chat bubbles copy their
 * message text (`chat-message-copy.ts`).
 *
 * A check event's output is included even when the row is collapsed: the whole
 * point of click-to-copy is to paste an entry into a bug report without having
 * to expand and drag-select it first.
 */
export type DebugEventKind = "activity" | "log" | "check" | "remote";

export interface CopyableDebugEvent {
  kind: DebugEventKind;
  title: string;
  /** Log context JSON, or the activity/remote body. */
  detail?: string;
  /** Short failure summary for a failed check run. */
  failureSummary?: string;
  /** Full check output — set on check events regardless of expansion. */
  checkOutput?: string;
}

/**
 * Text to copy for a debug event, or null when the entry carries no text.
 *
 * Ordering mirrors the expanded card: title, then failure summary, then the
 * body (context JSON / check output). Missing parts are omitted rather than
 * leaving blank lines.
 */
export function copyTextForDebugEvent(e: CopyableDebugEvent): string | null {
  const parts: string[] = [];
  const title = e.title.trim();
  if (title) parts.push(title);

  if (e.kind === "check") {
    const summary = e.failureSummary?.trim();
    if (summary) parts.push(summary);
    if (e.checkOutput) parts.push(e.checkOutput);
  } else {
    const detail = e.detail?.trim();
    // Activity and remote events currently carry the same text as both title
    // and detail; don't paste it twice.
    if (detail && detail !== title) parts.push(e.detail as string);
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

/** Whether a debug event has anything worth copying. */
export function canCopyDebugEvent(e: CopyableDebugEvent): boolean {
  return copyTextForDebugEvent(e) !== null;
}
