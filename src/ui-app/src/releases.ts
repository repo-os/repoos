import type { Task } from "./types";

/** Newest successful task-backed releases, bounded for a concise dashboard. */
export function releaseTimelineTasks(tasks: Task[], limit = 8): Task[] {
  return tasks
    .filter((task) => task.status === "done" && task.releasedAt)
    .slice()
    .sort((a, b) => (b.releasedAt ?? "").localeCompare(a.releasedAt ?? ""))
    .slice(0, limit);
}
