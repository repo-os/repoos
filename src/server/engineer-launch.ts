/**
 * Spawn or resume the engineer on a task worktree — shared by /start and CTO
 * safe actions (#0688).
 */
import { readFileSync } from "node:fs";
import type { RepoOSConfig, Task } from "../core/types.js";
import { bootstrap } from "../core/bootstrap.js";
import { generateContextPack, resumePreamble } from "../core/context-pack.js";
import { ensureWorktree } from "../core/git.js";
import { parseTask } from "../core/task.js";
import type { LiveIndex } from "./live-index.js";
import type { AgentRunner } from "./agents.js";
import { resolveAgentForTask } from "./agents.js";
import type { Logger } from "../core/logger.js";
export type EngineerLaunchResult =
  | { ok: true; pid?: number; queued?: boolean }
  | { ok: false; reason: string };

export interface EngineerLaunchDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  logger: Logger;
}

/**
 * Start or resume the engineer on an active task with an optional instruction
 * prepended to the resume preamble. Does not change task status.
 */
export async function relaunchEngineerOnActiveTask(
  deps: EngineerLaunchDeps,
  task: Task,
  instruction: string,
): Promise<EngineerLaunchResult> {
  const { config, index, runner, logger } = deps;
  const id = task.id;

  if (task.isArchived) {
    return { ok: false, reason: `Task #${id} is archived` };
  }
  if (task.status !== "active") {
    return { ok: false, reason: `Task #${id} is not active` };
  }
  if (runner.isRunning(id)) {
    return { ok: false, reason: `Task #${id} already has a running agent` };
  }
  if (runner.isPaused(id)) {
    return { ok: false, reason: `Task #${id} is paused` };
  }
  if (runner.isHandoffInFlight(id) || runner.hasPendingHandoff(id)) {
    return { ok: false, reason: `Task #${id} has a handoff in progress` };
  }

  const fresh = parseTask({
    content: readFileSync(task.absPath, "utf8"),
    absPath: task.absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });

  const agent = resolveAgentForTask(config, fresh);
  if (!agent) {
    return { ok: false, reason: "No enabled engineer agent is configured" };
  }

  const branch = fresh.branch;
  if (!branch) {
    return { ok: false, reason: `Task #${id} has no branch yet` };
  }

  const wtRes = fresh.hotfix
    ? { ok: true as const, path: config.root, created: false }
    : ensureWorktree(config.root, branch);
  const cwd = wtRes.ok ? wtRes.path : config.root;

  const bootResult = await bootstrap(config, fresh, branch, cwd);
  if (!bootResult.ok) {
    logger.task(id, "warn", "CTO engineer relaunch bootstrap failed", {
      reason: bootResult.reason,
    });
    return { ok: false, reason: `Bootstrap failed: ${bootResult.reason ?? "unknown error"}` };
  }

  const pack = generateContextPack(config, fresh, branch, cwd, bootResult);
  const resumeContext = resumePreamble(config, fresh, branch, cwd);
  const preamble = [resumeContext, instruction.trim()].filter(Boolean).join("\n\n") || undefined;

  const spawnRes = runner.start(fresh, branch, agent, {
    cwd,
    contextPack: pack.content,
    resumePreamble: preamble,
  });

  if (!spawnRes.ok) {
    return { ok: false, reason: spawnRes.reason ?? "could not start engineer" };
  }

  index.refreshBranches();
  return { ok: true, pid: spawnRes.pid, queued: spawnRes.queued };
}
