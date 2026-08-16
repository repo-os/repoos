<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRepoStore } from "../stores/repo";

const repo = useRepoStore();

onMounted(() => {
  void repo.loadBoardUsage();
});

const stats = computed(() => repo.boardUsage);

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

function fmtCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd < 1 ? usd.toFixed(3) : usd.toFixed(2)}`;
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
  <div v-if="stats" class="usage-panel">
    <div class="usage-head">
      <span class="usage-title">AI usage — all roles</span>
      <span v-if="hasUsage" class="usage-sessions">{{ stats.totalSessions }} sessions</span>
    </div>
    <template v-if="hasUsage">
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
          <span class="usage-value">{{ fmtCost(stats.totalCostUsd) }}</span>
        </div>
      </div>

      <div v-if="visibleRoles.length" class="usage-roles">
        <div class="usage-subtitle">by role</div>
        <div class="usage-role-list">
          <div v-for="r in visibleRoles" :key="r.role" class="usage-role">
            <span class="usage-role-name">{{ r.role }}</span>
            <span>{{ fmtElapsed(r.totalElapsedMs) }}</span>
            <span>{{ fmtTokens(r.totalTokens) }}</span>
            <span>{{ fmtCost(r.totalCostUsd) }}</span>
          </div>
        </div>
      </div>

      <div v-if="days.length" class="usage-days">
        <div class="usage-subtitle">by day (server local time)</div>
        <div class="usage-role-list">
          <div v-for="d in days" :key="d.day" class="usage-role">
            <span class="usage-role-name">{{ d.day }}</span>
            <span>{{ fmtElapsed(d.totalElapsedMs) }}</span>
            <span>{{ fmtTokens(d.totalTokens) }}</span>
            <span>{{ fmtCost(d.totalCostUsd) }}</span>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="usage-empty">No AI usage recorded yet.</div>
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
.usage-role-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.usage-role {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--txt-dim);
}
.usage-role-name {
  text-transform: capitalize;
  color: var(--cyan);
  min-width: 92px;
}
.usage-empty {
  font-size: 11.5px;
  color: var(--txt-dim);
}
</style>
