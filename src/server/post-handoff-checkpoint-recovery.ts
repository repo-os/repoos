/**
 * Post-handoff engineer checkpoint recovery (#0834).
 *
 * When Move to done sees HEAD ahead of the handoff snapshot only by WIP
 * self-check checkpoint commit(s), re-run the handoff gate on the new tree,
 * review the delta since the approved SHA, then resume the authorized close-out.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { LogLevel } from "../core/logger.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import { runGit } from "../core/git.js";
import { getGitWorker } from "./git-worker.js";
import type { JobCoordinator } from "./integration-job.js";
import type { LiveIndex, RepoEvent } from "./live-index.js";
import type { PreviewManager } from "./preview.js";
import type { ReviewManager } from "./review.js";
import type { RemoteValidator } from "./remote-validation.js";
import type { TaskCheckManager, TaskCheckListener } from "./task-check.js";
import type { AgentRunner } from "./agents.js";
import { finalizeReviewHandoff } from "./handoff.js";
import { readHandoffSnapshot, writeWorktreeReviewLock } from "./worktree-handoff-guard.js";
import { buildIntegrationSnapshot } from "./integration-status.js";
import { resolvePipelineCheckPlan } from "./check-plan-info.js";
import type { ReloadManager } from "./reload.js";

export type CheckpointRecoveryPhase = "gate" | "review" | "failed";

export interface PostHandoffCheckpointRecovery {
  taskId: string;
  approvedSha: string;
  headSha: string;
  phase: CheckpointRecoveryPhase;
  startedAt: string;
  detail?: string;
}

function recoveryPath(root: string, cacheDir: string, taskId: string): string {
  return join(root, cacheDir ?? ".repoos", "post-handoff-checkpoint", `${taskId}.json`);
}

export function readPostHandoffCheckpointRecovery(
  config: RepoOSConfig,
  taskId: string,
): PostHandoffCheckpointRecovery | null {
  const path = recoveryPath(config.root, config.cacheDir ?? ".repoos", taskId);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<PostHandoffCheckpointRecovery>;
    if (
      parsed?.taskId === taskId &&
      typeof parsed.approvedSha === "string" &&
      typeof parsed.headSha === "string" &&
      (parsed.phase === "gate" || parsed.phase === "review" || parsed.phase === "failed") &&
      typeof parsed.startedAt === "string"
    ) {
      return parsed as PostHandoffCheckpointRecovery;
    }
  } catch {
    /* corrupt */
  }
  return null;
}

function writeRecovery(config: RepoOSConfig, record: PostHandoffCheckpointRecovery): void {
  const path = recoveryPath(config.root, config.cacheDir ?? ".repoos", record.taskId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2), "utf8");
}

export function clearPostHandoffCheckpointRecovery(config: RepoOSConfig, taskId: string): void {
  try {
    unlinkSync(recoveryPath(config.root, config.cacheDir ?? ".repoos", taskId));
  } catch {
    /* gone */
  }
}

export function isPostHandoffCheckpointRecoveryActive(
  config: RepoOSConfig,
  taskId: string,
): boolean {
  const rec = readPostHandoffCheckpointRecovery(config, taskId);
  return rec !== null && rec.phase !== "failed";
}

/** Drop checkpoint markers left behind when no handoff slot is claimed (#1085). */
export function sweepOrphanedPostHandoffCheckpointRecoveries(
  config: RepoOSConfig,
  isHandoffLive: (taskId: string) => boolean,
): number {
  const dir = join(config.root, config.cacheDir ?? ".repoos", "post-handoff-checkpoint");
  let removed = 0;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const taskId = name.slice(0, -".json".length);
    const rec = readPostHandoffCheckpointRecovery(config, taskId);
    // Only a `gate` marker is backed by a handoff process. A `review` marker
    // means the delta review is still pending: close-out resumes from it when
    // the review says good to go, so a restart must not delete it.
    if (!rec || rec.phase !== "gate") continue;
    if (isHandoffLive(taskId)) continue;
    clearPostHandoffCheckpointRecovery(config, taskId);
    removed++;
  }
  return removed;
}

