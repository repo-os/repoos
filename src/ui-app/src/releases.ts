import type { Task } from "./types";

/** Newest successful task-backed releases, bounded for a concise dashboard. */
export function releaseTimelineTasks(tasks: Task[], limit = 12): Task[] {
  return tasks
    .filter((task) => task.status === "done" && task.releasedAt)
    .slice()
    .sort((a, b) => (b.releasedAt ?? "").localeCompare(a.releasedAt ?? ""))
    .slice(0, limit);
}

/** Suggest the least-surprising next semantic version for the release modal. */
export function nextReleaseVersion(version: string | null): string | null {
  if (!version) return null;
  const match = version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-.+)?(?:\+.+)?$/);
  if (!match) return null;
  // A prerelease normally graduates to its matching stable version; otherwise
  // the safest default is one patch forward. The field remains editable.
  if (match[4]) return `${match[1]}.${match[2]}.${match[3]}`;
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}
