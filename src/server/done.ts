/**
 * `POST /api/tasks/:id/done` orchestration — the review -> done close-out.
 *
 * Runs against the MAIN checkout (`config.root`), never the task's worktree:
 *   1. merge the task's branch into main (FF when possible, merge commit
 *      otherwise); if the merge hits a synchronization snag (drift/conflict),
 *      the branch is automatically synced with main and the merge retried;
 *      an unrecoverable conflict is aborted and the task stays review.
 *      A retry after the branch was already integrated is detected up front
 *      (`alreadyMerged`) so it resumes the remaining steps instead of being
 *      mislabelled as a failed merge.
 *   2. rebuild + regenerate screenshots + `repoos check` so the merged main
 *      stays green. The check runs the merged checkout's OWN freshly-built
 *      CLI (`dist/cli/index.js`) first — a globally linked `repoos` resolves
 *      build freshness and gate code against its own install snapshot, which
 *      can disagree with the checkout being closed out (#0130). Failure output
 *      is preserved with the exact command, exit status, and a redacted tail
 *      of stdout/stderr so the failing stage is diagnosable.
 *   3. set status `done`, delete the branch, remove the task's worktree.
 * A failure at any step leaves the task in `review`; if the merge already
 * happened, we report that state honestly and a retry resumes from the failed
 * step rather than treating the branch as a new conflicting merge.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  mergeBranch,
  preflightMerge,
  syncBranchWithMain,
  deleteBranch,
  removeWorktree,
  commitTaskFile,
  currentBranch,
  isAncestor,
  localBranches,
  worktreePathForBranch,
} from "../core/git.js";
import { markTaskReleased } from "./write.js";

export interface CheckSummary {
  ok: boolean;
  /** Failing close-out stage — "build" | "screenshots" | "check". */
  stage?: string;
  /** The exact command that failed (argv joined with spaces). */
  command?: string;
  /** Exit status of the failing command (null = killed / never exited). */
  exitCode?: number | null;
  /** Spawn failure code when the command could not start (ENOENT/EACCES). */
  errorCode?: string;
  /** Redacted tail of stdout+stderr (bounded). */
  output?: string;
  /** Human-readable failure detail (redacted, includes command + status). */
  detail?: string;
}

export interface CompleteResult {
  ok: boolean;
  /** Whether the branch was merged into main (even when later steps failed). */
  merged: boolean;
  /** True when the branch was already integrated into main before this run. */
  alreadyMerged?: boolean;
  /** Files that conflicted (merge aborted, task still in review). */
  conflicts: string[];
  /** Whether the merge was a fast-forward. */
  ff: boolean;
  /** True when a non-fast-forward/conflicting merge was detected in pre-flight. */
  drifted: boolean;
  /** Post-merge build/check gate (undefined when the merge itself failed). */
  check?: CheckSummary;
  /** The updated task, present when the task reached `done`. */
  task?: Task;
  /** Human-readable reason (not ok). */
  reason?: string;
}

/** The progress steps reported to the UI while the flow runs. */
export type DoneStep = "merge" | "build" | "screenshots" | "check" | "done";

export interface MergeAttempt {
  /** Whether the branch was merged into the main checkout. */
  merged: boolean;
  /** Whether the merge was a fast-forward. */
  ff: boolean;
  /** True when main was not an ancestor of the branch at merge time. */
  drifted: boolean;
  /** Files that conflicted (merge aborted, task still in review). */
  conflicts: string[];
  /** Human-readable failure reason (not merged and not a conflict). */
  reason?: string;
  /** True when an automatic sync-with-main ran before the successful merge. */
  autoSynced?: boolean;
  /**
   * True when the branch was already integrated into main before this run (a
   * retry after an earlier close-out merged it), so the merge step is a no-op.
   */
  alreadyMerged?: boolean;
}

/**
 * Merge `branch` into the main checkout, auto-syncing with main on a snag.
 *
 * Runs the existing pre-flight + merge once. If the merge cannot proceed
 * because the branch needs to be synchronized with main (drift or a conflict),
 * it runs the repository's existing sync-with-main operation (`main` merged
 * into the branch's worktree) and retries the merge. A successful sync makes
 * the retry a clean fast-forward, so the close-out completes without a manual
 * "Sync with main" step. Real source conflicts fail the sync too, and the
 * original failure is returned so the user sees exactly which files conflicted.
 * Never merges before the first attempt — automatic sync is the fallback, not
 * the default.
 */
