<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { useConfigStore } from "../stores/config";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  isPipelineVisible,
  resolvePipelineCard,
  sortPipelineLanes,
  type PipelineCardModel,
  type PipelineStage,
  type PipelineTaskInput,
} from "../../../core/pipeline-view.js";
import {
  pipelineHostLabel,
  pipelineModelsLabel,
  reviewerChip,
  taskInDevPass,
  taskRoundCounts,
} from "../lib/pipeline-card";
import { activeEngineerCardHint } from "../lib/active-task-card";
import { localQueueHintForTask } from "../lib/local-queue-hint";
import { remotePoolQueueHintForTaskChecks } from "../lib/remote-pool-queue";
import {
  integrationPipelineRole,
  integrationPipelineStalled,
} from "../lib/integration-pipeline-ui";
import { parseReviewVerdict } from "../lib/reviewVerdict";
import { resolveEffectiveAgent } from "../lib/effective-agent";
import {
  needsInputStatusLabel,
  needsInputSurfaces,
} from "../lib/needs-input-ui";
import { isHoldActive, taskIsHeld } from "../../../core/task-selection.js";
import type { Task } from "../types";
import PipelineCard, { type PipelineCardAction } from "./PipelineCard.vue";

const repo = useRepoStore();
const ui = useUiStore();
const config = useConfigStore();

/**
 * One tick for every "time in this state" label on the track. Thirty seconds
 * is plenty for minute-granularity labels, and a single view-level timer
 * beats one timer per card.
 */
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  nowTimer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    now.value = Date.now();
  }, 30_000);
});
onUnmounted(() => {
  if (nowTimer !== undefined) clearInterval(nowTimer);
});

interface Lane {
  task: Task;
  input: PipelineTaskInput;
  model: PipelineCardModel;
  chipText: string | null;
  stateSince: string | null;
  engineerRound: number;
  reviewerChipText: string | null;
  reviewerTone: "green" | "amber" | "red" | null;
  models: string;
  host: string;
  action: PipelineCardAction | null;
}

function lastActivityFor(taskId: string): string | undefined {
  return repo.agentActivityAt[taskId] ?? repo.runningSince[taskId];
}

