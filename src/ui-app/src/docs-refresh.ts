import type { DocMeta } from "./types";

export interface DocRefreshCounts {
  added: number;
  changed: number;
  removed: number;
}

/** Compare doc listings before and after a refresh (uses server mtimeMs). */
export function countDocRefresh(before: Map<string, number>, after: DocMeta[]): DocRefreshCounts {
  const afterMap = new Map(after.map((d) => [d.path, d.mtimeMs ?? 0]));
  let added = 0;
  let changed = 0;
  let removed = 0;
  for (const [path, mtime] of afterMap) {
    if (!before.has(path)) added++;
    else if (before.get(path) !== mtime) changed++;
  }
  for (const path of before.keys()) {
    if (!afterMap.has(path)) removed++;
  }
  return { added, changed, removed };
}

export function formatDocRefreshMessage(counts: DocRefreshCounts): string {
  if (counts.added === 0 && counts.changed === 0 && counts.removed === 0) {
    return "No changes";
  }
  const parts: string[] = [];
  if (counts.added) parts.push(`${counts.added} added`);
  if (counts.changed) parts.push(`${counts.changed} changed`);
  if (counts.removed) parts.push(`${counts.removed} removed`);
  return parts.join(", ");
}
