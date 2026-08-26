/**
 * Client-side mirror of server/task-transitions.ts's GENERIC_PATCH_EDGES — the
 * six bare-status-write edges with no side effect requiring a dedicated
 * action (Start work, Move to done, Abandon work, Reopen). Kept as the single
 * client source of truth so the status dropdown and board drag-drop can't
 * drift apart on which moves are actually valid.
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
 * Whether dragging a task currently at `from` onto a column for `to` is a
 * valid board move — either one of the six generic-patch edges, or the
 * special review-only drop onto `done` that BoardColumn's drag handler
 * performs via `completeTask` instead of a bare status write. Excludes the
 * no-op of dropping a card back on its own column.
 */
export function isValidBoardMove(from: string, to: string): boolean {
  if (from === to) return false;
  if (to === "done") return from === "review";
  return GENERIC_PATCH_TARGETS[from]?.includes(to) ?? false;
}

/** Which dedicated action actually performs each non-generic edge — for a
 *  helpful rejection message, not for validity itself (see isValidBoardMove
 *  and BoardColumn's own done-specific checks, which need live agent/review
 *  state this table doesn't have). */
const ACTION_HINTS: Record<string, string> = {
  "ready->active": "Start work",
  "active->ready": "Abandon work",
  "review->ready": "Abandon work",
  "done->ready": "Reopen",
  "review->done": "Move to done",
};

/**
 * Human-readable reason a board drag from `from` to `to` is invalid — shown
 * as a toast the moment the drag hovers an invalid column, same message a
 * rejected drop used to only surface after the fact. Callers should only
 * invoke this for a move `isValidBoardMove` (or their own extra checks, e.g.
 * BoardColumn's live review-running check for `done`) has already rejected.
 */
export function boardMoveRejectionReason(from: string, to: string): string {
  const hint = ACTION_HINTS[`${from}->${to}`];
  if (hint) return `Can't drag "${from}" straight to "${to}" — use ${hint} instead.`;
  return `A task can't move directly from "${from}" to "${to}".`;
}
