<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RefreshCw } from "lucide-vue-next";
import { api } from "../api";
import Button from "./ui/button.vue";
import type { CheckRunRow } from "../types";

/**
 * The Runs tab (#0564): a sortable history of check runs across all tasks —
 * local and remote, pre-review / close-out / release / CLI — answering "how
 * long does a full suite take on bee vs mini?" and "was that failure a fluke?"
 * without opening a Debug tab or a log file.
 */

/** Sortable columns. */
type SortKey = "startedAt" | "taskId" | "phase" | "machine" | "scope" | "outcome" | "durationMs";

const columns: { key: SortKey; label: string; cls?: string }[] = [
  { key: "startedAt", label: "Started" },
  { key: "taskId", label: "Task" },
  { key: "phase", label: "Phase" },
  { key: "machine", label: "Machine" },
  { key: "scope", label: "Scope" },
  { key: "outcome", label: "Outcome" },
  { key: "durationMs", label: "Duration", cls: "cr-col-dur" },
];

const runs = ref<CheckRunRow[]>([]);
const loading = ref(true);
const error = ref("");

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const res = await api<{ ok: boolean; runs: CheckRunRow[] }>("/api/check-runs?limit=300");
    runs.value = res.runs ?? [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not load the run history.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ── sorting ──────────────────────────────────────────────────────────────────

const sortKey = ref<SortKey>("startedAt");
const sortDesc = ref(true);

function setSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortDesc.value = !sortDesc.value;
  } else {
    sortKey.value = key;
    // Task/phase read naturally ascending; outcome ascends by severity
    // (failures first); everything else descends (newest / longest first).
    sortDesc.value = !["taskId", "phase", "outcome"].includes(key);
  }
}

/** Failures before cancellations before skips before passes — severity, not alphabet. */
const OUTCOME_SEVERITY: Record<CheckRunRow["outcome"], number> = {
  fail: 0,
  cancelled: 1,
  skipped: 2,
  pass: 3,
};

function sortValue(r: CheckRunRow, key: SortKey): string | number {
  switch (key) {
    case "taskId":
      return r.taskId ?? "";
    case "durationMs":
      return r.durationMs ?? -1;
    case "startedAt":
      return Date.parse(r.startedAt) || 0;
    case "machine":
      return (r.remote ? "" : "~") + (r.machine ?? "?"); // group local/remote of one host together
    case "outcome":
      return OUTCOME_SEVERITY[r.outcome] ?? 3;
    default:
      return String(r[key as keyof CheckRunRow] ?? "");
  }
}

const sorted = computed(() => {
  const key = sortKey.value;
  const dir = sortDesc.value ? -1 : 1;
  return [...runs.value].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return b.id - a.id; // newest first within a tie
  });
});

// ── per-machine summary strip ────────────────────────────────────────────────

interface MachineSummary {
  key: string;
  label: string;
  runs: number;
  passes: number;
  /** Median duration of FULL runs on this machine, ms. */
  medianFullMs: number | null;
}

const machines = computed<MachineSummary[]>(() => {
  const byKey = new Map<string, CheckRunRow[]>();
  for (const r of runs.value) {
    const key = r.remote ? `remote:${r.machine ?? "?"}` : `local:${r.machine ?? "?"}`;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }
  const out: MachineSummary[] = [];
  for (const [key, list] of byKey) {
    const full = list
      .filter(
        (r) =>
          r.scope === "full" &&
          r.outcome !== "cancelled" &&
          // A skipped gate ran nothing (0ms) — it would drag the median down.
          r.outcome !== "skipped" &&
          r.durationMs != null,
      )
      .map((r) => r.durationMs as number)
      .sort((a, b) => a - b);
    const median = full.length ? full[Math.floor(full.length / 2)] : null;
    out.push({
      key,
      label: key.startsWith("remote:") ? `${key.slice(7)} (remote)` : key.slice(6),
      runs: list.length,
      passes: list.filter((r) => r.outcome === "pass").length,
      medianFullMs: median,
    });
  }
  return out.sort((a, b) => b.runs - a.runs);
});

// ── formatting ───────────────────────────────────────────────────────────────

const PHASE_LABEL: Record<CheckRunRow["phase"], string> = {
  "pre-review": "pre-review",
  "close-out": "close-out",
  release: "release",
  cli: "cli",
};

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function fmtAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function scopeLabel(r: CheckRunRow): string {
  if (r.scope.startsWith("changed:")) return `changed · ${r.scope.slice(8)}`;
  return "full";
}

function outcomeTitle(r: CheckRunRow): string | undefined {
  if (r.failedTests.length === 0) return r.detail ?? undefined;
  return `Failed tests:\n${r.failedTests.join("\n")}`;
}

function outcomeLabel(r: CheckRunRow): string {
  if (r.outcome === "pass") return "passed";
  if (r.outcome === "cancelled") return "cancelled";
  if (r.outcome === "skipped") return "skipped · no checks configured";
  if (!r.failedStep) return "failed";
  const n = r.failedTests.length;
  return n > 0
    ? `failed · ${r.failedStep} (${n} test${n === 1 ? "" : "s"})`
    : `failed · ${r.failedStep}`;
}
</script>

