<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRepoStore } from "../stores/repo";

const repo = useRepoStore();

onMounted(() => {
  void repo.loadBoardUsage();
});

const stats = computed(() => repo.boardUsage);
const loading = computed(() => repo.boardUsageLoading);
const error = computed(() => repo.boardUsageError);

function fmtElapsed(ms: number | null | undefined): string {
  const totalSec = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

function fmtTokens(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(usd: number | null | undefined, source?: string): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  const n = usd < 0.01 ? usd.toFixed(4) : usd < 1 ? usd.toFixed(3) : usd.toFixed(2);
  if (source === "kiro-credits") return `${n} credits`;
  if (source === "estimate") return `~$${n} est`;
  if (source === "mixed") return `$${n}*`;
  return `$${n}`;
}

const hasUsage = computed(() => (stats.value?.totalSessions ?? 0) > 0);

/** The per-role breakdown, omitting empty roles so a quiet board stays compact. */
const visibleRoles = computed(() =>
  (stats.value?.roles ?? []).filter(
    (r) =>
      (r.totalSessions ?? 0) > 0 || (r.totalCostUsd ?? 0) > 0 || (r.totalElapsedMs ?? 0) > 0,
  ),
);

const days = computed(() => stats.value?.days ?? []);
</script>

<template>
  <div class="usage-panel" aria-live="polite">
    <div class="usage-head">
      <span class="usage-title">AI usage — all roles</span>
      <span v-if="hasUsage" class="usage-sessions">{{ stats?.totalSessions }} sessions</span>
    </div>
    <div v-if="loading" class="usage-empty">Loading AI usage…</div>
    <div v-else-if="error" class="usage-error">
      AI usage is unavailable: {{ error }}
      <button type="button" @click="repo.loadBoardUsage()">Retry</button>
    </div>
    <template v-else-if="stats && hasUsage">
      <div class="usage-grid">
        <div class="usage-cell">
          <span class="usage-label">time</span>
          <span class="usage-value">{{ fmtElapsed(stats.totalElapsedMs) }}</span>
        </div>
        <div class="usage-cell">
          <span class="usage-label">tokens</span>
          <span class="usage-value">{{ fmtTokens(stats.totalTokens) }}</span>
        </div>
        <div class="usage-cell">
          <span class="usage-label">cost</span>
          <span class="usage-value">{{ fmtCost(stats.totalCostUsd, stats.costSource) }}</span>
        </div>
      </div>

      <div v-if="visibleRoles.length" class="usage-roles">
        <div class="usage-subtitle">by role</div>
        <div class="usage-table-wrap">
          <table class="usage-table">
            <thead>
              <tr>
                <th class="ta-left">name</th>
                <th class="ta-right">time</th>
                <th class="ta-right">tokens</th>
                <th class="ta-right">cost</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in visibleRoles" :key="r.role" class="usage-role">
                <td class="usage-role-name ta-left">{{ r.role }}</td>
                <td class="ta-right">{{ fmtElapsed(r.totalElapsedMs) }}</td>
                <td class="ta-right">{{ fmtTokens(r.totalTokens) }}</td>
                <td class="ta-right">{{ fmtCost(r.totalCostUsd, r.costSource) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="days.length" class="usage-days">
        <div class="usage-subtitle">by day (server local time)</div>
        <div class="usage-table-wrap">
          <table class="usage-table">
            <thead>
              <tr>
                <th class="ta-left">date</th>
                <th class="ta-right">time</th>
                <th class="ta-right">tokens</th>
                <th class="ta-right">cost</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in days" :key="d.day" class="usage-role">
                <td class="usage-role-name ta-left">{{ d.day }}</td>
                <td class="ta-right">{{ fmtElapsed(d.totalElapsedMs) }}</td>
                <td class="ta-right">{{ fmtTokens(d.totalTokens) }}</td>
                <td class="ta-right">{{ fmtCost(d.totalCostUsd, d.costSource) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="stats.costSource === 'mixed'" class="usage-legend">* mixed cost sources — estimates &amp; credits shown alongside USD</div>
      </div>
    </template>
    <div v-else>No AI usage recorded yet.</div>
  </div>
</template>

<style scoped>
.usage-panel {
  border: 1px solid var(--border);
  background: var(--panel-solid);
  border-radius: 12px;
  padding: 12px 14px;
  font-family: "JetBrains Mono", monospace;
}
.usage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.usage-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--txt-faint);
}
.usage-sessions {
  font-size: 10.5px;
  color: var(--cyan);
}
.usage-grid {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
}
.usage-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.usage-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--txt-faint);
}
.usage-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--txt);
}
.usage-roles,
.usage-days {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
}
.usage-subtitle {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--txt-faint);
  margin-bottom: 6px;
}
.usage-table-wrap {
  margin-top: 6px;
  overflow-x: auto;
}
.usage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  color: var(--txt-dim);
  white-space: nowrap;
}
.usage-table th,
.usage-table td {
  padding: 4px 8px;
  text-align: right;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.usage-table td:first-child,
.usage-table th:first-child {
  padding-left: 0;
}
.usage-table th {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--txt-faint);
  font-weight: 600;
}
.ta-left {
  text-align: left !important;
}
.ta-right {
  text-align: right !important;
}
.usage-role-name {
  text-transform: capitalize;
  color: var(--cyan);
}
.usage-empty {
  font-size: 11.5px;
  color: var(--txt-dim);
}
.usage-error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--red);
  font-size: 11.5px;
}
.usage-error button {
  border: 1px solid currentColor;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 3px 7px;
}
.usage-legend {
  margin-top: 6px;
  font-size: 10px;
  color: var(--txt-faint);
}
</style>
