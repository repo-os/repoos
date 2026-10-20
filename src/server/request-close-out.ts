/**
 * Enqueue Move to done (close-out) for a task already in `review`, mirroring
 * the guards in `POST /api/tasks/:id/done` but without HTTP or dirty-main modals.
 * Used by the opt-in approval policy (#0686).
 */
import { existsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  mainDirtyFilesForCloseOut,
  GitDirtyCheckError,
  localBranches,
  preflightMerge,
  uncommittedWorkFiles,
  workFileFilter,
  worktreePathForBranch,
  branchChangedPaths,
  branchCommit,
} from "../core/git.js";
import type { JobCoordinator } from "./integration-job.js";
import type { ReloadManager } from "./reload.js";
import type { LiveIndex, RepoEvent } from "./live-index.js";
import type { AgentRunner } from "./agents.js";
import type { PreviewManager } from "./preview.js";
import type { ReviewManager } from "./review.js";
import { buildIntegrationSnapshot } from "./integration-status.js";
import { resolvePipelineCheckPlan } from "./check-plan-info.js";
import {
  readHandoffSnapshot,
  verifyWorktreeHandoffIntegrity,
  writeWorktreeReviewLock,
} from "./worktree-handoff-guard.js";
import {
  isPostHandoffCheckpointRecoveryActive,
  startPostHandoffCheckpointRecovery,
} from "./post-handoff-checkpoint-recovery.js";

export interface CloseOutEnqueueDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  jobCoordinator: JobCoordinator;
  reload: ReloadManager | null;
  emitEvent: (e: RepoEvent) => void;
  triggerJobProcessing: () => void;
  runner: AgentRunner;
  previews: PreviewManager;
  reviews: ReviewManager;
}

export type CloseOutEnqueueResult = { ok: true; jobTaskId: string } | { ok: false; reason: string };

/** Preflight data for approval policy evaluation. */
export async function gatherApprovalPreflight(
  config: RepoOSConfig,
  task: Task,
): Promise<{
  branchMissing: boolean;
  mergePreflightFailed: boolean;
  handoffDrift: boolean;
  mainDirty: boolean;
  changedPaths: string[] | null;
}> {
  const branch = task.branch;
  let mainDirty = false;
  try {
    mainDirty = (await mainDirtyFilesForCloseOut(config.root, config)).length > 0;
  } catch {
    // Treat an unreadable main as dirty: fail closed rather than auto-landing
    // on top of a checkout we could not verify (#0727).
    mainDirty = true;
  }
  if (!branch) {
    return {
      branchMissing: true,
      mergePreflightFailed: false,
      handoffDrift: false,
      mainDirty,
      changedPaths: null,
    };
  }
  if (!localBranches(config.root).has(branch)) {
    return {
      branchMissing: true,
      mergePreflightFailed: false,
      handoffDrift: false,
      mainDirty,
      changedPaths: null,
    };
  }

  const preflight = await preflightMerge(config.root, branch);
  const mergePreflightFailed = !preflight.ok;

  const worktree = task.hotfix === true ? null : worktreePathForBranch(config.root, branch);
  const changedPaths = worktree ? await branchChangedPaths(config.root, branch) : null;

  let handoffDrift = false;
  if (worktree) {
    try {
      const dirty = await uncommittedWorkFiles(worktree, workFileFilter(config));
      if (dirty.length > 0) handoffDrift = true;
    } catch {
      handoffDrift = true;
    }
    const handoffSnap = readHandoffSnapshot(config.root, config.cacheDir, task.id);
    if (handoffSnap) {
      const integrity = await verifyWorktreeHandoffIntegrity(config, branch, handoffSnap.sha, {
        handoffAt: handoffSnap.at,
        taskId: task.id,
      });
      if (!integrity.ok) handoffDrift = true;
    }
  }

  return { branchMissing: false, mergePreflightFailed, handoffDrift, mainDirty, changedPaths };
}

/**
 * Queue close-out when preconditions match a human Move to done (no uncommitted
 * main/worktree — policy must not silently commit dirty trees).
 */
