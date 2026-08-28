/**
 * Orchestrates individual close-out jobs through their lifecycle. Each job:
 *   1. Validates the candidate away from live main (temporary worktree/branch)
 *   2. Checks for main SHA drift and rebuilds if needed
 *   3. Publishes only a green candidate while holding the repo lock
 *   4. Cleans up the candidate and task resources
 *
 * Phases track recovery: if interrupted mid-flight, retry resumes from the current phase.
 */

import { readFileSync, existsSync, symlinkSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import type { RepoOSConfig, Task } from "../core/types.js";
import type { IntegrationJob, JobCoordinator, JobPhase } from "./integration-job.js";
import type { RepositoryLock, RootLock } from "./repo-lock.js";
import type { Logger } from "../core/logger.js";
import {
  currentBranch,
  runGit,
  worktreePathForBranch,
  ensureWorktree,
  removeWorktree,
  deleteBranch,
  isGitRepo,
  commitTaskFile,
  commitDirtyFiles,
  mergeBranch,
  dirtyFiles,
  getDiff,
  getDiffStats,
  GitDirtyCheckError,
} from "../core/git.js";
import type { DoneStep } from "./done.js";
import { redactSecrets, stripAnsi } from "./done.js";
import type { RemoteValidator } from "./remote-validation.js";
import { markTaskReleased } from "./write.js";
import { saveDiffSnapshot } from "./diff-snapshot.js";
import { parseTask } from "../core/task.js";
import type { TaskCheckManager, TaskCheckListener } from "./task-check.js";

// Candidate branch prefix. Must be a valid git refname: a leading dot is
// rejected by git (`'.repoos/integrate/…' is not a valid branch name`), which
// silently failed every close-out job at worktree creation.
const CANDIDATE_BRANCH_PREFIX = "repoos/integrate/";

/** Shared literal for the failed job phase so recovery paths stay consistent. */
const PHASE_FAILED = "failed";

function candidateBranchName(taskId: string): string {
  return `${CANDIDATE_BRANCH_PREFIX}${taskId}`;
}

/**
 * The merge that just ran left the candidate at exactly base main — it added
 * nothing. That is legitimate when the feature branch was already fully
 * integrated (a re-run of a close-out, a branch cherry-picked onto main
 * earlier): the close-out is idempotent and the task genuinely has nothing
 * left to land.
 *
 * It is a BUG when the branch still carries commits main lacks and the merge —
 * or, far more often, the conflict auto-resolution in `mergeBranch` — silently
 * dropped them. Left unguarded, the gate then runs `build` + `check` against
 * what is effectively bare main (which trivially passes) and the task publishes
 * as `done` with none of its code integrated. This bit #0306/#0307/#0309/#0312.
 *
 * Returns an actionable failure reason in the bug case, `null` when the no-op
 * is legitimate (or when git errored and a downstream step should surface it).
 */
export async function detectDroppedMerge(
  root: string,
  mainBranch: string,
  featureBranch: string,
  postMergeHead: string,
  baseMainSha: string,
): Promise<string | null> {
  if (postMergeHead !== baseMainSha) return null;
  // `git diff --quiet A...B` — exit 0: B adds nothing over the merge-base
  // (branch already in main → legit); exit 1: B carries a real delta that the
  // merge failed to bring across; >1: git error, leave it for a later step.
  const delta = await runGit(root, ["diff", "--quiet", `${mainBranch}...${featureBranch}`], 15_000);
  if (delta.status !== 1) return null;
  return (
    `merge of ${featureBranch} produced no change to ${mainBranch}, but the branch still carries ` +
    `commits ${mainBranch} does not have — the merge, or its conflict auto-resolution, dropped them. ` +
    `Rebase ${featureBranch} onto ${mainBranch} and resolve the conflicts there, then retry.`
  );
}

/**
 * Resolve the repository's actual default branch name.
 * Tries (in order):
 * 1. git symbolic-ref refs/remotes/origin/HEAD (when remote exists)
 * 2. git config --get init.defaultBranch
 * 3. currently checked-out branch
 * 4. fallback to "main"
 */
async function resolveDefaultBranch(root: string): Promise<string> {
  // Try remote HEAD first (most reliable for cloned repos)
  const remoteHeadRes = await runGit(root, ["symbolic-ref", "refs/remotes/origin/HEAD"], 4000);
  if (remoteHeadRes.status === 0) {
    // Output format: "ref: refs/remotes/origin/main" -> extract "main"
    const match = remoteHeadRes.stdout.trim().match(/refs\/remotes\/origin\/(.+)$/);
    if (match) return match[1];
  }

  // Try init.defaultBranch config
  const configRes = await runGit(root, ["config", "--get", "init.defaultBranch"], 4000);
  if (configRes.status === 0 && configRes.stdout.trim()) {
    return configRes.stdout.trim();
  }

  // Fall back to currently checked-out branch
  const currentRes = await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"], 4000);
  if (currentRes.status === 0 && currentRes.stdout.trim() && currentRes.stdout.trim() !== "HEAD") {
    return currentRes.stdout.trim();
  }

  // Final fallback
  return "main";
}

// How much of a failed command's output to keep as the failure reason.
const TAIL_LINES = 15;
const TAIL_MAX_CHARS = 800;

/**
 * Locate a task's file directly on disk by id, independent of the live
 * index's freshness. Used only as a fallback when `getTask` misses — the
 * normal, common path is the index lookup, which is far cheaper than a
 * directory scan. Task ids are unique by filename convention (`<id>-*.md`).
 */
function findTaskFileById(root: string, workDir: string, taskId: string): string | null {
  const dir = join(root, workDir);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const match = entries.find((f) => f.startsWith(`${taskId}-`) && f.endsWith(".md"));
  return match ? join(dir, match) : null;
}

/**
 * The useful part of a failed command's combined output. bun/npm wrap a child
 * failure with a generic trailing line (`error: script "repoos" exited with
 * code 1`) that is useless as a reason on its own, so keep the last several
 * meaningful lines — the real cause (a failing test, a compiler error) sits
 * just above the wrapper.
 *
 * The reason is persisted to `.repoos/integration-jobs/<id>.json` and shown
 * verbatim in the UI, so it must be free of ANSI escapes (the gate's test
 * output is colored) and of anything that looks like a credential. When the
 * excerpt exceeds the character cap it is cut from the front at a WORD
 * boundary — cutting mid-word produced reasons like `check failed: …eletion
 * detected by…` (0215) that read as garbage.
 */
export function tailLine(stdout: string, stderr: string): string {
  const lines = redactSecrets(stripAnsi(`${stdout}\n${stderr}`))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "unknown error";
  let tail = lines.slice(-TAIL_LINES).join("\n");
  if (tail.length > TAIL_MAX_CHARS) {
    const cut = tail.length - TAIL_MAX_CHARS;
    const lastWs = Math.max(tail.lastIndexOf(" ", cut), tail.lastIndexOf("\n", cut));
    const start = lastWs >= 0 ? lastWs + 1 : cut;
    return `…${tail.slice(start)}`;
  }
  return tail;
}

interface ProcessRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout: number; env?: NodeJS.ProcessEnv; onChunk?: (text: string) => void },
): Promise<ProcessRunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (status: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ status, stdout, stderr, timedOut });
    };

    child.stdout.on("data", (d: Buffer) => {
      const text = d.toString("utf8");
      stdout += text;
      opts.onChunk?.(text);
    });
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString("utf8");
      stderr += text;
      opts.onChunk?.(text);
    });
    child.on("error", () => finish(null));
    child.on("close", (code: number | null) => finish(code));

    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeout);
  });
}

