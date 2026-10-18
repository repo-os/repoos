/**
 * Expand/collapse rules for Debug tab log rows (#0829).
 * Uses a length threshold instead of layout measurement so unit tests stay stable.
 */
import type { DebugEventKind } from "./debug-event-copy.js";

export interface ExpandableDebugEvent {
  kind: DebugEventKind;
  title: string;
  detail?: string;
}

/** Titles longer than this are treated as truncated in the one-line row. */
export const DEBUG_TITLE_EXPAND_THRESHOLD = 72;

export function debugEventExpandable(e: ExpandableDebugEvent): boolean {
  if (e.kind === "check") return true;
  const detail = e.detail?.trim();
  const title = e.title.trim();
  if (detail && detail !== title) return true;
  if (detail && detail === title) return true;
  if (!detail && title.length >= DEBUG_TITLE_EXPAND_THRESHOLD) return true;
  return false;
}

/** Full message block shown above structured detail when expanded. */
export function debugEventExpandedMessage(e: ExpandableDebugEvent): string | null {
  if (!debugEventExpandable(e)) return null;
  if (e.kind === "check") {
    return e.title.length >= DEBUG_TITLE_EXPAND_THRESHOLD ? e.title : null;
  }
  return e.title;
}

/** Structured detail below the message (JSON, etc.) — never duplicates the title. */
export function debugEventExpandedDetail(e: ExpandableDebugEvent): string | null {
  if (!debugEventExpandable(e) || e.kind === "check") return null;
  const detail = e.detail?.trim();
  const title = e.title.trim();
  if (!detail || detail === title) return null;
  return e.detail ?? null;
}