export async function enqueueCloseOutForTask(
  deps: CloseOutEnqueueDeps,
  task: Task,
): Promise<CloseOutEnqueueResult> {
  const {
    config,
    index,
    jobCoordinator,
    reload,
    emitEvent,
    triggerJobProcessing,
    runner,
    previews,
    reviews,
  } = deps;
  const id = task.id;

  if (task.isArchived) {
    return { ok: false, reason: "task is archived" };
  }
  if (task.status !== "review") {
    return { ok: false, reason: `task is ${task.status}, not review` };
  }
  if (!task.branch) {
    return { ok: false, reason: "no branch to merge" };
  }
  if (runner.isRunning(id)) {
    return { ok: false, reason: "agent turn in progress" };
  }
  if (reviews.isRunning(id)) {
    return { ok: false, reason: "review still running" };
  }
  if (isPostHandoffCheckpointRecoveryActive(config, id)) {
    return { ok: false, reason: "checkpoint recovery in progress" };
  }

  const existingJob = jobCoordinator.getJob(id);
  if (
    existingJob &&
    existingJob.phase !== "done" &&
    existingJob.phase !== "failed" &&
    !existingJob.cancelled
  ) {
    return { ok: false, reason: "close-out already queued" };
  }

  let dirty: string[];
  try {
    dirty = await mainDirtyFilesForCloseOut(config.root, config);
  } catch (err) {
    if (err instanceof GitDirtyCheckError) {
      return { ok: false, reason: "main dirty check failed" };
    }
    throw err;
  }
  if (dirty.length > 0) {
    return { ok: false, reason: "main has uncommitted files" };
  }

  const branch = task.branch;
  const worktree = task.hotfix === true ? null : worktreePathForBranch(config.root, branch);
  if (worktree) {
    try {
      const worktreeDirty = await uncommittedWorkFiles(worktree, workFileFilter(config));
      if (worktreeDirty.length > 0) {
        return { ok: false, reason: "worktree has uncommitted files" };
      }
    } catch (err) {
      if (err instanceof GitDirtyCheckError) {
        return { ok: false, reason: "worktree dirty check failed" };
      }
      throw err;
    }
  }

  const lockPath = join(config.root, ".repoos/close-out.lock");
  if (existsSync(lockPath)) {
    try {
      const lockStat = statSync(lockPath);
      const age = Date.now() - lockStat.mtime.getTime();
      if (age > 60_000) unlinkSync(lockPath);
    } catch {
      /* best-effort */
    }
  }

  let handoffSha: string | null = null;
  if (!task.hotfix && branch && worktree) {
    const handoffSnap = readHandoffSnapshot(config.root, config.cacheDir, id);
    if (handoffSnap) {
      const integrity = await verifyWorktreeHandoffIntegrity(config, branch, handoffSnap.sha, {
        handoffAt: handoffSnap.at,
        taskId: id,
      });
      if (!integrity.ok) {
        if (integrity.checkpointOnlyDrift) {
          const started = await startPostHandoffCheckpointRecovery(
            {
              config,
              index,
              jobCoordinator,
              reviews,
              reload,
              emitEvent,
              triggerJobProcessing,
            },
            task,
            integrity.checkpointOnlyDrift.approvedSha,
            integrity.checkpointOnlyDrift.headSha,
          );
          if (!started.ok) return { ok: false, reason: started.reason };
          return { ok: false, reason: "checkpoint recovery in progress" };
        }
        return { ok: false, reason: integrity.reason ?? "worktree changed after handoff" };
      }
      handoffSha = handoffSnap.sha;
    }
  }

  await previews.stop(id, "task done");
  reviews.cancel(id);
  void runner.stop(id);
  // Fence the engineer before the merge can begin (#0886): stop() only signals,
  // so wait for the turn to actually leave the registry. A process that does
  // not stop is refused rather than raced; the closing-out lock below also
  // fences any write from a phantom the registry never tracked (#0863).
  // A partial runner without `waitForStop` (older embedding, approval tests)
  // is treated as already stopped; the real AgentRunner always implements it.
  const engineerStopped =
    typeof runner.waitForStop === "function" ? await runner.waitForStop(id, 5000) : true;
  if (!engineerStopped) {
    return {
      ok: false,
      reason: `the engineer process for #${id} did not stop; close-out was not started`,
    };
  }

  if (reload) await reload.prepareForCloseOut();

  const job = jobCoordinator.enqueue(task, { handoffSha });
  if (!job) {
    reload?.releaseCloseOut();
    return { ok: false, reason: "could not enqueue close-out job" };
  }
  // Deferred behind a cancelled attempt that is still executing (#0736).
  if (job.cancelled) {
    reload?.releaseCloseOut();
    return {
      ok: false,
      reason: `the previous close-out attempt for #${id} was stopped but is still shutting down; retry once it finishes`,
    };
  }

  // Always fence the task — including a task with no handoff snapshot. The
  // lock is what makes every task-write entry point (repoos mv, the runner's
  // handoff request, the file-watch handoff) refuse while the pipeline runs.
  writeWorktreeReviewLock(config.root, config.cacheDir, id, {
    status: "closing-out",
    sha: handoffSha ?? branchCommit(config.root, branch) ?? "",
    at: new Date().toISOString(),
  });

  emitEvent({
    type: "integration",
    pipeline: buildIntegrationSnapshot(jobCoordinator, {}, resolvePipelineCheckPlan(config)),
  });
  triggerJobProcessing();

  return { ok: true, jobTaskId: id };
}