/** Candidate validation and publication orchestrator for one job. */
export class CloseOutOrchestrator {
  constructor(
    private config: RepoOSConfig,
    private coordinator: JobCoordinator,
    private repoLock?: RepositoryLock,
    private rootLock?: RootLock,
    private getTask?: (taskId: string) => Task | null,
    private onProgress?: (step: DoneStep) => void,
    private logger?: Logger,
    /**
     * Fired when `validating` fails on a REAL, named merge conflict (never
     * for the task's own bookkeeping file or generated paths, which
     * auto-resolve; never for infra failures). The job itself is still
     * marked `failed` as before — this is a separate, best-effort trigger
     * to auto-resume the engineer to fix it and resubmit (#0271 follow-up).
     */
    private onMergeConflict?: (taskId: string, reason: string) => void,
    /**
     * Runs the expensive half of the gate (build + test) on a cloud VM when
     * `config.remoteValidation.enabled` — see validateCandidate. Undefined
     * disables remote validation regardless of config.
     */
    private remoteValidator?: RemoteValidator,
    /** Records the MTD merge-gate `repoos check` run for the Debug tab (0310). */
    private taskChecks?: TaskCheckManager,
    private onTaskCheckEvent?: TaskCheckListener,
  ) {}

  /**
   * Whether the task is, on disk, already `done`. The live index is an
   * in-memory cache that can lag the actual file (a duplicate/stale close-out
   * — #0289 — can run right after the first successful publish, before the
   * index rebuilds), so this reads the authoritative task file directly,
   * falling back to the index only when the file cannot be located or parsed.
   */
  private taskIsDone(taskId: string): boolean {
    const live = this.getTask?.(taskId);
    const workDir = this.config.workDir;
    const path =
      live?.absPath ??
      (workDir ? findTaskFileById(this.config.root, workDir, taskId) : null);
    if (path && existsSync(path)) {
      try {
        const task = parseTask({
          content: readFileSync(path, "utf8"),
          absPath: path,
          root: this.config.root,
          defaultStatus: this.config.defaultStatus ?? "inbox",
          defaultAssignee: this.config.defaultAssignee ?? "unassigned",
        });
        if (task.status === "done") return true;
      } catch {
        /* fall through to the index below */
      }
    }
    return live?.status === "done";
  }

  /**
   * Record a close-out job failure, OR reconcile it away when it is moot.
   *
   * A failure is moot when the task is already `done`: the failing job is a
   * duplicate/stale enqueue against a task that already finished successfully
   * through an earlier job (#0289). That earlier close-out's cleanup deleted
   * the worktree/branch, which is exactly why a later redundant enqueue fails
   * (e.g. "worktree not found"). There is no gate failure here needing a
   * human's attention, and the failed job record would otherwise sit forever
   * with no path to resolution, so it is dropped instead.
   *
   * Returns the `{ ok, reason }` the caller should return: `ok: true` for a
   * reconciled (moot) failure so the pipeline treats it as a normal completion
   * and never surfaces it as an actionable error; `ok: false` for a genuine
   * failure, which is recorded as `failed` (and `onRecorded`, e.g. the merge-
   * conflict retry, runs) so the UI and status bar can surface it.
   */
  private failOrReconcile(
    job: IntegrationJob,
    failedPhase: JobPhase,
    reason: string | undefined,
    onRecorded?: () => void,
  ): { ok: boolean; reason?: string } {
    if (this.taskIsDone(job.taskId)) {
      this.logger?.integration(
        job.taskId,
        "info",
        "close-out failure is moot — task already done; dropping job",
        { reason },
      );
      this.coordinator.removeJob(job.taskId);
      return { ok: true };
    }
    this.coordinator.updateJob(job.taskId, { phase: PHASE_FAILED, failedPhase, reason });
    onRecorded?.();
    return { ok: false, reason };
  }

