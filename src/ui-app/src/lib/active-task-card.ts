/**
 * UI bridge from repo store slices to {@link resolveActiveEngineerCardHint}.
 */
import {
  resolveActiveEngineerCardHint,
  type ActiveTaskCardHint,
  type ActiveTaskCheckSnapshot,
  type ActiveTaskRemoteSnapshot,
} from "../../../core/active-task-card.js";
import type { LocalQueueMarker } from "../../../core/local-queue-marker.js";
import { checkProgressLabel } from "./check-progress.js";
import { localQueueHintForTask } from "./local-queue-hint.js";
import { remotePoolQueueHintForTaskChecks } from "./remote-pool-queue.js";
import { silentMs } from "./retryHints.js";
import type { RemoteTaskActivity, TaskCheckRun } from "../types";

function runningCheck(runs: TaskCheckRun[] | undefined): TaskCheckRun | null {
  return runs?.find((r) => r.running) ?? null;
}

function checkSnapshot(run: TaskCheckRun): ActiveTaskCheckSnapshot {
  const scopeLabel =
    run.scope && run.scope !== "full"
      ? `Changed-path (${run.scope.replace(/^changed:/, "")})`
      : null;
  return {
    running: true,
    startedAt: run.startedAt,
    lastProgressAt: run.lastProgressAt ?? run.startedAt,
    progressLabel: checkProgressLabel({
      stepsDone: run.stepsDone ?? null,
      stepsTotal: run.stepsTotal ?? null,
      currentStep: run.currentStep ?? null,
      stepName: run.stepName ?? null,
      testsDone: run.testsDone ?? null,
      testsTotal: run.testsTotal ?? null,
      testsPass: run.testsPass ?? null,
    }),
    scopeLabel,
    machine: run.machine ?? null,
  };
}

function remoteSnapshot(
  activity: RemoteTaskActivity | null | undefined,
): ActiveTaskRemoteSnapshot | null {
  if (!activity) return null;
  return {
    run: activity.run
      ? {
          host: activity.run.host,
          kind: activity.run.kind,
          stage: activity.run.stage,
          startedAt: activity.run.startedAt,
          elapsedMs: activity.run.elapsedMs,
          lastProgressAt: activity.run.lastProgressAt,
        }
      : null,
    queue: activity.queue
      ? {
          host: activity.queue.host,
          position: activity.queue.position,
          waitedMs: activity.queue.waitedMs,
          kind: activity.queue.kind,
        }
      : null,
    telemetryMismatch: activity.telemetryMismatch ?? null,
  };
}

export function activeEngineerCardHint(opts: {
  taskId: string;
  nowMs: number;
  lastActivityAt: string | undefined;
  taskChecks: TaskCheckRun[] | undefined;
  remoteActivity: RemoteTaskActivity | null | undefined;
  resourceQueueMarkers: LocalQueueMarker[] | undefined;
  localCheckSlot?: { ageMs: number; heartbeatAgeMs: number } | null;
  busyChild?: string | null;
}): ActiveTaskCardHint {
  const localQueued = localQueueHintForTask(
    opts.resourceQueueMarkers,
    opts.taskId,
    new Date(opts.nowMs),
  );
  const poolQueued = remotePoolQueueHintForTaskChecks(opts.taskChecks);
  const run = runningCheck(opts.taskChecks);

  return resolveActiveEngineerCardHint({
    nowMs: opts.nowMs,
    agentSilentMs: silentMs(opts.nowMs, opts.lastActivityAt),
    check: run ? checkSnapshot(run) : null,
    remote: remoteSnapshot(opts.remoteActivity),
    localQueueLabel: localQueued?.label ?? null,
    localQueueTitle: localQueued?.title ?? null,
    remotePoolQueueLabel: poolQueued?.label ?? null,
    remotePoolQueueTitle: poolQueued?.title ?? null,
    localCheckSlot: opts.localCheckSlot ?? null,
    busyChild: opts.busyChild ?? null,
  });
}

export function activeEngineerCardBlocksInterrupt(hint: ActiveTaskCardHint): boolean {
  return hint.blocksAgentInterrupt;
}
