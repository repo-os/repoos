/** Bounded task search for native Hub clients (no task bodies or activity). */

export const HUB_TASK_SEARCH_MIN_QUERY_LEN = 2;
export const HUB_TASK_SEARCH_MAX_QUERY_LEN = 80;
export const HUB_TASK_SEARCH_DEFAULT_LIMIT = 8;
export const HUB_TASK_SEARCH_MAX_LIMIT = 8;

export interface HubTaskSearchHit {
  id: string;
  title: string;
  status: string;
  updatedAt: string | null;
  routePath: string;
}

export interface HubTaskSearchSourceRow {
  id: string;
  title: string;
  status: string;
  updated_at: string | null;
}

export function hubTaskRoutePath(taskId: string): string {
  return `/work?task=${encodeURIComponent(taskId)}`;
}

export function normalizeHubTaskSearchQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < HUB_TASK_SEARCH_MIN_QUERY_LEN) return null;
  if (trimmed.length > HUB_TASK_SEARCH_MAX_QUERY_LEN) return null;
  return trimmed;
}

export function clampHubTaskSearchLimit(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return HUB_TASK_SEARCH_DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(HUB_TASK_SEARCH_MAX_LIMIT, Math.floor(raw)));
}

function includes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

export function searchHubTasks(
  query: string,
  tasks: HubTaskSearchSourceRow[],
  limit = HUB_TASK_SEARCH_DEFAULT_LIMIT,
): HubTaskSearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < HUB_TASK_SEARCH_MIN_QUERY_LEN) return [];

  const scored: { hit: HubTaskSearchHit; score: number }[] = [];
  for (const task of tasks) {
    const id = task.id ?? "";
    const title = task.title ?? "";
    if (!includes(id, q) && !includes(title, q)) continue;
    let score = 0;
    if (includes(id, q)) score += id.startsWith(q) ? 40 : 24;
    if (includes(title, q)) score += title.toLowerCase().startsWith(q) ? 20 : 12;
    scored.push({
      score,
      hit: {
        id,
        title,
        status: task.status,
        updatedAt: task.updated_at,
        routePath: hubTaskRoutePath(id),
      },
    });
  }

  return scored
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.hit.title.localeCompare(b.hit.title);
    })
    .slice(0, limit)
    .map((row) => row.hit);
}