  /**
   * Process the next job in the queue: validate and publish it.
   * Phases are atomic; a retry at any phase resumes from that phase.
   * May return early if the job transitions back to an earlier phase (e.g., on main drift).
   */
  async processNext(): Promise<{ ok: boolean; reason?: string; requiresRetry?: boolean }> {
    const job = this.coordinator.peekNext();
    if (!job) return { ok: true, reason: "queue empty" };

    return this.processJob(job);
  }

  private async processJob(job: IntegrationJob): Promise<{ ok: boolean; reason?: string }> {
    const root = this.config.root;

    this.logger?.integration(job.taskId, "info", `Processing job phase: ${job.phase}`, {
      taskId: job.taskId,
      phase: job.phase,
    });

    try {
      if (!isGitRepo(root)) {
        return { ok: false, reason: "not a git repository" };
      }

      // Transition from queued to syncing.
      if (job.phase === "queued") {
        const updated = this.coordinator.updateJob(job.taskId, {
          phase: "syncing",
          startedAt: new Date().toISOString(),
        });
        if (!updated) return { ok: false, reason: "job disappeared" };
        job = updated;
      }

      // Syncing phase: ensure the candidate worktree exists and is up to date with main.
      if (job.phase === "syncing") {
        const syncRes = await this.syncCandidate(job);
        if (!syncRes.ok) {
          this.logger?.integration(job.taskId, "error", "sync failed", { reason: syncRes.reason });
          return this.failOrReconcile(job, "syncing", syncRes.reason);
        }
        job = this.coordinator.updateJob(job.taskId, { phase: "validating" })!;
      }

      // Validating phase: run the full gate (build, check) on the candidate.
      //
      // The gate is retried once before the job is failed (#0216). A false
      // failure here is expensive — the branch is green, but the task is
      // stranded in review and the user cannot tell contention from a real
      // regression. The retry also classifies the failure, which is the part
      // that actually helps: a genuine defect reproduces with the SAME reason
      // (Node-version-dependent breakage did exactly this on #0205, failing
      // identically twice), whereas load-induced failures land on a different
      // test each run (#0211 failed on two unrelated tests). Two attempts is
      // the cap — this must never loop.
      if (job.phase === "validating") {
        let validateRes = await this.validateCandidate(job);
        if (!validateRes.ok && validateRes.retryable === false) {
          // Deterministic by construction — a second run proves nothing and
          // costs the user another full gate cycle.
          this.logger?.integration(job.taskId, "error", "validation failed (non-retryable)", { reason: validateRes.reason });
          // A named, real conflict (not the task's own bookkeeping file or a
          // generated path — those auto-resolve inside validateCandidate and
          // never reach here) is the one non-retryable failure with an
          // actionable fix: merge main into the FEATURE branch and resolve it
          // there. Give the engineer a shot at that automatically instead of
          // leaving the job sitting `failed` until a human notices (#0271
          // follow-up).
          const conflict = validateRes.reason?.startsWith("merge conflict in ");
          return this.failOrReconcile(job, "validating", validateRes.reason, conflict
            ? () => this.onMergeConflict?.(job.taskId, validateRes.reason!)
            : undefined);
        }
        if (!validateRes.ok) {
          const firstReason = validateRes.reason ?? "unknown";
          validateRes = await this.validateCandidate(job);
          if (!validateRes.ok) {
            const secondReason = validateRes.reason ?? "unknown";
            const reason = firstReason === secondReason
              ? `${secondReason} — reproduced identically on retry, so this is a real failure in the branch, not machine load`
              : `${secondReason} — NOTE: the first attempt failed differently (${firstReason}). Two unrelated failures point at machine load or infrastructure rather than a regression in this branch; check for stray serve processes and retry.`;
            return this.failOrReconcile(job, "validating", reason);
          }
        }
        job = this.coordinator.updateJob(job.taskId, {
          phase: "publishing",
          candidateSha: validateRes.candidateSha,
        })!;
      }

      // Publishing phase: merge candidate to live main, holding the repo lock.
      if (job.phase === "publishing") {
        const pubRes = await this.publishCandidate(job);
        if (!pubRes.ok) {
          // Check if the job phase was changed by publishCandidate() (e.g., drift handling).
          // If it was moved back to "syncing" for retry, don't overwrite it to "failed".
          const currentJob = this.coordinator.getJob(job.taskId);
          if (currentJob && currentJob.phase === "syncing") {
            // Drift detected and handled - will retry on next processNext() call
            this.logger?.integration(job.taskId, "info", "main drifted during publish — resyncing", {
              reason: pubRes.reason,
            });
            return pubRes;
          }
          this.logger?.integration(job.taskId, "error", "publish failed", { reason: pubRes.reason });
          return this.failOrReconcile(job, "publishing", pubRes.reason);
        }
        job = this.coordinator.updateJob(job.taskId, { phase: "cleanup" })!;
      }

      // Cleanup phase: remove candidate worktree, delete candidate branch, remove task worktree.
      if (job.phase === "cleanup") {
        const cleanRes = await this.cleanup(job);
        if (!cleanRes.ok) {
          // Log but don't fail: the merge succeeded, so task is done even if cleanup is messy.
          this.logger?.integration(job.taskId, "warn", "cleanup warning", { reason: cleanRes.reason });
          console.warn(`Cleanup warning for task ${job.taskId}: ${cleanRes.reason}`);
        }
        job = this.coordinator.updateJob(job.taskId, { phase: "done" })!;
        this.logger?.integration(job.taskId, "info", "close-out complete — published to main");
      }

      return { ok: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      this.logger?.integration(job.taskId, "error", "orchestrator error", { reason });
      return this.failOrReconcile(job, job.phase ?? "unknown", `orchestrator error: ${reason}`);
    }
  }

  private async syncCandidate(job: IntegrationJob): Promise<{ ok: boolean; reason?: string; candidateSha?: string }> {
    this.onProgress?.("sync");
    const root = this.config.root;
    const branch = candidateBranchName(job.taskId);

    // Resolve the repository's actual default branch
    const mainBranch = await resolveDefaultBranch(root);

    // Record main SHA at validation start.
    const mainShaRes = await runGit(root, ["rev-parse", `${mainBranch}^{commit}`], 4000);
    if (mainShaRes.status !== 0) {
      return { ok: false, reason: "could not get main SHA" };
    }
    const baseMainSha = mainShaRes.stdout.trim();

    this.coordinator.updateJob(job.taskId, { baseMainSha });

    // Ensure candidate worktree exists and is on main.
    const wtRes = ensureWorktree(root, branch, `candidate-${job.taskId}`);
    if (!wtRes.ok) {
      return { ok: false, reason: `could not create candidate worktree: ${wtRes.reason}` };
    }

    // A fresh candidate worktree has no dependencies, and the gate below runs a
    // full `bun run build` + check. Reuse the main checkout's node_modules via
    // a symlink instead of a slow cold install; fail-soft so a missing install
    // surfaces as a build/check error rather than a misleading sync failure.
    const candidateNodeModules = join(wtRes.path, "node_modules");
    if (!existsSync(candidateNodeModules)) {
      const rootNodeModules = join(root, "node_modules");
      if (existsSync(rootNodeModules)) {
        try {
          symlinkSync(rootNodeModules, candidateNodeModules, "dir");
        } catch {
          /* fail-soft: the build step will report the real error */
        }
      }
    }

    // Reset candidate to main so it's a clean base for the merge.
    const resetRes = await runGit(wtRes.path, ["reset", "--hard", mainBranch], 30_000);
    if (resetRes.status !== 0) {
      return { ok: false, reason: `could not reset candidate to main: ${resetRes.stderr}` };
    }

    // Validate and record the feature branch SHA.
    const taskBranch = job.branch ?? job.taskId;
    // Check if the feature branch exists (critical: avoid merging unrelated history)
    const taskWtPath = worktreePathForBranch(root, taskBranch);
    if (!taskWtPath) {
      return { ok: false, reason: `feature branch ${taskBranch} worktree not found` };
    }

    const branchShaRes = await runGit(taskWtPath, ["rev-parse", "HEAD"], 4000);
    if (branchShaRes.status !== 0) {
      return { ok: false, reason: "could not get feature branch SHA" };
    }

    this.coordinator.updateJob(job.taskId, { branchSha: branchShaRes.stdout.trim() });

    return { ok: true, candidateSha: baseMainSha };
  }

  /**
   * Merge the feature branch into the candidate, then run the gate on it.
   *
   * `retryable: false` marks a failure that cannot possibly resolve on a second
   * identical run — a merge conflict is the same conflict every time — so the
   * caller can skip its retry instead of spending another few minutes proving
   * the point. Everything else defaults to retryable: build and check failures
   * are where genuine flakiness lives.
   */
  private async validateCandidate(job: IntegrationJob): Promise<{ ok: boolean; reason?: string; candidateSha?: string; retryable?: boolean }> {
    const root = this.config.root;
    const branch = candidateBranchName(job.taskId);
    const wtPath = worktreePathForBranch(root, branch);
    if (!wtPath) {
      return { ok: false, reason: "candidate worktree not found" };
    }

    // Check for main SHA changes. If main advanced, discard candidate and rebuild.
    const mainBranch = await resolveDefaultBranch(root);
    const currentMainRes = await runGit(root, ["rev-parse", `${mainBranch}^{commit}`], 4000);
    if (currentMainRes.status !== 0) {
      return { ok: false, reason: "could not get current main SHA" };
    }
    const currentMainSha = currentMainRes.stdout.trim();

    if (job.baseMainSha && currentMainSha !== job.baseMainSha) {
      // Main advanced: discard candidate, rebuild from new SHA, and revalidate.
      removeWorktree(root, branch);
      this.coordinator.updateJob(job.taskId, {
        phase: "syncing",
        baseMainSha: null,
        candidateSha: null,
      });
      return this.syncCandidate(job);
    }

    // Merge feature branch into candidate.
    const featureBranch = job.branch ?? job.taskId;

    // Verify feature branch still exists before attempting merge
    const branchListRes = await runGit(root, ["branch", "--list", featureBranch], 4000);
    if (branchListRes.status !== 0 || !branchListRes.stdout.trim()) {
      return { ok: false, reason: `feature branch ${featureBranch} no longer exists` };
    }

    // In the candidate worktree, merge the feature branch from its location.
    // dist/ and screenshots/ are generated output — the build step right
    // after this merge (below) regenerates them from source regardless of
    // what the merge produced, so a conflict there must never block the
    // merge. The task's own doc file routinely differs between main and the
    // branch (status/review_rounds bookkeeping on either side), so its
    // branch version is taken as authoritative, same as the legacy done.ts
    // close-out path. Reuses the existing, tested autoResolve semantics in
    // core/git.ts rather than reimplementing conflict resolution here.
    //
    // dist/ is gitignored on main as of 2026-08-15 (see docs/dogfooding-vs-
    // general.md), so most new merges won't touch this entry at all — a
    // branch that never modified dist/ resolves as a clean deletion. It stays
    // in the list because a branch cut BEFORE that change can still have
    // dist/ tracked and modified; mergeBranch's `-X theirs` fallback already
    // handles that as a modify/delete conflict. Safe to drop once no such
    // branch remains, but harmless to leave indefinitely.
    const task = this.getTask?.(job.taskId);
    const autoResolve = ["dist/", "screenshots/", ...(task ? [relative(root, task.absPath)] : [])];
    // The task currently closing is authoritative on its branch. Other task
    // files can change independently on main (for example, a CTO nudge), so
    // preserve main's version for those rather than blocking close-out.
    const autoResolveOurs = ["work/"];
    this.onProgress?.("merge");
    const merge = await mergeBranch(wtPath, featureBranch, { autoResolve, autoResolveOurs });
    if (!merge.merged) {
      // A conflict is a property of the two trees, not of the machine. Retrying
      // re-derives the identical conflict; the fix is always to merge main into
      // the feature branch and resolve it there (see docs/close-out-pipeline.md).
      return {
        ok: false,
        retryable: false,
        reason: merge.conflicts.length
          ? `merge conflict in ${merge.conflicts.join(", ")} — resolve it in the feature branch's own worktree (merge main into the branch), then retry`
          : merge.reason ?? "merge failed",
      };
    }

    // The merge "succeeded" but must have actually changed something, unless
    // the branch was already fully in main. A no-op merge that swallowed real
    // branch work would otherwise sail through the gate (it validates bare
    // main) and publish the task as done with nothing integrated (#0306 et al).
    const postMergeHead = await runGit(wtPath, ["rev-parse", "HEAD"], 4000);
    if (postMergeHead.status === 0) {
      const dropped = await detectDroppedMerge(
        root,
        mainBranch,
        featureBranch,
        postMergeHead.stdout.trim(),
        currentMainSha,
      );
      if (dropped) {
        return { ok: false, retryable: false, reason: dropped };
      }
    }

    // Check for merge conflict markers in text files (unresolved conflicts in content).
    const lsRes = await runGit(wtPath, ["ls-files"], 5000);
    if (lsRes.status === 0) {
      const files = lsRes.stdout.split("\n").filter(Boolean);
      const textExtensions = [".json", ".md", ".ts", ".tsx", ".js", ".jsx", ".css", ".html"];
      for (const file of files) {
        if (textExtensions.some((ext) => file.endsWith(ext))) {
          try {
            const content = readFileSync(join(wtPath, file), "utf8");
            // Check for git conflict markers: exactly 7 of each character at line start
            if (/^<{7}$|^={7}$|^>{7}$/m.test(content)) {
              return { ok: false, reason: `unresolved conflict markers in ${file}` };
            }
          } catch {
            /* skip unreadable files */
          }
        }
      }
    }

    // Run the post-merge gate: build + check via bun/npm.
    this.onProgress?.("build");
    let buildRes = await runProcess("bun", ["run", "build"], { cwd: wtPath, timeout: 300_000 });
    if (buildRes.status !== 0) {
      buildRes = await runProcess("npm", ["run", "build"], { cwd: wtPath, timeout: 300_000 });
    }
    if (buildRes.status !== 0) {
      return { ok: false, reason: `build failed: ${tailLine(buildRes.stdout, buildRes.stderr)}` };
    }

    // Remote Validation Runner (docs/remote-validation.md): hand the expensive
    // half of the gate — `bun install` + `bun run build` + `bun run test` — to a
    // disposable cloud VM, which is where MTD keeps failing under local memory
    // pressure. On a remote pass, the LOCAL `repoos check` below runs only the
    // cheap static guards + UI smoke (REPOOS_SKIP_TESTS=1). On a transient infra
    // failure the job fails RETRYABLY (resumes from this phase) unless
    // `remoteValidation.fallbackToLocal` is set; a real remote test failure is
    // non-retryable — fix it in the feature branch and resubmit.
    let skipTestsLocally = false;
    if (this.remoteValidator && this.config.remoteValidation?.enabled) {
      this.onProgress?.("check");
      const headRes = await runGit(wtPath, ["rev-parse", "HEAD"], 4000);
      if (headRes.status !== 0) {
        return { ok: false, reason: "could not resolve candidate HEAD before remote validation" };
      }
      const remote = await this.remoteValidator.validate({
        taskId: job.taskId,
        worktreePath: wtPath,
        candidateSha: headRes.stdout.trim(),
      });
      if (remote.ok) {
        skipTestsLocally = true;
      } else if (remote.transient && !this.config.remoteValidation.fallbackToLocal) {
        return {
          ok: false,
          retryable: true,
          reason: `${remote.detail ?? "remote validation unavailable"} — the branch IS merged into the candidate; retrying resumes from the check step`,
        };
      } else if (!remote.transient) {
        return {
          ok: false,
          retryable: false,
          reason: `remote validation failed: ${remote.detail ?? "build or test suite failed on the runner"} — fix it in the feature branch and resubmit`,
        };
      } else {
        this.logger?.integration(
          job.taskId,
          "warn",
          "remote validation unavailable — falling back to the full local gate (remoteValidation.fallbackToLocal)",
          { detail: remote.detail },
        );
      }
    }

    this.onProgress?.("check");
    // The candidate's OWN freshly-built CLI comes first, same as the legacy
    // done.ts close-out gate (#0130): a globally linked `repoos` resolves
    // build freshness and gate code against its own install snapshot, which
    // can disagree with the checkout actually being validated here. Running
    // `check` via the candidate's own `dist/cli/index.js` guarantees the gate
    // evaluates the exact code that was just merged and built above.
    // The build above already ran `bun run build` with nothing changed since,
    // so `check`'s own "Full build" step is redundant (#0213) — pass
    // REPOOS_SKIP_BUILD so it skips it. Standalone `repoos check` never sets it.
    const skipBuildEnv = {
      ...process.env,
      REPOOS_SKIP_BUILD: "1",
      ...(skipTestsLocally ? { REPOOS_SKIP_TESTS: "1" } : {}),
    };
    const localCli = join(wtPath, "dist", "cli", "index.js");
    const localCliPresent = existsSync(localCli);
    const checkHandle = this.taskChecks && this.onTaskCheckEvent
      ? this.taskChecks.start(job.taskId, "merge-gate", this.onTaskCheckEvent)
      : undefined;
    const rawCheck = (cli: string, args: string[]): Promise<ProcessRunResult> =>
      runProcess(cli, args, { cwd: wtPath, timeout: 600_000, env: skipBuildEnv, onChunk: checkHandle?.chunk });
    // A check whose ONLY failure is a stale build marker: the same marker the
    // close-out build above should have refreshed. This is the self-resolving
    // staleness pattern (#0276 Flavour B) — refreshing the marker and re-running
    // the identical check on the same tree passes. Cases that are NOT this (a
    // genuine non-staleness failure, or the local CLI being absent entirely) must
    // not be absorbed; see the branching below.
    const isStalenessFailure = (res: ProcessRunResult): boolean =>
      /stale build|no build found|build-info\.json|build is stale|cannot verify build freshness/i.test(
        `${res.stdout}\n${res.stderr}`,
      );

    let checkRes: ProcessRunResult;
    // Why the check result deviates from a plain local-CLI pass:
    //   'local-ok'     — candidate's own CLI passed (common case)
    //   'absorbed'     — local CLI reported staleness; marker refreshed and
    //                    re-check passed on the same tree (self-resolving)
    //   'fallback'     — local CLI failed for a genuine non-staleness reason;
    //                    fell through to the global CLI fallback
    //   'local-missing'— candidate's own CLI was absent; only the global CLI
    //                    fallback could run (Flavour A, not self-resolving)
    let outcome: "local-ok" | "absorbed" | "fallback" | "local-missing";

    if (!localCliPresent) {
      // Flavour A (#0276): no candidate-owned CLI to run. The global CLI
      // fallback compares the candidate's src hash against a DIFFERENT
      // install's marker — a guaranteed mismatch that reports "stale" no matter
      // how fresh the candidate really is. That is the #0213/3fbbd707
      // CLI-selection regression, not a self-resolving gap: never absorb it.
      checkRes = await rawCheck("repoos", ["check"]);
      outcome = "local-missing";
      this.logger?.integration(
        job.taskId,
        "error",
        "candidate dist/cli/index.js is missing — gate fell back to the globally linked repoos; any 'stale' result here is a CLI-selection regression (#0276 Flavour A), not self-resolving staleness",
      );
    } else {
      checkRes = await rawCheck(process.execPath, [localCli, "check"]);
      if (checkRes.status === 0) {
        outcome = "local-ok";
      } else if (isStalenessFailure(checkRes)) {
        // Self-resolving build staleness: only the stale-marker report failed,
        // and that same marker is what `bun run build` below refreshes. Refresh
        // it provably for the current source (REPOOS_SKIP_BUILD only lets check
        // skip its own build when the marker is already fresh), then re-run the
        // SAME check on the same candidate tree. Bounded to this one re-check —
        // it never loops, and it stays inside validateCandidate rather than
        // triggering an extra orchestrator-level retry / re-sync / debugger.
        this.logger?.integration(
          job.taskId,
          "info",
          "check reported self-resolving build staleness — refreshing marker and re-checking the same tree in place (no debugger detour)",
        );
        await runProcess("bun", ["run", "build"], { cwd: wtPath, timeout: 300_000 });
        checkRes = await rawCheck(process.execPath, [localCli, "check"]);
        if (checkRes.status !== 0) {
          checkHandle?.done(checkRes.status);
          return {
            ok: false,
            reason: `check failed after in-place staleness re-check: ${tailLine(checkRes.stdout, checkRes.stderr)}`,
          };
        }
        outcome = "absorbed";
      } else {
        // Genuine non-staleness failure from the local CLI: preserve the prior
        // fallback behaviour (retry via the global repoos, then bun run repoos).
        outcome = "fallback";
        checkRes = await rawCheck("repoos", ["check"]);
        if (checkRes.status !== 0) {
          checkRes = await rawCheck("bun", ["run", "repoos", "check"]);
        }
      }
    }
    checkHandle?.done(checkRes.status);

    if (checkRes.status !== 0) {
      return {
        ok: false,
        reason:
          outcome === "local-missing"
            ? `check failed: the candidate's own dist/cli/index.js was not used (CLI-selection regression — the globally linked repoos evaluates a different install's build marker). ${tailLine(checkRes.stdout, checkRes.stderr)}`
            : `check failed: ${tailLine(checkRes.stdout, checkRes.stderr)}`,
      };
    }

    // Candidate is green. Capture its SHA.
    const candidateShaRes = await runGit(wtPath, ["rev-parse", "HEAD"], 4000);
    if (candidateShaRes.status !== 0) {
      return { ok: false, reason: "could not get candidate SHA after validation" };
    }

    // Capture the reviewable source diff before publication removes the task
    // branch/worktree. The candidate is based on the exact main SHA checked
    // above and contains the validated feature merge, so this records the
    // precise change that is about to land (not a later, polluted main diff).
    const snapshotDiff = await getDiff(wtPath, mainBranch);
    const snapshotStats = getDiffStats(wtPath, mainBranch);
    saveDiffSnapshot(root, this.config.cacheDir, job.taskId, snapshotStats, snapshotDiff);

    return { ok: true, candidateSha: candidateShaRes.stdout.trim() };
  }

  private async publishCandidate(job: IntegrationJob): Promise<{ ok: boolean; reason?: string }> {
    const root = this.config.root;
    const mainBranch = await resolveDefaultBranch(root);

    const branch = candidateBranchName(job.taskId);
    const wtPath = worktreePathForBranch(root, branch);
    if (!wtPath) {
      return { ok: false, reason: "candidate worktree missing at publish time" };
    }

    // Acquire the repository lock before publishing.
    if (this.repoLock) {
      let acquireAttempts = 0;
      while (!this.repoLock.acquire(job.taskId) && acquireAttempts < 60) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        acquireAttempts++;
      }
      if (acquireAttempts >= 60) {
        return { ok: false, reason: "could not acquire publication lock (timeout)" };
      }
    }

    // Publishing mutates the live checkout.  It must therefore mutually
    // exclude a hotfix, which also owns that checkout for its entire run.
    // Acquire after the publication lock so concurrent close-outs retain
    // their existing serialization, but before inspecting or merging main.
    if (this.rootLock && !this.rootLock.acquire(job.taskId, "close-out")) {
      const holder = this.rootLock.getHolder();
      this.repoLock?.release(job.taskId);
      return {
        ok: false,
        reason: `main checkout is held by ${holder?.kind ?? "another operation"} (task #${holder?.taskId ?? "unknown"}); wait for it to finish before moving this task to done`,
      };
    }

    try {
      // Final SHA check: ensure candidate is still based on current main (holding the lock).
      const currentMainRes = await runGit(root, ["rev-parse", `${mainBranch}^{commit}`], 4000);
      if (currentMainRes.status !== 0) {
        return { ok: false, reason: "could not verify main before publish" };
      }
      const currentMainSha = currentMainRes.stdout.trim();

      if (job.baseMainSha !== currentMainSha) {
        // Main advanced between validation and publishing: go back to syncing.
        removeWorktree(root, branch);
        this.coordinator.updateJob(job.taskId, {
          phase: "syncing",
          baseMainSha: null,
          candidateSha: null,
        });
        return { ok: false, reason: "main advanced, revalidating" };
      }

      // Ensure the main checkout is on the actual main branch before merging.
      // A branch-mode hotfix leaves the main checkout on its hotfix branch
      // (ensureHotfix checks it out there). Merging the candidate into the
      // hotfix branch instead of main silently succeeds (FF or no-op) but
      // leaves main unchanged and blocks hotfix-branch cleanup. Switch to
      // main first so the merge, dirty check, and subsequent branch deletion
      // all target the correct branch.
      const currentHead = currentBranch(root);
      if (currentHead && currentHead !== mainBranch) {
        const checkoutRes = await runGit(root, ["checkout", mainBranch], 10_000);
        if (checkoutRes.status !== 0) {
          return {
            ok: false,
            reason: `could not switch main checkout from ${currentHead} to ${mainBranch} before publishing (${checkoutRes.stderr.trim()}). The candidate was NOT merged; retry.`,
          };
        }
      }

      // Publish-time dirty-main guard (#0211): the main working tree can be
      // dirtied between enqueue and publish (validation runs minutes-long
      // builds in the candidate worktree while `repoos check` regenerates a
      // dirty `dist/` on main). Re-check right before the merge so a dirty
      // main is surfaced as an actionable message instead of git's raw
      // "your local changes would be overwritten" at the tail of a long job.
      // Fails closed: an error/timeout in the check is "unknown", never
      // "clean", so we never merge blindly.
      let dirtyOnMain: string[];
      try {
        dirtyOnMain = await dirtyFiles(root);
      } catch (err) {
        if (err instanceof GitDirtyCheckError) {
          return {
            ok: false,
            reason: `could not verify main is clean at publish time (${err.message}). The candidate was NOT merged; retry, or commit/stash main's working tree first.`,
          };
        }
        throw err;
      }
      if (dirtyOnMain.length > 0) {
        // Auto-checkpoint routine, server-written churn instead of blocking
        // the merge on it (#0271 follow-up, confirmed live: #0293's close-out
        // was refused because an UNRELATED task's `work/*.md` file — an
        // activity-log stamp from a normal status/override change — was
        // dirty on main at publish time). Every routine task write already
        // auto-commits this exact way via `commitTaskFile`/`recordChange`
        // elsewhere in the system; a task file being dirty for a moment
        // between that write and this check is expected traffic on a busy
        // board, not a signal something risky is in flight.
        //
        // `repoos.toml` gets the same treatment: it's always written whole by
        // the settings API (agent config, maxActiveTasks, etc.), never
        // hand-edited mid-change the way a source file might be, so a dirty
        // moment there is the same class of routine churn, not a signal of
        // in-progress human work.
        //
        // Scoped narrowly: only when EVERY dirty path is under the work dir
        // or is exactly `repoos.toml` — anything else (source, other config,
        // a stray build artifact) still fails closed exactly as before,
        // since that's genuinely ambiguous and worth a human's attention
        // rather than a blind auto-commit.
        const workPrefix = `${this.config.workDir}/`;
        const isSafeChurn = (p: string): boolean => p.startsWith(workPrefix) || p === "repoos.toml";
        const onlySafeChurn = dirtyOnMain.every(isSafeChurn);
        if (onlySafeChurn) {
          try {
            await commitDirtyFiles(root, "chore: checkpoint bookkeeping/config before publish");
          } catch {
            return {
              ok: false,
              reason: `main has ${dirtyOnMain.length} uncommitted file${dirtyOnMain.length === 1 ? "" : "s"} at publish time and the automatic checkpoint commit failed: ${dirtyOnMain.slice(0, 8).join(", ")}${dirtyOnMain.length > 8 ? ", …" : ""}. The candidate was NOT merged; commit or stash those on main and retry.`,
            };
          }
        } else {
          return {
            ok: false,
            reason: `main has ${dirtyOnMain.length} uncommitted file${dirtyOnMain.length === 1 ? "" : "s"} at publish time, so the merge would abort: ${dirtyOnMain.slice(0, 8).join(", ")}${dirtyOnMain.length > 8 ? ", …" : ""}. The candidate was NOT merged; commit or stash those on main (or use "Commit & continue") and retry.`,
          };
        }
      }

      // Merge candidate to live main using FF when possible.
      const mergeRes = await runGit(root, ["merge", "--ff-only", branch], 30_000);
      if (mergeRes.status !== 0) {
        // Try a regular merge if FF is not possible.
        const regularMerge = await runGit(root, ["merge", "--no-edit", branch], 30_000);
        if (regularMerge.status !== 0) {
          // A dirty main that slipped in between the check and the merge (or a
          // conflict) aborts with git's raw "would be overwritten" message.
          // Re-frame a dirty-main outcome as an actionable instruction rather
          // than dumping that raw stderr.
          if (/would be overwritten by merge/i.test(regularMerge.stderr)) {
            const blocking = regularMerge.stderr
              .split("\n")
              .filter((l) => l.startsWith("\t"))
              .map((l) => l.trim())
              .filter(Boolean);
            return {
              ok: false,
              reason: `main has uncommitted files blocking the merge${blocking.length ? `: ${blocking.slice(0, 8).join(", ")}${blocking.length > 8 ? ", …" : ""}` : ""}. The candidate was NOT merged; commit or stash those on main (or use "Commit & continue") and retry.`,
            };
          }
          return { ok: false, reason: `could not merge to main: ${regularMerge.stderr}` };
        }
      }

      // Rebuild the live checkout's dist/ so the running `repoos serve`
      // process (which loads compiled JS at boot and never reloads on its
      // own) has something newer to notice. dist/ is gitignored, so the
      // merge above brought in new source but left dist/ exactly as it was.
      // This runs while rootLock/repoLock are still held (released in the
      // `finally` below), so ReloadManager's closingOut() check correctly
      // parks the resulting build for a user-triggered reload instead of
      // restarting the server out from under this still-running publish.
      // Fail-soft: the merge already succeeded, so a failed rebuild here
      // must not fail the whole publish — it just leaves dist/ stale, the
      // same pre-existing failure mode this is fixing, now at least logged.
      //
      // Skip entirely when there's no package.json: neither `bun run build`
      // nor the `npm run build` fallback can ever succeed without one, so
      // attempting them is two guaranteed-useless subprocess spawns every
      // time — real cost under load, and observed contributing to orphaned
      // build processes outliving a fixture test's own vitest timeout
      // (testTimeout: 15_000 vs. up to 300s per attempt here). Root without
      // a package.json only happens in this orchestrator's own unit-test
      // fixtures (bare git repos with no app to build) — a real repo always
      // has one, so this never skips a build that could have mattered.
      const canBuild = existsSync(join(root, "package.json"));
      let rebuildRes: ProcessRunResult | undefined;
      if (canBuild) {
        rebuildRes = await runProcess("bun", ["run", "build"], { cwd: root, timeout: 300_000 });
        if (rebuildRes.status !== 0) {
          rebuildRes = await runProcess("npm", ["run", "build"], { cwd: root, timeout: 300_000 });
        }
      }
      if (!canBuild) {
        console.error(`Post-merge rebuild of ${root} skipped for task ${job.taskId}: no package.json`);
      } else if (rebuildRes && rebuildRes.status !== 0) {
        console.error(
          `Post-merge rebuild of ${root} failed for task ${job.taskId}: ${tailLine(rebuildRes.stdout, rebuildRes.stderr)}`,
        );
      }

      this.onProgress?.("done");
      return { ok: true };
    } finally {
      this.rootLock?.release(job.taskId);
      // Always release the lock when done publishing.
      if (this.repoLock) {
        this.repoLock.release(job.taskId);
      }
    }
  }

