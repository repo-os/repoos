/**
 * Removes the tasks a board filter hides from one column's list (#1251).
 *
 * Returns the same array when nothing in the column is hidden. BoardColumn
 * keys its done-column sort on the array it is given, so a column whose
 * membership did not change must keep its identity. A filter toggle that only
 * touches other columns then leaves the Done list (about 1000 cards on a large
 * board) unsorted and unrendered.
 */
export function withoutHiddenTasks<T extends { id: string }>(
  tasks: T[],
  hidden: ReadonlySet<string>,
): T[] {
  if (!hidden.size || !tasks.some((t) => hidden.has(t.id))) return tasks;
  return tasks.filter((t) => !hidden.has(t.id));
}

/**
 * Returns `prev` when `next` holds the same ids, otherwise `next`. A computed
 * that returns this keeps its identity, so Vue does not re-render the board on
 * a recompute that changed nothing (#1251). The held list re-derives every
 * second while a hold is active, so without this the whole board re-rendered
 * once a second.
 */
export function keepSameIds(
  next: ReadonlySet<string>,
  prev: ReadonlySet<string>,
): ReadonlySet<string> {
  if (next.size !== prev.size) return next;
  for (const id of next) if (!prev.has(id)) return next;
  return prev;
}

/** Returns `prev` when `next` has the same tasks in the same order, otherwise
 *  `next`. The store's held list is re-derived every second while a hold is
 *  active; keeping the array lets the board skip a re-render on ticks that
 *  changed nothing (#1251). */
export function keepSameList<T>(next: T[], prev: T[]): T[] {
  if (next.length !== prev.length) return next;
  for (let i = 0; i < next.length; i++) if (next[i] !== prev[i]) return next;
  return prev;
}
