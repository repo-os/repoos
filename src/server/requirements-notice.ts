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
 * Delivery mirrors the `/message` route: an engineer already in a session gets
 * `runner.send` (which queues while a turn is live); a task whose engineer has
 * not started yet is started so the new requirements are actually read. A task
 * that is not `active` is never notified.
 */
import type { Agent, RepoOSConfig, Task } from "../core/types.js";
import { worktreePathForBranch } from "../core/git.js";
import { requirementsChangeMessage, summarizeRequirementsChange } from "../core/task-body-diff.js";
import { resumePreamble } from "../core/context-pack.js";
import { resolveAgentForTask } from "./agents.js";

/** The subset of `AgentRunner` this module needs (keeps tests lightweight). */
export interface RequirementsNoticeRunner {
  output(taskId: string): unknown;
  send(
    taskId: string,
    text: string,
    agent: Agent,
    opts?: { resumePreamble?: string; skipBoardDivergence?: boolean; cwd?: string },
  ): { ok: boolean; queued?: boolean; reason?: string };
  start(
    task: Task,
    branch: string,
    agent: Agent,
    opts?: { cwd?: string; resumePreamble?: string },
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
 * deliver the engineer one message naming the changed sections. Synchronous by
 * design so it can run from inside `LiveIndex.applyFileChange`.
 */
export function notifyEngineerOfRequirementsChange(
  deps: RequirementsNoticeDeps,
  task: Task,
  prevBody: string,
): RequirementsNoticeResult {
  if (task.status !== "active") return { sent: false, reason: "task is not active" };
  const change = summarizeRequirementsChange(prevBody, task.body);
  if (!change) return { sent: false, reason: "no requirement sections changed" };
  const summary = change.summary;

  if (!task.branch) return { sent: false, summary, reason: "task has no branch" };
  const agent = resolveAgentForTask(deps.config, task);
  if (!agent) return { sent: false, summary, reason: "no enabled engineer agent" };

  const cwd = worktreePathForBranch(deps.config.root, task.branch) ?? deps.config.root;
  const text = requirementsChangeMessage(task, change);
  const hasSession = deps.runner.output(task.id) !== null;
  const result = hasSession
    ? deps.runner.send(task.id, text, agent, {
        resumePreamble: resumePreamble(deps.config, task, task.branch, cwd) || undefined,
        skipBoardDivergence: true,
        cwd,
      })
    : deps.runner.start(task, task.branch, agent, { cwd, resumePreamble: text });

  if (!result.ok) {
    return { sent: false, summary, reason: result.reason ?? "could not notify engineer" };
  }
  return { sent: true, queued: "queued" in result ? result.queued : undefined, summary };
}