  private async cleanup(job: IntegrationJob): Promise<{ ok: boolean; reason?: string }> {
    const root = this.config.root;
    const branch = candidateBranchName(job.taskId);

    // Remove candidate worktree.
    removeWorktree(root, branch);

    // Delete candidate branch.
    deleteBranch(root, branch);

    // Remove task's feature worktree (if it still exists).
    removeWorktree(root, job.branch ?? job.taskId);

    // Delete task's feature branch.
    deleteBranch(root, job.branch ?? job.taskId);

    // Mark the task as done in the main checkout.
    //
    // The live index can miss a lookup right after a reload (its in-memory
    // rebuild is not instant, and this cleanup step can land in that window —
    // observed live, 2026-08-15, #0195: publish succeeded, main fast-forwarded
    // to the candidate, but this step silently no-op'd — `task` was undefined,
    // the `if (task)` guard skipped markTaskReleased with no error, and the
    // task sat published-but-not-released until a manual retry). Falling back
    // to a direct on-disk lookup by id makes this step independent of index
    // freshness — the file is exactly what markTaskReleased writes to anyway.
    try {
      const absPath = this.getTask?.(job.taskId)?.absPath ?? findTaskFileById(root, this.config.workDir, job.taskId);
      if (absPath) {
        markTaskReleased(this.config, absPath);
      } else {
        console.error(`Could not locate task ${job.taskId} on disk to mark it released — publish succeeded but release marking was skipped`);
      }
    } catch (err) {
      console.error(`Failed to mark task ${job.taskId} as done:`, err);
      // Don't fail cleanup - the important part (merge) already succeeded
    }

    return { ok: true };
  }
}