export async function mergeTaskBranchWithAutoSync(
  root: string,
  branch: string,
  opts: { autoResolve?: string[] } = {},
): Promise<MergeAttempt> {
  // Already integrated — the idempotent-retry case (#0130). The branch tip is
  // an ancestor of main (an earlier close-out merged it but stranded the task
  // in review on a later gate), so the merge step is a no-op and a retry must
  // resume the remaining steps rather than report a failed merge. When the
  // branch ref is also gone the close-out cleanup already ran (`deleteBranch`
  // refuses unmerged branches, so a missing branch was integrated) and there
  // is nothing left to merge.
  const head = currentBranch(root);
  if (head !== null && head !== branch && isAncestor(root, branch, head) === true) {
    return {
      merged: true,
      ff: true,
      drifted: false,
      conflicts: [],
      alreadyMerged: true,
    };
  }
  if (!localBranches(root).has(branch) && worktreePathForBranch(root, branch) === null) {
    return {
      merged: true,
      ff: true,
      drifted: false,
      conflicts: [],
      alreadyMerged: true,
    };
  }

  const attempt = async (): Promise<MergeAttempt> => {
    const preflight = await preflightMerge(root, branch, opts);
    if (!preflight.ok) {
      return {
        merged: false,
        ff: false,
        drifted: preflight.drifted,
        conflicts: preflight.conflicts,
        reason: preflight.reason ?? "merge conflict",
      };
    }
    const merge = await mergeBranch(root, branch, opts);
    return {
      merged: merge.merged,
      ff: merge.ff,
      drifted: preflight.drifted,
      conflicts: merge.conflicts,
      reason: merge.conflicts.length
        ? `merge conflict: ${merge.conflicts.join(", ")}`
        : merge.reason,
    };
  };

  const first = await attempt();
  if (first.merged) return first;

  // The merge hit a synchronization-related snag: automatically sync the branch
  // with main, then retry. If the sync itself cannot complete cleanly (real
  // source conflicts), surface the first failure rather than inventing a new
  // error — the user resolves those files in the worktree and retries.
  const sync = await syncBranchWithMain(root, branch, opts);
  if (!sync.ok) return first;

  const retry = await attempt();
  if (retry.merged) return { ...retry, autoSynced: true };
  return retry;
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
  /** True when the process was SIGKILLed by the timeout budget. */
  timedOut?: boolean;
}

/** Non-blocking `spawn`, resolving with exit status + captured output. */
function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout: number },
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let timedOut = false;
    const finish = (status: number | null, error?: NodeJS.ErrnoException): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ status, stdout, stderr, error, timedOut });
    };
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (err: NodeJS.ErrnoException) => finish(null, err));
    child.on("close", (code: number | null) => finish(code));
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeout);
  });
}

