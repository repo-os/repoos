import { parseTaskAreas } from "../../../core/areas.js";
import type { Task } from "../types";

/**
 * Search and quick filters for the Work queue (#1138). The phone queue owns
 * these controls; the desktop board reads the same URL keys so a filter that
 * arrives from a phone or a shared link is applied and shown at every width.
 */
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
  key: (typeof WORK_QUEUE_FILTER_KEYS)[number];
  label: string;
  /** True for a URL value that was not applied. */
  ignored?: boolean;
}

/**
 * One chip per quick filter that is set, in the order the controls appear. The
 * search has no chip (#1278): the search box in the board header shows it, and
 * Clear filters still removes it.
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
 * Present URL values the reader cannot use: a priority that is not p0-p3, or a
 * `mine` other than `1`. They are not applied, so each one gets a notice chip
 * and Clear filters removes it, instead of the board silently ignoring it.
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
  return chips;
}

/**
 * A copy of the route query with only the queue filter keys removed. Every
 * other entry, including null (bare `?key`) and repeated values, is kept as-is.
 */
export function clearWorkQueueFilterQuery(query: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if ((WORK_QUEUE_FILTER_KEYS as readonly string[]).includes(key)) continue;
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
