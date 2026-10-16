<script setup lang="ts">
/**
 * Dev page (#0748): the things a user runs while developing, declared in
 * `repoos.toml`'s `[[dev.targets]]` and supervised by the server (#0747).
 *
 * The page only ever names a target — the command is resolved server-side from
 * the committed config, so nothing here can run an arbitrary command. Start /
 * Stop / Restart call the same `/api/dev/targets/:name/*` routes the CLI uses;
 * there is no second process path. A target started here keeps running after
 * the tab is closed (the server owns the process, not the browser).
 *
 * Live state comes from the endpoint itself: the page polls while it is
 * visible and refreshes immediately after every action. The backend emits no
 * SSE frame for dev targets, so polling the authoritative list is the honest
 * way to keep the state current rather than inventing a second signal.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronDown } from "lucide-vue-next";
import Button from "../components/ui/button.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import { api, JSON_OPTS } from "../api";
import {
  readShotPreviewFixtureFromLocation,
  shotFixtureDevTargets,
} from "../lib/shot-preview-fixtures";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { fmtDate, fmtTime, relTime } from "../lib/time";
import type { DevTargetStatus, DevTargetView, DevTargetsResponse } from "../types";

const repo = useRepoStore();
const config = useConfigStore();

/** How often the visible page re-reads the list, so state stays live (ms). */
const POLL_MS = 4000;

const targets = ref<DevTargetView[]>([]);
const configErrors = ref<string[]>([]);
const loading = ref(true);
const loadError = ref("");
/** Feedback line after an action, e.g. "Started web". */
const message = ref("");
/** Target name a start/stop/restart request is in flight for. */
const busy = ref<string | null>(null);

/**
 * Whether the optional AI failure summary is offered (#0775). Read from the
 * live config so toggling it in Settings takes effect on the next poll.
 */
const aiSummariesEnabled = computed(() => {
  const dev = config.data?.dev as { failureSummary?: { ai?: boolean } } | undefined;
  return dev?.failureSummary?.ai === true;
});
/** AI-written summary per target, once asked for. */
const aiSummary = ref<Record<string, string>>({});
/** Explain request error per target. */
const aiSummaryError = ref<Record<string, string>>({});
/** Target name whose explain request is in flight, or null. */
const aiBusy = ref<string | null>(null);

/** The project this server serves — one group, matching one repoos.toml. */
const projectName = computed(() => repo.repoName || "This project");

/**
 * Targets grouped by project. A RepoOS server owns exactly one project's
 * config, so this is one group today; the shape keeps the per-project
 * grouping the page promises without inventing data it does not have.
 */
const groups = computed(() => [{ project: projectName.value, targets: targets.value }]);

/** Target whose Restart is awaiting confirmation, or null. */
const confirmRestart = ref<DevTargetView | null>(null);

const STATE_LABEL: Record<DevTargetStatus, string> = {
  running: "Running",
  stopped: "Stopped",
  starting: "Starting…",
  failed: "Failed",
};

const KIND_LABEL: Record<DevTargetView["kind"], string> = {
  server: "Server",
  artifact: "Build",
  process: "Process",
};

/** Whether a target is live, so its start time is the running chip's story. */
function isRunning(t: DevTargetView): boolean {
  return t.status === "running";
}

/**
 * How long ago the target started, e.g. "17 hours ago". Shown beside the
 * running chip; the page's 4s poll re-renders it, so it stays current while
 * the target is up.
 */
function startedAgo(t: DevTargetView): string {
  return relTime(t.startedAt);
}

/**
 * The exact local start time for the hover/focus tooltip, following the app's
 * date/time conventions (`lib/time.ts`), e.g. "Tue, 14 Oct at 11:18 AM".
 */
function startedAtTip(t: DevTargetView): string {
  const date = fmtDate(t.startedAt);
  const time = fmtTime(t.startedAt);
  if (date && time) return `${date} at ${time}`;
  return date || time || "unknown";
}

/** The full captured output for the last run, newest last (#0775). */
function fullLog(log: string[]): string {
  return log.join("\n");
}

