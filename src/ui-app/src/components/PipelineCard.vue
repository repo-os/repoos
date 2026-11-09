<script setup lang="ts">
import { computed } from "vue";
import { formatPipelineElapsed, type PipelineCardState } from "../../../core/pipeline-view.js";
import { agentLastActivityTip } from "../lib/card-activity-recency";
import { checkProgressPercent, type CheckProgress } from "../lib/check-progress";
import {
  resolveSharedTaskCardStatus,
  type SharedTaskCardStatusInput,
} from "../lib/task-card-status.js";
import ChecksProgressDisplay from "./ChecksProgressDisplay.vue";

export interface PipelineCardAction {
  icon: "pause" | "resume" | "check";
  label: string;
}

const props = defineProps<{
  taskId: string;
  type: string;
  priority: string;
  title: string;
  state: PipelineCardState;
  statusSignals: SharedTaskCardStatusInput | null;
  /** Live step in words ("Coding", "Running checks 3/5", …). */
  stepLabel: string;
  /** Coloured chip text replacing the dot+step for stuck / needs-input / merged. */
  chipText: string | null;
  /** ISO timestamp the current state began (updated_at; releasedAt once merged). */
  stateSince: string | null;
  lastActivityAt: string | null;
  nowMs: number;
  roundsLabel: string;
  reviewerTone: "green" | "amber" | "red" | null;
  modelsLabel: string;
  hostLabel: string;
  action: PipelineCardAction | null;
  checkProgress: CheckProgress | null;
}>();

const emit = defineEmits<{
  (e: "open", id: string): void;
  (e: "act", id: string): void;
}>();

const elapsed = computed(() => formatPipelineElapsed(props.stateSince, props.nowMs));
const sharedStatus = computed(() =>
  props.statusSignals ? resolveSharedTaskCardStatus(props.statusSignals) : null,
);
const displayState = computed<PipelineCardState>(() => {
  if (!sharedStatus.value) return props.state;
  if (sharedStatus.value.stuck) return "stuck";
  if (sharedStatus.value.kind === "needs-input") return "needs-input";
  if (sharedStatus.value.kind === "paused") return "paused";
  return "ok";
});
const displayStepLabel = computed(() => sharedStatus.value?.label ?? props.stepLabel);
const displayChipText = computed(() => {
  if (sharedStatus.value?.stuck) return "Stuck";
  if (sharedStatus.value?.kind === "needs-input") return sharedStatus.value.label;
  return props.chipText;
});
const displayAction = computed<PipelineCardAction | null>(() => {
  if (!props.statusSignals || !sharedStatus.value) return props.action;
  if (sharedStatus.value.action === "pause") {
    return { icon: "pause", label: `Pause work on task ${props.taskId}` };
  }
  if (sharedStatus.value.action === "restart") {
    return { icon: "resume", label: `Restart work on task ${props.taskId}` };
  }
  return null;
});

const showInlineCheckBar = computed(
  () => props.checkProgress != null && checkProgressPercent(props.checkProgress) != null,
);
const validLastActivityAt = computed(() =>
  Number.isFinite(Date.parse(props.lastActivityAt ?? "")) ? props.lastActivityAt : null,
);

/** Hide elapsed only while live work is healthy; idle review/close-out rows keep state time. */
const showElapsedInline = computed(
  () => !(sharedStatus.value?.inFlight && !sharedStatus.value.stuck) || !validLastActivityAt.value,
);
const elapsedTip = computed(() =>
  agentLastActivityTip(validLastActivityAt.value ?? undefined, props.nowMs),
);

function open(): void {
  emit("open", props.taskId);
}
function act(): void {
  emit("act", props.taskId);
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    open();
  }
}
</script>

