/**
 * Shared close-out re-queue after refreshing main's install (#0674, #0688).
 */
import type { RepoOSConfig, Task } from "../core/types.js";
import type { JobCoordinator } from "./integration-job.js";
import { classifyFailure } from "../core/close-out-failure.js";
import {
  isCloseOutEnvironmentFailure,
  refreshMainDependencyInstall,
} from "../core/dependency-install.js";

export type RequeueEnvCloseOutResult =
  | { ok: true; refreshed: boolean }
  | { ok: false; reason: string };

export async function requeueCloseOutAfterEnvFix(
  config: RepoOSConfig,
  jobCoordinator: JobCoordinator,
  task: Task,
  opts?: { skipRefresh?: boolean },
): Promise<RequeueEnvCloseOutResult> {
  const job = jobCoordinator.getJob(task.id);
  if (!job) {
    return { ok: false, reason: `No integration job for task #${task.id}` };
  }
  if (job.phase !== "failed") {
    return { ok: false, reason: `Task #${task.id} is not in a failed integration state` };
  }

  const reason = job.reason ?? "";
  if (
    classifyFailure(job.failedPhase, reason) !== "environment" &&
    !isCloseOutEnvironmentFailure(reason)
  ) {
    return {
      ok: false,
      reason: "Only environment failures (stale or missing dependencies) can be re-queued this way",
    };
  }

  let refreshed = false;
  if (!opts?.skipRefresh) {
    const install = await refreshMainDependencyInstall(config);
    if (!install.ok) {
      return {
        ok: false,
        reason: install.reason ?? "could not refresh dependencies in the primary checkout",
      };
    }
    refreshed = true;
  }

  const reenqueued = jobCoordinator.enqueue(task);
  if (!reenqueued) {
    return { ok: false, reason: `Task #${task.id} has no branch to integrate` };
  }

  return { ok: true, refreshed };
}