export interface CheckpointRecoveryDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  jobCoordinator: JobCoordinator;
  reviews: ReviewManager;
  reload: ReloadManager | null;
  emitEvent: (e: RepoEvent) => void;
  triggerJobProcessing: () => void;
  taskChecks?: TaskCheckManager;
  onTaskCheckEvent?: TaskCheckListener;
  remoteValidator?: RemoteValidator;
  previews?: PreviewManager;
  onTaskLog?: (taskId: string, level: LogLevel, message: string) => void;
  /** Required: the handoff slot is what makes recovery single-flight (#1085). */
  runner: Pick<AgentRunner, "markHandoffInFlight" | "releaseHandoffInFlight" | "isHandoffInFlight">;
}

/**
 * Begin async recovery instead of refusing Move to done. Returns immediately
 * after persisting state; the gate and delta review run in the background.
 */
export async function startPostHandoffCheckpointRecovery(
  deps: CheckpointRecoveryDeps,
  task: Task,
  approvedSha: string,
  headSha: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { config } = deps;
  const existing = readPostHandoffCheckpointRecovery(config, task.id);
  if (existing && existing.phase !== "failed") {
    if (deps.runner?.isHandoffInFlight?.(task.id)) {
      return { ok: false, reason: "checkpoint recovery is already running for this task" };
    }
    // The `review` phase is not slot-backed, but its delta review may still be
    // running: a second Move to done must not delete the marker and restart.
    if (existing.phase === "review" && deps.reviews.isRunning(task.id)) {
      return { ok: false, reason: "the delta review for this task is still running" };
    }
    clearPostHandoffCheckpointRecovery(config, task.id);
  }
  // Claim the handoff slot synchronously, before any await, so a second Move to
  // done cannot slip in between the start decision and the pipeline's claim.
  if (deps.runner?.markHandoffInFlight && !deps.runner.markHandoffInFlight(task.id)) {
    return { ok: false, reason: "checkpoint recovery is already running for this task" };
  }
  writeRecovery(config, {
    taskId: task.id,
    approvedSha,
    headSha,
    phase: "gate",
    startedAt: new Date().toISOString(),
  });
  deps.emitEvent({
    type: "task.progress",
    id: task.id,
    step: "checkpoint-recovery",
    detail: "Re-running handoff gate after engineer checkpoint commit(s)",
    at: new Date().toISOString(),
  });
  void runRecoveryPipeline(deps, task, approvedSha, headSha).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    writeRecovery(config, {
      taskId: task.id,
      approvedSha,
      headSha,
      phase: "failed",
      startedAt: new Date().toISOString(),
      detail: message,
    });
    deps.onTaskLog?.(task.id, "error", `checkpoint recovery failed: ${message}`);
    // Terminal signal (#0834): the task stays in `review`, so surface the
    // failure through the close-out error channel instead of leaving it silent.
    deps.emitEvent({
      type: "task.progress",
      id: task.id,
      step: "checkpoint-recovery-failed",
      detail: `checkpoint recovery failed: ${message} — move to done to retry, or send the task back to the engineer`,
      at: new Date().toISOString(),
    });
  });
  return { ok: true };
}

