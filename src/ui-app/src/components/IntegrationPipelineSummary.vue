<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import { INTEGRATION_STAGES } from "../types";
import { formatDuration } from "../lib/time";
import { api } from "../api";

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
const queueDetail = computed(() => snapshot.value?.queueDetail ?? []);
const showQueue = computed(() => queue.value.length > 0 && !active.value?.failed);
const localSlots = ref<
  Array<{
    slot: number;
    pid?: number;
    ageMs: number;
    heartbeatAgeMs: number;
    dead: boolean;
    wedged: boolean;
    meta?: Record<string, unknown>;
  }>
>([]);
const localQueue = ref<Array<{ taskId: string; position: number; since: string }>>([]);
async function refreshLocalSlots(): Promise<void> {
  try {
    const data = await api<{ holders: typeof localSlots.value; queue?: typeof localQueue.value }>(
      "/api/local-check-slots",
    );
    localSlots.value = data.holders ?? [];
    localQueue.value = data.queue ?? [];
  } catch {
    localSlots.value = [];
    localQueue.value = [];
  }
}

const stageIndex = computed(() => {
  const s = active.value?.stage;
  if (!s) return -1;
  return INTEGRATION_STAGES.indexOf(s);
});

/** Tick once a second so the current phase's elapsed time stays live (#0897). */
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void refreshLocalSlots();
  ticker = setInterval(() => {
    now.value = Date.now();
    void refreshLocalSlots();
  }, 5000);
});
onUnmounted(() => {
  if (ticker) clearInterval(ticker);
});

const phaseElapsed = computed(() => {
  const startedAt = active.value?.phaseStartedAt;
  if (!startedAt) return active.value?.phaseElapsedMs ?? null;
  const t = Date.parse(startedAt);
  return Number.isFinite(t) ? Math.max(0, now.value - t) : (active.value?.phaseElapsedMs ?? null);
});

const phaseBreakdown = computed(() => {
  const parts = (active.value?.phaseTimings ?? []).map((p) => {
    const ms =
      p.durationMs ??
      (p.endedAt
        ? Date.parse(p.endedAt) - Date.parse(p.startedAt)
        : Math.max(0, now.value - Date.parse(p.startedAt)));
    return `${p.phase} ${formatDuration(ms)}`;
  });
  return parts.join(" · ");
});

function queueWait(ms: number): string {
  return formatDuration(Math.max(0, ms));
}
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
          <template v-else>
            #{{ active.taskId }} · {{ active.stage ?? "…" }}
            <template v-if="active.phase">
              · {{ active.phase
              }}<template v-if="phaseElapsed != null">
                ({{ formatDuration(phaseElapsed) }})</template
              >
            </template>
          </template>
        </span>
        <span v-if="active.failed && active.error" class="ips-err">{{ active.error }}</span>
        <span v-else-if="phaseBreakdown" class="ips-phases">{{ phaseBreakdown }}</span>
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
      <span v-for="q in queueDetail" :key="q.taskId" class="ips-chip">
        #{{ q.taskId }} · pos {{ q.position }} · {{ queueWait(q.waitedMs)
        }}<template v-if="q.blockerTaskId">
          · ahead: #{{ q.blockerTaskId }} {{ q.blockerPhase }}</template
        >
      </span>
      <span v-for="q in queueDetail.length ? [] : queue" :key="q" class="ips-chip">#{{ q }}</span>
    </div>
    <div class="ips-local-slots" aria-label="Local check slots">
      <strong>Local check slots</strong>
      <span v-for="holder in localSlots" :key="holder.slot" class="ips-chip">
        slot {{ holder.slot }} ·
        <template v-if="holder.pid"
          >{{ holder.meta?.taskId ? `#${holder.meta.taskId}` : "check" }} PID {{ holder.pid }} ·
          {{ holder.dead ? "dead, reclaiming" : holder.wedged ? "wedged" : "alive" }} · held
          {{ formatDuration(holder.ageMs) }} · heartbeat
          {{ formatDuration(holder.heartbeatAgeMs) }} ago</template
        ><template v-else>free</template>
      </span>
      <span v-for="(queued, index) in localQueue" :key="queued.taskId" class="ips-chip"
        >queue {{ index + 1 }} · #{{ queued.taskId }} · position {{ queued.position }} ·
        {{ formatDuration(Math.max(0, now - Date.parse(queued.since))) }} waiting</span
      >
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
.ips-phases {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--txt-dim);
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
