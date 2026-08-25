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
