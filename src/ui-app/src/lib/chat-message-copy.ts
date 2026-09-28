import { bubbleRole, type DisplayRow } from "./chat-rows.js";

const INTERACTIVE_SELECTOR = "a, button, input, textarea, select";

/** True when the row is a human or assistant message bubble that can be copied. */
export function isCopyableBubbleRow(row: DisplayRow): boolean {
  return copyTextForBubbleRow(row) !== null;
}

/** Plain text to copy for a bubble chat row, or null when the row is not a message. */
export function copyTextForBubbleRow(row: DisplayRow): string | null {
  const role = bubbleRole(row);
  if (role !== "human" && role !== "assistant") return null;
  if (row.kind === "tools") return null;
  const text = row.text;
  return text.length > 0 ? text : null;
}

/** Plain text to copy for TaskDrawer agent/review rows (`human` / `text` only). */
export function copyTextForTaskDrawerRow(row: DisplayRow): string | null {
  if (row.kind === "human" || row.kind === "text") {
    return row.text.length > 0 ? row.text : null;
  }
  return null;
}

/**
 * Whether a bubble click should trigger copy-to-clipboard.
 * Suppresses when the user selected text or clicked an interactive control.
 */
export function shouldCopyMessageOnClick(event: MouseEvent): boolean {
  const target = event.target;
  if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) {
    return false;
  }
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && selection.toString().length > 0) {
    return false;
  }
  return true;
}