/** Token shapes that must never surface in close-out diagnostics. */
const SECRET_PATTERNS: RegExp[] = [
  /github_pat_[A-Za-z0-9_]+/g,
  /gh[pousr]_[A-Za-z0-9]+/g,
  /\bsk-[A-Za-z0-9_-]+/g,
  /xox[baprs]-[A-Za-z0-9-]+/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

/** Replace anything that looks like a credential with `***`. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "***");
  return out;
}

/** Strip ANSI SGR escape sequences so diagnostics stay readable in JSON. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

const MAX_OUTPUT_CHARS = 4000;
const MAX_OUTPUT_LINES = 40;

/**
 * The useful part of a failed command's combined output: the LAST meaningful
 * lines (errors print at the tail, so the old first-6-lines slice kept noise
 * and dropped the reason), redacted, ANSI-free, and bounded.
 */
export function captureOutput(stdout: string, stderr: string): string {
  const combined = redactSecrets(stripAnsi([stdout, stderr].join("\n")));
  const lines = combined.split("\n").map((l) => l.trim()).filter(Boolean);
  const tail = lines.slice(-MAX_OUTPUT_LINES).join("\n");
  return tail.length > MAX_OUTPUT_CHARS ? tail.slice(-MAX_OUTPUT_CHARS) : tail;
}

/** Quote argv so a path with spaces stays a single command token. */
function fmtCommand(argv: readonly string[]): string {
  return argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ");
}

export type CheckStage = "build" | "screenshots" | "check";

export interface RunStepOptions {
  cwd: string;
  candidates: string[][];
  /** Human-readable label used in failure text. */
  label: string;
  /** Stage the failing command belongs to (for diagnostics). */
  stage: CheckStage;
  /** Per-command wall-clock budget before SIGKILL, in ms. */
  timeout?: number;
}

/**
 * Try each candidate command in order until one exits 0. A command that runs
 * and fails (non-zero exit, spawn error other than ENOENT/EACCES) is the
 * authoritative failure: it is reported with the exact command, exit status,
 * and a redacted output tail so the failing stage is diagnosable. Commands
 * that cannot be launched (missing tool) are skipped in favor of the next
 * candidate. Returns `{ ok: true }` on success.
 */
export async function runDoneStep(opts: RunStepOptions): Promise<CheckSummary> {
  const timeout = opts.timeout ?? 240_000;
  let missing = "";
  for (const cmd of opts.candidates) {
    const run = await runProcess(cmd[0], cmd.slice(1), { cwd: opts.cwd, timeout });
    if (run.status === 0) return { ok: true, stage: opts.stage };
    if (run.error && (run.error.code === "ENOENT" || run.error.code === "EACCES")) {
      missing = `${cmd[0]} is not available`;
      continue;
    }
    const command = fmtCommand(cmd);
    const statusText = run.timedOut
      ? `timed out after ${Math.round(timeout / 1000)}s (killed)`
      : run.error
        ? `could not start (${run.error.code ?? run.error.message})`
        : `exit ${run.status}`;
    const output = captureOutput(run.stdout, run.stderr);
    const short = output.slice(0, 500).replace(/\s+/g, " ").trim();
    return {
      ok: false,
      stage: opts.stage,
      command,
      exitCode: run.status,
      errorCode: run.error?.code,
      output,
      detail: `${opts.label} failed (${statusText}) — ${command}${short ? ` — ${short}` : ""}`,
    };
  }
  return { ok: false, stage: opts.stage, detail: missing || `\`${opts.label}\` could not be run` };
}

const BUILD_STEPS: string[][] = [
  ["bun", "run", "build"],
  ["npm", "run", "build"],
];

/**
 * Regenerate the committed screenshots. Merging a UI-changing task makes the
 * `screenshots` gate of `repoos check` fail (the `.ui-hash` drift), so the
 * done flow re-captures before checking. The script serves dist/ui itself on an
 * ephemeral port, so no build is needed here — `BUILD_STEPS` already ran.
 */
const SCREENSHOT_STEPS: string[][] = [["node", "scripts/capture-screenshots.mjs"]];

/** Commit regenerated `dist/` and `screenshots/` so main stays clean and mergeable. */
async function commitGenerated(root: string): Promise<void> {
  await runProcess("git", ["add", "-A", "--", "dist", "screenshots"], { cwd: root, timeout: 4000 });
  await runProcess("git", ["commit", "-m", "chore: regenerate dist and screenshots"], {
    cwd: root,
    timeout: 4000,
  });
}

/**
 * The commands that run the post-merge gate, in preference order. The merged
 * checkout's OWN freshly-built CLI comes first: a globally linked `repoos`
 * resolves build freshness and runs gate code against its own install snapshot
 * (in this self-hosted repo the global install is the main checkout's dist),
 * which can disagree with the checkout being closed out — running `check` from
 * the merged `dist/cli/index.js` guarantees the gate evaluates the merged code
 * with the merged gate logic (#0130).
 */
function checkCandidates(root: string): string[][] {
  const localCli = join(root, "dist", "cli", "index.js");
  const list: string[][] = [];
  if (existsSync(localCli)) {
    list.push([process.execPath, localCli, "check"]);
  }
  list.push(["repoos", "check"], ["bun", "run", "repoos", "check"]);
  return list;
}

/** Post-merge gate runners, overridable in tests to avoid real builds. */
export interface CompleteTaskSteps {
  build?: (cwd: string) => Promise<CheckSummary>;
  screenshots?: (cwd: string) => Promise<CheckSummary>;
  check?: (cwd: string) => Promise<CheckSummary>;
}

export async function completeTask(
  config: RepoOSConfig,
  task: Task,
  onProgress?: (step: DoneStep) => void,
  steps: CompleteTaskSteps = {},
): Promise<CompleteResult> {
  const root = config.root;

  onProgress?.("merge");
  // Ensure the task file is committed in main before merging: API-created tasks
  // are untracked in main, and the agent's main-copy sync leaves uncommitted
  // edits — either would abort `git merge`. The branch's version of the task
  // file is authoritative for the final state, so if it is the only conflicted
  // path the merge resolves it automatically.
  commitTaskFile(root, task.absPath, `docs(${task.id}): update task`);
  const rel = relative(root, task.absPath);
  // `dist/` and `screenshots/` are generated by every build/check and change on
  // both sides of a close-out merge; the build right after this merge
  // regenerates them, so the branch's version is safe to take.
  const autoResolve = [rel, "dist/", "screenshots/"];

  // Cheap pre-flight: detect source-file conflicts before the expensive
  // build/screenshots/check steps run. Never leaves a half-applied merge.
  // When the merge cannot proceed because the branch needs to be synchronized
  // with main, `mergeTaskBranchWithAutoSync` runs the existing sync-with-main
  // operation and retries, so the close-out completes without a manual step.
  // A retry where the branch was already integrated is detected up front and
  // reported as `alreadyMerged`, resuming from the remaining steps.
  const merge = await mergeTaskBranchWithAutoSync(root, task.branch, { autoResolve });
  if (!merge.merged) {
    return {
      ok: false,
      merged: false,
      alreadyMerged: merge.alreadyMerged,
      conflicts: merge.conflicts,
      ff: false,
      drifted: merge.drifted,
      reason: merge.reason ?? "merge failed",
    };
  }

  onProgress?.("build");
  const build = steps.build
    ? await steps.build(root)
    : await runDoneStep({ cwd: root, candidates: BUILD_STEPS, label: "bun run build", stage: "build", timeout: 300_000 });
  if (!build.ok) {
    return {
      ok: false,
      merged: true,
      alreadyMerged: merge.alreadyMerged,
      conflicts: [],
      ff: merge.ff,
      drifted: merge.drifted,
      check: build,
      reason: `build failed after merge (${build.exitCode ?? build.errorCode ?? "killed"}) — the branch IS merged into main; retrying resumes from the build step. Task kept in review.`,
    };
  }
  // Re-capture screenshots against the merged UI so `repoos check` stays green.
  onProgress?.("screenshots");
  const shots = steps.screenshots
    ? await steps.screenshots(root)
    : await runDoneStep({ cwd: root, candidates: SCREENSHOT_STEPS, label: "repoos screenshots", stage: "screenshots", timeout: 300_000 });
  if (!shots.ok) {
    return {
      ok: false,
      merged: true,
      alreadyMerged: merge.alreadyMerged,
      conflicts: [],
      ff: merge.ff,
      drifted: merge.drifted,
      check: shots,
      reason: `screenshot regeneration failed after merge (${shots.exitCode ?? shots.errorCode ?? "killed"}) — the branch IS merged into main; retrying resumes from screenshot generation. Task kept in review.`,
    };
  }
  await commitGenerated(root);

  onProgress?.("check");
  const check = steps.check
    ? await steps.check(root)
    : await runDoneStep({ cwd: root, candidates: checkCandidates(root), label: "repoos check", stage: "check", timeout: 600_000 });
  if (!check.ok) {
    return {
      ok: false,
      merged: true,
      alreadyMerged: merge.alreadyMerged,
      conflicts: [],
      ff: merge.ff,
      drifted: merge.drifted,
      check,
      reason: `repoos check failed after merge (${check.exitCode ?? check.errorCode ?? "killed"}) — the branch IS merged into main; retrying resumes from the check step. Task kept in review.`,
    };
  }

  onProgress?.("done");
  const updated = markTaskReleased(config, task.absPath);
  // Best-effort cleanup; content is preserved in the merged main. The worktree
  // must go first — git refuses to delete a branch checked out in a worktree.
  // Both are fail-soft, so an already-cleaned retry is a no-op here.
  removeWorktree(root, task.branch);
  deleteBranch(root, task.branch);

  return {
    ok: true,
    merged: true,
    alreadyMerged: merge.alreadyMerged,
    conflicts: [],
    ff: merge.ff,
    drifted: merge.drifted,
    check: { ok: true },
    task: updated,
  };
}
