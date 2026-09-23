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

export interface MergedStoryGroup extends StoryGroup {
  excerpt: string;
  body: string;
  registered: boolean;
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
): MergedStoryGroup[] {
  const defByKey = new Map(definitions.map((d) => [d.key, d] as const));
  const derived = deriveStories(tasks);
  const merged: MergedStoryGroup[] = [];
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
    });
  }
  return sortStories(merged) as MergedStoryGroup[];
}
