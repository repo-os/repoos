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

let defaultsApplied = false;

/**
 * Apply "collapse empty columns" defaults once, only when the user has no saved
 * state — mirrors the Work board's applyCollapseDefaults.
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
