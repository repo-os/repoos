<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RefreshCw } from "lucide-vue-next";
import { api } from "../api";
import Button from "./ui/button.vue";
import type { RemoteValidationStatusView } from "../types";

/**
 * The Remote runners tab (#0564): each configured host with its health, the
 * runs currently in flight (task + elapsed time, not just a count), the queue
 * depth and next-up tasks, and the last completed run. Live: polls the status
 * endpoint every 3s while the tab is visible.
 */

const status = ref<RemoteValidationStatusView | null>(null);
const loading = ref(true);
const error = ref("");
let pollTimer: ReturnType<typeof setInterval> | undefined;
/** Ticks once a second so in-flight elapsed times stay live between polls. */
const nowTick = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | undefined;

async function load(): Promise<void> {
  try {
    status.value = await api<RemoteValidationStatusView>("/api/remote-validation/status");
    error.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not load runner status.";
  } finally {
    loading.value = false;
  }
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

const hosts = computed(() => status.value?.hosts ?? []);
const totalQueued = computed(() => hosts.value.reduce((n, h) => n + (h.queued ?? 0), 0));

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
      <Button variant="ghost" size="sm" :disabled="loading" @click="load">
        <RefreshCw class="size-3.5" :class="{ spin: loading }" />
        Refresh
      </Button>
      <span class="rr-note">live · refreshes every 3s</span>
    </div>
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

    <div v-for="h in hosts" :key="h.host" class="rr-host" :data-health="health(h).cls">
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
      </div>
      <p v-if="h.detail && !h.healthy" class="rr-detail">{{ h.detail }}</p>

      <dl class="rr-facts">
        <div>
          <dt>Running now</dt>
          <dd>
            <template v-if="(h.activeRuns ?? []).length">
              <span
                v-for="r in h.activeRuns"
                :key="`${r.taskId}-${r.startedAt}`"
                class="rr-active-run"
              >
                <span class="mono">#{{ r.taskId }}</span> · {{ elapsedSince(r.startedAt) }}
              </span>
            </template>
            <span v-else class="rr-dim">idle</span>
          </dd>
        </div>
        <div>
          <dt>Queue</dt>
          <dd>
            <template v-if="h.queued > 0">
              <template v-if="(h.queuedTasks ?? []).length">
                next: <span class="mono">#{{ h.queuedTasks![0] }}</span>
              </template>
              <span v-if="h.queued > 1" class="rr-dim"> +{{ h.queued - 1 }} behind</span>
              <span v-else-if="(h.queuedTasks ?? []).length === 0" class="rr-dim"
                >{{ h.queued }} queued</span
              >
            </template>
            <span v-else class="rr-dim">empty</span>
          </dd>
        </div>
        <div>
          <dt>Last completed</dt>
          <dd>
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
.rr-detail {
  margin: 0;
  font-size: 12px;
  color: var(--red);
  line-height: 1.5;
}

.rr-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 24px;
  margin: 0;
  font-size: 12px;
}
.rr-facts > div {
  display: flex;
  gap: 6px;
}
.rr-facts dt {
  color: var(--txt-dim);
}
.rr-facts dd {
  margin: 0;
}
.rr-active-run {
  margin-right: 10px;
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
.rr-queue-note {
  margin: 0;
  font-size: 12px;
  color: var(--amber);
}
</style>
