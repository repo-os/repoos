/**
 * Expand/collapse rules for Debug tab log rows (#0829).
 * Title-only rows rely on layout truncation (scrollWidth > clientWidth), measured
 * in {@link DebugPanel.vue}; other kinds expand from structured detail alone.
 */
import type { DebugEventKind } from "./debug-event-copy.js";

export interface ExpandableDebugEvent {
  kind: DebugEventKind;
  title: string;
  detail?: string;
  failureSummary?: string;
  checkOutput?: string;
}

export interface DebugEventExpandOpts {
  /** Set when the one-line title cell is visually ellipsized. */
  titleTruncated?: boolean;
}

/** Whether a rendered title element is truncated by `text-overflow: ellipsis`. */
export function isTitleVisuallyTruncated(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

function checkRowHasExpandableBody(e: ExpandableDebugEvent): boolean {
  return Boolean(e.failureSummary?.trim() || e.checkOutput?.trim());
}

export function debugEventExpandable(
  e: ExpandableDebugEvent,
  opts?: DebugEventExpandOpts,
): boolean {
  if (e.kind === "check") {
    return checkRowHasExpandableBody(e) || Boolean(opts?.titleTruncated);
  }
  const detail = e.detail?.trim();
  const title = e.title.trim();
  if (detail && detail !== title) return true;
  if (detail && detail === title) return true;
  if (!detail && opts?.titleTruncated) return true;
  return false;
}

/** Full message block shown above structured detail when expanded. */
export function debugEventExpandedMessage(
  e: ExpandableDebugEvent,
  opts?: DebugEventExpandOpts,
): string | null {
  if (!debugEventExpandable(e, opts)) return null;
  if (e.kind === "check") {
    return opts?.titleTruncated ? e.title : null;
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
