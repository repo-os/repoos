<script setup lang="ts">
import { computed } from "vue";
import { formatPipelineElapsed, type PipelineCardState } from "../../../core/pipeline-view.js";
import type { CheckProgress } from "../lib/check-progress";
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
      <template v-else>
        <span class="pl-dot" aria-hidden="true"></span>
        <span class="pl-step">{{ displayStepLabel }}</span>
      </template>
      <span class="pl-spacer"></span>
      <span class="pl-elapsed">{{ elapsed }}</span>
    </div>
    <ChecksProgressDisplay
      v-if="checkProgress"
      variant="pipeline"
      test-id="pipeline-card-check-progress"
      :progress="checkProgress"
    />
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
}
.pl-id {
  font-size: 11px;
  color: var(--txt-dim);
}
.pl-chip {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--chip-bg);
  color: var(--txt-dim);
  font-size: 10px;
  line-height: 1.5;
  padding: 0 6px;
  white-space: nowrap;
}
.pl-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--txt);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pl-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green);
}
.is-stuck .pl-dot {
  background: var(--red);
}
.is-needs-input .pl-dot {
  background: var(--amber);
}
.is-paused .pl-dot,
.is-held .pl-dot {
  background: var(--txt-faint);
}
.pl-step {
  color: var(--txt-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pl-elapsed {
  flex: 0 0 auto;
  color: var(--txt-faint);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.pl-status-chip {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--chip-bg);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
  padding: 0 6px;
  white-space: nowrap;
}
.is-stuck .pl-status-chip {
  border-color: var(--red-border-tint);
  background: var(--red-tint);
  color: var(--red);
}
.is-needs-input .pl-status-chip {
  border-color: var(--amber-border-tint);
  background: var(--amber-tint);
  color: var(--amber);
}
.is-merged .pl-status-chip {
  border-color: var(--green-border-tint);
  background: var(--green-tint);
  color: var(--green);
}
.pl-models {
  color: var(--txt-faint);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.pl-host {
  flex: 0 0 auto;
  color: var(--txt-dim);
  font-size: 10px;
  white-space: nowrap;
}
.pl-action {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--txt-dim);
  cursor: pointer;
  padding: 0;
}
.pl-action:hover {
  color: var(--txt);
  border-color: var(--border-bright);
}
.pl-action:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 1px;
}
.pl-action svg {
  width: 12px;
  height: 12px;
}
.is-merged .pl-action {
  border-color: var(--green-border-tint);
  background: var(--green-tint);
  color: var(--green);
}
</style>