<template>
  <div class="cr-panel">
    <div class="cr-toolbar">
      <Button variant="ghost" size="sm" :disabled="loading" @click="load">
        <RefreshCw class="size-3.5" :class="{ spin: loading }" />
        Refresh
      </Button>
      <span class="cr-count">{{
        loading ? "Loading run history…" : `${runs.length} run${runs.length === 1 ? "" : "s"}`
      }}</span>
    </div>
    <p v-if="error" class="cr-err">{{ error }}</p>

    <section v-if="machines.length" class="cr-machines" aria-label="Machines summary">
      <div v-for="m in machines" :key="m.key" class="cr-machine">
        <span class="cr-machine-name">{{ m.label }}</span>
        <span class="cr-machine-facts">
          {{ m.runs }} run{{ m.runs === 1 ? "" : "s" }} ·
          {{ m.runs ? Math.round((m.passes / m.runs) * 100) : 0 }}% passed
          <template v-if="m.medianFullMs != null">
            · median full {{ fmtDuration(m.medianFullMs) }}
          </template>
        </span>
      </div>
    </section>

    <div v-if="!loading && runs.length === 0" class="cr-empty">
      No recorded runs yet. Every <code>repoos check</code> — handoff, close-out, release, or a bare
      CLI run — lands here once it finishes.
    </div>

    <div v-else-if="runs.length" class="cr-table-wrap">
      <table class="cr-table">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key" :class="col.cls">
              <button type="button" class="cr-sort" @click="setSort(col.key as SortKey)">
                {{ col.label }}
                <span v-if="sortKey === col.key" class="cr-arrow">{{ sortDesc ? "▾" : "▴" }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in sorted" :key="r.id" :data-outcome="r.outcome">
            <td class="cr-time" :title="fmtTime(r.startedAt)">
              {{ fmtTime(r.startedAt) }}
              <span class="cr-ago">{{ fmtAgo(r.startedAt) }}</span>
            </td>
            <td class="cr-task">
              <span v-if="r.taskId" class="mono">#{{ r.taskId }}</span>
              <span v-else class="cr-dim">—</span>
            </td>
            <td>{{ PHASE_LABEL[r.phase] }}</td>
            <td class="cr-machine-cell">
              <span
                v-if="r.machine"
                class="mono"
                :class="{ 'cr-remote': r.remote }"
                :title="r.remote ? 'remote validation host' : 'this machine'"
                >{{ r.machine }}</span
              >
              <span v-else class="cr-dim" title="never reached a machine">not run</span>
            </td>
            <td
              class="cr-scope"
              :title="r.skippedSteps.length ? `skipped: ${r.skippedSteps.join(', ')}` : undefined"
            >
              {{ scopeLabel(r) }}
              <span v-if="r.skippedSteps.length" class="cr-skipped"
                >{{ r.skippedSteps.length }} skipped</span
              >
            </td>
            <td :data-outcome="r.outcome" class="cr-outcome">
              <span
                :title="outcomeTitle(r)"
                :class="{ 'cr-failed-step': r.failedStep && r.outcome === 'fail' }"
                >{{ outcomeLabel(r) }}</span
              >
            </td>
            <td class="cr-dur">{{ fmtDuration(r.durationMs) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.cr-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cr-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cr-count {
  font-size: 12px;
  color: var(--txt-dim);
}
.cr-err {
  color: var(--red);
  font-size: 13px;
}
.cr-err code,
.cr-empty code {
  font-family: var(--mono);
}
.spin {
  animation: cr-spin 1s linear infinite;
}
@keyframes cr-spin {
  to {
    transform: rotate(360deg);
  }
}

.cr-machines {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cr-machine {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-gradient);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 200px;
}
.cr-machine-name {
  font-weight: 700;
  font-size: 12.5px;
}
.cr-machine-facts {
  font-size: 11.5px;
  color: var(--txt-dim);
}

.cr-empty {
  color: var(--txt-dim);
  font-size: 12.5px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  padding: 18px;
  line-height: 1.6;
}

.cr-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.cr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.cr-table th {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--txt-dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.cr-sort {
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}
.cr-sort:hover {
  color: var(--txt);
}
.cr-arrow {
  margin-left: 3px;
  color: var(--cyan);
}
.cr-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.cr-table tbody tr:last-child td {
  border-bottom: none;
}
.mono {
  font-family: var(--mono);
}
.cr-time {
  white-space: nowrap;
}
.cr-ago {
  color: var(--txt-dim);
  margin-left: 6px;
  font-size: 11px;
}
.cr-dim {
  color: var(--txt-dim);
}
.cr-remote {
  color: var(--cyan);
}
.cr-machine-cell {
  white-space: nowrap;
}
.cr-scope {
  white-space: nowrap;
}
.cr-skipped {
  color: var(--amber);
  margin-left: 6px;
  font-size: 11px;
}
.cr-outcome span {
  white-space: nowrap;
}
.cr-outcome[data-outcome="pass"] span {
  color: var(--green);
}
.cr-outcome[data-outcome="cancelled"] span {
  color: var(--amber);
}
.cr-outcome[data-outcome="fail"] span {
  color: var(--red);
}
.cr-failed-step {
  font-family: var(--mono);
  font-size: 11px;
}
.cr-col-dur,
.cr-dur {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
