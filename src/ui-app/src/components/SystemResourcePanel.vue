<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import Card from "./ui/card.vue";
import type { SystemStats } from "../types";

const repo = useRepoStore();
const { systemStats } = storeToRefs(repo);

const HISTORY_MAX = 60;

const cpuHistory = ref<number[]>([]);
const memHistory = ref<number[]>([]);

watch(systemStats, (s) => {
  if (!s) return;
  cpuHistory.value = [...cpuHistory.value, s.totals.cpuPercent].slice(-HISTORY_MAX);
  memHistory.value = [...memHistory.value, s.totals.memPercent].slice(-HISTORY_MAX);
});

const memUsed = computed(() => {
  if (!systemStats.value) return null;
  return (systemStats.value.machine.totalMem - systemStats.value.machine.freeMem);
});

function fmtBytes(b: number): string {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB";
  if (b >= 1048576) return (b / 1048576).toFixed(0) + " MB";
  return (b / 1024).toFixed(0) + " KB";
}

function fmtPct(v: number): string {
  if (v < 0.1) return v.toFixed(1);
  if (v < 10) return v.toFixed(1);
  return v.toFixed(0);
}

function fmtElapsed(raw: string): string {
  const parts = raw.split(/[-:]/);
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseInt(parts[2], 10);
    if (h > 0) return `${h}h${m}m`;
    if (m > 0) return `${m}m${s}s`;
    return `${s}s`;
  }
  return raw;
}

