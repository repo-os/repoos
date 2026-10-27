/**
 * The automatic engineer notice for a requirements change (#0817).
 *
 * Requirements (a task's Problem / Desired UX / Acceptance criteria / Notes
 * sections) are edited on the board while the engineer works from its own
 * worktree copy, which the edit deliberately does not touch. Something has to
 * tell the engineer what moved — and relying on a human to remember failed on
 * #0816. `LiveIndex` calls this on every body change that reaches the index
 * (a UI save, `repoos update --body`, or a direct file edit the watcher picks
 * up), so the notice does not depend on the write path.
 *
 * Delivery mirrors the `/message` route: the notice goes to the engineer's
 * session with `runner.send`, queueing while a turn is live. A task that has
 * never started an engineer has no session to message — this deliberately does
 * NOT auto-start one, so a paused or human-owned active task is never woken by
 * a requirements edit. A task that is not `active` is never notified.
 */
import type { Agent, RepoOSConfig, Task } from "../core/types.js";
import { requirementsChangeMessage, summarizeRequirementsChange } from "../core/task-body-diff.js";
import { resolveAgentForTask } from "./agents.js";
import { serverResumePreamble } from "./context-pack.js";
import { getGitWorker } from "./git-worker.js";

/** The subset of `AgentRunner` this module needs (keeps tests lightweight). */
export interface RequirementsNoticeRunner {
  send(
    taskId: string,
    text: string,
    agent: Agent,
    opts?: { resumePreamble?: string; skipBoardDivergence?: boolean; cwd?: string },
  ): { ok: boolean; queued?: boolean; reason?: string };
}

export interface RequirementsNoticeDeps {
  config: RepoOSConfig;
  runner: RequirementsNoticeRunner;
}

export interface RequirementsNoticeResult {
  /** True when the engineer was messaged (queued counts as messaged). */
  sent: boolean;
  queued?: boolean;
  /** The changed-sections summary, present even when delivery was skipped. */
  summary?: string;
  /** Why no message went out, when `sent` is false. */
  reason?: string;
}

/**
 * Compare `prevBody` with the task's current body and, on an active task,
 * deliver the engineer one message naming the changed sections. Worktree
 * resolution uses the queued Git worker.
 */
export async function notifyEngineerOfRequirementsChange(
  deps: RequirementsNoticeDeps,
  task: Task,
  prevBody: string,
): Promise<RequirementsNoticeResult> {
  if (task.status !== "active") return { sent: false, reason: "task is not active" };
  const change = summarizeRequirementsChange(prevBody, task.body);
  if (!change) return { sent: false, reason: "no requirement sections changed" };
  const summary = change.summary;

  const agent = resolveAgentForTask(deps.config, task);
  if (!agent) return { sent: false, summary, reason: "no enabled engineer agent" };

  const cwd = task.branch
    ? ((await getGitWorker(deps.config.root).worktreePath(task.branch)) ?? deps.config.root)
    : undefined;
  const preamble =
    task.branch && cwd ? await serverResumePreamble(deps.config, task, task.branch, cwd) : "";
  const result = deps.runner.send(task.id, requirementsChangeMessage(task, change), agent, {
    resumePreamble: preamble || undefined,
    skipBoardDivergence: true,
    cwd,
  });
  if (!result.ok) {
    return { sent: false, summary, reason: result.reason ?? "could not notify engineer" };
  }
  return { sent: true, queued: result.queued === true, summary };
}
