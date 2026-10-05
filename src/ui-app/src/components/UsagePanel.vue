<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRepoStore } from "../stores/repo";
import type { UsageRange } from "../types";
import { fmtTokens } from "../lib/format";
import { relTime } from "../lib/time";

const repo = useRepoStore();

onMounted(() => {
  void repo.loadBoardUsage();
});

const stats = computed(() => repo.boardUsage);
const loading = computed(() => repo.boardUsageLoading);
const error = computed(() => repo.boardUsageError);
const range = computed(() => repo.boardUsageRange);

/** The four windows the panel can show (0334), in selector order. */
const RANGE_OPTIONS: Array<{ value: UsageRange; label: string }> = [
  { value: "1d", label: "1 day" },
  { value: "7d", label: "1 week" },
  { value: "30d", label: "1 month" },
  { value: "all", label: "all time" },
];

function selectRange(next: UsageRange): void {
  if (next !== range.value) void repo.loadBoardUsage(next);
}

function fmtElapsed(ms: number | null | undefined): string {
  const totalSec = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

/** "3 hours ago", prefixed with the calendar date once it is over 24 hours old. */
function fmtWhen(iso: string | null | undefined): string {
  const ago = relTime(iso);
  if (!iso) return ago;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return ago;
  if (Date.now() - t.getTime() <= 24 * 3600 * 1000) return ago;
  const sameYear = t.getFullYear() === new Date().getFullYear();
  const date = t.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${date} · ${ago}`;
}

/** Hover text, e.g. "Tue, 5 Oct 13:55" (local time). */
function fmtWhenFull(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const date = t.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date.replace(/^(\w+) /, "$1, ")} ${time}`;
}

function fmtCost(usd: number | null | undefined, source?: string): string {
  // No provider-reported cost → say so plainly rather than an em dash that
  // reads as "zero" (#0676). Legacy `estimate` rows are shown as unknown too:
  // a token-count estimate is not real spend.
  if (usd === null || usd === undefined || !Number.isFinite(usd) || source === "estimate") {
    return "unknown";
  }
  const n = usd < 0.01 ? usd.toFixed(4) : usd < 1 ? usd.toFixed(3) : usd.toFixed(2);
  if (source === "kiro-credits") return `${n} credits`;
  if (source === "mixed") return `$${n}*`;
  return `$${n}`;
}

const hasUsage = computed(() => (stats.value?.totalSessions ?? 0) > 0);

/** The per-role breakdown, omitting empty roles so a quiet board stays compact. */
const visibleRoles = computed(() =>
  (stats.value?.roles ?? []).filter(
    (r) => (r.totalSessions ?? 0) > 0 || (r.totalCostUsd ?? 0) > 0 || (r.totalElapsedMs ?? 0) > 0,
  ),
);

const days = computed(() => stats.value?.days ?? []);

/**
 * Most recent errored sessions in the selected window (newest first). The CTO's
 * provider credit/auth failures used to be anonymous; the panel now names the
 * role, trigger and truncated reason (#0649).
 */
const recentFailures = computed(() => stats.value?.recentFailures ?? []);
</script>

<template>
  <div class="usage-panel" aria-live="polite">
    <div class="usage-head">
      <span class="usage-title">AI usage — all roles</span>
      <div class="usage-head-right">
        <span v-if="hasUsage" class="usage-sessions">{{ stats?.totalSessions }} sessions</span>
        <div class="usage-range" role="group" aria-label="AI usage date range">
          <button
            v-for="opt in RANGE_OPTIONS"
            :key="opt.value"
            type="button"
            class="usage-range-btn"
            :class="{ 'is-active': range === opt.value }"
            :aria-pressed="range === opt.value"
            @click="selectRange(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
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

      <div v-if="visibleRoles.length || days.length" class="usage-breakdown">
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
        </div>
      </div>

      <div v-if="stats.costSource === 'mixed'" class="usage-legend">
        * mixed cost sources — credits shown alongside USD; rows with no reported cost show
        “unknown”
      </div>

      <div v-if="recentFailures.length" class="usage-failures">
        <div class="usage-subtitle">recent failures</div>
        <ul class="usage-failure-list">
          <li v-for="f in recentFailures" :key="f.sessionId" class="usage-failure">
            <span class="usage-failure-role">{{ f.sessionType }}</span>
            <span class="usage-failure-when" :title="fmtWhenFull(f.endedAt ?? f.startedAt)">
              {{ fmtWhen(f.endedAt ?? f.startedAt) }}
            </span>
            <span class="usage-failure-agent">
              {{ f.codingAgent }}<template v-if="f.model"> · {{ f.model }}</template>
            </span>
            <span class="usage-failure-trigger" :title="f.trigger ?? ''">
              {{ f.trigger ?? "—" }}
            </span>
            <span class="usage-failure-reason" :title="f.errorReason ?? ''">
              {{ f.errorReason ?? "no reason recorded" }}
            </span>
            <span class="usage-failure-elapsed">{{ fmtElapsed(f.elapsedMs) }}</span>
          </li>
        </ul>
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
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.usage-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--txt-faint);
}
.usage-head-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.usage-sessions {
  font-size: 10.5px;
  color: var(--cyan);
}
.usage-range {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.usage-range-btn {
  border: none;
  background: transparent;
  color: var(--txt-faint);
  cursor: pointer;
  font: inherit;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 7px;
  white-space: nowrap;
}
.usage-range-btn + .usage-range-btn {
  border-left: 1px solid var(--border);
}
.usage-range-btn:hover {
  color: var(--txt-dim);
}
.usage-range-btn.is-active {
  color: var(--cyan);
  background: var(--cyan-dim);
}
.usage-range-btn:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: -2px;
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
.usage-breakdown {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
  display: grid;
  gap: 10px 22px;
}
/* min-width:0 lets each table's own overflow-x scroller engage instead of
   stretching the grid column. */
.usage-roles,
.usage-days {
  min-width: 0;
}
@media (min-width: 860px) {
  .usage-breakdown {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
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
.usage-failures {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
}
.usage-failure-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 5px;
}
.usage-failure {
  display: grid;
  grid-template-columns: 72px 130px 150px 150px minmax(0, 1fr) 48px;
  gap: 8px;
  align-items: baseline;
  font-size: 11px;
  color: var(--txt-dim);
}
.usage-failure-role {
  color: var(--red);
  text-transform: capitalize;
}
.usage-failure-when,
.usage-failure-agent,
.usage-failure-trigger,
.usage-failure-reason {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.usage-failure-when,
.usage-failure-agent,
.usage-failure-trigger {
  color: var(--txt-faint);
}
.usage-failure-elapsed {
  text-align: right;
  color: var(--txt-faint);
  white-space: nowrap;
}
@media (max-width: 720px) {
  .usage-failure {
    grid-template-columns: 1fr;
    gap: 1px;
  }
  .usage-failure-elapsed {
    text-align: left;
  }
}
</style>
