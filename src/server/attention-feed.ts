/**
 * Server-side assembly of the unified attention feed (#0687), including the
 * in-flight slow-run detector (#0720).
 */
import { buildAttentionFeed, type AttentionFeed } from "../core/attention.js";
import {
  effectiveElapsedMs,
  evaluateSlowness,
  persistentSlowNotices,
  type CheckRunSample,
  type RunningRun,
  type SlowRunFlag,
} from "../core/check-slowness.js";
import { DEFAULT_SLOW_RUN_MULTIPLIER } from "../core/types.js";
import type { RepoOSConfig } from "../core/types.js";
import type { LiveIndex } from "./live-index.js";
import type { AgentRunner } from "./agents.js";
import type { CloseOutOutcomeStore } from "./close-out-outcome.js";
import type { AttentionEventStore } from "./attention-events.js";
import type { TaskCheckManager } from "./task-check.js";
import type { ReleaseNotesRun, ReleaseRun } from "./routes/release.js";
import { getRepoOSDb } from "../core/db.js";
import { getCheckStore, type CheckRunPhase } from "../core/check-store.js";
import { DEFAULT_STALL_TIMEOUT_MS } from "./agents.js";
import type { CtoHeartbeatTracker } from "./cto-heartbeat.js";
import { ctoSilentThresholdMs } from "./cto-heartbeat.js";

/** Maps a tracked TaskCheckManager kind to its history phase. */
const TASK_CHECK_PHASE: Record<string, CheckRunPhase> = {
  "handoff-finalize": "pre-review",
  "merge-gate": "close-out",
};

/** How many recent history rows feed the rolling median (#0720). */
const HISTORY_LIMIT = 60;

/** Awake-clock sample for sleep-aware elapsed (#0720/#0678). */
export interface AwakeClock {
  lastTickMs: number;
  intervalMs: number;
}

/** An in-flight remote run with its current stage, from the remote validator. */
export interface RemoteActiveRunInfoLike {
  taskId: string;
  host: string;
  phase: CheckRunPhase;
  scope: string;
  startedAt: string;
  stage: string | null;
  uploadBytes: number | null;
  uploadSeconds: number | null;
}

export interface AttentionFeedDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  closeOutOutcomes?: CloseOutOutcomeStore;
  attentionEvents?: AttentionEventStore;
  /** In-memory live check runs (#0720). */
  taskChecks?: TaskCheckManager;
  /** In-flight remote runs with stage, from the remote validator (#0720). */
  remoteActiveRuns?: () => RemoteActiveRunInfoLike[];
  /**
   * Awake-clock sample for sleep-aware elapsed (#0720/#0678): the last
   * watchdog tick and its cadence. Absent means "no sleep adjustment".
   */
  awakeClock?: () => AwakeClock;
  getReleaseRun: () => ReleaseRun;
  getReleaseNotesRun: () => ReleaseNotesRun;
  previewTargetAreas: string[];
  ctoHeartbeat?: CtoHeartbeatTracker;
}

/** Read the recent check-run history reduced to what the median needs. */
function readHistory(config: RepoOSConfig): CheckRunSample[] {
  try {
    return getCheckStore(config.root, config.cacheDir)
      .list({ limit: HISTORY_LIMIT })
      .map((r) => ({
        phase: r.phase,
        remote: r.remote,
        scope: r.scope,
        outcome: r.outcome,
        durationMs: r.durationMs,
        machine: r.machine ?? null,
      }));
  } catch {
    // Visibility only — a slow-run flag must never break the feed.
    return [];
  }
}

/** Sleep-aware elapsed ms for a run started at `startedAtIso`. */
function elapsedFor(startedAtIso: string, nowMs: number, clock: AwakeClock | undefined): number {
  const startedMs = Date.parse(startedAtIso);
  if (!Number.isFinite(startedMs)) return 0;
  if (!clock) return Math.max(0, nowMs - startedMs);
  return effectiveElapsedMs(startedMs, nowMs, clock.lastTickMs, clock.intervalMs);
}

/**
 * Assemble in-flight runs from the local check manager and remote validator.
 * When a task's gate is on a remote runner, TaskCheckManager still tracks the
 * local wrapper — skip that row so slow-run detection raises one item (#0720).
 */
export function collectRunningRuns(
  taskChecks: TaskCheckManager | undefined,
  remoteRuns: RemoteActiveRunInfoLike[] | undefined,
  nowMs: number,
  clock: AwakeClock | undefined,
): RunningRun[] {
  const running: RunningRun[] = [];
  const remoteTaskIds = new Set((remoteRuns ?? []).map((r) => r.taskId));

  for (const run of taskChecks?.runningRuns() ?? []) {
    if (remoteTaskIds.has(run.taskId)) continue;
    running.push({
      id: `taskcheck:${run.id}`,
      taskId: run.taskId,
      phase: TASK_CHECK_PHASE[run.kind] ?? "cli",
      remote: false,
      scope: run.scope,
      machine: run.machine,
      startedAt: run.startedAt,
      elapsedMs: elapsedFor(run.startedAt, nowMs, clock),
      stage: null,
    });
  }

  for (const run of remoteRuns ?? []) {
    running.push({
      id: `remote:${run.taskId}:${run.startedAt}`,
      taskId: run.taskId,
      phase: run.phase,
      remote: true,
      scope: run.scope,
      machine: run.host,
      startedAt: run.startedAt,
      elapsedMs: elapsedFor(run.startedAt, nowMs, clock),
      stage: run.stage,
      uploadBytes: run.uploadBytes,
      uploadSeconds: run.uploadSeconds,
    });
  }

  return running;
}

/** Every in-flight run that currently exceeds its kind median (#0720). */
export function computeSlowRunFlags(opts: {
  config: RepoOSConfig;
  taskChecks?: TaskCheckManager;
  remoteRuns?: RemoteActiveRunInfoLike[];
  awakeClock?: AwakeClock;
  nowMs?: number;
}): SlowRunFlag[] {
  const multiplier = opts.config.attention?.slowRunMultiplier ?? DEFAULT_SLOW_RUN_MULTIPLIER;
  const nowMs = opts.nowMs ?? Date.now();
  const running = collectRunningRuns(opts.taskChecks, opts.remoteRuns, nowMs, opts.awakeClock);
  if (running.length === 0) return [];
  return evaluateSlowness({ running, history: readHistory(opts.config), multiplier });
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

  // Slow-run detection (#0720): compare each in-flight run's elapsed time with
  // the rolling median of recent PASSING runs of the same kind.
  const multiplier = deps.config.attention?.slowRunMultiplier ?? DEFAULT_SLOW_RUN_MULTIPLIER;
  const history = readHistory(deps.config);
  const nowMs = Date.now();
  const running = collectRunningRuns(
    deps.taskChecks,
    deps.remoteActiveRuns?.(),
    nowMs,
    deps.awakeClock?.(),
  );
  const slowRuns = evaluateSlowness({ running, history, multiplier });
  const slowRunNotices = persistentSlowNotices({ history, multiplier });

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
    slowRuns,
    slowRunNotices,
    previewTargetAreas: deps.previewTargetAreas,
    ctoHeartbeatAt: deps.ctoHeartbeat?.last() ?? null,
    ctoSilentThresholdMs: ctoSilentThresholdMs(
      (deps.config as { ctoMonitorIntervalMs?: number }).ctoMonitorIntervalMs,
    ),
  });
}
