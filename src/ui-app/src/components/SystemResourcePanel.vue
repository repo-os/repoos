<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { api, JSON_OPTS } from "../api";
import { useRepoStore } from "../stores/repo";
import Card from "./ui/card.vue";
import DeleteConfirmDialog from "./DeleteConfirmDialog.vue";
import type { SystemStats } from "../types";

const repo = useRepoStore();
const { systemStats, runningIds, queuedIds } = storeToRefs(repo);
const killingPid = ref<number | null>(null);
type GcPreview = {
  report: {
    removedWorktrees: Array<{ branch: string; path: string }>;
    keptDirty: Array<{ branch: string; reason: string }>;
  };
  activeCloseOutTaskIds: string[];
  blocked: boolean;
};
const gcPreview = ref<GcPreview | null>(null);
const gcStatus = ref<GcPreview | null>(null);
const gcConfirmOpen = ref(false);
const gcBusy = ref(false);
let gcStatusTimer: ReturnType<typeof setInterval> | null = null;

async function refreshGcStatus(): Promise<void> {
  try {
    const status = await api<GcPreview>("/api/system/worktree-gc");
    gcStatus.value = status;
    if (gcPreview.value) gcPreview.value = status;
  } catch {
    // The cleanup endpoint may not exist on an older server build.
  }
}

onMounted(() => {
  void refreshGcStatus();
  gcStatusTimer = setInterval(() => void refreshGcStatus(), 5000);
});
onUnmounted(() => {
  if (gcStatusTimer) clearInterval(gcStatusTimer);
});

async function previewWorktreeCleanup(): Promise<void> {
  try {
    gcPreview.value = await api<GcPreview>("/api/system/worktree-gc");
  } catch (err) {
    repo.pushToast(
      err instanceof Error ? err.message : "Could not preview worktree cleanup",
      "error",
    );
  }
}

async function cleanWorktrees(): Promise<void> {
  gcBusy.value = true;
  try {
    const result = await api<{ removedWorktrees: Array<{ branch: string }> }>(
      "/api/system/worktree-gc",
      { method: "POST" },
    );
    repo.pushToast(
      `Removed ${result.removedWorktrees.length} worktree${result.removedWorktrees.length === 1 ? "" : "s"}.`,
      "info",
    );
    gcConfirmOpen.value = false;
    gcPreview.value = null;
  } catch (err) {
    repo.pushToast(err instanceof Error ? err.message : "Could not clean up worktrees", "error");
    await previewWorktreeCleanup();
  } finally {
    gcBusy.value = false;
  }
}

async function killProcess(pid: number): Promise<void> {
  if (killingPid.value !== null) return;
  if (!confirm(`Kill process ${pid}? This cannot be undone.`)) return;
  killingPid.value = pid;
  try {
    await api("/api/system/kill-process", JSON_OPTS("POST", { pid }));
  } catch (err) {
    repo.pushToast(err instanceof Error ? err.message : `Could not kill process ${pid}`, "error");
  } finally {
    killingPid.value = null;
  }
}

const HISTORY_MAX = 60;

const cpuHistory = ref<number[]>([]);
const memHistory = ref<number[]>([]);

watch(systemStats, (s) => {
  if (!s) return;
  cpuHistory.value = [...cpuHistory.value, s.totals.cpuPercent].slice(-HISTORY_MAX);
  memHistory.value = [...memHistory.value, s.totals.memPercent].slice(-HISTORY_MAX);
});

/** Memory the OS can hand back on demand (free + inactive + cache). The number
 *  worth watching — raw `freeMem` is pinned near zero on macOS at all times. */
const machineAvail = computed(() => {
  if (!systemStats.value) return null;
  return systemStats.value.machine.availableMem ?? systemStats.value.machine.freeMem;
});

/** "Used" that excludes reclaimable memory, so it tracks real pressure instead
 *  of sitting pinned near total. */
