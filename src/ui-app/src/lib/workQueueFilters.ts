import { parseTaskAreas } from "../../../core/areas.js";
import type { Task } from "../types";

/**
 * Search and quick filters for the Work queue (#1138). The phone queue owns
 * these controls; the desktop board reads the same URL keys so a filter that
 * arrives from a phone or a shared link is applied and shown at every width.
 */

/** Status columns the board filters by (`?status=`). Any other value is a
 *  phone-only queue view (attention, held, archived, human, all) or not a
 *  status at all, so the board shows it as an ignored notice. */
export const BOARD_STATUS_FILTER_IDS = [
  "draft",
  "inbox",
  "ready",
  "active",
  "review",
  "done",
] as const;

/** The queue's sort, by last update. Absent `sort` leaves the board's own sort. */
export type WorkQueueSort = "newest" | "oldest";
export interface WorkQueueFilters {
  /** Raw search text; `#` and case are normalised when matching. */
  query: string;
  /** `""` or one of the priority ids. */
  priority: string;
  /** `"any"` or an area name as the area vocabulary spells it. */
  area: string;
  /** `"any"` or a story id. */
  story: string;
  /** Only tasks assigned to a person. */
  mine: boolean;
}

/** URL keys that carry the filters above. `sort` and `status` are separate. */
export const WORK_QUEUE_FILTER_KEYS = ["q", "priority", "area", "story", "mine"] as const;

const PRIORITY_IDS = ["p0", "p1", "p2", "p3"] as const;

export const NO_WORK_QUEUE_FILTERS: WorkQueueFilters = {
  query: "",
  priority: "",
  area: "any",
  story: "any",
  mine: false,
};

function firstString(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return "";
}

/** Read the filters from a route query. Unknown priorities are ignored. */
export function readWorkQueueFilters(query: Record<string, unknown>): WorkQueueFilters {
  const priority = firstString(query.priority);
  return {
    query: firstString(query.q),
    priority: (PRIORITY_IDS as readonly string[]).includes(priority) ? priority : "",
    area: firstString(query.area) || "any",
    story: firstString(query.story) || "any",
    mine: firstString(query.mine) === "1",
  };
}

/** The sort the URL asks for, or null when `sort` is absent or not a known value. */
export function readWorkQueueSort(query: Record<string, unknown>): WorkQueueSort | null {
  const sort = firstString(query.sort);
  return sort === "newest" || sort === "oldest" ? sort : null;
}

/** Newest or oldest first by last update: the order the phone queue has always used. */
export function sortWorkQueueTasks(tasks: Task[], order: WorkQueueSort): Task[] {
  return [...tasks].sort((a, b) => {
    const compared = (a.updated_at ?? "").localeCompare(b.updated_at ?? "");
    return order === "newest" ? -compared : compared;
  });
}

function isBoardStatus(value: string): boolean {
  return (BOARD_STATUS_FILTER_IDS as readonly string[]).includes(value);
}

export function taskAreaNames(task: Task): string[] {
  return parseTaskAreas(task.areas?.length ? task.areas : task.area);
}

/** The search needle: trimmed, lower-case, with one leading `#` dropped. A
 *  query that is only `#` (or blank) is an empty needle, so it filters nothing. */
