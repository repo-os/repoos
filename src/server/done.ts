/**
 * `POST /api/tasks/:id/done` orchestration — the review -> done close-out.
 *
 * Runs against the MAIN checkout (`config.root`), never the task's worktree:
 *   1. merge the task's branch into main (FF when possible, merge commit
 *      otherwise); if the merge hits a synchronization snag (drift/conflict),
 *      the branch is automatically synced with main and the merge retried;
 *      an unrecoverable conflict is aborted and the task stays review.
 *   2. rebuild + `repoos check` so the merged main stays green.
 *   3. set status `done`, delete the branch, remove the task's worktree.
 * A failure at any step leaves the task in `review`; if the merge already
 * happened, we report that state honestly.
 */
import { spawn } from "node:child_process";
import { relative } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  mergeBranch,
  preflightMerge,
  syncBranchWithMain,
  deleteBranch,
  removeWorktree,
  commitTaskFile,
} from "../core/git.js";
import { markTaskReleased } from "./write.js";

export interface CheckSummary {
  ok: boolean;
  /** Human-readable failure detail (when not ok). */
  detail?: string;
}

export interface CompleteResult {
  ok: boolean;
  /** Whether the branch was merged into main (even when later steps failed). */
  merged: boolean;
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
    const finish = (status: number | null, error?: NodeJS.ErrnoException): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ status, stdout, stderr, error });
    };
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (err: NodeJS.ErrnoException) => finish(null, err));
    child.on("close", (code: number | null) => finish(code));
    timer = setTimeout(() => child.kill("SIGKILL"), opts.timeout);
  });
}

async function runStep(cwd: string, candidates: string[][], label: string): Promise<CheckSummary> {
  let missing = "";
  for (const cmd of candidates) {
    const run = await runProcess(cmd[0], cmd.slice(1), { cwd, timeout: 240_000 });
    if (run.status === 0) return { ok: true };
    if (run.error && (run.error.code === "ENOENT" || run.error.code === "EACCES")) {
      missing = `${cmd[0]} is not available`;
      continue;
    }
    const out = [run.stdout, run.stderr]
      .filter((x) => x.trim() !== "")
      .join("\n")
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join(" · ");
    return { ok: false, detail: out || `\`${label}\` failed (exit ${run.status})` };
  }
  return { ok: false, detail: missing || `\`${label}\` could not be run` };
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

const CHECK_STEPS: string[][] = [
  ["repoos", "check"],
  ["bun", "run", "repoos", "check"],
  ["node", "dist/cli/index.js", "check"],
];

export async function completeTask(
  config: RepoOSConfig,
  task: Task,
  onProgress?: (step: DoneStep) => void,
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
  const merge = await mergeTaskBranchWithAutoSync(root, task.branch, { autoResolve });
  if (!merge.merged) {
    return {
      ok: false,
      merged: false,
      conflicts: merge.conflicts,
      ff: false,
      drifted: merge.drifted,
      reason: merge.reason ?? "merge failed",
    };
  }

  onProgress?.("build");
  const build = await runStep(root, BUILD_STEPS, "bun run build");
  if (!build.ok) {
    return {
      ok: false,
      merged: true,
      conflicts: [],
      ff: merge.ff,
      drifted: merge.drifted,
      check: { ok: false, detail: `build failed: ${build.detail}` },
      reason: "build failed after merge — task kept in review",
    };
  }
  // Re-capture screenshots against the merged UI so `repoos check` stays green.
  onProgress?.("screenshots");
  const shots = await runStep(root, SCREENSHOT_STEPS, "repoos screenshots");
  if (!shots.ok) {
    return {
      ok: false,
      merged: true,
      conflicts: [],
      ff: merge.ff,
      drifted: merge.drifted,
      check: { ok: false, detail: `screenshot regeneration failed: ${shots.detail}` },
      reason: "screenshot regeneration failed after merge — task kept in review",
    };
  }
  await commitGenerated(root);

  onProgress?.("check");
  const check = await runStep(root, CHECK_STEPS, "repoos check");
  if (!check.ok) {
    return {
      ok: false,
      merged: true,
      conflicts: [],
      ff: merge.ff,
      drifted: merge.drifted,
      check: { ok: false, detail: `repoos check failed: ${check.detail}` },
      reason: "repoos check failed after merge — task kept in review",
    };
  }

  onProgress?.("done");
  const updated = markTaskReleased(config, task.absPath);
  // Best-effort cleanup; content is preserved in the merged main. The worktree
  // must go first — git refuses to delete a branch checked out in a worktree.
  removeWorktree(root, task.branch);
  deleteBranch(root, task.branch);

  return {
    ok: true,
    merged: true,
    conflicts: [],
    ff: merge.ff,
    drifted: merge.drifted,
    check: { ok: true },
    task: updated,
  };
}
