import { readFileSync } from "node:fs";
import { bootstrap } from "../core/bootstrap.js";
import { generateContextPack } from "../core/context-pack.js";
import { ensureWorktree } from "../core/git.js";
import { deriveBranch } from "./agents.js";
import { parseTask } from "../core/task.js";
import type { RepoOSConfig, Status, Task } from "../core/types.js";
import type { Logger } from "../core/logger.js";
import { getSchedule } from "../core/schedule.js";
import { resolveAgentForTask, noAgentAvailableMessage, pausedAgentFallbackNote } from "./agents.js";
import type { AgentRunner } from "./agents.js";
import type { LiveIndex } from "./live-index.js";
import { patchTaskFile, type TaskPatch } from "./write.js";

export type ScheduleAutoStartDeps = {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  logger: Logger;
  onServerStatusChange?: (task: Task, prev: Status, next: Status) => void;
};

/**
 * When `auto_start_agent` is set on the schedule, move a freshly created
 * `ready` AI task to `active` and spawn the engineer — the same outcome as
 * Start work, without going through HTTP.
 */
export async function maybeAutoStartScheduledTask(
  deps: ScheduleAutoStartDeps,
  scheduleId: string,
  taskId: string,
): Promise<void> {
  const row = getSchedule(deps.config, scheduleId);
  if (!row?.autoStartAgent) return;
  let task = deps.index.getTask(taskId);
  if (!task || task.assignee === "human") return;
  if (task.status !== "ready") return;
  if (deps.runner.isRunning(taskId)) return;

  const agent = resolveAgentForTask(deps.config, task);
  if (!agent) {
    deps.logger.task(taskId, "warn", noAgentAvailableMessage(deps.config, "engineer"), {
      scheduleId,
    });
    return;
  }
  const pauseNote = pausedAgentFallbackNote(deps.config, task);
  if (pauseNote) {
    deps.logger.task(taskId, "info", "Agent selection adjusted for a paused allowlist entry", {
      note: pauseNote,
      scheduleId,
    });
  }

  const branch = task.branch || deriveBranch(task.title);
  const patch: TaskPatch = { status: "active" };
  if (!task.branch) patch.branch = branch;
  const updated = patchTaskFile(deps.config, task.absPath, patch, {
    onStatusChange: deps.onServerStatusChange,
  });
  deps.index.applyFileChange(updated.absPath);
  deps.index.refreshBranches();

  const taskForLaunch = parseTask({
    content: readFileSync(updated.absPath, "utf8"),
    absPath: updated.absPath,
    root: deps.config.root,
    defaultStatus: deps.config.defaultStatus,
    defaultAssignee: deps.config.defaultAssignee,
  });

  const isHotfix = taskForLaunch.hotfix === true;
  const wtRes = isHotfix
    ? { ok: true as const, path: deps.config.root, created: false }
    : ensureWorktree(deps.config.root, branch);
  const cwd = wtRes.ok ? wtRes.path : deps.config.root;
  const bootResult = await bootstrap(deps.config, taskForLaunch, branch, cwd);
  if (!bootResult.ok) {
    deps.logger.task(taskId, "warn", "Schedule auto-start bootstrap failed", {
      scheduleId,
      reason: bootResult.reason,
    });
    return;
  }
  const pack = generateContextPack(deps.config, taskForLaunch, branch, cwd, bootResult);
  const spawnRes = deps.runner.start(taskForLaunch, branch, agent, {
    cwd,
    contextPack: pack.content,
  });
  if (!spawnRes.ok) {
    deps.logger.task(taskId, "warn", "Schedule auto-start spawn failed", {
      scheduleId,
      reason: spawnRes.reason,
    });
  }
}