/**
 * Targets whose "Last output" body is collapsed (#0777), keyed by target
 * name so the 4s poll replacing the list never resets the reader's choice.
 * Per-view state only — nothing is persisted.
 */
const collapsedLogs = ref<Set<string>>(new Set());

/** Toggle one target's "Last output" body between collapsed and expanded. */
function toggleLog(name: string): void {
  const next = new Set(collapsedLogs.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  collapsedLogs.value = next;
}

/** Whether one target's "Last output" body is currently collapsed. */
function isLogCollapsed(name: string): boolean {
  return collapsedLogs.value.has(name);
}

async function load(silent = false): Promise<void> {
  // A capture can pin a failed target via `?shotState=dev:failed` (preview
  // builds only, #0775), so its shot shows the failure summary and port holder
  // without needing a genuinely stuck port. Real data is used everywhere else.
  if (repo.health?.isPreviewBuild) {
    const fixture = shotFixtureDevTargets(readShotPreviewFixtureFromLocation(window.location));
    if (fixture) {
      targets.value = fixture;
      configErrors.value = [];
      loadError.value = "";
      loading.value = false;
      return;
    }
  }
  if (!silent) loading.value = true;
  try {
    const res = await api<DevTargetsResponse>("/api/dev/targets");
    targets.value = res.targets ?? [];
    configErrors.value = res.errors ?? [];
    loadError.value = "";
  } catch (err) {
    // A failed poll must not thrash the page: keep the last good list and only
    // surface the reason on a non-silent load.
    if (!silent) loadError.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (!silent) loading.value = false;
  }
}

/**
 * Run one action for a target. The endpoint is authoritative for the outcome,
 * so a failure (e.g. a command that exited) is reflected by re-reading the
 * list rather than guessed here — the target then renders `failed` with its
 * own reason.
 */
async function act(name: string, action: "start" | "stop" | "restart"): Promise<void> {
  if (busy.value) return;
  busy.value = name;
  message.value = "";
  try {
    const res = await api<{ ok: boolean; target: DevTargetView }>(
      `/api/dev/targets/${encodeURIComponent(name)}/${action}`,
      JSON_OPTS("POST", {}),
    );
    message.value = `${action === "start" ? "Started" : action === "stop" ? "Stopped" : "Restarted"} ${res.target?.label ?? name}`;
  } catch (err) {
    // The server returns the target's state alongside a failing action; a
    // re-read below shows the failed state and its reason.
    message.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = null;
    await load(true);
  }
}

function requestRestart(t: DevTargetView): void {
  // Restarting a live server drops its connections — confirm first, through
  // the shared dialog (never a native confirm).
  if (t.status === "running" || t.status === "starting") confirmRestart.value = t;
  else void act(t.name, "restart");
}

async function confirmRestartNow(): Promise<void> {
  const t = confirmRestart.value;
  confirmRestart.value = null;
  if (t) await act(t.name, "restart");
}

/**
 * Ask the server for an AI-written explanation of a failed target (#0775). Only
 * offered while the feature is enabled; the deterministic summary needs no
 * model and is always shown.
 */
async function explainFailure(t: DevTargetView): Promise<void> {
  if (aiBusy.value) return;
  aiBusy.value = t.name;
  const { [t.name]: _drop, ...restError } = aiSummaryError.value;
  aiSummaryError.value = restError;
  try {
    const res = await api<{ ok: boolean; summary: string }>(
      `/api/dev/targets/${encodeURIComponent(t.name)}/explain`,
      JSON_OPTS("POST", {}),
    );
    aiSummary.value = { ...aiSummary.value, [t.name]: res.summary ?? "" };
  } catch (err) {
    aiSummaryError.value = {
      ...aiSummaryError.value,
      [t.name]: err instanceof Error ? err.message : String(err),
    };
  } finally {
    aiBusy.value = null;
  }
}

/**
 * Stop the process holding the port a failed target could not bind (#0775). The
 * server only permits this for a process RepoOS itself started.
 */
async function stopHolder(t: DevTargetView): Promise<void> {
  if (busy.value) return;
  busy.value = t.name;
  message.value = "";
  try {
    await api(`/api/dev/targets/${encodeURIComponent(t.name)}/stop-holder`, JSON_OPTS("POST", {}));
    message.value = `Stopped the process holding the port for ${t.label}`;
  } catch (err) {
    message.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = null;
    await load(true);
  }
}

// Poll only while the tab is visible; a hidden tab costs nothing, and state is
// re-read the moment it comes back.
let poll: ReturnType<typeof setInterval> | null = null;

function startPoll(): void {
  if (poll) return;
  poll = setInterval(() => {
    if (document.visibilityState === "visible") void load(true);
  }, POLL_MS);
}

function onVisibility(): void {
  if (document.visibilityState === "visible") void load(true);
}

onMounted(() => {
  void load();
  startPoll();
  document.addEventListener("visibilitychange", onVisibility);
});

onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  poll = null;
  document.removeEventListener("visibilitychange", onVisibility);
});