async function runRecoveryPipeline(
  deps: CheckpointRecoveryDeps,
  task: Task,
  approvedSha: string,
  headSha: string,
): Promise<void> {
  const { config, reviews } = deps;
  const branch = task.branch;
  if (!branch) throw new Error("task has no branch");
  // The slot was claimed by startPostHandoffCheckpointRecovery; hold it for the
  // whole gate and release it however the gate ends.
  let liveHead = headSha;
  try {
    const workdir = await getGitWorker(config.root).worktreePath(branch);
    if (!workdir) throw new Error("feature worktree not found");

    const headRes = await runGit(workdir, ["rev-parse", "HEAD"], 10_000);
    liveHead = headRes.status === 0 ? headRes.stdout.trim() : headSha;
    if (liveHead !== headSha) {
      throw new Error(
        `worktree HEAD moved during checkpoint recovery (${headSha.slice(0, 8)} → ${liveHead.slice(0, 8)})`,
      );
    }

    const handoff = await finalizeReviewHandoff(config, task, {
      checkpointRecovery: { approvedSha },
      taskChecks: deps.taskChecks,
      onTaskCheckEvent: deps.onTaskCheckEvent,
      remoteValidator: deps.remoteValidator,
      previews: deps.previews,
      onTaskLog: deps.onTaskLog,
      onProgress: () => {
        /* progress surfaced via task.progress above */
      },
    });
    if (!handoff.ok) {
      throw new Error(handoff.detail ?? `handoff gate failed at ${handoff.step}`);
    }
  } finally {
    deps.runner?.releaseHandoffInFlight?.(task.id);
  }

  writeRecovery(config, {
    taskId: task.id,
    approvedSha,
    headSha: liveHead,
    phase: "review",
    startedAt: new Date().toISOString(),
  });
  deps.emitEvent({
    type: "task.progress",
    id: task.id,
    step: "checkpoint-recovery",
    detail: "Reviewing delta since the approved handoff commit",
    at: new Date().toISOString(),
  });

  const review = await reviews.runCheckpointDelta(task, approvedSha);
  if (!review.ok) {
    throw new Error(review.reason ?? "could not start delta review");
  }
}

/**
 * After a delta review finishes `good to go`, resume Move to done with the
 * updated handoff snapshot SHA.
 */
export async function resumeCloseOutAfterCheckpointRecovery(
  deps: CheckpointRecoveryDeps,
  task: Task,
): Promise<void> {
  const { config, jobCoordinator, reload } = deps;
  const rec = readPostHandoffCheckpointRecovery(config, task.id);
  if (!rec || rec.phase !== "review") return;

  const branch = task.branch;
  if (!branch) {
    clearPostHandoffCheckpointRecovery(config, task.id);
    return;
  }
  const snap = readHandoffSnapshot(config.root, config.cacheDir ?? ".repoos", task.id);
  const handoffSha = snap?.sha ?? rec.headSha;
  clearPostHandoffCheckpointRecovery(config, task.id);

  if (reload) await reload.prepareForCloseOut();
  const job = jobCoordinator.enqueue(task, { handoffSha });
  if (!job || job.cancelled) {
    reload?.releaseCloseOut();
    deps.emitEvent({
      type: "task.progress",
      id: task.id,
      step: "checkpoint-recovery-failed",
      detail:
        "checkpoint recovery finished but close-out could not be resumed — move to done to retry",
      at: new Date().toISOString(),
    });
    return;
  }
  deps.emitEvent({
    type: "task.progress",
    id: task.id,
    step: "checkpoint-recovery-done",
    detail: "delta review passed — close-out resumed",
    at: new Date().toISOString(),
  });
  writeWorktreeReviewLock(config.root, config.cacheDir ?? ".repoos", task.id, {
    status: "closing-out",
    sha: handoffSha,
    at: new Date().toISOString(),
  });
  deps.emitEvent({
    type: "integration",
    pipeline: buildIntegrationSnapshot(jobCoordinator, {}, resolvePipelineCheckPlan(config)),
  });
  deps.triggerJobProcessing();
}

/** Delta review failed or was not good to go — drop recovery state. */
export function abandonCheckpointRecoveryAfterFailedDelta(
  config: RepoOSConfig,
  taskId: string,
  detail?: string,
): void {
  const rec = readPostHandoffCheckpointRecovery(config, taskId);
  if (!rec) return;
  writeRecovery(config, {
    ...rec,
    phase: "failed",
    detail: detail ?? rec.detail,
  });
  clearPostHandoffCheckpointRecovery(config, taskId);
}
