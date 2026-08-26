/**
 * Client-side mirror of server/task-transitions.ts's GENERIC_PATCH_EDGES — the
 * six bare-status-write edges with no side effect requiring a dedicated
 * action (Start work, Move to done, Abandon work, Reopen). Kept as the single
 * client source of truth so the status dropdown and board drag-drop can't
 * drift apart on which moves are actually valid.
 *
 * The dropdown only ever offers these six — a bare status write is all it
 * does. Drag-drop is allowed a couple more (DRAG_ACTION_TARGETS below):
 * dropping a card is a deliberate enough gesture, and a real column to drop
 * it on, that it can trigger the same dedicated action the equivalent button
 * would — not just the subset that happens to be a bare write.
 */
export const GENERIC_PATCH_TARGETS: Record<string, string[]> = {
  draft: ["inbox"],
  inbox: ["draft", "ready"],
  ready: ["inbox"],
  active: ["review"],
  review: ["active"],
  done: [],
};

/**
 * Edges board drag-drop performs via their real action instead of a bare
 * status write — BoardColumn's onDrop special-cases each of these exactly
 * like it already did for review -> done (completeTask), so dragging behaves
 * identically to clicking the equivalent button (Start work), dirty-worktree
 * confirmation included. Abandon work and Reopen are deliberately NOT here:
 * both stop something in progress (an agent, a review, a done task's
 * history) behind an explicit confirm(), which an easy-to-trigger-by-accident
 * drag gesture shouldn't be able to skip past.
 */
export const DRAG_ACTION_TARGETS: Record<string, string[]> = {
  ready: ["active"],
  review: ["done"],
};

/**
 * Whether dragging a task currently at `from` onto a column for `to` is a
 * valid board move — a generic-patch edge, or one of the two drag-action
 * edges above. Excludes the no-op of dropping a card back on its own column.
 * Live agent/review state (is the task actually running, is a review
 * in-flight) isn't known here — BoardColumn layers those checks on top for
 * the edges that need them.
 */
export function isValidBoardMove(from: string, to: string): boolean {
  if (from === to) return false;
  if (GENERIC_PATCH_TARGETS[from]?.includes(to)) return true;
  return DRAG_ACTION_TARGETS[from]?.includes(to) ?? false;
}

/** Which dedicated action actually performs each edge drag-drop can't do
 *  directly — for a helpful rejection message, not for validity itself. */
const ACTION_HINTS: Record<string, string> = {
  "active->ready": "Abandon work",
  "review->ready": "Abandon work",
  "done->ready": "Reopen",
};

/**
 * Human-readable reason a board drag from `from` to `to` is invalid — shown
 * as a toast the moment the drag hovers an invalid column, same message a
 * rejected drop used to only surface after the fact. Callers should only
 * invoke this for a move `isValidBoardMove` (or their own extra checks, e.g.
 * BoardColumn's live running/review-state checks) has already rejected.
 */
export function boardMoveRejectionReason(from: string, to: string): string {
  const hint = ACTION_HINTS[`${from}->${to}`];
  if (hint) return `Can't drag "${from}" straight to "${to}" — use ${hint} instead.`;
  return `A task can't move directly from "${from}" to "${to}".`;
}
