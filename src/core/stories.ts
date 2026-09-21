/**
 * Stories are an optional, purely derived grouping over tasks.
 *
 * A task's `story` frontmatter names a cross-area delivery slice (e.g. the
 * project-updates email list, which spans Neon infra, the landing site and a
 * human checklist). There is deliberately no story file, status, worktree or
 * persistence store: the entire model is derived from the tasks that carry a
 * `story` tag. A story is complete exactly when every one of its tasks is done.
 *
 * The helpers here are dependency-free (no `node:` imports) so the same
 * grouping/ordering logic can be unit-tested and reused by the web UI.
 */
import { STATUSES, type Status } from "./types.js";

/** The minimal shape needed to derive a story roll-up. */
export interface StoryTaskLike {
  /** Raw `story` tag on the task, if any. */
  story?: string | null;
  status: string;
  /** True when the task is waiting on the human (blocked on input). */
  needsInput?: boolean;
  /** True when the task branch has drifted and needs a manual merge. */
  needsMerge?: boolean;
  /** ISO timestamp of the task's last change, for "most recent activity". */
  updated_at?: string | null;
}

/** One derived delivery slice. */
export interface StoryGroup<T extends StoryTaskLike = StoryTaskLike> {
  /** Case-insensitive grouping key. */
  key: string;
  /** Stable display name (see {@link groupTasksByStory}). */
  name: string;
  /** Member tasks, in the order they were supplied. */
  tasks: T[];
  /** Number of member tasks. */
  total: number;
  /** Number of member tasks in `done`. */
  done: number;
  /** Per-status counts for the canonical statuses. */
  counts: Record<Status, number>;
  /** Convenience mirrors of `counts.active` / `counts.review`. */
  active: number;
  review: number;
  /** Tasks awaiting human input — the "needs attention" signal. */
  attention: number;
  /** True when every member task is done (a derived, never manual, completion). */
  complete: boolean;
  /** ISO timestamp of the most recent member activity, or null when unknown. */
  lastActivity: string | null;
}

/**
 * Normalize a raw `story` value: strings only, with internal whitespace
 * collapsed and the result trimmed. Anything else (absent, null, number,
 * object) yields the empty string, so a malformed value can never create a
 * grouping key. An empty string means "untagged".
 */
export function normalizeStoryName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

/** The case-insensitive grouping key for a story name. */
export function storyKey(raw: string): string {
  return normalizeStoryName(raw).toLowerCase();
}

/** Pick the stable display name from every exact spelling seen for one key. */
function pickDisplayName(spellings: Map<string, number>): string {
  let best = "";
  let bestCount = -1;
  for (const [name, count] of spellings) {
    if (count > bestCount || (count === bestCount && name.localeCompare(best) < 0)) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

const NEW_COUNTS = (): Record<Status, number> =>
  Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;

/**
 * Group tasks by story, dropping untagged tasks entirely. Story names are
 * matched case-insensitively and whitespace-normalized; the group's display
 * name is the most common exact spelling (ties broken lexicographically) so it
 * stays stable regardless of task order.
 */
export function groupTasksByStory<T extends StoryTaskLike>(tasks: T[]): StoryGroup<T>[] {
  const byKey = new Map<string, { spellings: Map<string, number>; tasks: T[] }>();
  for (const task of tasks) {
    const name = normalizeStoryName(task.story);
    if (!name) continue;
    const key = name.toLowerCase();
    let group = byKey.get(key);
    if (!group) {
      group = { spellings: new Map(), tasks: [] };
      byKey.set(key, group);
    }
    group.tasks.push(task);
    group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
  }

  const groups: StoryGroup<T>[] = [];
  for (const [key, { spellings, tasks: members }] of byKey) {
    const counts = NEW_COUNTS();
    let attention = 0;
    let lastActivity: string | null = null;
    for (const task of members) {
      if (task.status in counts) counts[task.status as Status] += 1;
      if (task.needsInput || task.needsMerge) attention += 1;
      const at = task.updated_at ?? null;
      if (at && (lastActivity === null || at > lastActivity)) lastActivity = at;
    }
    const total = members.length;
    const done = counts.done;
    groups.push({
      key,
      name: pickDisplayName(spellings),
      tasks: members,
      total,
      done,
      counts,
      active: counts.active,
      review: counts.review,
      attention,
      complete: total > 0 && done === total,
      lastActivity,
    });
  }
  return groups;
}

/**
 * Ordering bucket for a story: attention-needed work first, then stories with
 * active/review work, then everything else, and completed stories last (they
 * stay visible but are rendered quietly).
 */
function storyRank(group: StoryGroup): number {
  if (group.complete) return 3;
  if (group.attention > 0) return 0;
  if (group.active + group.review > 0) return 1;
  return 2;
}

/**
 * Sort stories for display: attention-needed/active work first, then by most
 * recent activity (nulls last), then by name for a stable tie-break. Completed
 * stories sink to the bottom.
 */
export function sortStories<T extends StoryTaskLike>(groups: StoryGroup<T>[]): StoryGroup<T>[] {
  return [...groups].sort((a, b) => {
    const rank = storyRank(a) - storyRank(b);
    if (rank !== 0) return rank;
    const at = a.lastActivity ?? "";
    const bt = b.lastActivity ?? "";
    if (at !== bt) return at < bt ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/** Convenience: group and sort in one call. */
export function deriveStories<T extends StoryTaskLike>(tasks: T[]): StoryGroup<T>[] {
  return sortStories(groupTasksByStory(tasks));
}
