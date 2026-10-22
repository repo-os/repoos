<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ArrowDown, ArrowUp, Check, RefreshCw } from "lucide-vue-next";
import { api } from "../api";
import { useConfigStore } from "../stores/config";
import { useRepoStore } from "../stores/repo";
import {
  applyShotPreviewFixture,
  readShotPreviewFixtureFromLocation,
  shotFixturePinnedRemoteStatus,
} from "../lib/shot-preview-fixtures";
import Button from "./ui/button.vue";
import type {
  RemoteHostStatusView,
  RemoteQueuedRunInfo,
  RemoteValidationStatusView,
} from "../types";

/**
 * The Remote runners tab (#0564): each configured host with its health, the
 * runs currently in flight (task + elapsed time, not just a count), the queue
 * depth and next-up tasks, and the last completed run. Live: polls the status
 * endpoint every 3s while the tab is visible.
 */

const status = ref<RemoteValidationStatusView | null>(null);
const config = useConfigStore();
const repo = useRepoStore();
const loading = ref(true);
const refreshing = ref(false);
const lastRefreshedAt = ref<number | null>(null);
const refreshOk = ref(false);
const error = ref("");
const orderSaving = ref(false);
const orderMessage = ref("");
let pollTimer: ReturnType<typeof setInterval> | undefined;
/** Ticks once a second so in-flight elapsed times stay live between polls. */
const nowTick = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | undefined;

async function load(opts?: { manual?: boolean }): Promise<void> {
  const manual = opts?.manual === true;
  // A declared shot fixture pins a synthetic pool so the capture shows the
  // queued/running rows a preview (with no runner) could never produce (#0897).
  const pinned = shotFixturePinnedRemoteStatus();
  if (pinned) {
    status.value = pinned;
    loading.value = false;
    lastRefreshedAt.value = Date.now();
    refreshOk.value = true;
    return;
  }
  if (manual) refreshing.value = true;
  try {
    status.value = await api<RemoteValidationStatusView>(
      "/api/remote-validation/status?includeStats=1",
    );
    error.value = "";
    lastRefreshedAt.value = Date.now();
    refreshOk.value = true;
    if (manual) repo.pushToast("Runner status updated", "success");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load runner status.";
    error.value = message;
    refreshOk.value = false;
    if (manual) repo.pushToast(message, "error");
  } finally {
    loading.value = false;
    if (manual) refreshing.value = false;
  }
}

async function refreshManual(): Promise<void> {
  if (refreshing.value) return;
  await load({ manual: true });
}

onMounted(() => {
  // A capture can mount this panel before App.vue applies the fixture; seed it
  // here first so the very first load paints the queued state (a poll would
  // take another 3s, long enough for the shot's waitFor to time out) (#0897).
  if (typeof window !== "undefined" && repo.health?.isPreviewBuild) {
    const fixture = readShotPreviewFixtureFromLocation(window.location);
    if (fixture) applyShotPreviewFixture(repo, fixture);
  }
  void load();
  pollTimer = setInterval(() => void load(), 3000);
  tickTimer = setInterval(() => (nowTick.value = Date.now()), 1000);
});
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (tickTimer) clearInterval(tickTimer);
});

const hosts = computed(() => status.value?.hosts ?? []);
const totalQueued = computed(() => hosts.value.reduce((n, h) => n + (h.queued ?? 0), 0));
const pressuredHosts = computed(() =>
  status.value?.pressureCheck === false
    ? []
    : hosts.value.filter((h) => h.pressure?.state === "pressured"),
);
const pressureCheckEnabled = computed(() => status.value?.pressureCheck !== false);

/** "swap 73%, 4% memory available" — the numbers the banner must name. */
function pressureNumbers(h: RemoteHostStatusView): string {
  const parts: string[] = [];
  if (h.pressure?.swapUsedRatio != null) {
    parts.push(`swap ${Math.round(h.pressure.swapUsedRatio * 100)}% used`);
  }
  if (h.pressure?.availableMemRatio != null) {
    parts.push(`${Math.round(h.pressure.availableMemRatio * 100)}% memory available`);
  }
  if (h.pressure?.psiMemoryAvg10 != null) {
    parts.push(`PSI ${h.pressure.psiMemoryAvg10.toFixed(1)}% avg10`);
  }
  return parts.join(", ");
}

