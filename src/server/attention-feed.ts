/**
 * Server-side assembly of the unified attention feed (#0687).
 */
import { buildAttentionFeed, type AttentionFeed } from "../core/attention.js";
import type { RepoOSConfig } from "../core/types.js";
import type { LiveIndex } from "./live-index.js";
import type { AgentRunner } from "./agents.js";
import type { CloseOutOutcomeStore } from "./close-out-outcome.js";
import type { AttentionEventStore } from "./attention-events.js";
import type { ReleaseNotesRun, ReleaseRun } from "./routes/release.js";
import { getRepoOSDb } from "../core/db.js";
import { DEFAULT_STALL_TIMEOUT_MS } from "./agents.js";
import type { CtoHeartbeatTracker } from "./cto-heartbeat.js";
import { ctoSilentThresholdMs } from "./cto-heartbeat.js";

export interface AttentionFeedDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  closeOutOutcomes?: CloseOutOutcomeStore;
  attentionEvents?: AttentionEventStore;
  getReleaseRun: () => ReleaseRun;
  getReleaseNotesRun: () => ReleaseNotesRun;
  previewTargetAreas: string[];
  ctoHeartbeat?: CtoHeartbeatTracker;
}

export function assembleAttentionFeed(deps: AttentionFeedDeps): AttentionFeed {
  const tasks = deps.index.getTasks();
  const db = getRepoOSDb(deps.config.root);
  const board = db?.getBoardStats("all") ?? null;
  const recentProviderFailures =
    board?.recentFailures.map((r) => ({
      sessionId: r.sessionId,
      taskId: r.taskId ?? null,
      errorReason: r.errorReason,
      startedAt: r.startedAt,
    })) ?? [];

  const stallMs = DEFAULT_STALL_TIMEOUT_MS;
  const silentRuns: Array<{ taskId: string; lastOutputAt: string | null; detail: string }> = [];
  for (const run of deps.runner.running()) {
    const stats = deps.runner.stats(run.id);
    if (!stats.stalled) continue;
    silentRuns.push({
      taskId: run.id,
      lastOutputAt: stats.lastOutputAt,
      detail: `No agent output for at least ${Math.round(stallMs / 1000)}s while the process is still running.`,
    });
  }

  return buildAttentionFeed({
    config: deps.config,
    tasks,
    closeOutOutcomes: deps.closeOutOutcomes?.list() ?? [],
    releaseRun: deps.getReleaseRun(),
    releaseNotesRun: deps.getReleaseNotesRun(),
    recordedEvents: deps.attentionEvents?.list() ?? [],
    totalSpendUsd: board?.totalCostUsd ?? null,
    recentProviderFailures,
    silentRuns,
    previewTargetAreas: deps.previewTargetAreas,
    ctoHeartbeatAt: deps.ctoHeartbeat?.last() ?? null,
    ctoSilentThresholdMs: ctoSilentThresholdMs(
      (deps.config as { ctoMonitorIntervalMs?: number }).ctoMonitorIntervalMs,
    ),
  });
}