function laneFor(task: Task, nowMs: number): Lane | null {
  const running = repo.isRunning(task.id);
  const checks = repo.taskChecks[task.id] ?? [];
  const runningCheck = checks.find((r) => r.running) ?? null;
  const remoteActivity = repo.taskRemoteActivity[task.id] ?? null;
  const reviewState = repo.reviewFor(task.id);
  const reviewRunning =
    reviewState?.running ?? task.automaticReview?.running ?? false;
  const role = integrationPipelineRole(repo.integration, task.id);
  const closeoutActive = role === "active";
  const closeoutQueued = role === "queued";
  const closeoutStalled = closeoutActive && integrationPipelineStalled(repo.integration, nowMs);
  // Same evidence the board card reads (#1000): a heartbeat stamped between
  // ticks must not read as "future" relative to this 30s tick.
  const engineerHint = activeEngineerCardHint({
    taskId: task.id,
    nowMs: Math.max(nowMs, Date.now()),
    lastActivityAt: lastActivityFor(task.id),
    taskChecks: repo.taskChecks[task.id],
    remoteActivity,
    resourceQueueMarkers: repo.resourceQueueMarkers,
  });
  const stuck =
    engineerHint.cls === "tc-stuck" || closeoutStalled || repo.doneErrorFor(task.id) !== null;
  const surfacesNeedsInput = needsInputSurfaces(task);
  const held = taskIsHeld(task) && isHoldActive(task, new Date(nowMs));
  const reviewPassesRaw = task.extra?.review_passes;
  const reviewPasses =
    typeof reviewPassesRaw === "number" && Number.isFinite(reviewPassesRaw)
      ? Math.max(0, Math.floor(reviewPassesRaw))
      : 0;
  const reviewRoundsRaw = task.extra?.review_rounds;
  const reviewRounds =
    typeof reviewRoundsRaw === "number" && Number.isFinite(reviewRoundsRaw)
      ? Math.max(0, Math.floor(reviewRoundsRaw))
      : 0;

  const input: PipelineTaskInput = {
    id: task.id,
    status: task.status as PipelineTaskInput["status"],
    priority: task.priority,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    releasedAt: task.releasedAt ?? null,
    running,
    queuedForAgent: repo.isQueued(task.id),
    handoffRequested: task.pendingHandoff === true,
    handoffFinalizing: repo.handoffInFlight(task.id),
    checkRunning: runningCheck !== null,
    checkQueued:
      remotePoolQueueHintForTaskChecks(checks) !== null ||
      localQueueHintForTask(repo.resourceQueueMarkers, task.id, new Date(nowMs)) !== null,
    checkProgress: runningCheck
      ? {
          done: runningCheck.stepsDone ?? runningCheck.testsDone ?? null,
          total: runningCheck.stepsTotal ?? runningCheck.testsTotal ?? null,
        }
      : null,
    reviewRunning,
    closeoutActive,
    closeoutQueued,
    closeoutStalled,
    stuck,
    needsInput: surfacesNeedsInput,
    held,
    reviewPasses,
    reviewRounds,
  };
  if (!isPipelineVisible(input, nowMs)) return null;

  const model = resolvePipelineCard(input, nowMs);
  const chipText =
    model.state === "stuck"
      ? "Stuck"
      : model.state === "needs-input"
        ? needsInputStatusLabel(task.needsInputReason, (task.questions?.length ?? 0) > 0)
        : model.state === "merged"
          ? "Merged"
          : null;
  const rounds = taskRoundCounts(task, taskInDevPass(task, running));
  const verdict = parseReviewVerdict(reviewState?.report?.markdown);
  const enabledAgents = (config.agents ?? []).filter((a) => a.enabled);
  const engineer = resolveEffectiveAgent(
    enabledAgents,
    { agentOverride: task.agentOverride, cliOverride: task.cliOverride, modelOverride: task.modelOverride },
    "engineer",
  );
  const reviewer = resolveEffectiveAgent(
    enabledAgents,
    {
      agentOverride: task.reviewAgentOverride ?? null,
      cliOverride: task.reviewCliOverride ?? null,
      modelOverride: task.reviewModelOverride ?? null,
    },
    "reviewer",
  );

  let action: PipelineCardAction | null = null;
  if (!held) {
    if (model.state === "merged" && repo.needsAck(task)) {
      action = { icon: "check", label: `Acknowledge merge of task ${task.id}` };
    } else if (task.status === "active" && running) {
      action = { icon: "pause", label: `Pause work on task ${task.id}` };
    } else if (task.status === "active") {
      action = { icon: "resume", label: `Resume work on task ${task.id}` };
    }
  }

  return {
    task,
    input,
    model,
    chipText,
    stateSince: model.state === "merged" ? (task.releasedAt ?? task.updated_at) : task.updated_at,
    engineerRound: rounds.dev,
    reviewerChipText: reviewerChip({ passes: rounds.review, tone: verdict?.tone ?? null, reviewRunning }),
    reviewerTone: verdict?.tone ?? null,
    models: pipelineModelsLabel(engineer.model, reviewer.model),
    host: pipelineHostLabel(remoteActivity?.run?.host, remoteActivity?.queue?.host),
    action,
  };
}

const lanes = computed<Lane[]>(() => {
  const nowMs = now.value;
  const candidates = [
    ...repo.byStatus("active"),
    ...repo.byStatus("review"),
    ...repo.byStatus("done"),
  ];
  const out: Lane[] = [];
  for (const task of candidates) {
    if (task.status !== "active" && task.status !== "review" && task.status !== "done") continue;
    const lane = laneFor(task, nowMs);
    if (lane) out.push(lane);
  }
  // Priority, then longest in flight first — decided while building (#1035).
  const order = new Map(sortPipelineLanes(out.map((l) => l.input)).map((input, i) => [input.id, i]));
  return out.sort((a, b) => (order.get(a.task.id) ?? 0) - (order.get(b.task.id) ?? 0));
});

const readyCount = computed(() => repo.byStatus("ready").length);

function sentBackNote(count: number): string {
  return count === 1 ? "sent back once" : `sent back ×${count}`;
}

function openTask(id: string): void {
  const lane = lanes.value.find((l) => l.task.id === id);
  if (lane) void ui.openTask(lane.task);
}