function pressureLimit(h: RemoteHostStatusView): string {
  const t = h.pressureThresholds;
  if (!t) return "";
  return `warn above ${Math.round(t.maxSwapUsedRatio * 100)}% swap use · hold below ${Math.round(
    t.minAvailableMemRatio * 100,
  )}% memory available`;
}

async function moveHost(index: number, offset: -1 | 1): Promise<void> {
  const current = hosts.value;
  const destination = index + offset;
  if (
    !status.value?.hostPoolEditable ||
    destination < 0 ||
    destination >= current.length ||
    orderSaving.value
  ) {
    return;
  }
  const reordered = current.slice();
  [reordered[index], reordered[destination]] = [reordered[destination]!, reordered[index]!];
  orderSaving.value = true;
  orderMessage.value = "";
  try {
    await config.setConfigValues({
      "remoteValidation.tailscaleHosts": reordered.map((host) => `${host.user}@${host.host}`),
    });
    await load();
    orderMessage.value = "Host order saved. New runs use it immediately.";
  } catch (e) {
    orderMessage.value = e instanceof Error ? e.message : "Could not save host order.";
  } finally {
    orderSaving.value = false;
  }
}

function formatBytes(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "unavailable";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MiB`;
  return `${(value / 1024).toFixed(0)} KiB`;
}

function formatSampleTime(value: string | undefined): string {
  if (!value) return "not sampled";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString() : value;
}

/** Health label + class for one host, mirroring the Settings drawer's words. */
function health(h: { probed: boolean; healthy: boolean; detail?: string }): {
  label: string;
  cls: string;
} {
  if (!h.probed) return { label: "not checked yet", cls: "idle" };
  if (h.healthy) return { label: "ready", cls: "ok" };
  return { label: h.detail ? "unavailable" : "unreachable", cls: "bad" };
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

/** Live elapsed time of an in-flight run, refreshed by the 1s tick. */
function elapsedSince(startedAt: string): string {
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return "—";
  return fmtDuration(Math.max(0, nowTick.value - t));
}

const lastRefreshedLabel = computed(() => {
  if (lastRefreshedAt.value == null) return "";
  const secs = Math.max(0, Math.round((nowTick.value - lastRefreshedAt.value) / 1000));
  if (secs < 8) return "just now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
});

function runLabel(r: NonNullable<RemoteHostStatusView["activeRuns"]>[number]): string {
  if (r.label) return r.label;
  if (/^\d+$/.test(r.taskId)) return `#${r.taskId}`;
  return r.taskId;
}

const KIND_LABELS: Record<string, string> = {
  handoff: "handoff check",
  "close-out": "close-out",
  "self-check": "self-check",
  review: "review",
  shot: "screenshots",
  release: "release",
  checks: "check",
};

function kindLabel(kind: string | undefined): string {
  return KIND_LABELS[kind ?? "checks"] ?? kind ?? "check";
}

const STAGE_LABELS: Record<string, string> = {
  bundle: "bundling",
  upload: "uploading",
  queue: "waiting for host slot",
  run: "build + tests",
  build: "install/build",
  tests: "tests",
};

function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "";
  return STAGE_LABELS[stage] ?? stage;
}

/** One-line phase breakdown for an in-flight run (#0897). */
function phaseSummary(r: NonNullable<RemoteHostStatusView["activeRuns"]>[number]): string {
  const parts = (r.phases ?? []).map((p) => {
    const label = p.phase === "queued" ? "queued for slot" : stageLabel(p.phase);
    const ms =
      p.durationMs ??
      (p.endedAt
        ? Date.parse(p.endedAt) - Date.parse(p.startedAt)
        : Math.max(0, nowTick.value - Date.parse(p.startedAt)));
    return `${label} ${fmtDuration(ms)}`;
  });
  return parts.join(" · ");
}

/** The jobs holding the slots a queued validation needs (#0897). */
function blockerText(q: RemoteQueuedRunInfo): string {
  if (!q.blockers.length) return "no slot holder visible yet";
  return q.blockers
    .map((b) => `#${b.taskId} ${kindLabel(b.kind)} on ${b.host} (${fmtDuration(b.elapsedMs)})`)
    .join(", ");
}

function fmtAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const secs = Math.max(0, Math.round((nowTick.value - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}
</script>

<template>
  <div class="rr-panel">
    <div class="rr-toolbar">
      <Button
        variant="ghost"
        size="sm"
        :disabled="refreshing"
        :aria-busy="refreshing"
        @click="refreshManual"
      >
        <RefreshCw class="size-3.5" :class="{ spin: refreshing }" aria-hidden="true" />
        Refresh
      </Button>
      <span v-if="refreshOk && lastRefreshedLabel" class="rr-refresh-ok" role="status">
        <Check class="size-3.5" aria-hidden="true" />
        Updated {{ lastRefreshedLabel }}
      </span>
      <span class="rr-note">auto 3s · host locks 3s · server stats 15s</span>
    </div>
    <p v-if="hosts.length" class="rr-tie-note">
      Jobs go to the host with the fewest active runs, then to the host that has run least recently
      (LRU), so sequential checks rotate across the pool. Config order is the final tie-break —
      before any host has run, the top host goes first.
    </p>
    <p v-if="status?.tailscaleHostPinsTop" class="rr-config-note">
      <code>remoteValidation.tailscaleHost</code> pins {{ status.tailscaleHost }} to the top. Remove
      that shorthand from <code>repoos.toml</code> to control its position with this list.
    </p>
    <p v-else-if="status && !status.hostPoolEditable" class="rr-config-note">
      This host pool uses <code>[[remoteValidation.tailscaleHosts]]</code> rows. Reordering is
      read-only here; edit the row order in <code>repoos.toml</code>.
    </p>
    <p v-if="orderMessage" class="rr-order-message" role="status">{{ orderMessage }}</p>
    <p v-if="error" class="rr-err">{{ error }}</p>

    <!-- #0901: a pressured runner is not a silent skip. Name the host, its
         numbers, the exact OS fix, and the re-check command. -->
    <section v-if="pressuredHosts.length" class="rr-pressure-banner" role="alert">
      <div class="rr-pressure-head">
        <strong>Runner memory pressure</strong>
        <span class="rr-pressure-count"
          >{{ pressuredHosts.length }} of {{ hosts.length }} host{{
            hosts.length === 1 ? "" : "s"
          }}
          over the limit</span
        >
      </div>
      <div v-for="h in pressuredHosts" :key="`pressure-${h.host}`" class="rr-pressure-host">
        <span class="mono rr-pressure-name">{{ h.user }}@{{ h.host }}</span>
        <span v-if="pressureNumbers(h)" class="rr-pressure-numbers">{{ pressureNumbers(h) }}</span>
        <span class="rr-pressure-reason">{{ h.pressure?.reason }}</span>
        <span class="rr-pressure-fix"><strong>Fix:</strong> {{ h.pressure?.fix }}</span>
        <span class="rr-pressure-recheck"
          >Re-check: <code>{{ h.pressure?.recheckCommand ?? "repoos runners --probe" }}</code></span
        >
      </div>
      <p v-if="pressuredHosts.length === hosts.length" class="rr-pressure-all">
        Every eligible host is pressured, so new gates queue here with this reason instead of
        failing a branch's tests on a thrashing machine.
      </p>
    </section>

    <div v-if="status && !status.enabled" class="rr-empty">
      Remote validation is disabled. Enable it under
      <router-link to="/settings?tab=toml">Settings</router-link> to see runner hosts here.
    </div>
    <div v-else-if="status && hosts.length === 0" class="rr-empty">
      <template v-if="status.provider === 'hetzner'">
        Hetzner runner configured — it is a single VM created on demand, so there is no host pool to
        show. Its state lives in the Settings drawer.
      </template>
      <template v-else>No remote hosts configured.</template>
    </div>

    <div
      v-for="(h, index) in hosts"
      :key="h.host"
      class="rr-host"
      :data-health="health(h).cls"
      :data-running="h.inFlight > 0 || (h.lockWaiters ?? []).length > 0 || undefined"
    >
      <div class="rr-host-head">
        <span class="rr-host-name mono">{{ h.user }}@{{ h.host }}</span>
        <span v-for="cap in [h.os, ...h.labels].filter(Boolean)" :key="cap" class="rr-cap">{{
          cap
        }}</span>
        <span class="rr-health" :class="health(h).cls"
          >{{ health(h).cls === "ok" ? "●" : health(h).cls === "bad" ? "✕" : "○" }}
          {{ health(h).label }}</span
        >
        <span
          v-if="h.pressure?.state === 'pressured'"
          class="rr-pressure-badge"
          data-test-id="runner-pressure-badge"
          >memory pressure</span
        >
        <span class="rr-limits"
          >{{ h.inFlight }}/{{ h.maxConcurrent }} in flight<template v-if="h.queued">
            · {{ h.queued }} queued</template
          ></span
        >
        <div v-if="status?.hostPoolEditable" class="rr-order-controls">
          <Button
            variant="ghost"
            size="icon"
            :disabled="index === 0 || orderSaving"
            :aria-label="`Move ${h.user}@${h.host} up`"
            @click="moveHost(index, -1)"
          >
            <ArrowUp aria-hidden="true" class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            :disabled="index === hosts.length - 1 || orderSaving"
            :aria-label="`Move ${h.user}@${h.host} down`"
            @click="moveHost(index, 1)"
          >
            <ArrowDown aria-hidden="true" class="size-4" />
          </Button>
        </div>
      </div>
      <p v-if="h.detail && !h.healthy" class="rr-detail">{{ h.detail }}</p>

      <dl class="rr-cells rr-facts">
        <div>
          <dt>Running now</dt>
          <dd class="rr-wrap">
            <template v-if="(h.activeRuns ?? []).length">
              <span
                v-for="r in h.activeRuns"
                :key="`${r.taskId}-${r.startedAt}`"
                class="rr-active-run"
                :class="{ 'rr-hung': r.hung }"
              >
                <span class="mono">{{ runLabel(r) }}</span>
                <span class="rr-kind">{{ kindLabel(r.kind) }}</span>
                <span v-if="r.stage" class="rr-dim"> · {{ stageLabel(r.stage) }}</span>
                · {{ elapsedSince(r.startedAt) }}
                <span v-if="r.phases?.length" class="rr-phases"> ({{ phaseSummary(r) }}) </span>
                <span
                  v-if="r.slow"
                  class="rr-slow-badge"
                  data-test-id="remote-run-slow"
                  tabindex="0"
                  :aria-label="r.slowDetail ? `Slow run. ${r.slowDetail}` : 'Slow run'"
                  :data-tip="r.slowDetail || 'This job is taking longer than typical for its kind'"
                >
                  slow
                </span>
                <span v-if="r.hung" class="rr-hung-badge">hung · killing</span>
              </span>
            </template>
            <span v-else class="rr-dim">idle</span>
          </dd>
        </div>
        <div v-if="(h.hungRuns ?? []).length">
          <dt>Hung runs</dt>
          <dd class="rr-wrap">
            <span
              v-for="hr in h.hungRuns"
              :key="`${hr.taskId}-${hr.at}`"
              class="rr-active-run rr-hung"
            >
              <span class="mono">#{{ hr.taskId }}</span>
              <span class="rr-dim"> · killed {{ fmtAgo(hr.at) }}</span>
            </span>
          </dd>
        </div>
        <div>
          <dt>Queue</dt>
          <dd class="rr-wrap">
            <template v-if="h.queued > 0 || (h.lockWaiters ?? []).length">
              <template v-if="(h.queuedRuns ?? []).length">
                <span
                  v-for="q in h.queuedRuns"
                  :key="`${q.taskId}-${q.position}`"
                  class="rr-queued-run"
                >
                  <span class="mono">{{ /^\d+$/.test(q.taskId) ? `#${q.taskId}` : q.taskId }}</span>
                  <span class="rr-kind">{{ kindLabel(q.kind) }}</span>
                  <span class="rr-dim"> · position {{ q.position }}</span>
                  <span v-if="q.host" class="rr-dim"> on {{ q.host }}</span>
                  · {{ fmtDuration(q.waitedMs) }} waiting
                  <span class="rr-blockers">ahead: {{ blockerText(q) }}</span>
                </span>
              </template>
              <template v-else-if="(h.lockWaiters ?? []).length">
                <span
                  v-for="w in h.lockWaiters"
                  :key="`${w.taskId}-${w.queuePosition ?? 0}`"
                  class="rr-active-run"
                >
                  <span class="mono">{{ w.label }}</span>
                  <span class="rr-dim"> · {{ w.phase }}</span>
                  <span v-if="w.queuePosition != null" class="rr-dim">
                    · queue #{{ w.queuePosition }}</span
                  >
                  · {{ fmtDuration(w.ageSecs * 1000) }} waiting
                </span>
              </template>
              <template v-else-if="(h.queuedTasks ?? []).length">
                next: <span class="mono">#{{ h.queuedTasks![0] }}</span>
              </template>
              <span v-if="h.queued > 1" class="rr-dim"> +{{ h.queued - 1 }} behind</span>
              <span
                v-else-if="!(h.lockWaiters ?? []).length && !(h.queuedTasks ?? []).length"
                class="rr-dim"
                >{{ h.queued }} queued</span
              >
            </template>
            <span v-else class="rr-dim">empty</span>
          </dd>
        </div>
        <div>
          <dt>validate.sh</dt>
          <dd class="rr-wrap">
            <template v-if="!h.probed">not checked yet</template>
            <template v-else-if="h.validateScriptMirrorSupported">
              incremental uploads (mirror)
            </template>
            <template v-else-if="h.healthy">
              legacy — full bundle only
              <span v-if="h.validateScriptInstallCommand" class="rr-dim mono rr-wrap">
                · update: {{ h.validateScriptInstallCommand }}
              </span>
            </template>
            <span v-else class="rr-dim">—</span>
          </dd>
        </div>
        <div>
          <dt>Memory health</dt>
          <dd class="rr-wrap">
            <template v-if="!pressureCheckEnabled">
              <span class="rr-dim">check disabled in Settings</span>
            </template>
            <template v-else-if="h.pressure">
              <span :class="h.pressure.state === 'pressured' ? 'rr-bad' : 'rr-ok'">
                {{ h.pressure.state }}</span
              >
              <span v-if="pressureNumbers(h)" class="rr-dim"> · {{ pressureNumbers(h) }}</span>
              <span v-if="pressureLimit(h)" class="rr-dim">· {{ pressureLimit(h) }}</span>
            </template>
            <span v-else class="rr-dim">not sampled yet</span>
          </dd>
        </div>
        <div>
          <dt>Last completed</dt>
          <dd class="rr-wrap">
            <template v-if="h.lastRun">
              <span class="mono">#{{ h.lastRun!.taskId }}</span>
              <span :class="h.lastRun!.ok ? 'rr-ok' : 'rr-bad'">
                {{ h.lastRun!.ok ? "passed" : "failed" }}</span
              >
              <template v-if="h.lastRun!.durationMs != null">
                · {{ fmtDuration(h.lastRun!.durationMs) }}</template
              >
              · {{ fmtAgo(h.lastRun!.at) }}
            </template>
            <span v-else class="rr-dim">none yet</span>
          </dd>
        </div>
      </dl>
      <section class="rr-server-stats" :aria-label="`Server stats for ${h.host}`">
        <span class="rr-section-label">Server stats</span>
        <dl class="rr-cells rr-stats">
          <div>
            <dt>Load average (1/5/15m)</dt>
            <dd v-if="h.serverStats?.loadAverage" class="rr-wrap">
              {{ h.serverStats.loadAverage.map((load) => load.toFixed(2)).join(" / ") }}
              <template v-if="h.serverStats.cpuCount">
                · {{ (h.serverStats.loadAverage[0] / h.serverStats.cpuCount).toFixed(2) }} per core
              </template>
            </dd>
            <dd v-else>unavailable</dd>
          </div>
          <div>
            <dt>CPU cores</dt>
            <dd>{{ h.serverStats?.cpuCount ?? "unavailable" }}</dd>
          </div>
          <div>
            <dt>Memory</dt>
            <dd>
              <template
                v-if="
                  h.serverStats?.memoryUsedBytes != null && h.serverStats.memoryTotalBytes != null
                "
                >{{ formatBytes(h.serverStats.memoryUsedBytes) }} /
                {{ formatBytes(h.serverStats.memoryTotalBytes) }}</template
              >
              <span v-else>unavailable</span>
            </dd>
          </div>
          <div>
            <dt>Free disk</dt>
            <dd>{{ formatBytes(h.serverStats?.diskFreeBytes) }}</dd>
          </div>
          <div>
            <dt>Sampled</dt>
            <dd>{{ formatSampleTime(h.serverStats?.sampledAt) }}</dd>
          </div>
          <div v-if="h.serverStats && !h.serverStats.available" class="rr-stats-detail">
            <dt>Status</dt>
            <dd>
              stats unavailable<template v-if="h.serverStats.detail">
                · {{ h.serverStats.detail }}</template
              >
            </dd>
          </div>
        </dl>
      </section>
    </div>

    <p v-if="totalQueued > 0" class="rr-queue-note">
      {{ totalQueued }} run{{ totalQueued === 1 ? "" : "s" }} waiting across all hosts.
    </p>
  </div>
</template>

<style scoped>
.rr-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rr-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rr-note {
  font-size: 11.5px;
  color: var(--txt-dim);
}
.rr-refresh-ok {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--green);
}
.rr-tie-note,
.rr-config-note,
.rr-order-message {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--txt-dim);
}
.rr-config-note {
  color: var(--amber);
}
.rr-order-message {
  color: var(--green);
}
.rr-err {
  color: var(--red);
  font-size: 13px;
}
/* #0901: loud, specific, and actionable — a runner under memory pressure is
   why a gate would otherwise fail with someone else's test names. */
