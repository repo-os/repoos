/**
 * Trusted finalization for a runner-issued handoff capability.
 *
 * Agents only edit their assigned worktree and emit a structured readiness
 * signal. The runner binds that signal to its active turn and calls this code
 * after the process exits successfully. No agent-controlled command or path is
 * executed: task, branch and worktree are all checked against RepoOS state.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RepoOSConfig, Status, Task } from "../core/types.js";
import { runGit, worktreePathForBranch } from "../core/git.js";
import { parseTask } from "../core/task.js";
import type { AgentHandoffRequest } from "./agents.js";
import { patchTaskFile } from "./write.js";

export type HandoffStep = "validate" | "check" | "commit" | "review" | "main" | "done";

export interface HandoffResult {
  ok: boolean;
  detail?: string;
  step: HandoffStep;
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((finish) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const done = (status: number | null, error?: NodeJS.ErrnoException): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish({ status, stdout, stderr, error });
    };
    child.stdout.on("data", (data: Buffer) => (stdout += data.toString("utf8")));
    child.stderr.on("data", (data: Buffer) => (stderr += data.toString("utf8")));
    child.on("error", (error: NodeJS.ErrnoException) => done(null, error));
    child.on("close", (code) => done(code));
    timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  });
}

function samePath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

function concise(run: RunResult): string {
  if (run.error) return run.error.message;
  return [run.stdout, run.stderr]
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8)
    .join(" · ") || `exit ${run.status}`;
}

const CHECK_STEPS = [
  ["repoos", "check"],
  ["bun", "run", "repoos", "check"],
  ["node", "dist/cli/index.js", "check"],
] as const;

async function runCheck(worktree: string): Promise<RunResult> {
  let last: RunResult = { status: null, stdout: "", stderr: "check command unavailable" };
  for (const candidate of CHECK_STEPS) {
    last = await run(candidate[0], [...candidate.slice(1)], worktree, 240_000);
    if (last.status === 0) return last;
    if (!last.error || (last.error.code !== "ENOENT" && last.error.code !== "EACCES")) return last;
  }
  return last;
}

/** Finalize one capability issued by an active runner turn. */
export async function handoffTask(
  config: RepoOSConfig,
  task: Task,
  request: AgentHandoffRequest,
  onProgress?: (step: HandoffStep) => void,
  onStatusChange?: (task: Task, prev: Status, next: Status) => void,
): Promise<HandoffResult> {
  onProgress?.("validate");
  if (!request.runId || request.taskId !== task.id) {
    return { ok: false, step: "validate", detail: "handoff does not match the active runner session" };
  }
  if (task.status !== "active" && task.status !== "review") {
    return { ok: false, step: "validate", detail: `task must be active or review, but is ${task.status}` };
  }
  if (!task.branch || request.branch !== task.branch) {
    return { ok: false, step: "validate", detail: "handoff branch does not match the task branch" };
  }
  const registered = worktreePathForBranch(config.root, task.branch);
  if (!registered || !samePath(registered, request.workdir) || !existsSync(registered)) {
    return { ok: false, step: "validate", detail: "handoff worktree does not match the registered task worktree" };
  }
  const branch = await runGit(registered, ["branch", "--show-current"], 10_000);
  if (branch.status !== 0 || branch.stdout.trim() !== task.branch) {
    return { ok: false, step: "validate", detail: "registered worktree is not on the expected branch" };
  }
  const worktreeTaskPath = join(registered, task.path);
  if (!existsSync(worktreeTaskPath)) {
    return { ok: false, step: "validate", detail: "task file is missing from the registered worktree" };
  }
  let worktreeTask: Task;
  try {
    worktreeTask = parseTask({
      content: readFileSync(worktreeTaskPath, "utf8"),
      absPath: worktreeTaskPath,
      root: registered,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
  } catch (error) {
    return { ok: false, step: "validate", detail: `could not parse the worktree task: ${(error as Error).message}` };
  }
  // On a first launch the linked worktree is created immediately before the
  // canonical task receives its derived branch, so its task copy may still
  // have an empty branch. A different non-empty branch is never acceptable.
  if (worktreeTask.id !== task.id || (worktreeTask.branch && worktreeTask.branch !== task.branch)) {
    return { ok: false, step: "validate", detail: "worktree task identity does not match the active task" };
  }

  // A completed retry still validates identity before returning success.
  if (task.status === "review" && worktreeTask.status === "review") {
    return { ok: true, step: "done", detail: "handoff was already finalized" };
  }

  onProgress?.("check");
  const check = await runCheck(registered);
  if (check.status !== 0) {
    return { ok: false, step: "check", detail: `repoos check failed: ${concise(check)}` };
  }

  onProgress?.("commit");
  const add = await runGit(registered, ["add", "-A"], 30_000);
  if (add.status !== 0) return { ok: false, step: "commit", detail: `git add failed: ${concise(add)}` };
  const staged = await runGit(registered, ["diff", "--cached", "--quiet"], 10_000);
  if (staged.status === 1) {
    const commit = await runGit(registered, ["commit", "-m", `feat(${task.id}): implement ${task.title}`], 30_000);
    if (commit.status !== 0) return { ok: false, step: "commit", detail: `git commit failed: ${concise(commit)}` };
  } else if (staged.status !== 0) {
    return { ok: false, step: "commit", detail: `could not inspect staged changes: ${concise(staged)}` };
  }

  onProgress?.("review");
  if (worktreeTask.status !== "review" || worktreeTask.branch !== task.branch) {
    try {
      patchTaskFile(
        { ...config, root: registered },
        worktreeTaskPath,
        { status: "review", branch: task.branch },
      );
    } catch (error) {
      return { ok: false, step: "review", detail: `could not update the worktree task: ${(error as Error).message}` };
    }
  }

  onProgress?.("main");
  if (task.status !== "review") {
    try {
      patchTaskFile(config, task.absPath, { status: "review" }, {
        onStatusChange: onStatusChange
          ? (updated, prev, next) => onStatusChange(updated, prev, next)
          : undefined,
      });
    } catch (error) {
      return { ok: false, step: "main", detail: `could not update the canonical task: ${(error as Error).message}` };
    }
  }
  onProgress?.("done");
  return { ok: true, step: "done" };
}
