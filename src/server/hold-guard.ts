/**
 * Last-moment hold checks (#0960). Start and handoff both await work (bootstrap,
 * checks) before they commit, and a spawn can sit in the agent queue after the
 * caller already checked. The task file is the authority: a hold written during
 * that window must be read here, immediately before a process is created or a
 * status is moved to review.
 */
import { readFileSync } from "node:fs";
import type { RepoOSConfig, Task } from "../core/types.js";
import { parseTask } from "../core/task.js";
import { isHoldActive, isHoldExpired, taskIsHeld } from "../core/task-selection.js";

/** Re-read the task file so a hold applied during awaited work is visible. */
export function taskWithLiveHold(config: RepoOSConfig, task: Task): Task {
  if (!task.absPath) return task;
  try {
    return parseTask({
      content: readFileSync(task.absPath, "utf8"),
      absPath: task.absPath,
      root: config.root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
  } catch {
    return task;
  }
}

/** Refusal string when a held task must not gain an engineer. Null when clear. */
export function holdBlocksEngineer(config: RepoOSConfig, task: Task | undefined): string | null {
  if (!task) return null;
  // The file wins when it shows a hold (a concurrent `repoos hold` writes it
  // before the index catches up). The in-memory task also counts, so a hold
  // already applied to the index is not missed when the file read fails.
  const fromDisk = taskWithLiveHold(config, task);
  const live = isHoldActive(fromDisk) ? fromDisk : isHoldActive(task) ? task : null;
  if (!live) return null;
  const reason = live.holdReason ? `: ${live.holdReason}` : "";
  const until = live.holdUntil ? ` (auto-releases ${live.holdUntil})` : "";
  return `Task #${live.id} is held${reason}${until} — use "repoos unhold ${live.id}" to release it`;
}

/**
 * Drop the in-memory pause a hold recorded once `hold_until` has passed.
 * The hold flag stays on the task (the badge shows it expired); only the
 * pause that would keep watchdog and CTO recovery away is cleared.
 */
export function clearExpiredHoldPauses(
  tasks: Iterable<Task>,
  runner: { clearHoldPause?(id: string): void },
  now: number = Date.now(),
): void {
  if (!runner.clearHoldPause) return;
  for (const task of tasks) {
    if (taskIsHeld(task) && isHoldExpired(task.holdUntil, now)) {
      runner.clearHoldPause(task.id);
    }
  }
}