<template>
  <article
    class="pipeline-card"
    :class="`is-${displayState}`"
    :data-task-id="taskId"
    tabindex="0"
    role="button"
    :aria-label="`Open task ${taskId}: ${title}`"
    @click="open"
    @keydown="onKey"
  >
    <!-- Row 1: id, type, priority, action -->
    <div class="pl-row pl-row-1">
      <span class="pl-id mono">#{{ taskId }}</span>
      <span class="pl-chip">{{ type }}</span>
      <span class="pl-chip">{{ priority }}</span>
      <span class="pl-spacer"></span>
      <button
        v-if="displayAction"
        type="button"
        class="pl-action"
        :aria-label="displayAction.label"
        @click.stop="act"
      >
        <svg
          v-if="displayAction.icon === 'pause'"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="M10 4H6v16h4zM18 4h-4v16h4z" stroke="currentColor" stroke-width="2" />
        </svg>
        <svg
          v-else-if="displayAction.icon === 'resume'"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="M8 5v14l11-7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 12l5 5L20 6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
    <!-- Row 2: title -->
    <div class="pl-row pl-row-2 pl-title">{{ title }}</div>
    <!-- Row 3: status -->
    <div class="pl-row pl-row-3">
      <span v-if="displayChipText" class="pl-status-chip">{{ displayChipText }}</span>
      <ChecksProgressDisplay
        v-else-if="showInlineCheckBar"
        class="pl-check-progress"
        variant="pipeline"
        test-id="pipeline-card-check-progress"
        :progress="checkProgress"
        :pipeline-status-text="displayStepLabel"
        :data-tip="!showElapsedInline && elapsedTip ? elapsedTip : undefined"
        :tabindex="!showElapsedInline && elapsedTip ? 0 : undefined"
      />
      <template v-else>
        <span class="pl-dot" aria-hidden="true"></span>
        <span
          class="pl-step"
          :class="{ 'pl-step--recency-tip': !showElapsedInline && elapsedTip }"
          :tabindex="!showElapsedInline && elapsedTip ? 0 : undefined"
          :data-tip="!showElapsedInline && elapsedTip ? elapsedTip : undefined"
        >
          {{ displayStepLabel }}
        </span>
      </template>
      <span class="pl-spacer"></span>
      <span v-if="showElapsedInline" class="pl-elapsed" data-test-id="pipeline-card-elapsed">
        {{ elapsed }}
      </span>
    </div>
    <!-- Row 4: rounds, models, host -->
    <div class="pl-row pl-row-4">
      <span class="rounds-badge pl-round" :class="reviewerTone ? `tone-${reviewerTone}` : ''">
        {{ roundsLabel }}
      </span>
      <span class="pl-models">{{ modelsLabel }}</span>
      <span class="pl-spacer"></span>
      <span class="pl-host">{{ hostLabel }}</span>
    </div>
  </article>
</template>

<style scoped>
.pipeline-card {
  /* Cards are about twice the old 250px: wider than their column, anchored to
     its left edge (right edge for the last two columns) and overlapping the
     neighbouring empty lane space. */
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  width: min(500px, 155%);
  min-height: 116px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-solid);
  color: var(--txt);
  cursor: pointer;
  font-size: 11px;
  line-height: 1.4;
}
.pipeline-card:hover {
  border-color: var(--border-bright);
}
.pipeline-card:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 1px;
}
.pipeline-card.is-held,
.pipeline-card.is-paused {
  border-style: dashed;
}
.pl-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.pl-spacer {
  flex: 1 1 auto;
  min-width: 4px;
}
.pl-id {
  font-weight: 700;
  color: var(--muted-foreground);
}
.pl-chip {
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9px;
  text-transform: uppercase;
  font-weight: 600;
  border: 1px solid var(--border);
  color: var(--muted-foreground);
}
.pl-title {
  font-weight: 600;
  font-size: 12px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pl-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  flex: 0 0 auto;
}
.pipeline-card.is-paused .pl-dot {
  background: var(--amber);
}
.pipeline-card.is-stuck .pl-dot,
.pipeline-card.is-needs-input .pl-dot {
  background: var(--red);
}
.pl-step {
  font-weight: 600;
  color: var(--txt);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pl-status-chip {
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
}
.pipeline-card.is-stuck .pl-status-chip {
  color: var(--red);
  background: color-mix(in srgb, var(--red) 12%, transparent);
}
.pipeline-card.is-needs-input .pl-status-chip {
  color: var(--amber);
  background: color-mix(in srgb, var(--amber) 12%, transparent);
}
.pipeline-card.is-paused .pl-status-chip {
  color: var(--amber);
}
.pl-elapsed {
  color: var(--muted-foreground);
  font-size: 10px;
  white-space: nowrap;
}
.pl-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--txt);
  cursor: pointer;
  padding: 0;
}
.pl-action:hover {
  border-color: var(--border-bright);
}
.pl-action svg {
  width: 14px;
  height: 14px;
}
.pl-row-4 {
  color: var(--muted-foreground);
  font-size: 10px;
}
.pl-round {
  font-size: 9px;
}
.pl-models {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pl-host {
  white-space: nowrap;
}
.pl-check-progress {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