.rr-pressure-banner {
  border: 1px solid var(--red);
  border-left: 4px solid var(--red);
  border-radius: 12px;
  background: color-mix(in srgb, var(--red) 10%, transparent);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rr-pressure-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.rr-pressure-head strong {
  color: var(--red);
  font-size: 13.5px;
}
.rr-pressure-count {
  color: var(--txt-dim);
  font-size: 12px;
}
.rr-pressure-host {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  font-size: 12.5px;
  line-height: 1.5;
}
.rr-pressure-name {
  font-weight: 650;
  color: var(--txt);
}
.rr-pressure-numbers {
  color: var(--red);
  font-variant-numeric: tabular-nums;
}
.rr-pressure-reason,
.rr-pressure-fix {
  flex-basis: 100%;
  color: var(--txt-dim);
}
.rr-pressure-fix strong {
  color: var(--txt);
}
.rr-pressure-recheck {
  flex-basis: 100%;
  color: var(--txt-dim);
}
.rr-pressure-recheck code {
  color: var(--txt);
}
.rr-pressure-all {
  margin: 0;
  color: var(--txt);
  font-size: 12.5px;
}
.rr-pressure-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--red);
  color: var(--red);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
}
.rr-empty {
  color: var(--txt-dim);
  font-size: 12.5px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  padding: 18px;
  line-height: 1.6;
}
.rr-empty a {
  color: var(--cyan);
}
.spin {
  animation: rr-spin 1s linear infinite;
}
@keyframes rr-spin {
  to {
    transform: rotate(360deg);
  }
}

