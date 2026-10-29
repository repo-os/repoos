/**
 * Spawn or resume the engineer on a task worktree — shared by /start and CTO
 * safe actions (#0688).
 */
import { readFileSync } from "node:fs";
import type { RepoOSConfig, Task } from "../core/types.js";
import { bootstrap } from "../core/bootstrap.js";
import { generateServerContext } from "./context-pack.js";
import { ensureWorktree } from "../core/git.js";
import { parseTask } from "../core/task.js";
import type { LiveIndex } from "./live-index.js";
import type { AgentRunner } from "./agents.js";
import { resolveAgentForTask, noAgentAvailableMessage, pausedAgentFallbackNote } from "./agents.js";
import { isHoldActive } from "../core/task-selection.js";
import { holdBlocksEngineer } from "./hold-guard.js";
import type { Logger } from "../core/logger.js";
export type EngineerLaunchResult =
  | {
      ok: true;
      pid?: number;
      queued?: boolean;
      /**#0850: what a paused allowlist entry changed, for the task activity log. */
      pauseNote?: string;
    }
  | { ok: false; reason: string };

export interface EngineerLaunchDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  logger: Logger;
}

/**
 * Start or resume the engineer on an active task with an optional instruction
 * prepended to the resume preamble. Does not change task status. When
 * `freshSession` is set the previous conversation is abandoned and a new one
 * starts in the same worktree (#0727).
 */
export async function relaunchEngineerOnActiveTask(
  deps: EngineerLaunchDeps,
  task: Task,
  instruction: string,
  opts: { freshSession?: boolean; fromCrashRecovery?: boolean; force?: boolean } = {},
): Promise<EngineerLaunchResult> {
  const { config, index, runner, logger } = deps;
  const id = task.id;

  if (task.isArchived) {
    return { ok: false, reason: `Task #${id} is archived` };
  }
  if (task.status !== "active") {
    return { ok: false, reason: `Task #${id} is not active` };
  }
  // #0960: a held task is inert for ALL automation. Only an explicit human/driver
  // command that clears the hold (or `repoos start --force`) may start it. This
  // is the single chokepoint shared by /start, the CTO monitor, the watchdog and
  // crash recovery, so a held task cannot be started by any of them.
  if (isHoldActive(task) && !opts.force) {
    const reason = task.holdReason ? `: ${task.holdReason}` : "";
    const until = task.holdUntil ? ` (auto-releases ${task.holdUntil})` : "";
    return {
      ok: false,
      reason: `Task #${id} is held${reason}${until} — use "repoos unhold ${id}" to release it${
        opts.fromCrashRecovery ? "" : ", or " + `"repoos start ${id} --force"`
      }`,
    };
  }
  runner.releasePhantomForStart(id);
  if (runner.isRunning(id)) {
    return { ok: false, reason: `Task #${id} already has a running agent` };
  }
  // A hold that stopped a live engineer recorded its own pause. Once the hold
  // is gone or `hold_until` has passed, that pause must not keep blocking
  // relaunch. A human pause (markPaused, not markHoldPause) stays.
  if ((opts.force || !isHoldActive(task)) && typeof runner.clearHoldPause === "function") {
    runner.clearHoldPause(id);
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
    return { ok: false, reason: noAgentAvailableMessage(config, "engineer") };
  }
  const pauseNote = pausedAgentFallbackNote(config, fresh);
  if (pauseNote) {
    logger.task(id, "info", "Agent selection adjusted for a paused allowlist entry", {
      note: pauseNote,
    });
  }

  const branch = fresh.branch;
  if (!branch) {
    return { ok: false, reason: `Task #${id} has no branch yet` };
  }

  const wtRes = fresh.hotfix
    ? { ok: true as const, path: config.root, created: false }
    : ensureWorktree(config.root, branch);
  // Never fall back to the main checkout: an engineer started there either
  // edits main or refuses and stalls (2026-10-28: #0966 sat 10 h on main).
  if (!wtRes.ok) {
    return { ok: false, reason: `Could not create the task worktree: ${wtRes.reason}` };
  }
  const cwd = wtRes.path;

  const bootResult = await bootstrap(config, fresh, branch, cwd);
  if (!bootResult.ok) {
    logger.task(id, "warn", "CTO engineer relaunch bootstrap failed", {
      reason: bootResult.reason,
    });
    return { ok: false, reason: `Bootstrap failed: ${bootResult.reason ?? "unknown error"}` };
  }

  // #0960: the hold check above ran before the awaited bootstrap. Re-read the
  // task file (not the request snapshot) and refuse before spawn. spawnTurn
  // checks again, including after a slot/pressure queue.
  const liveBeforeSpawn = index.getTask?.(id) ?? fresh;
  const heldNow = !opts.force ? holdBlocksEngineer(config, liveBeforeSpawn) : null;
  if (heldNow) {
    return {
      ok: false,
      reason: opts.fromCrashRecovery ? heldNow : `${heldNow}, or "repoos start ${id} --force"`,
    };
  }

  const { pack, resumePreamble: resumeContext } = await generateServerContext(
    config,
    liveBeforeSpawn,
    branch,
    cwd,
    bootResult,
  );
  const preamble = [resumeContext, instruction.trim()].filter(Boolean).join("\n\n") || undefined;

  const spawnRes = runner.start(liveBeforeSpawn, branch, agent, {
    cwd,
    contextPack: pack.content,
    resumePreamble: preamble,
    freshSession: opts.freshSession === true,
    ...(opts.fromCrashRecovery ? { fromCrashRecovery: true } : {}),
    ...(opts.force ? { bypassHold: true } : {}),
  });

  if (!spawnRes.ok) {
    return { ok: false, reason: spawnRes.reason ?? "could not start engineer" };
  }

  await index.refreshBranchesAsync();
  return {
    ok: true,
    pid: spawnRes.pid,
    queued: spawnRes.queued,
    pauseNote: pauseNote ?? undefined,
  };
}