export function searchNeedle(query: string): string {
  return query.trim().toLowerCase().replace(/^#/, "").trim();
}

/** Search matches id, title or area: the three things a user scans a card by. */
function matchesSearch(task: Task, needle: string): boolean {
  if (task.id.toLowerCase().includes(needle)) return true;
  if (task.title.toLowerCase().includes(needle)) return true;
  return taskAreaNames(task).some((name) => name.toLowerCase().includes(needle));
}

export function matchesWorkQueueFilters(task: Task, filters: WorkQueueFilters): boolean {
  if (filters.priority && task.priority !== filters.priority) return false;
  const wantedArea = filters.area.toLowerCase();
  if (wantedArea && wantedArea !== "any") {
    if (!taskAreaNames(task).some((name) => name.toLowerCase() === wantedArea)) return false;
  }
  if (filters.story && filters.story !== "any" && (task.story ?? "") !== filters.story) {
    return false;
  }
  if (filters.mine && task.assignee !== "human") return false;
  const needle = searchNeedle(filters.query);
  return !needle || matchesSearch(task, needle);
}

export function hasActiveWorkQueueFilters(filters: WorkQueueFilters): boolean {
  return (
    searchNeedle(filters.query) !== "" ||
    filters.priority !== "" ||
    (filters.area !== "any" && filters.area !== "") ||
    (filters.story !== "any" && filters.story !== "") ||
    filters.mine
  );
}

export interface WorkQueueFilterChip {
  key: (typeof WORK_QUEUE_FILTER_KEYS)[number] | "status" | "sort";
  label: string;
  /** True for a URL value that was not applied. */
  ignored?: boolean;
}

/** The label for a URL sort, shared by the chip and the Sort control's placeholder. */
export function workQueueSortLabel(sort: WorkQueueSort): string {
  return sort === "oldest" ? "Sort: Oldest updated" : "Sort: Newest updated";
}

/** A chip for the board's applied sort, so a sorted board never looks like the default. */
export function workQueueSortChip(sort: WorkQueueSort | null): WorkQueueFilterChip | null {
  if (!sort) return null;
  return { key: "sort", label: workQueueSortLabel(sort) };
}

/**
 * One chip per quick filter that is set, in the order the controls appear.
 * Search is represented by the input in the board header, never a chip (#1278).
 */
export function workQueueFilterChips(filters: WorkQueueFilters): WorkQueueFilterChip[] {
  const chips: WorkQueueFilterChip[] = [];
  if (filters.priority)
    chips.push({ key: "priority", label: `Priority: ${filters.priority.toUpperCase()}` });
  if (filters.area !== "any" && filters.area !== "") {
    chips.push({ key: "area", label: `Area: ${filters.area}` });
  }
  if (filters.story !== "any" && filters.story !== "") {
    chips.push({ key: "story", label: `Story: ${filters.story}` });
  }
  if (filters.mine) chips.push({ key: "mine", label: "Assigned to you" });
  return chips;
}

/**
 * Present URL values the reader cannot use: a priority that is not p0-p3, a
 * `mine` other than `1`, a status that is not a board column, or a sort that is
 * not newest/oldest. They are not applied, so each one gets a notice chip and
 * Clear filters removes it, instead of the board silently ignoring it.
 */
export function ignoredWorkQueueFilterChips(query: Record<string, unknown>): WorkQueueFilterChip[] {
  const chips: WorkQueueFilterChip[] = [];
  const priority = firstString(query.priority);
  if (priority && !(PRIORITY_IDS as readonly string[]).includes(priority)) {
    chips.push({ key: "priority", label: `Ignored filter: priority=${priority}`, ignored: true });
  }
  const mine = firstString(query.mine);
  if (mine && mine !== "1") {
    // Say which value applies: a bare "0" reads as "not mine", which is not what is ignored.
    chips.push({
      key: "mine",
      label: `Ignored filter: mine=${mine} (only mine=1 applies)`,
      ignored: true,
    });
  }
  const status = ignoredStatusText(query.status);
  if (status !== null) {
    const reason = Array.isArray(query.status) ? "use one status" : "not a board column";
    chips.push({
      key: "status",
      label: `Ignored filter: status=${status} (${reason})`,
      ignored: true,
    });
  }
  const sort = firstString(query.sort);
  if (sort && !readWorkQueueSort({ sort })) {
    chips.push({
      key: "sort",
      label: `Ignored filter: sort=${sort} (only newest or oldest applies)`,
      ignored: true,
    });
  }
  return chips;
}

/**
 * The `status` text the board cannot apply, or null when it applies one. The
 * board filters only by a single board column, so a bare or empty key, an
 * unknown value and a repeated key are all notices, never silent.
 */
function ignoredStatusText(raw: unknown): string | null {
  if (raw === undefined) return null;
  if (typeof raw === "string" && isBoardStatus(raw)) return null;
  if (Array.isArray(raw)) return raw.map((value) => value ?? "").join(", ");
  return raw === null ? "" : String(raw);
}

/**
 * A copy of the route query with the queue filter keys removed, plus the board's
 * `sort` and any status the board ignores (those are shown in the same bar). A
 * board status column, and every other entry, including null (bare `?key`) and
 * other repeated values, is kept as-is.
 */
export function clearWorkQueueFilterQuery(query: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if ((WORK_QUEUE_FILTER_KEYS as readonly string[]).includes(key)) continue;
    if (key === "sort") continue;
    if (key === "status" && ignoredStatusText(value) !== null) continue;
    next[key] = value;
  }
  return next;
}

/**
 * A copy of the route query with `q` set to the search text, or removed when the
 * text is empty. The board's search box writes through this so typing never
 * drops a quick filter or the drawer params that sit beside it.
 */
export function withWorkQueueSearch(
  query: Record<string, unknown>,
  search: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...query };
  if (search) next.q = search;
  else delete next.q;
  return next;
}
