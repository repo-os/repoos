import { ref } from "vue";

/**
 * Collapsed-column state for the Inputs board (#0401). Same shape as the Work
 * board's boardCollapse module, but a separate localStorage key so collapsing
 * an Inputs column never changes the Work board (and vice versa).
 */
const COLLAPSE_KEY = "repoos.inputs.board.collapsed";

function readRaw(): string | null {
  try {
    return localStorage.getItem(COLLAPSE_KEY);
  } catch {
    return null;
  }
}

/** True when the user has ever persisted a collapse preference (even an empty
 *  list). Defaults only apply when the key has never been written. */
let hadSavedState = readRaw() !== null;

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

/** True when the given Inputs board column is collapsed. */
export function isInputColumnCollapsed(colId: string): boolean {
  return collapsedIds.value.has(colId);
}

/** Currently collapsed Inputs column ids (reactive). */
export const collapsedInputColumnIds = collapsedIds;

/** Toggle an Inputs column's collapsed state, persisting the change. */
export function toggleInputColumnCollapsed(colId: string): void {
  const s = new Set(collapsedIds.value);
  if (s.has(colId)) s.delete(colId);
  else s.add(colId);
  collapsedIds.value = s;
  persist();
}

/**
 * Auto-open one collapsed column when an input arrives in it (move-next, SSE
 * reload, etc.). One-directional — becoming empty never auto-collapses.
 */
export function revealInputColumnOnArrival(colId: string): boolean {
  if (!collapsedIds.value.has(colId)) return false;
  const next = new Set(collapsedIds.value);
  next.delete(colId);
  collapsedIds.value = next;
  persist();
  return true;
}

/**
 * Expand every collapsed column whose status just went from no inputs to at
 * least one. Callers pass previous and current per-status count snapshots.
 */
export function revealInputArrivals(
  prev: Readonly<Record<string, number>>,
  now: Readonly<Record<string, number>>,
): void {
  for (const [id, count] of Object.entries(now)) {
    if (count > 0 && (prev[id] ?? 0) === 0) revealInputColumnOnArrival(id);
  }
}

let defaultsApplied = false;

/**
 * Apply "collapse empty columns" defaults once, only when the user has no saved
 * state. Callers must wait until inputs have loaded at least once — otherwise
 * an empty first paint collapses every column and persist() locks that in.
 */
export function applyInputCollapseDefaults(
  byStatus: (statusId: string) => unknown[],
  columnIds: readonly string[],
): void {
  if (defaultsApplied) return;
  defaultsApplied = true;
  if (hadSavedState) return;
  collapsedIds.value = new Set(columnIds.filter((id) => byStatus(id).length === 0));
  persist();
}

/** Test-only: clear module state so each suite can re-seed localStorage cleanly. */
export function resetInputCollapseForTests(): void {
  defaultsApplied = false;
  hadSavedState = readRaw() !== null;
  collapsedIds.value = new Set(readSaved());
}