function svgPath(data: number[], width: number, height: number, maxVal: number): string {
  if (data.length < 2) return "";
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const effectiveMax = Math.max(maxVal, 1);
  return data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * w;
      const y = pad + h - (v / effectiveMax) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const hasData = computed(() => systemStats.value !== null);
</script>

<template>
  <Card class="resource-panel">
    <div class="panel-title">System Resources</div>

    <template v-if="hasData">
      <div class="headlines">
        <div class="metric">
          <div class="metric-label">CPU (RepoOS)</div>
          <div class="metric-val">
            <span class="metric-big">{{ fmtPct(systemStats!.totals.cpuPercent) }}%</span>
            <span class="metric-sub">of {{ systemStats!.machine.cpuCount }} cores</span>
          </div>
          <svg class="sparkline" :viewBox="`0 0 120 32`" preserveAspectRatio="none">
            <path
              v-if="cpuHistory.length > 1"
              :d="svgPath(cpuHistory, 120, 32, Math.max(...cpuHistory, 10))"
              fill="none"
              stroke="var(--cyan)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <div class="metric">
          <div class="metric-label">Memory (RepoOS)</div>
          <div class="metric-val">
            <span class="metric-big">{{ fmtBytes(systemStats!.totals.memBytes) }}</span>
            <span class="metric-sub">/ {{ fmtBytes(systemStats!.machine.totalMem) }} · {{ fmtPct(systemStats!.totals.memPercent) }}%</span>
          </div>
          <svg class="sparkline" :viewBox="`0 0 120 32`" preserveAspectRatio="none">
            <path
              v-if="memHistory.length > 1"
              :d="svgPath(memHistory, 120, 32, Math.max(...memHistory, 1))"
              fill="none"
              stroke="var(--violet)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <div v-if="memUsed !== null" class="metric">
          <div class="metric-label">Machine</div>
          <div class="metric-val">
            <span class="metric-big">{{ fmtBytes(memUsed) }}</span>
            <span class="metric-sub">used of {{ fmtBytes(systemStats!.machine.totalMem) }}</span>
          </div>
          <div class="metric-extra">
            <span>Free: {{ fmtBytes(systemStats!.machine.freeMem) }}</span>
            <span>Load: {{ systemStats!.machine.loadavg.map(v => v.toFixed(1)).join(" ") }}</span>
          </div>
        </div>
      </div>

      <div v-if="systemStats!.processes.length" class="process-table-wrap">
        <div class="process-table-header">
          <span class="col-pid">PID</span>
          <span class="col-task">Task</span>
          <span class="col-cpu">CPU</span>
          <span class="col-mem">Memory</span>
          <span class="col-time">Runtime</span>
        </div>
        <div
          v-for="p in systemStats!.processes"
          :key="p.pid"
          class="process-row"
          :class="{ orphaned: p.orphaned }"
        >
          <span class="col-pid">
            <span class="pid-chip" :class="{ orphan: p.orphaned }">{{ p.pid }}</span>
          </span>
          <span class="col-task">
            <template v-if="p.taskId">
              <router-link v-if="p.taskId" :to="`/work?id=${p.taskId}`" class="task-link">
                #{{ p.taskId }}
              </router-link>
            </template>
            <template v-else>
              <span class="task-unknown">{{ p.pid === systemStats!.serverPid ? 'serve' : 'unknown' }}</span>
            </template>
            <span v-if="p.orphaned" class="orphan-tag">orphan</span>
            <span v-if="p.unverified" class="unverified-tag">unverified</span>
          </span>
          <span class="col-cpu">{{ fmtPct(p.cpuPercent) }}%</span>
          <span class="col-mem">{{ fmtBytes(p.memBytes) }}</span>
          <span class="col-time">{{ fmtElapsed(p.elapsed) }}</span>
        </div>
      </div>
    </template>

    <div v-else class="waiting">
      <span class="waiting-dot"></span>
      Waiting for resource data — connect to the live server
    </div>
  </Card>
</template>

<style scoped>
.resource-panel {
  background: var(--panel-gradient, linear-gradient(180deg, #0c1222, #080c16));
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--txt-dim);
  margin-bottom: 14px;
}

.headlines {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 14px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--txt-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.metric-val {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.metric-big {
  font-size: 20px;
  font-weight: 700;
  color: var(--txt);
  font-variant-numeric: tabular-nums;
}

.metric-sub {
  font-size: 11px;
  color: var(--txt-faint);
}

.metric-extra {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: var(--txt-faint);
  font-variant-numeric: tabular-nums;
}

.sparkline {
  width: 100%;
  height: 32px;
  margin-top: 2px;
  opacity: 0.6;
}

.process-table-wrap {
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.process-table-header {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr 1.5fr 1.5fr;
  gap: 6px;
  padding: 4px 4px 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--txt-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.process-row {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr 1.5fr 1.5fr;
  gap: 6px;
  padding: 6px 4px;
  font-size: 12px;
  color: var(--txt-dim);
  border-bottom: 1px solid rgba(120, 140, 200, 0.06);
  align-items: center;
  font-variant-numeric: tabular-nums;
}

.process-row:last-child {
  border-bottom: none;
}

.process-row.orphaned {
  background: rgba(255, 107, 125, 0.06);
  border-radius: 4px;
}

.process-row.orphaned .col-task {
  color: var(--red);
}

.pid-chip {
  display: inline-block;
  background: var(--chip-bg);
  color: var(--txt-dim);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.pid-chip.orphan {
  background: rgba(255, 107, 125, 0.18);
  color: var(--red);
}

.task-link {
  color: var(--cyan);
  text-decoration: none;
  font-weight: 500;
}

.task-link:hover {
  text-decoration: underline;
}

.task-unknown {
  color: var(--txt-faint);
  font-style: italic;
}

.orphan-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--red);
  background: rgba(255, 107, 125, 0.14);
  border-radius: 3px;
}

.unverified-tag {
  display: inline-block;
  margin-left: 4px;
  padding: 0 5px;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--amber);
  background: rgba(255, 180, 84, 0.14);
  border-radius: 3px;
}

@media (max-width: 768px) {
  .headlines {
    grid-template-columns: 1fr;
  }
}

.waiting {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--txt-faint);
  padding: 12px 0 4px;
}

.waiting-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--amber);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
</style>
