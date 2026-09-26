/**
 * Trusted finalization for a handoff capability.
 *
 * Agents only edit their assigned worktree and emit a structured readiness
 * signal (or run `repoos mv <own id> review` inside their runner session, which
 * records the same request — see handoff-request.ts). The runner binds that
 * request to its active turn and calls this code after the process exits. No
 * agent-controlled command or path is executed: task, branch and worktree are
 * all checked against RepoOS state.
 *
 * #0507: this is the ONE finalization path. It used to be reachable only from
 * a runner-minted capability, which left the Review button, board drag, a
 * direct PATCH and a `repoos mv` from a human's shell all going through the
 * bare commit/vacuity gate instead — and the route agents actually use
 * (`repoos mv <own id> review`) was the worst of them, because it also killed
 * the agent that asked. `finalizeReviewHandoff` is the same code without the
 * capability requirement, and every route in server.ts / routes/tasks.ts now
 * funnels through it; the shared body below is what both entry points run.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RepoOSConfig, Status, Task } from "../core/types.js";
import {
  runGit,
  worktreePathForBranch,
  currentBranch,
  branchChangesSinceBase,
} from "../core/git.js";
import { CLOSEOUT_CHECK_ARGS } from "../core/check-plan.js";
import { parseTask } from "../core/task.js";
import { parseDocument, serializeDocument } from "../core/frontmatter.js";
import type { AgentHandoffRequest, AgentRunner } from "./agents.js";
import { resolveAgentForTask } from "./agents.js";
import { patchTaskFile } from "./write.js";
import { guardReviewTransition } from "./review-guard.js";
import type { TaskCheckManager, TaskCheckListener } from "./task-check.js";

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

function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
  onChunk?: (text: string) => void,
): Promise<RunResult> {
  return new Promise((finish) => {
    const child = spawn(cmd, args, { cwd, env: env ?? process.env });
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
    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString("utf8");
      stdout += text;
      onChunk?.(text);
    });
    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString("utf8");
      stderr += text;
      onChunk?.(text);
    });
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

/**
 * Clears a stale `check_retry_count` once a handoff's `repoos check` step
 * passes. The field exists only to cap `scheduleCheckFailureRetry`'s retries
 * and to let the board show "fixing check failure" while a retry is in
 * flight (0265) — left on the file after the check that mattered has passed,
 * it would mislabel any later, unrelated resume of this task's engineer
 * session as still fixing a check failure. Best-effort: never fails the
 * handoff over a cosmetic field.
 */
function clearCheckRetryCount(absPath: string): void {
  try {
    const raw = readFileSync(absPath, "utf8");
    const doc = parseDocument(raw);
    if (doc.data.check_retry_count === undefined) return;
    delete doc.data.check_retry_count;
    writeFileSync(absPath, serializeDocument(doc.data, `\n${doc.body}\n`, Object.keys(doc.data)));
  } catch (err) {
    console.error(
      `[repoos] could not clear check_retry_count for ${absPath}: ${(err as Error).message}`,
    );
  }
}

