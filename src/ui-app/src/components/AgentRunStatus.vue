<script setup lang="ts">
import { computed } from "vue";
import { splitAgentFailureDetail } from "../../../core/agent-failure.js";
import {
  agentRunTone,
  formatAgentRunLabel,
  matchAgentRunSetup,
  type AgentLastRunRow,
} from "../../../core/agent-last-runs.js";

/** One agent's latest run, inline beside its name — a dot plus a short label. */
const props = defineProps<{
  run: AgentLastRunRow | null;
  /** The agent's current coding agent and model (what the card is configured to). */
  cli: string;
  model: string;
}>();

const setupMatch = computed(() =>
  props.run ? matchAgentRunSetup(props.run, { cli: props.cli, model: props.model }) : "unknown",
);

const tone = computed(() =>
  props.run ? agentRunTone(props.run.status, setupMatch.value) : "muted",
);

const clock = computed(() => {
  if (!props.run) return "";
  const at = new Date(props.run.at);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
});

const label = computed(() =>
  props.run ? formatAgentRunLabel(props.run, setupMatch.value, clock.value).trim() : "",
);

const failure = computed(() => {
  if (!props.run?.reason) return null;
  const parts = splitAgentFailureDetail(props.run.reason);
  return parts.summary || parts.raw ? parts : null;
});

/** A previous setup is context, not the current status; a healthy run has no expansion. */
const expandable = computed(
  () =>
    Boolean(failure.value) ||
    setupMatch.value === "previous" ||
    (tone.value === "error" && Boolean(props.run?.taskId)),
);

const taskLink = computed(() => {
  if (!props.run?.taskId) return null;
  return { name: "work", query: { task: props.run.taskId, tab: "debug" } };
});
</script>

<template>
  <details
    v-if="run && expandable"
    class="agent-run-status"
    :class="`agent-run-${tone}`"
    data-testid="agent-run-status"
    :data-agent="run.name"
  >
    <summary class="agent-run-summary">
      <span class="agent-run-dot" aria-hidden="true"></span>
      <span class="agent-run-label">{{ label }}</span>
    </summary>
    <div class="agent-run-detail">
      <p v-if="setupMatch === 'previous'" class="agent-run-previous">
        This run used a different coding agent or model than this card now uses.
      </p>
      <p v-if="failure?.summary" class="agent-run-reason">{{ failure.summary }}</p>
      <RouterLink v-if="taskLink" class="agent-run-link" :to="taskLink">
        Open task log →
      </RouterLink>
      <details v-if="failure?.raw" class="agent-failure-raw">
        <summary>Raw CLI error</summary>
        <pre>{{ failure.raw }}</pre>
      </details>
    </div>
  </details>
  <span
    v-else-if="run"
    class="agent-run-status"
    :class="`agent-run-${tone}`"
    data-testid="agent-run-status"
    :data-agent="run.name"
  >
    <span class="agent-run-dot" aria-hidden="true"></span>
    <span class="agent-run-label">{{ label }}</span>
  </span>
</template>