const memUsed = computed(() => {
  if (!systemStats.value || machineAvail.value === null) return null;
  return systemStats.value.machine.totalMem - machineAvail.value;
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

function fmtRatio(ratio: number | null | undefined): string {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
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

const serve = computed(() => systemStats.value?.serve ?? null);

/** Memory-first pressure verdict (#0871). Absent on older servers. */
const pressure = computed(() => systemStats.value?.pressure ?? null);

/** Top CPU / memory consumers across the whole machine (#0871). */
const topProcesses = computed(() => systemStats.value?.topProcesses ?? null);

/** Engineers across every registered RepoOS server on this laptop (#0871). */
const globalEngineers = computed(() => systemStats.value?.globalEngineers ?? null);

/** git-derived codebase size (worktrees / tracked files / LOC). Absent on older servers. */
const repoStats = computed(() => systemStats.value?.repo ?? null);

/** True when the registered worktree count is over the advisory ceiling from config. */
const worktreesOverLimit = computed(() => {
  const r = repoStats.value;
  const limit = r?.worktreeWarnThreshold ?? 0;
  return !!r && limit > 0 && r.worktrees > limit;
});

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return Math.round(n / 1000) + "k";
  if (n >= 1_000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

/** Strays worth naming individually, newest-looking first. Capped so the panel never grows unbounded. */
const strayList = computed(() =>
  (serve.value?.processes ?? []).filter((p) => p.kind === "stray").slice(0, 6),
);

const serveMessage = computed(() => {
  const s = serve.value;
  if (!s || s.level === "ok") return "";
  const noun = s.strays === 1 ? "process" : "processes";
  const dead =
    s.deadRoot > 0 ? ` ${s.deadRoot} of them are serving a directory that no longer exists.` : "";
  const busy =
    s.inFlight > 0
      ? ` (${s.inFlight} more are in-flight under a live parent and not counted.)`
      : "";
  return s.level === "warn"
    ? `${s.strays} abandoned repoos serve ${noun} — enough to starve the close-out gate and fail it on unrelated flaky tests.${dead}${busy}`
    : `${s.strays} abandoned repoos serve ${noun} left over from a task or test run.${dead}${busy}`;
});
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
            <span class="metric-sub"
              >/ {{ fmtBytes(systemStats!.machine.totalMem) }} ·
              {{ fmtPct(systemStats!.totals.memPercent) }}%</span
            >
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

        <div class="metric">
          <div class="metric-label">Agents</div>
          <div class="metric-val">
            <span class="metric-big">{{ runningIds.length }}</span>
            <span class="metric-sub"
              >running{{ queuedIds.length ? ` · ${queuedIds.length} queued` : "" }}</span
            >
          </div>
          <div v-if="queuedIds.length" class="metric-extra">
            <span>Waiting for a free slot — starts automatically as agents finish.</span>
          </div>
          <div v-if="globalEngineers" class="metric-extra">
            <span>
              {{ globalEngineers.own }} here · {{ globalEngineers.others }} on other RepoOS
              servers<template v-if="globalEngineers.servers.length">
                ({{ globalEngineers.servers.length }} registered)</template
              >
            </span>
          </div>
        </div>

        <div v-if="memUsed !== null" class="metric">
          <div class="metric-label">Machine</div>
          <div class="metric-val">
            <span class="metric-big">{{ fmtBytes(memUsed) }}</span>
            <span class="metric-sub">used of {{ fmtBytes(systemStats!.machine.totalMem) }}</span>
          </div>
          <div class="metric-extra">
            <span
              :title="`Reclaimable on demand (free + inactive + cache). Truly-free pages right now: ${fmtBytes(systemStats!.machine.freeMem)}.`"
              >Available: {{ fmtBytes(machineAvail!) }}</span
            >
            <span>Load: {{ systemStats!.machine.loadavg.map((v) => v.toFixed(1)).join(" ") }}</span>
            <span v-if="pressure">
              Pressure: {{ pressure.level }} · swap {{ fmtRatio(pressure.swapUsedRatio) }} ·
              compressor {{ fmtRatio(pressure.compressorRatio) }}
            </span>
            <span v-if="serve" :class="{ 'serve-bad': serve.level !== 'ok' }">
              Serve: {{ serve.total
              }}<template v-if="serve.strays"> ({{ serve.strays }} stray)</template
              ><template v-else-if="serve.inFlight"> ({{ serve.inFlight }} busy)</template>
            </span>
          </div>
        </div>

        <div v-if="repoStats" class="metric">
          <div class="metric-label">Codebase</div>
          <div class="metric-val">
            <span class="metric-big">{{ fmtCount(repoStats.linesOfCode) }}</span>
            <span class="metric-sub">lines · {{ fmtCount(repoStats.trackedFiles) }} files</span>
          </div>
          <div class="metric-extra">
            <span
              :class="{ 'wt-warn': worktreesOverLimit }"
              :title="
                worktreesOverLimit
                  ? `Over the advisory ceiling of ${repoStats.worktreeWarnThreshold}. Run \`repoos gc\` to reclaim worktrees left by done / abandoned tasks.`
                  : 'Registered git worktrees, including the main checkout. Run `repoos gc` if this climbs.'
              "
              >{{ repoStats.worktrees }} git worktree{{
                repoStats.worktrees === 1 ? "" : "s"
              }}</span
            >
            <button
              type="button"
              class="gc-action"
              :disabled="gcStatus?.blocked"
              :title="
                gcStatus?.blocked
                  ? `Close-out active: ${gcStatus.activeCloseOutTaskIds.map((id) => `#${id}`).join(', ')}`
                  : undefined
              "
              @click="previewWorktreeCleanup"
            >
              {{ worktreesOverLimit ? "Run repoos gc · clean up worktrees" : "Clean up worktrees" }}
            </button>
            <span>tracked on main · gitignored excluded</span>
          </div>
          <div v-if="gcPreview" class="gc-preview" aria-live="polite">
            <strong>Cleanup preview</strong>
            <span
              >{{ gcPreview.report.removedWorktrees.length }} worktree{{
                gcPreview.report.removedWorktrees.length === 1 ? "" : "s"
              }}
              would be removed.</span
            >
            <span v-for="item in gcPreview.report.removedWorktrees" :key="item.path"
              >Remove {{ item.branch || item.path }}</span
            >
            <span v-for="item in gcPreview.report.keptDirty" :key="item.path"
              >Keep {{ item.branch || item.path }} — {{ item.reason }}</span
            >
            <span v-if="gcPreview.blocked" class="gc-blocked"
              >Disabled while close-out{{
                gcPreview.activeCloseOutTaskIds.length === 1 ? " is" : "s are"
              }}
              active: {{ gcPreview.activeCloseOutTaskIds.map((id) => `#${id}`).join(", ") }}</span
            >
            <button
              type="button"
              class="gc-action"
              :disabled="gcPreview.blocked"
              @click="gcConfirmOpen = true"
            >
              Confirm cleanup
            </button>
            <button type="button" class="gc-action" @click="gcPreview = null">Dismiss</button>
          </div>
        </div>
      </div>

      <div
        v-if="pressure && pressure.level !== 'normal'"
        class="pressure-alert"
        :class="pressure.level"
      >
        <div class="pressure-head">
          <span class="pressure-level">{{
            pressure.level === "critical"
              ? "Pressure critical — holding new work"
              : "Pressure warning"
          }}</span>
          <span class="pressure-metric"
            >swap {{ fmtRatio(pressure.swapUsedRatio) }} · compressor
            {{ fmtRatio(pressure.compressorRatio) }} · available
            {{ fmtRatio(pressure.availableMemRatio) }}</span
          >
        </div>
        <div v-if="pressure.reason" class="pressure-detail">{{ pressure.reason }}</div>
        <div v-else-if="pressure.warnings.length" class="pressure-detail">
          {{ pressure.warnings.join(" · ") }}
        </div>
        <div v-if="pressure.source === 'load'" class="pressure-source">
          Memory stats unavailable — using load average as the fallback signal.
        </div>
      </div>

      <div v-if="serve && serve.level !== 'ok'" class="serve-alert" :class="serve.level">
        <div class="serve-alert-head">
          <span class="serve-alert-icon">{{ serve.level === "warn" ? "!" : "i" }}</span>
          <span>{{ serveMessage }}</span>
        </div>
        <div class="serve-alert-list">
          <span
            v-for="p in strayList"
            :key="p.pid"
            class="serve-chip"
            :class="{ dead: !p.rootExists }"
          >
            {{ p.pid }}<template v-if="p.port">:{{ p.port }}</template>
            <button
              type="button"
              class="chip-kill"
              :disabled="killingPid === p.pid"
              title="Kill this stray process"
              @click="killProcess(p.pid)"
            >
              ×
            </button>
          </span>
          <span v-if="serve.strays > strayList.length" class="serve-more">
            +{{ serve.strays - strayList.length }} more
          </span>
        </div>
      </div>

      <div
        v-if="topProcesses && (topProcesses.byCpu.length || topProcesses.byMemory.length)"
        class="top-processes"
      >
        <div class="top-title">Top processes on this machine</div>
        <div class="top-grid">
          <div class="top-col">
            <div class="top-col-head">By CPU</div>
            <div v-for="p in topProcesses.byCpu.slice(0, 6)" :key="`cpu-${p.pid}`" class="top-row">
              <span class="top-owner" :class="p.owner">{{
                p.owner === "repoos" ? "RepoOS" : "other"
              }}</span>
              <span class="top-name"
                >{{ p.command }} <span class="top-pid">#{{ p.pid }}</span></span
              >
              <span class="top-val">{{ fmtPct(p.cpuPercent) }}%</span>
            </div>
          </div>
          <div class="top-col">
            <div class="top-col-head">By memory</div>
            <div
              v-for="p in topProcesses.byMemory.slice(0, 6)"
              :key="`mem-${p.pid}`"
              class="top-row"
            >
              <span class="top-owner" :class="p.owner">{{
                p.owner === "repoos" ? "RepoOS" : "other"
              }}</span>
              <span class="top-name"
                >{{ p.command }} <span class="top-pid">#{{ p.pid }}</span></span
              >
              <span class="top-val">{{ fmtBytes(p.memBytes) }}</span>
            </div>
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
          <span class="col-kill"></span>
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
              <span class="task-unknown">{{
                p.pid === systemStats!.serverPid ? "serve" : "unknown"
              }}</span>
            </template>
            <span v-if="p.orphaned" class="orphan-tag">orphan</span>
            <span v-if="p.unverified" class="unverified-tag">unverified</span>
          </span>
          <span class="col-cpu">{{ fmtPct(p.cpuPercent) }}%</span>
          <span class="col-mem">{{ fmtBytes(p.memBytes) }}</span>
          <span class="col-time">{{ fmtElapsed(p.elapsed) }}</span>
          <span class="col-kill">
            <button
              v-if="p.pid !== systemStats!.serverPid"
              type="button"
              class="kill-btn"
              :disabled="killingPid === p.pid"
              title="Kill this process"
              @click="killProcess(p.pid)"
            >
              {{ killingPid === p.pid ? "…" : "kill" }}
            </button>
          </span>
        </div>
      </div>
    </template>

    <div v-else class="waiting">
      <span class="waiting-dot"></span>
      Waiting for resource data — connect to the live server
    </div>
    <DeleteConfirmDialog
      :open="gcConfirmOpen"
      title="Clean up worktrees?"
      confirm-label="Clean up worktrees"
      :busy="gcBusy"
      @update:open="gcConfirmOpen = $event"
      @confirm="cleanWorktrees"
    >
      This removes the worktrees listed in the preview. Worktrees kept for active close-outs or
      unmerged work remain in place.
    </DeleteConfirmDialog>
  </Card>
</template>

<style scoped>
.resource-panel {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
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
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.serve-bad {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  color: var(--amber, #f5a524);
  font-weight: 600;
}

.pressure-alert {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  line-height: 1.45;
}

.pressure-alert.warning {
  border-color: color-mix(in srgb, var(--amber) 40%, transparent);
  background: color-mix(in srgb, var(--amber) 8%, transparent);
}

.pressure-alert.critical {
  border-color: color-mix(in srgb, var(--red) 45%, transparent);
  background: color-mix(in srgb, var(--red) 10%, transparent);
}

.pressure-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.pressure-level {
  font-weight: 700;
  /* The tinted warning/critical background pushed the 12px severity label
     below the WCAG floor in several themes (#0877 gate); the text names the
     state, the border/background keep the colour cue. */
  color: var(--txt);
}

.pressure-metric {
  /* --txt-dim alone sits at 4.29 (gruvbox-light) and 4.49 (gruvbox-dark) on
     the amber wash; lean it toward the body token to clear the WCAG floor
     (#0877 gate). */
  color: color-mix(in srgb, var(--txt-dim) 60%, var(--txt));
  font-variant-numeric: tabular-nums;
}

.pressure-detail {
  margin-top: 4px;
  color: var(--txt);
}

.pressure-source {
  margin-top: 4px;
  color: var(--txt-faint);
}

.top-processes {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  margin-bottom: 12px;
}

.top-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--txt-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

.top-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.top-col-head {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--txt-faint);
  margin-bottom: 4px;
}

.top-row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: var(--txt-dim);
  padding: 2px 0;
  font-variant-numeric: tabular-nums;
}

.top-owner {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: center;
  padding: 1px 4px;
  border-radius: 3px;
}

.top-owner.repoos {
  color: var(--cyan);
  /* Keep the neutral chip fill used by the sibling owner badge: tinting the
     background with the same --cyan the text uses pushed 9px labels below the
     WCAG floor in every light theme and gruvbox-dark (#0877 gate). */
  background: var(--chip-bg);
}

.top-owner.other {
  color: var(--txt-faint);
  background: var(--chip-bg);
}

.top-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-pid {
  color: var(--txt-faint);
  font-size: 10px;
}

.top-val {
  color: var(--txt);
}

.serve-alert {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  line-height: 1.45;
}

.serve-alert.notice {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  border-color: color-mix(in srgb, var(--amber, #f5a524) 40%, transparent);
  background: color-mix(in srgb, var(--amber, #f5a524) 8%, transparent);
  color: var(--txt);
}

.serve-alert.warn {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  border-color: color-mix(in srgb, var(--red, #f31260) 45%, transparent);
  background: color-mix(in srgb, var(--red, #f31260) 10%, transparent);
  color: var(--txt);
}

.serve-alert-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.serve-alert-icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  margin-top: 1px;
}

.serve-alert.notice .serve-alert-icon {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  background: color-mix(in srgb, var(--amber, #f5a524) 25%, transparent);
  color: var(--amber, #f5a524);
}

.serve-alert.warn .serve-alert-icon {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  background: color-mix(in srgb, var(--red, #f31260) 25%, transparent);
  color: var(--red, #f31260);
}

.serve-alert-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
  padding-left: 24px;
}

.serve-chip {
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 5px;
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  background: var(--chip-bg, rgba(255, 255, 255, 0.06));
  color: var(--txt-dim);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.chip-kill {
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0;
}

.chip-kill:hover:not(:disabled) {
  opacity: 1;
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  color: var(--red, #f31260);
}

.chip-kill:disabled {
  cursor: default;
  opacity: 0.3;
}

.serve-chip.dead {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  color: var(--red, #f31260);
  background: color-mix(in srgb, var(--red, #f31260) 12%, transparent);
}

.serve-more {
  font-size: 11px;
  color: var(--txt-dim);
  align-self: center;
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

.metric-extra .wt-warn {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  color: var(--amber, #f5a524);
  font-weight: 600;
}

.gc-action {
  align-self: flex-start;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 3px 7px;
  color: var(--txt);
  background: var(--panel);
  cursor: pointer;
  font: inherit;
}

.gc-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.gc-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--txt-dim);
}

.gc-blocked {
  color: var(--amber);
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
  grid-template-columns: 1fr 2fr 1fr 1.5fr 1.5fr 0.6fr;
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
  grid-template-columns: 1fr 2fr 1fr 1.5fr 1.5fr 0.6fr;
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
  /* hardcode-ok: translucent surface tint layered over theme surfaces (#0596 triage: hover/decoration, no text sits on it) */
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

.col-kill {
  text-align: right;
}

.kill-btn {
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 4px;
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  border: 1px solid var(--red-border-tint, rgba(255, 107, 125, 0.25));
  background: transparent;
  color: var(--red, #f31260);
  cursor: pointer;
}

.kill-btn:hover:not(:disabled) {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  background: var(--red-tint, rgba(255, 107, 125, 0.14));
}

.kill-btn:disabled {
  cursor: default;
  opacity: 0.5;
}

.pid-chip.orphan {
  /* hardcode-ok: translucent surface tint layered over theme surfaces (#0596 triage: hover/decoration, no text sits on it) */
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
  /* hardcode-ok: translucent surface tint layered over theme surfaces (#0596 triage: hover/decoration, no text sits on it) */
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
  /* hardcode-ok: translucent surface tint layered over theme surfaces (#0596 triage: hover/decoration, no text sits on it) */
  background: rgba(255, 180, 84, 0.14);
  border-radius: 3px;
}

@media (max-width: 1100px) {
  .headlines {
    grid-template-columns: repeat(2, 1fr);
  }
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
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}
</style>
