<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import { INTEGRATION_STAGES } from "../types";

/**
 * Inline close-out pipeline summary (#0738): active task, stage, and FIFO queue.
 * Shared by the Checks "Now" tab; the bottom IntegrationStatusBar keeps its own
 * expanded/collapsed chrome.
 */

const repo = useRepoStore();
const { integration } = storeToRefs(repo);

const snapshot = computed(() => integration.value ?? null);
const idle = computed(() => snapshot.value === null || snapshot.value.empty);
const active = computed(() => snapshot.value?.active ?? null);
const queue = computed(() => snapshot.value?.queue ?? []);
const showQueue = computed(() => queue.value.length > 0 && !active.value?.failed);

const stageIndex = computed(() => {
  const s = active.value?.stage;
  if (!s) return -1;
  return INTEGRATION_STAGES.indexOf(s);
});
</script>

<template>
  <section class="ips" aria-label="Close-out pipeline">
    <header class="ips-head">
      <span class="ips-title">Close-out pipeline</span>
      <span class="ips-dot" :class="{ idle, run: !idle && !active?.failed, err: active?.failed }" />
    </header>

    <p v-if="idle" class="ips-idle">
      No close-outs in progress. Queued Move-to-done jobs appear here with the task ahead of them in
      line.
    </p>

    <template v-else-if="active">
      <p class="ips-active">
        <span class="ips-active-label">
          <template v-if="active.failed">#{{ active.taskId }} failed</template>
          <template v-else>#{{ active.taskId }} · {{ active.stage ?? "…" }}</template>
        </span>
        <span v-if="active.failed && active.error" class="ips-err">{{ active.error }}</span>
      </p>
      <ol v-if="!active.failed" class="ips-stages" aria-label="Integration stages">
        <li
          v-for="(s, i) in INTEGRATION_STAGES"
          :key="s"
          class="ips-stage"
          :data-state="i < stageIndex ? 'done' : i === stageIndex ? 'current' : 'todo'"
        >
          {{ s }}
        </li>
      </ol>
    </template>

    <p v-else class="ips-active">
      <span class="ips-active-label">Close-out in progress</span>
    </p>

    <div v-if="showQueue" class="ips-queue">
      <span class="ips-queue-label">Queued behind</span>
      <span v-for="q in queue" :key="q" class="ips-chip">#{{ q }}</span>
    </div>
  </section>
</template>

<style scoped>
.ips {
  border: 1px solid var(--border);
  background: var(--panel-gradient);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.ips-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.ips-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--txt-dim);
}
.ips-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ips-dot.idle {
  background: var(--txt-faint);
}
.ips-dot.run {
  background: var(--cyan);
  box-shadow: 0 0 8px var(--cyan);
}
.ips-dot.err {
  background: var(--red);
  box-shadow: 0 0 8px var(--red);
}
.ips-idle {
  margin: 0;
  font-size: 12.5px;
  color: var(--txt-dim);
  line-height: 1.5;
}
.ips-active {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.45;
}
.ips-active-label {
  font-weight: 700;
  color: var(--txt);
  font-variant-numeric: tabular-nums;
}
.ips-err {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--red);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ips-stages {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 12px;
}
.ips-stage {
  color: var(--txt-faint);
}
.ips-stage[data-state="done"] {
  color: var(--green);
}
.ips-stage[data-state="current"] {
  color: var(--cyan);
  font-weight: 600;
}
.ips-queue {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
  font-size: 12px;
}
.ips-queue-label {
  color: var(--txt-faint);
}
.ips-chip {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--txt-dim);
  background: var(--chip-bg);
  border-radius: 999px;
  padding: 1px 8px;
  font-variant-numeric: tabular-nums;
}
</style>
