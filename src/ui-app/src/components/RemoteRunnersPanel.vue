<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from "vue";
import { type RouteLocationNormalizedLoaded, routeLocationKey } from "vue-router";
import { ArrowDown, ArrowUp, Check, RefreshCw } from "lucide-vue-next";
import { api } from "../api";
import { remoteRunnersHungShotFixture } from "../lib/remote-runners-shot-fixture";
import { useConfigStore } from "../stores/config";
import { useRepoStore } from "../stores/repo";
import Button from "./ui/button.vue";
import type { RemoteHostStatusView, RemoteValidationStatusView } from "../types";

/**
 * The Remote runners tab (#0564): each configured host with its health, the
 * runs currently in flight (task + elapsed time, not just a count), the queue
 * depth and next-up tasks, and the last completed run. Live: polls the status
 * endpoint every 3s while the tab is visible.
 */

const route = inject<RouteLocationNormalizedLoaded | null>(routeLocationKey, null);
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
  void load();
  pollTimer = setInterval(() => void load(), 3000);
  tickTimer = setInterval(() => (nowTick.value = Date.now()), 1000);
});
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (tickTimer) clearInterval(tickTimer);
});

const shotFixture = computed(() =>
  route?.query?.rvFixture === "hung-runs" ? "hung-runs" : null,
);
const shotFixtureLabel = computed(() =>
  shotFixture.value === "hung-runs" ? "Shot fixture — not live runner state" : "",
);

const hosts = computed(() => {
  if (shotFixture.value === "hung-runs") return [remoteRunnersHungShotFixture()];
  return status.value?.hosts ?? [];
});
const totalQueued = computed(() => hosts.value.reduce((n, h) => n + (h.queued ?? 0), 0));

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
    <p v-if="shotFixtureLabel" class="rr-shot-fixture ff-notice" role="status">
      {{ shotFixtureLabel }}
    </p>
    <p v-if="hosts.length" class="rr-tie-note">
      Jobs go to the host with the fewest active runs. Hosts with equal load are tried top to
      bottom, so the first host gets the work when all are idle.
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
                <span v-if="r.phase" class="rr-dim"> · {{ r.phase }}</span>
                · {{ elapsedSince(r.startedAt) }}
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
              <template v-if="(h.lockWaiters ?? []).length">
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
.rr-host[data-running] {
  border-color: var(--cyan);
  animation: rr-pulse 2s ease-in-out infinite;
}
@keyframes rr-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
  50% {
    box-shadow: 0 0 14px 1px var(--cyan-dim);
    border-color: var(--cyan);
  }
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
.rr-ok {
  color: var(--green);
}
.rr-bad {
  color: var(--red);
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
