import { ref } from "vue";
import type { Column } from "../stores/repo";

/**
 * Shared collapsed-column state for the board (#0290). BoardColumn used to own
 * a module-local Set of collapsed column ids; WorkView's keyboard navigation
 * also needs to know which columns are collapsed so the highlight can never
 * reach a hidden row. Keeping the state here gives both consumers one source
 * of truth driven by the same localStorage key.
 */
const COLLAPSE_KEY = "repoos.board.collapsed";

function readRaw(): string | null {
  try {
    return localStorage.getItem(COLLAPSE_KEY);
  } catch {
    return null;
  }
}

/** True when the user has ever persisted a collapse preference (even an empty
 *  list). Mirrors BoardColumn's prior `hasSavedState` — defaults only apply
 *  when the key has never been written. */
const hadSavedState = readRaw() !== null;

function readSaved(): string[] {
  try {
    const raw = readRaw();
    if (raw === null) return [];
    const parsed = JSON.parse(raw) ?? [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const collapsedIds = ref<Set<string>>(new Set(readSaved()));

function persist(): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsedIds.value]));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

/** True when the given column is collapsed in the board. */
export function isColumnCollapsed(colId: string): boolean {
  return collapsedIds.value.has(colId);
}

/** Currently collapsed column ids, as a reactive ref so dependents (e.g. the
 *  board's keyboard navigation) can recompute when a column is toggled. */
export const collapsedColumnIds = collapsedIds;

/** Toggle a column's collapsed state, persisting the change. */
export function toggleColumnCollapsed(colId: string): void {
  const s = new Set(collapsedIds.value);
  if (s.has(colId)) s.delete(colId);
  else s.add(colId);
  collapsedIds.value = s;
  persist();
}

/** Signature of the repo store's per-status task lookup, passed in by callers
 *  so this module stays store-agnostic (same pattern as applyCollapseDefaults). */
export type StatusCount = (statusId: string) => unknown[];

/**
 * True when at least one board column with no tasks is currently expanded —
 * i.e. the bulk toggle's next action is "collapse the empty columns" (#0328).
 * When every empty column is already collapsed (or none exists) the next
 * action is "expand all columns".
 */
export function hasExpandedEmptyColumn(
  byStatus: StatusCount,
  columnIds: readonly string[],
): boolean {
  return columnIds.some((id) => byStatus(id).length === 0 && !collapsedIds.value.has(id));
}

/**
 * Collapse every column whose live task count is zero (#0328). Columns holding
 * tasks are never touched, and columns already collapsed stay collapsed.
 * Persists like a manual collapse. Returns true when the collapsed set changed.
 */
export function collapseAllEmpty(byStatus: StatusCount, columnIds: readonly string[]): boolean {
  const next = new Set(collapsedIds.value);
  let changed = false;
  for (const id of columnIds) {
    if (byStatus(id).length === 0 && !next.has(id)) {
      next.add(id);
      changed = true;
    }
  }
  if (changed) {
    collapsedIds.value = next;
    persist();
  }
  return changed;
}

/**
 * Expand every board column — empty and non-empty — including columns the
 * user had collapsed individually (#0328). Persists. Returns true when the
 * collapsed set changed.
 */
export function expandAll(columnIds: readonly string[]): boolean {
  const next = new Set(collapsedIds.value);
  let changed = false;
  for (const id of columnIds) {
    if (next.delete(id)) changed = true;
  }
  if (changed) {
    collapsedIds.value = next;
    persist();
  }
  return changed;
}

/**
 * Auto-open one collapsed column (#0328): called by the board when a status's
 * live task count transitions 0 → ≥1, so a task arriving in a collapsed
 * column is visible no matter what moved it there (drag-and-drop, a
 * task-panel action, or an SSE update from another client). One-directional
 * by design — a column that becomes empty is never auto-collapsed; only the
 * user and the bulk toggle ever close columns. Returns true when the column
 * was expanded.
 */
export function revealOnArrival(colId: string): boolean {
  if (!collapsedIds.value.has(colId)) return false;
  const next = new Set(collapsedIds.value);
  next.delete(colId);
  collapsedIds.value = next;
  persist();
  return true;
}

/**
 * Expand every collapsed column whose status just went from no tasks to at
 * least one (#0328). Callers pass the previous and current per-status count
 * snapshots so only genuine 0 → ≥1 arrivals fire — identical snapshots (an
 * unrelated re-render) and count decreases are no-ops, so an empty column is
 * never auto-closed.
 */
export function revealArrivals(
  prev: Readonly<Record<string, number>>,
  now: Readonly<Record<string, number>>,
): void {
  for (const [id, count] of Object.entries(now)) {
    if (count > 0 && (prev[id] ?? 0) === 0) revealOnArrival(id);
  }
}

let defaultsApplied = false;

/**
 * Apply "collapse empty columns" defaults once, only when the user has no saved
 * state. Mirrors BoardColumn's previous load-time behavior.
 */
export function applyCollapseDefaults(repo: {
  byStatus: (s: string) => unknown[];
  columns: readonly Column[];
}): void {
  if (defaultsApplied) return;
  defaultsApplied = true;
  if (hadSavedState) return;
  const ids = ["draft", ...repo.columns.map((c) => c.id)];
  collapsedIds.value = new Set(ids.filter((id) => repo.byStatus(id).length === 0));
  persist();
}
