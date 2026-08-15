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
import { guardReviewTransition } from "./review-guard.js";

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

async function runCheck(worktree: string): Promise<RunResult> {
  // Prefer the assigned worktree's compiled CLI. A globally linked `repoos`
  // resolves build freshness relative to its own package checkout, which can
  // falsely pass or fail when finalizing a different linked worktree.
  const localCli = join(worktree, "dist", "cli", "index.js");
  const candidates: ReadonlyArray<readonly [string, ...string[]]> = existsSync(localCli)
    ? [[process.execPath, localCli, "check"]]
    : [
        ["repoos", "check"],
        ["bun", "run", "repoos", "check"],
      ];
  let last: RunResult = { status: null, stdout: "", stderr: "check command unavailable" };
  for (const candidate of candidates) {
    last = await run(candidate[0], [...candidate.slice(1)], worktree, 240_000);
    if (last.status === 0) return last;
    if (!last.error || (last.error.code !== "ENOENT" && last.error.code !== "EACCES")) return last;
  }
  return last;
}

/**
 * Finalize one capability issued by an active runner turn.
 *
 * Enforces a hard deadline (600s) on the entire finalization process. If any
 * step (validate, check, commit, review, main) exceeds the deadline, the
 * finalization is abandoned and returned as failed. This ensures the handoff
 * promise never hangs indefinitely.
 */
export async function handoffTask(
  config: RepoOSConfig,
  task: Task,
  request: AgentHandoffRequest,
  onProgress?: (step: HandoffStep) => void,
  onStatusChange?: (task: Task, prev: Status, next: Status) => void,
): Promise<HandoffResult> {
  const HANDOFF_DEADLINE_MS = 600_000; // 10 minutes hard deadline
  let settled = false;

  // Race the entire handoff against a hard deadline. If the deadline fires,
  // return a failure result immediately without awaiting inner cleanup.
  const timeoutPromise = new Promise<HandoffResult>((resolve) => {
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ ok: false, step: "check", detail: "server-side finalization timed out (deadline exceeded)" });
      }
    }, HANDOFF_DEADLINE_MS);
  });

  const resultPromise = (async (): Promise<HandoffResult> => {
    try {
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
      if (worktreeTask.id !== task.id || (worktreeTask.branch && worktreeTask.branch !== task.branch)) {
        return { ok: false, step: "validate", detail: "worktree task identity does not match the active task" };
      }

      if (task.status === "review" && worktreeTask.status === "review") {
        return { ok: true, step: "done", detail: "handoff was already finalized" };
      }

      onProgress?.("check");
      const check = await runCheck(registered);
      if (check.status !== 0) {
        return { ok: false, step: "check", detail: `repoos check failed: ${concise(check)}` };
      }

      onProgress?.("commit");
      const gate = await guardReviewTransition(config, worktreeTask);
      if (!gate.ok) {
        return { ok: false, step: "commit", detail: gate.detail };
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
      settled = true;
      return { ok: true, step: "done" };
    } catch (err) {
      settled = true;
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, step: "validate", detail: `unexpected error: ${message}` };
    }
  })();

  return Promise.race([resultPromise, timeoutPromise]);
}
