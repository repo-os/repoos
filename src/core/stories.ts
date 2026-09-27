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

/**
 * The part of a story PM session id that identifies *which* story (#0515).
 *
 * A registered story uses its stable number — the same shape a task PM chat
 * uses (`pm-task-v2:0042`), so the two read alike in `.repoos/sessions/`, and it
 * survives the PM agent renaming the story. A story that exists only as a task
 * tag has no definition file and therefore no number, so it falls back to a
 * slug of its key.
 *
 * The one consequence worth knowing: registering a story that already had a PM
 * conversation changes its session id (slug → number), so that earlier thread
 * reads as a fresh conversation. The alternative — keying on the name — would
 * break the far more common rename instead, so the number stays the identity and
 * this is the accepted trade.
 *
 * The result is always filename-safe (`[a-z0-9-]`), which is what the runner's
 * session file requires.
 */
/**
 * Short, stable, filename-safe hash of a string (djb2, base36). Dependency-free
 * because `stories.ts` is shared with the UI bundle. Only ever used to
 * disambiguate, never for anything security-relevant.
 */
function shortHash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Cap on the slug part of a session id, mirroring `storySlug`'s file-name cap. */
const SESSION_SLUG_MAX = 55;

export function storyPmSessionSlug(key: string, number?: string | null): string {
  if (number) return number;
  const slug = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return "story";
  // Truncation alone would let two long, similarly-prefixed story names share
  // one PM conversation — silently merging two users' threads. Appending a hash
  // of the full key keeps them distinct; the budget shrinks to fit.
  if (slug.length <= SESSION_SLUG_MAX) return slug;
  const suffix = `-${shortHash(key)}`;
  return slug.slice(0, SESSION_SLUG_MAX - suffix.length) + suffix;
}

/**
 * Runner session key for the PM conversation about one story (#0515). Per-user
 * when auth is on, exactly like the task PM chat (0248), so teammates sharing
 * one instance each get their own conversation per story.
 *
 * `pm-story-v1:` is deliberately not a `pm-task-v2:` prefix — a story is not a
 * task, and `resolveSessionTaskId` must not attribute a story chat's tokens to
 * a phantom task (see that function's prefix guard).
 */
export function storyPmSessionId(
  key: string,
  number: string | null | undefined,
  email?: string | null,
): string {
  const base = `pm-story-v1:${storyPmSessionSlug(key, number)}`;
  return email ? `${base}::${email}` : base;
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

/** User-chosen ordering on the Stories page (#0536). No priority — stories have none. */
export type StoryListSortOrder = "recent" | "taskNumberNewest" | "taskNumberOldest";

function storyNumberValue(number: string | null | undefined): number {
  const raw = (number ?? "").trim();
  if (!/^\d+$/.test(raw)) return Number.NEGATIVE_INFINITY;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

/**
 * Sort merged story groups for the Stories page list (#0536). Purely client-side
 * over already-derived roll-ups — uses `lastActivity` for recency and the
 * registered story `number` for numeric ordering (tag-only stories last).
 */
export function sortStoryGroupsForPage<T extends StoryTaskLike>(
  groups: StoryGroup<T>[],
  order: StoryListSortOrder,
  numberFor: (group: StoryGroup<T>) => string | null | undefined = (g) =>
    (g as { number?: string | null }).number ?? null,
): StoryGroup<T>[] {
  const copy = [...groups];
  switch (order) {
    case "recent":
      return copy.sort((a, b) => {
        const at = a.lastActivity ?? "";
        const bt = b.lastActivity ?? "";
        if (!at) return bt ? 1 : 0;
        if (!bt) return -1;
        const cmp = bt.localeCompare(at);
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      });
    case "taskNumberNewest":
      return copy.sort((a, b) => {
        const na = storyNumberValue(numberFor(a));
        const nb = storyNumberValue(numberFor(b));
        if (na === nb) return a.name.localeCompare(b.name);
        if (!Number.isFinite(na)) return 1;
        if (!Number.isFinite(nb)) return -1;
        return nb - na;
      });
    case "taskNumberOldest":
      return copy.sort((a, b) => {
        const na = storyNumberValue(numberFor(a));
        const nb = storyNumberValue(numberFor(b));
        if (na === nb) return a.name.localeCompare(b.name);
        if (!Number.isFinite(na)) return 1;
        if (!Number.isFinite(nb)) return -1;
        return na - nb;
      });
    default:
      return copy;
  }
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
