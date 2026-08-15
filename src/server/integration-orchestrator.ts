/**
 * Orchestrates individual close-out jobs through their lifecycle. Each job:
 *   1. Validates the candidate away from live main (temporary worktree/branch)
 *   2. Checks for main SHA drift and rebuilds if needed
 *   3. Publishes only a green candidate while holding the repo lock
 *   4. Cleans up the candidate and task resources
 *
 * Phases track recovery: if interrupted mid-flight, retry resumes from the current phase.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { RepoOSConfig, Task } from "../core/types.js";
import type { IntegrationJob, JobCoordinator } from "./integration-job.js";
import type { RepositoryLock } from "./repo-lock.js";
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
} from "../core/git.js";
import type { DoneStep } from "./done.js";
import { markTaskReleased } from "./write.js";

const CANDIDATE_BRANCH_PREFIX = ".repoos/integrate/";

/** Shared literal for the failed job phase so recovery paths stay consistent. */
const PHASE_FAILED = "failed";

function candidateBranchName(taskId: string): string {
  return `${CANDIDATE_BRANCH_PREFIX}${taskId}`;
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

interface ProcessRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

function runProcess(cmd: string, args: string[], opts: { cwd: string; timeout: number }): Promise<ProcessRunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd });
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

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
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
    private getTask?: (taskId: string) => Task | null,
    private onProgress?: (step: DoneStep) => void,
    private logger?: Logger,
  ) {}

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
          this.coordinator.updateJob(job.taskId, {
            phase: PHASE_FAILED,
            reason: syncRes.reason,
          });
          return syncRes;
        }
        job = this.coordinator.updateJob(job.taskId, { phase: "validating" })!;
      }

      // Validating phase: run the full gate (build, check) on the candidate.
      if (job.phase === "validating") {
        const validateRes = await this.validateCandidate(job);
        if (!validateRes.ok) {
          this.coordinator.updateJob(job.taskId, {
            phase: PHASE_FAILED,
            reason: validateRes.reason,
          });
          return validateRes;
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
            return pubRes;
          }
          this.coordinator.updateJob(job.taskId, {
            phase: PHASE_FAILED,
            reason: pubRes.reason,
          });
          return pubRes;
        }
        job = this.coordinator.updateJob(job.taskId, { phase: "cleanup" })!;
      }

      // Cleanup phase: remove candidate worktree, delete candidate branch, remove task worktree.
      if (job.phase === "cleanup") {
        const cleanRes = await this.cleanup(job);
        if (!cleanRes.ok) {
          // Log but don't fail: the merge succeeded, so task is done even if cleanup is messy.
          console.warn(`Cleanup warning for task ${job.taskId}: ${cleanRes.reason}`);
        }
        job = this.coordinator.updateJob(job.taskId, { phase: "done" })!;
      }

      return { ok: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      this.coordinator.updateJob(job.taskId, {
        phase: PHASE_FAILED,
        reason: `orchestrator error: ${reason}`,
      });
      return { ok: false, reason };
    }
  }

  private async syncCandidate(job: IntegrationJob): Promise<{ ok: boolean; reason?: string; candidateSha?: string }> {
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

    // Reset candidate to main so it's a clean base for the merge.
    const resetRes = await runGit(wtRes.path, ["reset", "--hard", mainBranch], 30_000);
    if (resetRes.status !== 0) {
      return { ok: false, reason: `could not reset candidate to main: ${resetRes.stderr}` };
    }

    // Validate and record the feature branch SHA.
    const taskBranch = job.taskId;
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

  private async validateCandidate(job: IntegrationJob): Promise<{ ok: boolean; reason?: string; candidateSha?: string }> {
    const root = this.config.root;
    const branch = candidateBranchName(job.taskId);
    const wtPath = worktreePathForBranch(root, branch);
    if (!wtPath) {
      return { ok: false, reason: "candidate worktree not found" };
    }

    // Check for main SHA changes. If main advanced, discard candidate and rebuild.
    const mainBranch = await resolveDefaultBranch(root);
    const currentMainRes = await runGit(root, ["rev-parse", `${mainBranch}:^{commit}`], 4000);
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
    const featureBranch = job.taskId;

    // Verify feature branch still exists before attempting merge
    const branchListRes = await runGit(root, ["branch", "--list", featureBranch], 4000);
    if (branchListRes.status !== 0 || !branchListRes.stdout.trim()) {
      return { ok: false, reason: `feature branch ${featureBranch} no longer exists` };
    }

    // In the candidate worktree, merge the feature branch from its location.
    const mergeRes = await runGit(wtPath, ["merge", "--no-edit", featureBranch], 60_000);
    if (mergeRes.status !== 0) {
      const conflicts = await runGit(wtPath, ["diff", "--name-only", "--diff-filter=U"], 5000);
      if (conflicts.status === 0 && conflicts.stdout.trim()) {
        await runGit(wtPath, ["merge", "--abort"], 4000);
        return { ok: false, reason: `merge conflict in ${conflicts.stdout.trim().split("\n")[0]}` };
      }
      await runGit(wtPath, ["merge", "--abort"], 4000);
      return { ok: false, reason: `merge failed: ${mergeRes.stderr.split("\n")[0]}` };
    }

    // Check for unmerged index entries (should not exist after successful merge, but catch edge cases).
    const unmergedRes = await runGit(wtPath, ["diff", "--name-only", "--diff-filter=U"], 5000);
    if (unmergedRes.status === 0 && unmergedRes.stdout.trim()) {
      return { ok: false, reason: `unmerged index entries: ${unmergedRes.stdout.trim().split("\n")[0]}` };
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
      return { ok: false, reason: `build failed: ${buildRes.stderr.split("\n")[0] || "unknown error"}` };
    }

    this.onProgress?.("check");
    let checkRes = await runProcess("repoos", ["check"], { cwd: wtPath, timeout: 600_000 });
    if (checkRes.status !== 0) {
      checkRes = await runProcess("bun", ["run", "repoos", "check"], { cwd: wtPath, timeout: 600_000 });
    }
    if (checkRes.status !== 0) {
      return { ok: false, reason: `check failed: ${checkRes.stderr.split("\n")[0] || "unknown error"}` };
    }

    // Candidate is green. Capture its SHA.
    const candidateShaRes = await runGit(wtPath, ["rev-parse", "HEAD"], 4000);
    if (candidateShaRes.status !== 0) {
      return { ok: false, reason: "could not get candidate SHA after validation" };
    }

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

    try {
      // Final SHA check: ensure candidate is still based on current main (holding the lock).
      const currentMainRes = await runGit(root, ["rev-parse", `${mainBranch}:^{commit}`], 4000);
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

      // Merge candidate to live main using FF when possible.
      const mergeRes = await runGit(root, ["merge", "--ff-only", branch], 30_000);
      if (mergeRes.status !== 0) {
        // Try a regular merge if FF is not possible.
        const regularMerge = await runGit(root, ["merge", "--no-edit", branch], 30_000);
        if (regularMerge.status !== 0) {
          return { ok: false, reason: `could not merge to main: ${regularMerge.stderr}` };
        }
      }

      this.onProgress?.("done");
      return { ok: true };
    } finally {
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
    removeWorktree(root, job.taskId);

    // Delete task's feature branch.
    deleteBranch(root, job.taskId);

    // Mark the task as done in the main checkout.
    try {
      const task = this.getTask?.(job.taskId);
      if (task) {
        markTaskReleased(this.config, task.absPath);
      }
    } catch (err) {
      console.error(`Failed to mark task ${job.taskId} as done:`, err);
      // Don't fail cleanup - the important part (merge) already succeeded
    }

    return { ok: true };
  }
}