async function runAction(id: string): Promise<void> {
  const lane = lanes.value.find((l) => l.task.id === id);
  if (!lane || !lane.action) return;
  try {
    if (lane.action.icon === "check") {
      repo.acknowledge(id);
    } else if (lane.action.icon === "pause") {
      await repo.pauseWork(lane.task);
    } else {
      await repo.startWork(lane.task, "resume");
    }
  } catch (err) {
    // A dirty worktree needs the restart choice the board card's dialog
    // offers — open the panel so the human answers it there instead of
    // guessing from the track.
    if (err instanceof Error && err.name === "DirtyCheckoutError") {
      void ui.openTask(lane.task);
      return;
    }
    repo.onError(err);
  }
}

function stageCells(stage: PipelineStage): string {
  return `pipeline-cell stage-${stage}`;
}
</script>

<template>
  <div class="pipeline" data-test-id="pipeline-view">
    <div class="pipeline-scroll">
      <div class="pipeline-grid">
        <div class="pipeline-gutter pipeline-head-gutter">
          <span v-if="readyCount > 0" class="pipeline-queue">Ready · {{ readyCount }}</span>
        </div>
        <div
          v-for="stage in PIPELINE_STAGES"
          :key="`head-${stage}`"
          class="pipeline-head"
          :class="`stage-${stage}`"
        >
          {{ PIPELINE_STAGE_LABELS[stage] }}
        </div>
        <template v-for="lane in lanes" :key="lane.task.id">
          <div class="pipeline-gutter">
            <span v-if="lane.model.sentBackCount > 0" class="pipeline-sent-back">{{
              sentBackNote(lane.model.sentBackCount)
            }}</span>
          </div>
          <div v-for="stage in PIPELINE_STAGES" :key="`${lane.task.id}-${stage}`" :class="stageCells(stage)">
            <PipelineCard
              v-if="lane.model.stage === stage"
              :task-id="lane.task.id"
              :type="lane.task.type"
              :priority="lane.task.priority"
              :title="lane.task.title"
              :state="lane.model.state"
              :step-label="lane.model.stepLabel"
              :chip-text="lane.chipText"
              :state-since="lane.stateSince"
              :now-ms="now"
              :engineer-round="lane.engineerRound"
              :reviewer-chip="lane.reviewerChipText"
              :reviewer-tone="lane.reviewerTone"
              :models-label="lane.models"
              :host-label="lane.host"
              :action="lane.action"
              @open="openTask"
              @act="runAction"
            />
          </div>
        </template>
      </div>
      <div v-if="lanes.length === 0" class="pipeline-empty">
        <div class="pipeline-empty-title">Nothing in flight</div>
        <div>Tasks in active or review will race here, left to right.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pipeline {
  width: 100%;
  padding: 0 0 var(--page-bottom-inset);
  box-sizing: border-box;
}
.pipeline-scroll {
  overflow-x: auto;
}
.pipeline-grid {
  display: grid;
  grid-template-columns: 150px repeat(6, minmax(258px, 1fr));
  min-width: 1700px;
}
.pipeline-head-gutter {
  display: flex;
  align-items: center;
  min-height: 32px;
}
.pipeline-queue {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--chip-bg);
  color: var(--txt-dim);
  font-size: 10px;
  padding: 1px 7px;
  white-space: nowrap;
}
.pipeline-head {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--txt-faint);
}
.pipeline-head.stage-merged {
  background: var(--green-tint);
  color: var(--green);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}
.pipeline-gutter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 10px;
  height: 96px;
  border-top: 1px solid color-mix(in srgb, var(--txt) 7%, transparent);
}
.pipeline-sent-back {
  color: var(--amber);
  font-size: 10px;
  white-space: nowrap;
}
.pipeline-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96px;
  border-top: 1px solid color-mix(in srgb, var(--txt) 7%, transparent);
}
.pipeline-cell.stage-checks,
.pipeline-cell.stage-handoff,
.pipeline-cell.stage-review,
.pipeline-cell.stage-closeout,
.pipeline-cell.stage-merged {
  border-left: 1px solid color-mix(in srgb, var(--txt) 7%, transparent);
}
.pipeline-cell.stage-merged {
  background: var(--green-tint);
}
.pipeline-empty {
  padding: 40px 0;
  text-align: center;
  color: var(--txt-faint);
  font-size: 13px;
}
.pipeline-empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--txt-dim);
  margin-bottom: 4px;
}
</style>
