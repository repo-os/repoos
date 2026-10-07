/**
 * Assemble the CTO decision digest from live server state (#0730).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDecisionDigest,
  type CloseOutJobDigestSource,
  type DecisionDigest,
  type ProviderFailureDigestSource,
} from "../core/decision-digest.js";
import type { RepoOSConfig } from "../core/types.js";
import type { LiveIndex } from "./live-index.js";
import type { AgentRunner } from "./agents.js";
import type { JobCoordinator } from "./integration-job.js";
import type { ReviewManager } from "./review.js";
import type { AttentionEventStore } from "./attention-events.js";
import { evaluateAutoApprove } from "./approval-policy.js";
import { DEFAULT_STALL_TIMEOUT_MS } from "./agents.js";
import { getReleaseRunState } from "./routes/release.js";
import { isProviderFailureReason } from "../core/attention.js";

export interface DecisionDigestDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  jobCoordinator: JobCoordinator;
  reviews: ReviewManager;
  attentionEvents?: AttentionEventStore;
}

function readLogTail(root: string, relPath: string, maxChars = 8000): string | undefined {
  try {
    const raw = readFileSync(join(root, relPath), "utf8");
    return raw.slice(-maxChars);
  } catch {
    return undefined;
  }
}

export async function assembleDecisionDigest(deps: DecisionDigestDeps): Promise<DecisionDigest> {
  const tasks = deps.index.getTasks();
  const failedCloseOutJobs: CloseOutJobDigestSource[] = [];
  for (const job of deps.jobCoordinator.allJobs()) {
    if (job.phase !== "failed") continue;
    const task = deps.index.getTask(job.taskId);
    failedCloseOutJobs.push({
      taskId: job.taskId,
      taskTitle: task?.title ?? `Task #${job.taskId}`,
      failedPhase: job.failedPhase,
      reason: job.reason,
      logPath: job.logPath,
      debugTldr: job.debugTldr,
      failedAt: job.failedAt,
      logExcerpt: job.logPath ? readLogTail(deps.config.root, job.logPath) : undefined,
    });
  }

  const stallMs = DEFAULT_STALL_TIMEOUT_MS;
  const silentRuns: Array<{
    taskId: string;
    taskTitle: string;
    lastOutputAt: string | null;
    detail: string;
  }> = [];
  for (const run of deps.runner.running()) {
    const stats = deps.runner.stats(run.id);
    if (!stats.stalled) continue;
    const task = deps.index.getTask(run.id);
    silentRuns.push({
      taskId: run.id,
      taskTitle: task?.title ?? `Task #${run.id}`,
      lastOutputAt: stats.lastOutputAt,
      detail: `No agent output for at least ${Math.round(stallMs / 1000)}s while the process is still running.`,
    });
  }

  const reviewMarkdownByTaskId: Record<string, string> = {};
  const approvalByTaskId: Record<string, Awaited<ReturnType<typeof evaluateAutoApprove>>> = {};
  for (const task of tasks) {
    if (task.status !== "review" || task.isArchived) continue;
    const report = deps.reviews.read(task.id);
    const markdown = report?.markdown ?? "";
    reviewMarkdownByTaskId[task.id] = markdown;
    approvalByTaskId[task.id] = await evaluateAutoApprove(deps.config, task, markdown);
  }

  const providerFailures: ProviderFailureDigestSource[] = [];
  for (const ev of deps.attentionEvents?.list() ?? []) {
    if (ev.kind !== "providerFailure") continue;
    if (!isProviderFailureReason(ev.detail) && !isProviderFailureReason(ev.message)) continue;
    providerFailures.push({
      id: ev.id,
      taskId: ev.taskId,
      message: ev.message,
      detail: ev.detail,
      at: ev.at,
    });
  }

  const release = getReleaseRunState();
  const releaseRun =
    release.state === "failed"
      ? {
          state: "failed" as const,
          message: release.message,
          startedAt: release.startedAt,
        }
      : null;

  return buildDecisionDigest({
    config: deps.config,
    tasks,
    failedCloseOutJobs,
    silentRuns,
    releaseRun,
    providerFailures,
    reviewMarkdownByTaskId,
    approvalByTaskId,
  });
}