.rr-host {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--panel-gradient);
  padding: 13px 15px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* Same "running" treatment as a started dev target (#0801): the shared
   `running-glow-pulse` keyframes live in the global stylesheet. */
.rr-host[data-running] {
  border-color: var(--cyan);
  animation: running-glow-pulse 2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .rr-host[data-running] {
    animation: none;
  }
}
.rr-host-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.rr-host-name {
  font-size: 13px;
  font-weight: 700;
}
.mono {
  font-family: var(--mono);
}
.rr-cap {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--txt-dim);
}
.rr-health {
  font-size: 11.5px;
  margin-left: 4px;
}
.rr-health.ok {
  color: var(--green);
}
.rr-health.bad {
  color: var(--red);
}
.rr-health.idle {
  color: var(--txt-dim);
}
.rr-limits {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--txt-dim);
  font-variant-numeric: tabular-nums;
}
.rr-order-controls {
  display: flex;
  margin-left: 2px;
}
.rr-detail {
  margin: 0;
  font-size: 12px;
  color: var(--red);
  line-height: 1.5;
}

.rr-cells {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px 20px;
  font-size: 12.5px;
}
.rr-cells > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.rr-cells dt {
  font-size: 10px;
  font-weight: 500;
  color: var(--txt-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.rr-cells dd {
  margin: 0;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}
.rr-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
}
.rr-server-stats {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rr-section-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--txt-dim);
}
.rr-stats-detail {
  grid-column: 1 / -1;
  color: var(--red);
}
.rr-dim {
  color: var(--txt-dim);
}
.rr-kind {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 10px;
  color: var(--txt-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.rr-phases {
  color: var(--txt-faint);
  font-size: 11.5px;
}
.rr-queued-run {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 4px;
  width: 100%;
  font-size: 12.5px;
}
.rr-blockers {
  width: 100%;
  color: var(--txt-faint);
  font-size: 11.5px;
  padding-left: 2px;
}
.rr-ok {
  color: var(--green);
}
.rr-bad {
  color: var(--red);
}
.rr-slow-badge {
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--amber);
  border: 1px solid var(--amber);
}
.rr-hung {
  color: var(--amber);
}
.rr-hung-badge {
  margin-left: 6px;
  padding: 0 5px;
  border: 1px solid var(--amber);
  border-radius: 999px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.rr-queue-note {
  margin: 0;
  font-size: 12px;
  color: var(--amber);
}
</style>
