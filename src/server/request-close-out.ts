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
  runGit,
  uncommittedWorkFiles,
  workFileFilter,
  worktreePathForBranch,
  branchChangedPaths,
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
  readWorktreeReviewLock,
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
export interface ApprovalPreflight {
  branchMissing: boolean;
  mergePreflightFailed: boolean;
  /** Every conflicted path `preflightMerge` reported (including the task file). */
  mergeConflicts: string[];
  mergeReason?: string;
  handoffDrift: boolean;
  mainDirty: boolean;
  /** Dirty paths on the primary checkout, minus ignorable runtime churn. */
  mainDirtyFiles: string[];
  /** True when reading main's dirty state failed (fail closed). */
  mainDirtyCheckFailed: boolean;
  /** Branch changes vs its merge-base with main; null when unreadable. */
  changedPaths: string[] | null;
  /** The task worktree, or null for hotfix/branch-less tasks. */
  worktree: string | null;
  /** Full worktree HEAD, when readable. */
  headSha: string | null;
  /** The review lock sha written at handoff, or null when no lock exists. */
  lockSha: string | null;
  /** Uncommitted files in the worktree; null when unreadable/no worktree. */
  worktreeDirty: string[] | null;
}

/** Preflight data shared by the approval policy and `repoos landable` (#0867). */
export async function gatherApprovalPreflight(
  config: RepoOSConfig,
  task: Task,
): Promise<ApprovalPreflight> {
  const branch = task.branch;
  let mainDirty = false;
  let mainDirtyFiles: string[] = [];
  let mainDirtyCheckFailed = false;
  try {
    mainDirtyFiles = await mainDirtyFilesForCloseOut(config.root, config);
    mainDirty = mainDirtyFiles.length > 0;
  } catch {
    // Treat an unreadable main as dirty: fail closed rather than auto-landing
    // on top of a checkout we could not verify (#0727).
    mainDirty = true;
    mainDirtyCheckFailed = true;
  }
  const lockSha = readWorktreeReviewLock(config.root, config.cacheDir, task.id)?.sha ?? null;
  if (!branch) {
    return {
      branchMissing: true,
      mergePreflightFailed: false,
      mergeConflicts: [],
      handoffDrift: false,
      mainDirty,
      mainDirtyFiles,
      mainDirtyCheckFailed,
      changedPaths: null,
      worktree: null,
      headSha: null,
      lockSha,
      worktreeDirty: null,
    };
  }
  if (!localBranches(config.root).has(branch)) {
    return {
      branchMissing: true,
      mergePreflightFailed: false,
      mergeConflicts: [],
      handoffDrift: false,
      mainDirty,
      mainDirtyFiles,
      mainDirtyCheckFailed,
      changedPaths: null,
      worktree: null,
      headSha: null,
      lockSha,
      worktreeDirty: null,
    };
  }

  const preflight = await preflightMerge(config.root, branch);
  const mergePreflightFailed = !preflight.ok;

  const worktree = task.hotfix === true ? null : worktreePathForBranch(config.root, branch);
  const changedPaths = worktree ? await branchChangedPaths(config.root, branch) : null;

  let handoffDrift = false;
  let worktreeDirty: string[] | null = null;
  let headSha: string | null = null;
  if (worktree) {
    const head = await runGit(worktree, ["rev-parse", "HEAD"], 4_000);
    if (head.status === 0 && head.stdout.trim()) headSha = head.stdout.trim();
    // A lock that names an older sha is the same drift the review-lock check
    // reports (#0867): the branch moved after handoff, so never auto-approve it.
    if (lockSha && headSha && lockSha !== headSha) handoffDrift = true;
    try {
      worktreeDirty = await uncommittedWorkFiles(worktree, workFileFilter(config));
      if (worktreeDirty.length > 0) handoffDrift = true;
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

  return {
    branchMissing: false,
    mergePreflightFailed,
    mergeConflicts: preflight.conflicts,
    mergeReason: preflight.reason,
    handoffDrift,
    mainDirty,
    mainDirtyFiles,
    mainDirtyCheckFailed,
    changedPaths,
    worktree,
    headSha,
    lockSha,
    worktreeDirty,
  };
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

  if (handoffSha) {
    writeWorktreeReviewLock(config.root, config.cacheDir, id, {
      status: "closing-out",
      sha: handoffSha,
      at: new Date().toISOString(),
    });
  }

  emitEvent({
    type: "integration",
    pipeline: buildIntegrationSnapshot(jobCoordinator, {}, resolvePipelineCheckPlan(config)),
  });
  triggerJobProcessing();

  return { ok: true, jobTaskId: id };
}