// The declared target list can change under us (a repoos.toml save reloads the
// config); re-read so a newly declared or removed target appears without a
// manual refresh.
watch(
  () => JSON.stringify((config.data?.dev as { targets?: unknown } | undefined)?.targets ?? []),
  () => void load(true),
);
</script>

<template>
  <div class="dev-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Dev</h1>
        <p class="page-desc">
          The things you run while developing, declared in
          <code>[[dev.targets]]</code>. Start and stop them here — a running server keeps running
          after you close this page.
        </p>
      </div>
      <div class="page-header-actions">
        <a class="page-help-link" href="/settings?tab=toml">Edit dev targets</a>
        <Button variant="ghost" size="sm" :disabled="loading" @click="load()">Refresh</Button>
      </div>
    </header>

    <p v-if="loading && !targets.length" class="dev-state dev-state--muted">Loading dev targets…</p>
    <p v-else-if="loadError && !targets.length" class="dev-state dev-state--error" role="alert">
      {{ loadError }}
    </p>

    <template v-else>
      <section v-if="configErrors.length" class="dev-config-errors" role="alert">
        <strong>Some <code>[[dev.targets]]</code> entries were ignored:</strong>
        <ul>
          <li v-for="e in configErrors" :key="e">{{ e }}</li>
        </ul>
      </section>

      <p v-if="!targets.length" class="dev-empty">
        No dev targets are declared for this project. Add a
        <code>[[dev.targets]]</code> row in <a href="/settings?tab=toml">repoos.toml</a> — a
        <code>server</code> (with a URL), an <code>artifact</code> build (with an output path), or a
        <code>process</code> (a native app with no URL) — then reload.
      </p>

      <template v-else>
        <section
          v-for="group in groups"
          :key="group.project"
          class="dev-group"
          :aria-label="`Dev targets for ${group.project}`"
        >
          <h2 class="dev-group-name">{{ group.project }}</h2>

          <article
            v-for="t in group.targets"
            :key="t.name"
            class="dev-card"
            :data-status="t.status"
            :data-running="isRunning(t) || undefined"
          >
            <div class="dev-card-head">
              <div class="dev-card-title">
                <span class="dev-card-label">{{ t.label }}</span>
                <span class="dev-chip dev-chip--kind">{{ KIND_LABEL[t.kind] }}</span>
                <span class="dev-state-pill" :data-status="t.status">
                  <span class="dev-dot"></span>{{ STATE_LABEL[t.status] }}
                </span>
                <span
                  v-if="t.startedAt && isRunning(t)"
                  class="dev-started"
                  tabindex="0"
                  data-test-id="dev-started"
                  :data-tip="startedAtTip(t)"
                  :aria-label="`Started ${startedAgo(t)} — ${startedAtTip(t)}`"
                  >{{ startedAgo(t) }}</span
                >
              </div>
              <code class="dev-card-name">{{ t.name }}</code>
            </div>

            <dl class="kv-rows dev-meta">
              <div>
                <dt>Command</dt>
                <dd class="kv-wrap">
                  <code class="dev-command">{{ t.command }}</code>
                </dd>
              </div>
              <div v-if="t.kind === 'server' && t.url">
                <dt>URL</dt>
                <dd class="kv-wrap">
                  <a class="dev-open" :href="t.url" target="_blank" rel="noreferrer">
                    Open {{ t.url.replace(/^https?:\/\//, "") }} ↗
                  </a>
                </dd>
              </div>
              <div v-if="t.kind === 'server' && t.port !== undefined">
                <dt>Port</dt>
                <dd class="kv-wrap">
                  <code class="dev-port">{{ t.port }}</code>
                  <span v-if="isRunning(t)" class="dev-port-note">in use now</span>
                </dd>
              </div>
              <div v-else-if="t.kind === 'artifact' && t.artifactPath">
                <dt>Output</dt>
                <dd>
                  <code>{{ t.artifactPath }}</code>
                </dd>
              </div>
              <div v-else-if="t.kind === 'process'">
                <dt>Process</dt>
                <dd>Long-lived, no URL — running while the process is alive</dd>
              </div>
              <div v-if="t.pid !== undefined">
                <dt>PID</dt>
                <dd>
                  <code>{{ t.pid }}</code>
                </dd>
              </div>
            </dl>

            <section
              v-if="t.status === 'failed' && (t.failure || t.error)"
              class="dev-failure dev-summary"
              role="alert"
            >
              <template v-if="t.failure">
                <p class="dev-summary-what">{{ t.failure.what }}</p>
                <p class="dev-summary-line">
                  <span class="dev-summary-key">Likely cause</span> {{ t.failure.cause }}
                </p>
                <p class="dev-summary-line">
                  <span class="dev-summary-key">How to fix</span> {{ t.failure.fix }}
                </p>
                <div v-if="t.failure.holder" class="dev-holder">
                  <p class="dev-summary-line dev-holder-line">
                    <span class="dev-summary-key">Held by</span>
                    <code class="dev-holder-command">{{ t.failure.holder.command }}</code>
                    <span class="dev-holder-pid">PID {{ t.failure.holder.pid }}</span>
                    <span v-if="t.failure.holder.stale" class="dev-holder-stale"
                      >left over from an earlier run</span
                    >
                  </p>
                  <Button
                    v-if="t.failure.canStopHolder"
                    variant="outline"
                    size="sm"
                    :disabled="busy === t.name"
                    @click="stopHolder(t)"
                  >
                    Stop the process holding it
                  </Button>
                </div>
                <p
                  v-else-if="t.failure.kind === 'port-in-use' && t.failure.port !== undefined"
                  class="dev-summary-hint"
                >
                  Run
                  <code>lsof -iTCP:{{ t.failure.port }} -sTCP:LISTEN -t</code>
                  to find the process holding the port.
                </p>
                <div v-if="aiSummariesEnabled" class="dev-ai">
                  <Button
                    v-if="!aiSummary[t.name]"
                    variant="ghost"
                    size="sm"
                    :disabled="aiBusy !== null"
                    @click="explainFailure(t)"
                  >
                    {{ aiBusy === t.name ? "Explaining…" : "Explain with AI" }}
                  </Button>
                  <p v-if="aiSummary[t.name]" class="dev-ai-text">
                    <span class="dev-summary-key">AI summary</span> {{ aiSummary[t.name] }}
                  </p>
                  <p v-if="aiSummaryError[t.name]" class="dev-ai-error">
                    {{ aiSummaryError[t.name] }}
                  </p>
                </div>
              </template>
              <p v-if="t.error" class="dev-summary-reported">
                <span class="dev-summary-key">Reported</span> <code>{{ t.error }}</code>
              </p>
            </section>

            <div class="dev-actions">
              <Button
                variant="accent"
                size="sm"
                :disabled="busy === t.name || t.status === 'running' || t.status === 'starting'"
                @click="act(t.name, 'start')"
              >
                {{ busy === t.name ? "Working…" : "Start" }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="busy === t.name || t.status === 'stopped'"
                @click="act(t.name, 'stop')"
              >
                Stop
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :disabled="busy === t.name"
                @click="requestRestart(t)"
              >
                Restart
              </Button>
            </div>

            <div v-if="t.log.length" class="dev-log">
              <div class="dev-log-head" :class="{ collapsed: isLogCollapsed(t.name) }">
                <span>Last output</span>
                <span class="dev-log-meta">
                  <span class="dev-log-count">{{ t.log.length }} lines</span>
                  <button
                    type="button"
                    class="dev-log-toggle"
                    :title="isLogCollapsed(t.name) ? 'Expand the output' : 'Collapse the output'"
                    :aria-label="isLogCollapsed(t.name) ? 'Expand output' : 'Collapse output'"
                    :aria-expanded="!isLogCollapsed(t.name)"
                    @click="toggleLog(t.name)"
                  >
                    <ChevronDown
                      class="size-3.5 dev-log-chev"
                      :class="{ open: !isLogCollapsed(t.name) }"
                    />
                  </button>
                </span>
              </div>
              <pre
                v-show="!isLogCollapsed(t.name)"
                class="dev-log-body"
                tabindex="0"
                role="region"
                :aria-label="`Full output for ${t.label}`"
              ><code>{{ fullLog(t.log) }}</code></pre>
            </div>
            <p v-else class="dev-log-empty">No output yet.</p>
          </article>
        </section>

        <p v-if="message" class="dev-message" role="status" aria-live="polite">{{ message }}</p>
      </template>
    </template>

    <ConfirmDialog
      :open="confirmRestart !== null"
      title="Restart target?"
      confirm-label="Restart"
      @update:open="
        (v) => {
          if (!v) confirmRestart = null;
        }
      "
      @confirm="confirmRestartNow"
    >
      Restarting <strong>{{ confirmRestart?.label }}</strong> stops the running process and starts
      it again — anything connected to it (a browser, a device) is dropped and reconnects.
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.dev-page {
  min-width: 0;
}
.dev-page code {
  font-family: "JetBrains Mono", monospace;
}

.dev-state {
  font-size: 13px;
}
.dev-state--muted {
  color: var(--txt-dim);
}
.dev-state--error {
  color: var(--red);
}

.dev-config-errors {
  border: 1px solid var(--amber-border-tint);
  background: var(--amber-tint);
  color: var(--amber);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 13px;
  margin-bottom: 16px;
}
.dev-config-errors ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.dev-config-errors code {
  color: inherit;
}

.dev-empty {
  border: 1px solid var(--border);
  background: var(--panel-gradient);
  border-radius: 14px;
  padding: 18px;
  color: var(--txt-faint);
  font-size: 13px;
  line-height: 1.6;
}
.dev-empty a {
  color: var(--cyan);
  text-decoration: none;
}
.dev-empty a:hover {
  text-decoration: underline;
}
.dev-empty code {
  color: var(--txt-dim);
}

.dev-group {
  margin-bottom: 22px;
}
.dev-group-name {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--txt-dim);
  margin: 0 0 12px;
}

.dev-card {
  position: relative;
  border: 1px solid var(--border);
  background: var(--panel-gradient);
  border-radius: 14px;
  padding: 16px 18px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.dev-card[data-status="failed"] {
  border-color: var(--red-border-tint);
}
/* A started target gets the same "running" highlight as an active remote
   runner (#0801): the shared cyan breathing glow. Stopped/starting/failed
   targets never set `data-running`, so their base border stands. */
.dev-card[data-running] {
  border-color: var(--cyan);
  animation: running-glow-pulse 2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .dev-card[data-running] {
    animation: none;
  }
}

.dev-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.dev-card-title {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  min-width: 0;
}
.dev-card-label {
  font-size: 15px;
  font-weight: 750;
}
.dev-card-name {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  color: var(--txt-faint);
}

.dev-chip {
  font-size: 10.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--txt-dim);
}

.dev-state-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
  color: var(--txt-dim);
  background: color-mix(in srgb, var(--border) 55%, transparent);
}
.dev-state-pill[data-status="running"] {
  color: var(--green);
  background: var(--green-tint);
}
.dev-state-pill[data-status="starting"] {
  color: var(--amber);
  background: var(--amber-tint);
}
.dev-state-pill[data-status="failed"] {
  color: var(--red);
  background: var(--red-tint);
}
.dev-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

/* Elapsed time beside the running chip — muted so it reads as context for the
   pill, not a second badge. Focusable: the shared tooltip shows the exact
   start time on hover and keyboard focus. */
.dev-started {
  font-size: 12px;
  font-weight: 500;
  color: var(--txt-faint);
  font-variant-numeric: tabular-nums;
  cursor: default;
}
.dev-started:focus-visible {
  outline: 2px solid var(--border-bright);
  outline-offset: 2px;
  border-radius: 4px;
}

.dev-meta {
  --kv-label-w: 74px;
  font-size: 12.5px;
}
.dev-command {
  font-family: "JetBrains Mono", monospace;
  color: var(--txt-dim);
  overflow-wrap: anywhere;
  min-width: 0;
}
.dev-open {
  color: var(--cyan);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.dev-open:hover {
  text-decoration: underline;
}
/* The chosen port (#0802), shown beside the URL so a running target's real
   port is visible at a glance. */
.dev-port {
  font-family: "JetBrains Mono", monospace;
  font-variant-numeric: tabular-nums;
  color: var(--txt);
}
.dev-port-note {
  margin-left: 6px;
  font-size: 11px;
  color: var(--txt-faint);
}

.dev-failure {
  margin: 0;
  border: 1px solid var(--red-border-tint);
  background: var(--red-tint);
  color: var(--red);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 12.5px;
  overflow-wrap: anywhere;
}

/* Plain-language failure summary (#0775): what failed, why, and the fix. */
.dev-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  line-height: 1.5;
}
.dev-summary-what {
  margin: 0;
  font-weight: 700;
}
.dev-summary-line {
  margin: 0;
}
.dev-summary-key {
  font-size: 10.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.85;
  margin-right: 4px;
}
.dev-summary-reported {
  margin: 0;
  opacity: 0.85;
}
.dev-summary-reported code,
.dev-summary-hint code {
  font-family: "JetBrains Mono", monospace;
}
.dev-summary-hint {
  margin: 0;
}
.dev-holder {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  border-top: 1px solid var(--red-border-tint);
  padding-top: 6px;
}
.dev-holder-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.dev-holder-command {
  font-family: "JetBrains Mono", monospace;
  overflow-wrap: anywhere;
}
.dev-holder-pid {
  font-variant-numeric: tabular-nums;
}
.dev-holder-stale {
  font-style: italic;
  opacity: 0.85;
}
.dev-ai {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  border-top: 1px solid var(--red-border-tint);
  padding-top: 6px;
}
.dev-ai-text,
.dev-ai-error {
  margin: 0;
}
.dev-ai-error {
  font-weight: 600;
}

.dev-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.dev-log {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--md-body-bg);
}
.dev-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--txt-faint);
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
}
/* Collapsed: the body is hidden, so the divider would dangle over nothing. */
.dev-log-head.collapsed {
  border-bottom: none;
}
/* Right-side group: line count with the collapse/expand toggle beside it. */
.dev-log-meta {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dev-log-count {
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  color: var(--txt-dim);
}
.dev-log-toggle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: none;
  color: var(--txt-dim);
  cursor: pointer;
  transition:
    background-color 0.15s,
    color 0.15s;
}
.dev-log-toggle:hover {
  background: var(--nav-hover-bg);
  color: var(--txt);
}
.dev-log-toggle:focus-visible {
  outline: 2px solid var(--border-bright);
  outline-offset: 1px;
}
/* Same flip as the error card's collapse chevron: up while expanded. */
.dev-log-chev {
  transition: transform 0.15s;
}
.dev-log-chev.open {
  transform: rotate(180deg);
}
.dev-log-body {
  margin: 0;
  padding: 10px 12px;
  font-family: "JetBrains Mono", monospace;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--txt-dim);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 320px;
  overflow-y: auto;
  overflow-x: hidden;
}
/* The full log is a scroll region: focusable so keyboard users can scroll it. */
.dev-log-body:focus-visible {
  outline: 2px solid var(--border-bright);
  outline-offset: -2px;
}
.dev-log-empty {
  margin: 0;
  color: var(--txt-faint);
  font-size: 12px;
}

.dev-message {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--txt-dim);
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .dev-card-head {
    flex-direction: column;
    gap: 6px;
  }
  .dev-card-name {
    align-self: flex-start;
  }
}
</style>
