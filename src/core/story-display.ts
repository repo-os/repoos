/**
 * Browser-safe story display helpers (#0486): merge registered definitions with
 * task-derived roll-ups. No Node imports — safe for the UI bundle.
 */
import { deriveStories, sortStories, type StoryGroup, type StoryTaskLike } from "./stories.js";
import { STATUSES, type Status } from "./types.js";

export interface StoryDefinition {
  key: string;
  name: string;
  path: string;
  body: string;
  createdAt: string;
  createdBy: string;
}

/**
 * Generic over the member-task type so a caller that already holds rich task
 * objects (the UI's `Task`) keeps them through the merge instead of widening
 * to the structural minimum — the story side panel navigates to `task` by id
 * and needs the full object. Defaults keep bare `MergedStoryGroup` valid.
 */
export interface MergedStoryGroup<T extends StoryTaskLike = StoryTaskLike> extends StoryGroup<T> {
  excerpt: string;
  body: string;
  registered: boolean;
  /**
   * Definition metadata, null for a story that exists only as a task tag. The
   * side panel's Details tab reads these so it can show where a story is
   * defined and who wrote it without the view having to join the definitions
   * back on by key a second time.
   */
  path: string | null;
  createdAt: string | null;
  createdBy: string | null;
}

export function storyExcerpt(body: string, max = 200): string {
  const flat = body
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

export function mergeStoriesForDisplay<T extends StoryTaskLike>(
  tasks: T[],
  definitions: StoryDefinition[],
): MergedStoryGroup<T>[] {
  const defByKey = new Map(definitions.map((d) => [d.key, d] as const));
  const derived = deriveStories(tasks);
  const merged: MergedStoryGroup<T>[] = [];
  const seen = new Set<string>();
  for (const group of derived) {
    seen.add(group.key);
    const def = defByKey.get(group.key);
    merged.push({
      ...group,
      name: def?.name ?? group.name,
      excerpt: def ? storyExcerpt(def.body) : "",
      body: def?.body ?? "",
      registered: !!def,
      path: def?.path ?? null,
      createdAt: def?.createdAt ?? null,
      createdBy: def?.createdBy ?? null,
    });
  }
  const emptyCounts = (): Record<Status, number> =>
    Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const def of definitions) {
    if (seen.has(def.key)) continue;
    merged.push({
      key: def.key,
      name: def.name,
      tasks: [] as T[],
      total: 0,
      done: 0,
      counts: emptyCounts(),
      active: 0,
      review: 0,
      attention: 0,
      complete: false,
      lastActivity: null,
      excerpt: storyExcerpt(def.body),
      body: def.body,
      registered: true,
      path: def.path,
      createdAt: def.createdAt,
      createdBy: def.createdBy,
    });
  }
  return sortStories(merged) as MergedStoryGroup<T>[];
}