function concise(run: RunResult): string {
  if (run.error) return run.error.message;
  return (
    [run.stdout, run.stderr]
      .join("\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-8)
      .join(" · ") || `exit ${run.status}`
  );
}

async function runCheck(
  worktree: string,
  config: RepoOSConfig,
  onChunk?: (text: string) => void,
): Promise<RunResult> {
  // Prefer the assigned worktree's compiled CLI. A globally linked `repoos`
  // resolves build freshness relative to its own package checkout, which can
  // falsely pass or fail when finalizing a different linked worktree.
  const localCli = join(worktree, "dist", "cli", "index.js");
  const candidates: ReadonlyArray<readonly [string, ...string[]]> = existsSync(localCli)
    ? [[process.execPath, localCli, "check", ...CLOSEOUT_CHECK_ARGS]]
    : [
        ["repoos", "check", ...CLOSEOUT_CHECK_ARGS],
        ["bun", "run", "repoos", "check", ...CLOSEOUT_CHECK_ARGS],
      ];
  // Scope the test step to what this branch actually changed since its
  // merge-base with main (see changedTestRef in commands/check.ts): this is
  // re-verifying the SAME isolated branch the engineer already self-checked,
  // not main's merged state, so narrowing coverage here is safe and cuts a
  // ~10-minute full run down to seconds for a typical small task. Falls back
  // to an unscoped (full) run when the merge-base can't be resolved.
  const baseBranch = currentBranch(config.root) ?? "main";
  const { base } = branchChangesSinceBase(worktree, baseBranch);
  const env = base ? { ...process.env, REPOOS_CHECK_CHANGED: base } : process.env;
  let last: RunResult = { status: null, stdout: "", stderr: "check command unavailable" };
  for (const candidate of candidates) {
    last = await run(candidate[0], [...candidate.slice(1)], worktree, 240_000, env, onChunk);
    if (last.status === 0) return last;
    if (!last.error || (last.error.code !== "ENOENT" && last.error.code !== "EACCES")) return last;
  }
  return last;
}

/** Hard cap on an entire finalization, whatever route asked for it. */
const HANDOFF_DEADLINE_MS = 600_000; // 10 minutes

/** Where a handoff came from. Diagnostics only — never trusted for authority. */
export type HandoffOrigin =
  | "agent-signal"
  | "agent-mv"
  | "ui-review"
  | "board-drag"
  | "task-file"
  | "api";

/** Side channels a caller supplies to observe a finalization as it runs. */
export interface HandoffSink {
  onProgress?: (step: HandoffStep) => void;
  onStatusChange?: (task: Task, prev: Status, next: Status) => void;
  /** Records this finalization's `repoos check` run for the Debug tab (0310). */
  taskChecks?: TaskCheckManager;
  onTaskCheckEvent?: TaskCheckListener;
}

/** Options for the non-capability entry point (`finalizeReviewHandoff`). */
export interface ReviewHandoffOptions extends HandoffSink {
  /**
   * Human-only override (#0507): run the commit/vacuity gate but NOT
   * `repoos check`. Reached exclusively through the Review button's explicit
   * "Skip checks" choice, which the UI gates behind a confirm modal and the
   * server records in the activity log. Agents never get this.
   */
  skipChecks?: boolean;
  /** Who chose to skip, recorded in the activity entry. */
  actor?: string;
  /** Which route asked — surfaced in progress/sys lines for debugging. */
  origin?: HandoffOrigin;
}

/** The worktree-side facts the finalization body needs, once resolved. */
interface ResolvedWorktree {
  workdir: string;
  isHotfix: boolean;
  worktreeTaskPath: string;
  worktreeTask: Task;
}

function fail(step: HandoffStep, detail: string): HandoffResult {
  return { ok: false, step, detail };
}

/**
 * Resolve the task's registered worktree and its own copy of the task file,
 * refusing anything RepoOS state does not vouch for. Shared by both entry
 * points; `expectWorkdir` is the capability path's additional binding (a runner
 * turn may only hand off from the worktree it was actually launched in).
 */
async function resolveWorktree(
  config: RepoOSConfig,
  task: Task,
  expectWorkdir?: string,
): Promise<{ ok: true; resolved: ResolvedWorktree } | { ok: false; result: HandoffResult }> {
  if (task.status !== "active" && task.status !== "review") {
    return {
      ok: false,
      result: fail("validate", `task must be active or review, but is ${task.status}`),
    };
  }
  if (!task.branch) {
    return {
      ok: false,
      result: fail("validate", `task #${task.id} has no branch to finalize from`),
    };
  }
  const isHotfix = task.hotfix === true;
  const registered = worktreePathForBranch(config.root, task.branch);
  const registeredIsRoot = registered ? samePath(registered, config.root) : false;
  if (isHotfix) {
    if (!registeredIsRoot || (expectWorkdir && !samePath(config.root, expectWorkdir))) {
      return {
        ok: false,
        result: fail("validate", "hotfix handoff must run in the main checkout"),
      };
    }
  } else if (
    !registered ||
    !existsSync(registered) ||
    (expectWorkdir && !samePath(registered, expectWorkdir))
  ) {
    return {
      ok: false,
      result: fail("validate", "handoff worktree does not match the registered task worktree"),
    };
  }
  // After validation, `registered` is non-null for both paths — hotfix
  // requires registeredIsRoot, non-hotfix requires `registered` truthy.
  const workdir = isHotfix ? config.root : registered!;
  const branch = await runGit(workdir, ["branch", "--show-current"], 10_000);
  if (branch.status !== 0 || branch.stdout.trim() !== task.branch) {
    return {
      ok: false,
      result: fail("validate", "registered worktree is not on the expected branch"),
    };
  }
  const worktreeTaskPath = join(workdir, task.path);
  if (!existsSync(worktreeTaskPath)) {
    return {
      ok: false,
      result: fail("validate", "task file is missing from the registered worktree"),
    };
  }
  let worktreeTask: Task;
  try {
    worktreeTask = parseTask({
      content: readFileSync(worktreeTaskPath, "utf8"),
      absPath: worktreeTaskPath,
      root: workdir,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
  } catch (error) {
    return {
      ok: false,
      result: fail("validate", `could not parse the worktree task: ${(error as Error).message}`),
    };
  }
  if (worktreeTask.id !== task.id || (worktreeTask.branch && worktreeTask.branch !== task.branch)) {
    return {
      ok: false,
      result: fail("validate", "worktree task identity does not match the active task"),
    };
  }
  return { ok: true, resolved: { workdir, isHotfix, worktreeTaskPath, worktreeTask } };
}

/**
 * The ONE finalization body every route into `review` runs: validate →
 * (check) → commit/vacuity gate → worktree copy → canonical board copy.
 *
 * It never moves the task anywhere on its own initiative: every early return
 * leaves the task in the status it arrived in. The caller's job is to keep the
 * task `active` until this returns ok, which is why the server-side routes
 * await it before writing `status: review` anywhere.
 */
async function runHandoffFinalization(
  config: RepoOSConfig,
  task: Task,
  resolved: ResolvedWorktree,
  opts: ReviewHandoffOptions,
): Promise<HandoffResult> {
  const { workdir, isHotfix, worktreeTaskPath, worktreeTask } = resolved;
  const onProgress = opts.onProgress;
  const onStatusChange = opts.onStatusChange;

  if (task.status === "review" && worktreeTask.status === "review") {
    onProgress?.("done");
    return { ok: true, step: "done", detail: "handoff was already finalized" };
  }

  if (!opts.skipChecks) {
    onProgress?.("check");
    const checkHandle =
      opts.taskChecks && opts.onTaskCheckEvent
        ? opts.taskChecks.start(task.id, "handoff-finalize", opts.onTaskCheckEvent)
        : undefined;
    const check = await runCheck(workdir, config, checkHandle?.chunk);
    checkHandle?.done(check.status);
    if (check.status !== 0) {
      return fail("check", `repoos check failed: ${concise(check)}`);
    }
    clearCheckRetryCount(task.absPath);
  } else {
    // Keep the step sequence honest for a UI that renders "Running checks…":
    // the commit gate is still real work, so report it as the step in flight.
    onProgress?.("check");
  }

  onProgress?.("commit");
  // The gate resolves the worktree from `task.branch`, so it must be given the
  // CANONICAL branch, not the worktree copy's. A worktree's own copy of the
  // task file legitimately lags main's frontmatter — `patchTaskFile` commits
  // status changes to main only, so a worktree created before a branch was
  // recorded still carries no `branch:` at all. Tolerated two lines up in
  // `resolveWorktree` (an empty worktree branch is a lag, not a mismatch),
  // but fatal here, and the mismatch was invisible until #0507 started routing
  // file edits through this path.
  const gate = await guardReviewTransition(config, { ...worktreeTask, branch: task.branch });
  if (!gate.ok) {
    return fail("commit", gate.detail ?? "the commit/vacuity gate rejected the transition");
  }

  onProgress?.("review");
  if (worktreeTask.status !== "review" || worktreeTask.branch !== task.branch) {
    try {
      patchTaskFile({ ...config, root: workdir }, worktreeTaskPath, {
        status: "review",
        branch: task.branch,
      });
    } catch (error) {
      return fail("review", `could not update the worktree task: ${(error as Error).message}`);
    }
  }

  onProgress?.("main");
  if (task.status !== "review") {
    try {
      // A branch-mode hotfix runs in the root checkout, so task.absPath points
      // at the hotfix branch's copy. Before the checkout returns to main (for
      // example during a server reload), write the same metadata to main's
      // canonical board copy as well. Otherwise the next server reads the
      // pre-hotfix task and makes completed work look ready again.
      if (isHotfix && task.hotfixTarget !== "main") {
        const onHotfixBranch = await runGit(config.root, ["branch", "--show-current"], 10_000);
        if (onHotfixBranch.status !== 0 || onHotfixBranch.stdout.trim() !== task.branch) {
          return fail("main", "hotfix checkout changed before canonical task sync");
        }
        const checkoutMain = await runGit(config.root, ["checkout", "main"], 20_000);
        if (checkoutMain.status !== 0) {
          return fail("main", `could not check out main for task sync: ${concise(checkoutMain)}`);
        }
        try {
          patchTaskFile(
            config,
            join(config.root, task.path),
            {
              status: "review",
              branch: task.branch,
              hotfix: true,
              hotfixTarget: task.hotfixTarget,
            },
            { onStatusChange },
          );
        } finally {
          const restore = await runGit(config.root, ["checkout", task.branch], 20_000);
          if (restore.status !== 0) {
            return fail(
              "main",
              `canonical task synced but could not restore hotfix checkout: ${concise(restore)}`,
            );
          }
        }
      } else {
        patchTaskFile(
          config,
          task.absPath,
          {
            status: "review",
            ...(opts.skipChecks && opts.actor
              ? { note: `review without checks by ${opts.actor}` }
              : {}),
          },
          { onStatusChange },
        );
      }
    } catch (error) {
      return fail("main", `could not update the canonical task: ${(error as Error).message}`);
    }
  }
  onProgress?.("done");
  return { ok: true, step: "done" };
}

/**
 * Race a finalization against a hard deadline. If the deadline fires, return a
 * failure immediately without awaiting inner cleanup — the handoff promise
 * never hangs indefinitely. The timer is unref'd: it exists to bound the
 * RESULT, and a process with nothing else to do has nobody left to notify.
 */
function withHandoffDeadline(
  run: (markSettled: () => void) => Promise<HandoffResult>,
): Promise<HandoffResult> {
  let settled = false;
  const markSettled = (): void => {
    settled = true;
  };
  const timeoutPromise = new Promise<HandoffResult>((res) => {
    const timer = setTimeout(() => {
      if (settled) return;
      markSettled();
      res(fail("check", "server-side finalization timed out (deadline exceeded)"));
    }, HANDOFF_DEADLINE_MS);
    timer.unref?.();
  });
  return Promise.race([run(markSettled), timeoutPromise]);
}

/**
 * Finalize one capability issued by an active runner turn — the
 * `::repoos-handoff-ready::` signal, or a `repoos mv <own id> review` the same
 * turn recorded. The capability check is what makes this safe to fire without
 * further ceremony: task id, run id, branch and worktree must all match the
 * live turn, so a forged, expired, or cross-task request never finalizes.
 */
export async function handoffTask(
  config: RepoOSConfig,
  task: Task,
  request: AgentHandoffRequest,
  onProgress?: (step: HandoffStep) => void,
  onStatusChange?: (task: Task, prev: Status, next: Status) => void,
  taskChecks?: TaskCheckManager,
  onTaskCheckEvent?: TaskCheckListener,
): Promise<HandoffResult> {
  return withHandoffDeadline(async (markSettled) => {
    try {
      onProgress?.("validate");
      if (!request.runId || request.taskId !== task.id) {
        return fail("validate", "handoff does not match the active runner session");
      }
      if (!task.branch || request.branch !== task.branch) {
        return fail("validate", "handoff branch does not match the task branch");
      }
      const resolved = await resolveWorktree(config, task, request.workdir);
      if (!resolved.ok) return resolved.result;
      return await runHandoffFinalization(config, task, resolved.resolved, {
        onProgress,
        onStatusChange,
        taskChecks,
        onTaskCheckEvent,
      });
    } catch (err) {
      markSettled();
      const message = err instanceof Error ? err.message : String(err);
      return fail("validate", `unexpected error: ${message}`);
    }
  });
}

/**
 * Finalize a handoff for every NON-agent route into `review` (#0507): the
 * Review button, a board drag, `PATCH status: review`, a direct task-file edit
 * and a `repoos mv` from a human's shell. Identical to {@link handoffTask} —
 * scoped `repoos check`, then the commit/vacuity gate, then `review` — minus
 * the runner capability, which those routes by definition do not have.
 *
 * Callers must NOT write `status: review` themselves: this function is what
 * moves the task, so a failure leaves it exactly where it was (`active`) with
 * the failure to show. `onStatusChange` fires only once the check and the gate
 * have both passed.
 */
export async function finalizeReviewHandoff(
  config: RepoOSConfig,
  task: Task,
  opts: ReviewHandoffOptions = {},
): Promise<HandoffResult> {
  return withHandoffDeadline(async (markSettled) => {
    try {
      opts.onProgress?.("validate");
      const resolved = await resolveWorktree(config, task);
      if (!resolved.ok) return resolved.result;
      return await runHandoffFinalization(config, task, resolved.resolved, opts);
    } catch (err) {
      markSettled();
      const message = err instanceof Error ? err.message : String(err);
      return fail("validate", `unexpected error: ${message}`);
    }
  });
}

/** Automatic retries allowed for a `check`-step finalization failure before
 *  the task is left for the task watchdog / a human (mirrors review.ts's
 *  MAX_AUTO_REVIEW_ROUNDS bound on auto-bounce). */
const MAX_CHECK_RETRY_ATTEMPTS = 2;
/** Resume is deferred this long past the failed handoff so AgentRunner has
 *  cleared the task from `handoffsInFlight` — `send()` rejects while set. */
const CHECK_RETRY_DELAY_MS = 3_000;

/**
 * On a finalization failure at the `check` step, automatically resume the
 * same engineer session with the check output and ask it to fix (or re-verify,
 * if the failure looks transient) and re-hand-off — up to
 * `MAX_CHECK_RETRY_ATTEMPTS` times. Every other failure step (validate,
 * commit, review, main) is structural/environmental, not something a plain
 * retry of the same session fixes, so only `check` is retried.
 *
 * Returns true when a retry was scheduled. On give-up (cap reached, or no
 * engineer configured) the failure reason is persisted to the task's Activity
 * log via `AgentRunner.persistHandoffFailure` so the task watchdog classifies
 * it correctly instead of falling back to its generic
 * "exited without handoff" guess.
 */
export function scheduleCheckFailureRetry(
  config: RepoOSConfig,
  task: Task,
  result: HandoffResult,
  runner: AgentRunner,
  /** Called right after `check_retry_count` is persisted so the live index
   *  (and its SSE `task.updated` event) picks up the new count immediately —
   *  this write bypasses `patchTaskFile`, so nothing else refreshes it. */
  onFileChange?: (absPath: string) => void,
): boolean {
  if (result.step !== "check") return false;
  let retries = task.extra?.check_retry_count as number | undefined;
  if (typeof retries !== "number") retries = 0;
  const detail = result.detail ?? "repoos check failed";

  if (retries >= MAX_CHECK_RETRY_ATTEMPTS) {
    runner.persistHandoffFailure(
      task.id,
      task,
      `check failed after ${MAX_CHECK_RETRY_ATTEMPTS} automatic retries · ${detail}`,
    );
    return false;
  }

  const engineer = resolveAgentForTask(config, task);
  if (!engineer) {
    runner.persistHandoffFailure(
      task.id,
      task,
      `check failed and no engineer is configured to retry · ${detail}`,
    );
    return false;
  }

  const attempt = retries + 1;
  setTimeout(() => {
    const message = [
      `Server finalization's \`repoos check\` failed after your handoff (automatic retry ${attempt} of ${MAX_CHECK_RETRY_ATTEMPTS}):`,
      "",
      detail,
      "",
      "Fix the failure — or, if it looks like an unrelated flaky/timing test, just re-run and re-verify — then re-emit the handoff signal once `repoos check` passes.",
    ].join("\n");
    const sent = runner.send(task.id, message, engineer, { skipBoardDivergence: true });
    if (!sent.ok) {
      runner.system(
        task.id,
        `✗ automatic check-failure retry could not resume: ${sent.reason ?? "unknown error"}`,
      );
      runner.persistHandoffFailure(
        task.id,
        task,
        `could not auto-retry after check failure · ${sent.reason ?? "unknown error"}`,
      );
      return;
    }
    try {
      const raw = readFileSync(task.absPath, "utf8");
      const doc = parseDocument(raw);
      doc.data.check_retry_count = attempt;

      // Persist parseable handoff-check failure details
      doc.data.last_check_failure = {
        stage: "check",
        command: "repoos check",
        exitCode: result.detail?.match(/exit (\d+)/)?.[1] || null,
        detail: detail,
        timestamp: new Date().toISOString(),
      };

      const keys = Object.keys(doc.data).filter(
        (k) => k !== "check_retry_count" && k !== "last_check_failure",
      );
      keys.unshift("check_retry_count", "last_check_failure");
      writeFileSync(task.absPath, serializeDocument(doc.data, `\n${doc.body}\n`, keys));
      onFileChange?.(task.absPath);
    } catch (err) {
      console.error(
        `[repoos] could not persist check_retry_count for #${task.id}: ${(err as Error).message}`,
      );
    }
    runner.system(
      task.id,
      `↻ automatically resuming after check failure (attempt ${attempt} of ${MAX_CHECK_RETRY_ATTEMPTS})`,
    );
  }, CHECK_RETRY_DELAY_MS);

  return true;
}

/** Cap mirrors MAX_CHECK_RETRY_ATTEMPTS — same reasoning, different failure step. */
const MAX_MERGE_CONFLICT_RETRY_ATTEMPTS = 2;
const MERGE_CONFLICT_RETRY_DELAY_MS = 3_000;

/**
 * On a close-out `validating`-phase failure caused by a REAL merge conflict
 * (the candidate's merge of the feature branch into itself failed with named
 * conflicting paths — not the task's own bookkeeping file or `dist/`/
 * `dist/`, which auto-resolve, and not an infra failure), automatically
 * resume the task's engineer session and ask it to merge main into ITS OWN
 * branch and resolve the conflict there — the exact manual recovery
 * docs/close-out-pipeline.md prescribes (#0271 follow-up: this was
 * previously always a human/agent-operator manual step, discovered when
 * task #0282 sat failed until someone noticed).
 *
 * Unlike `scheduleCheckFailureRetry`, this does NOT ask the engineer to
 * re-emit the handoff signal — the task is already `review`, and a fresh
 * handoff attempt against an already-`review` task just short-circuits as
 * "already finalized" (see the check near the top of `handoffTask`) without
 * re-running the close-out. Instead, server.ts's `agent.exited` handler
 * watches for this exact session ending while its job is still the
 * failed-on-this-conflict record, and re-enqueues the close-out itself —
 * the same action a human clicking "Move to done" again performs. The
 * engineer's job is just to fix the branch and end its turn.
 *
 * Otherwise mirrors `scheduleCheckFailureRetry` closely: same retry cap
 * shape, same give-up-to-persistHandoffFailure fallback, same
 * do-not-flip-status behavior (the task stays in `review` — TaskCard.vue can
 * label this state the same way it labels a check-failure retry). Capped,
 * because a conflict that survives two resolve attempts is very likely the
 * agent resolving it WRONG in a way that reintroduces the same conflict, not
 * something a third attempt fixes — same logic `MAX_CHECK_RETRY_ATTEMPTS`
 * already encodes.
 *
 * Returns true when a retry was scheduled.
 */
export function scheduleMergeConflictRetry(
  config: RepoOSConfig,
  task: Task,
  reason: string,
  runner: AgentRunner,
  /** Same purpose as in `scheduleCheckFailureRetry` — let the live index pick
   *  up the new retry count immediately via its own SSE event. */
  onFileChange?: (absPath: string) => void,
): boolean {
  let retries = task.extra?.merge_conflict_retry_count as number | undefined;
  if (typeof retries !== "number") retries = 0;

  if (retries >= MAX_MERGE_CONFLICT_RETRY_ATTEMPTS) {
    runner.persistHandoffFailure(
      task.id,
      task,
      `merge conflict unresolved after ${MAX_MERGE_CONFLICT_RETRY_ATTEMPTS} automatic retries · ${reason}`,
    );
    return false;
  }

  const engineer = resolveAgentForTask(config, task);
  if (!engineer) {
    runner.persistHandoffFailure(
      task.id,
      task,
      `merge conflict and no engineer is configured to retry · ${reason}`,
    );
    return false;
  }

  const attempt = retries + 1;
  setTimeout(() => {
    const message = [
      `Close-out validation failed (automatic retry ${attempt} of ${MAX_MERGE_CONFLICT_RETRY_ATTEMPTS}): your branch has a real merge conflict with main.`,
      "",
      reason,
      "",
      'In YOUR OWN branch\'s worktree (not the candidate — the candidate is discarded and rebuilt from your branch on every attempt): merge main into your branch, resolve the conflict by understanding what BOTH sides were trying to do — do not blindly prefer one side over the other unless one is genuinely obsolete — verify `repoos check` passes, and commit the merge. The task is already in `review`, so do NOT re-emit the handoff signal (it will just report "already finalized" and do nothing) — simply end your turn once the merge is committed and verified. The close-out retries automatically the moment your turn ends.',
    ].join("\n");
    const sent = runner.send(task.id, message, engineer, { skipBoardDivergence: true });
    if (!sent.ok) {
      runner.system(
        task.id,
        `✗ automatic merge-conflict retry could not resume: ${sent.reason ?? "unknown error"}`,
      );
      runner.persistHandoffFailure(
        task.id,
        task,
        `could not auto-retry after merge conflict · ${sent.reason ?? "unknown error"}`,
      );
      return;
    }
    try {
      const raw = readFileSync(task.absPath, "utf8");
      const doc = parseDocument(raw);
      doc.data.merge_conflict_retry_count = attempt;
      const keys = Object.keys(doc.data).filter((k) => k !== "merge_conflict_retry_count");
      keys.unshift("merge_conflict_retry_count");
      writeFileSync(task.absPath, serializeDocument(doc.data, `\n${doc.body}\n`, keys));
      onFileChange?.(task.absPath);
    } catch (err) {
      console.error(
        `[repoos] could not persist merge_conflict_retry_count for #${task.id}: ${(err as Error).message}`,
      );
    }
    runner.system(
      task.id,
      `↻ automatically resuming after merge conflict (attempt ${attempt} of ${MAX_MERGE_CONFLICT_RETRY_ATTEMPTS})`,
    );
  }, MERGE_CONFLICT_RETRY_DELAY_MS);

  return true;
}

/** Cap mirrors the other two retry schedulers — same reasoning, different failure step. */
const MAX_HANDOFF_SIGNAL_RETRY_ATTEMPTS = 2;
const HANDOFF_SIGNAL_RETRY_DELAY_MS = 3_000;

/**
 * Third instance of the same pattern (#0271 follow-up), for the task-watchdog's
 * `exited-without-handoff` classification (task-watchdog.ts): a session ran to
 * completion but its final line wasn't exactly `::repoos-handoff-ready::`, so no
 * handoff ever fired. Previously the watchdog could only surface this — move
 * the task to `review`/`ready` and leave a human to notice and click Restart
 * (task #0268 sat this way until someone asked "why hasn't this recovered on
 * its own").
 *
 * Unlike the other two, this failure has no specific diagnostic to hand back —
 * "you didn't finish right" is vaguer than a named conflict or check output —
 * so it's a strictly weaker signal, which is exactly why the watchdog didn't
 * already do this: auto-resuming on a vague prompt risks looping on genuine
 * confusion, not just fixing a rendering hiccup. The cap bounds that risk the
 * same way it bounds the other two; on exhaustion this returns false and the
 * caller (task-watchdog.ts) falls through to its EXISTING surface behavior —
 * there is no separate give-up path here, unlike the other two schedulers,
 * because surfacing already IS the correct terminal state the watchdog was
 * built for.
 *
 * Returns true when a retry was scheduled; false means "give up, surface it
 * the normal way" — either the cap was hit or no engineer is configured.
 */
export function scheduleHandoffSignalRetry(
  config: RepoOSConfig,
  task: Task,
  runner: AgentRunner,
  onFileChange?: (absPath: string) => void,
): boolean {
  let retries = task.extra?.handoff_signal_retry_count as number | undefined;
  if (typeof retries !== "number") retries = 0;
  if (retries >= MAX_HANDOFF_SIGNAL_RETRY_ATTEMPTS) return false;

  const engineer = resolveAgentForTask(config, task);
  if (!engineer) return false;

  const persistAttempt = (): void => {
    // Persisted on EVERY attempt, success or failure of `send()` — otherwise a
    // structural send failure (e.g. the runner reports busy every time) would
    // never advance the counter and this could retry forever every watchdog
    // scan instead of respecting the cap.
    try {
      const raw = readFileSync(task.absPath, "utf8");
      const doc = parseDocument(raw);
      doc.data.handoff_signal_retry_count = attempt;
      const keys = Object.keys(doc.data).filter((k) => k !== "handoff_signal_retry_count");
      keys.unshift("handoff_signal_retry_count");
      writeFileSync(task.absPath, serializeDocument(doc.data, `\n${doc.body}\n`, keys));
      onFileChange?.(task.absPath);
    } catch (err) {
      console.error(
        `[repoos] could not persist handoff_signal_retry_count for #${task.id}: ${(err as Error).message}`,
      );
    }
  };

  const attempt = retries + 1;
  setTimeout(() => {
    const message = [
      `Automatic recovery (attempt ${attempt} of ${MAX_HANDOFF_SIGNAL_RETRY_ATTEMPTS}): your previous turn on this task ended without the server detecting a clean handoff.`,
      "",
      "The handoff signal must be exactly `::repoos-handoff-ready::` on its own line — a rendering quirk can occasionally mangle it (see #0154/#0155).",
      "",
      "Check your last output and the current state of your worktree. If the work is actually complete and `repoos check` passes: emit the signal line correctly this time. If it is NOT complete: finish it, verify `repoos check` passes, then emit the signal.",
    ].join("\n");
    const sent = runner.send(task.id, message, engineer, { skipBoardDivergence: true });
    persistAttempt();
    if (!sent.ok) return; // capped; the watchdog's next scan surfaces it normally
    runner.system(
      task.id,
      `↻ automatically resuming after a missed handoff signal (attempt ${attempt} of ${MAX_HANDOFF_SIGNAL_RETRY_ATTEMPTS})`,
    );
  }, HANDOFF_SIGNAL_RETRY_DELAY_MS);

  return true;
}
