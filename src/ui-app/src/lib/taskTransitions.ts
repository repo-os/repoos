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
