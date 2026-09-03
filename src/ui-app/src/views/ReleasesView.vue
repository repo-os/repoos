<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowRight, Bug } from "lucide-vue-next";
import Button from "../components/ui/button.vue";
import Dialog from "../components/ui/dialog/root.vue";
import DialogClose from "../components/ui/dialog/close.vue";
import DialogContent from "../components/ui/dialog/content.vue";
import DialogDescription from "../components/ui/dialog/description.vue";
import DialogOverlay from "../components/ui/dialog/overlay.vue";
import DialogTitle from "../components/ui/dialog/title.vue";
import { api, JSON_OPTS } from "../api";
import { nextReleaseVersion } from "../releases";

interface ReleaseStatus {
  enabled: boolean;
  supported: boolean;
  name: string;
  provider: string | null;
  branch: string;
  version: string | null;
  tag: string | null;
  latestTag: string | null;
  latestTagAt: string | null;
  latestTagSha: string | null;
  head: string | null;
  clean: boolean;
  onReleaseBranch: boolean;
  tagExists: boolean;
  released: boolean;
  ready: boolean;
  blockers: string[];
  releaseUrl: string | null;
  workflowUrl: string | null;
}

type ReleasePhase =
  | "preparing"
  | "committing"
  | "building"
  | "checking"
  | "pushing_main"
  | "tagging"
  | "pushing_tag";

interface ReleaseRun {
  state: "idle" | "running" | "succeeded" | "failed";
  phase: ReleasePhase | null;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

const status = ref<ReleaseStatus | null>(null);
const loading = ref(true);
const running = ref(false);
const confirmOpen = ref(false);
const newVersion = ref("");
const message = ref("");
const error = ref("");
/** Full command output from a failed release phase (repoos check log, build errors). */
const runLog = ref("");
const debuggerSending = ref(false);
const debuggerSent = ref(false);
const debuggerErr = ref("");
const run = ref<ReleaseRun | null>(null);
const now = ref(Date.now());
let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function startPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    now.value = Date.now();
    void pollRun();
  }, 1000);
}

/** "v" or whatever prefix the configured tag uses, derived from tag vs version. */
const tagPrefix = computed(() => {
  const tag = status.value?.tag;
  const version = status.value?.version;
  return tag && version && tag.endsWith(version) ? tag.slice(0, -version.length) : "v";
});

/** The version already shipped (tag exists for the current manifest version). */
const publishedVersion = computed(() =>
  status.value?.released ? (status.value.version ?? null) : null,
);
const publishedTag = computed(() =>
  publishedVersion.value
    ? `${tagPrefix.value}${publishedVersion.value}`
    : (status.value?.latestTag ?? null),
);

/** A manifest version bumped but not yet tagged — ready to cut as-is. */
const pendingVersion = computed(() =>
  status.value && !status.value.released && status.value.tag && !status.value.tagExists
    ? status.value.version
    : null,
);

const suggestedVersion = computed(
  () => pendingVersion.value ?? nextReleaseVersion(status.value?.version ?? null),
);
const suggestedTag = computed(() =>
  suggestedVersion.value ? `${tagPrefix.value}${suggestedVersion.value}` : null,
);

const newTag = computed(() => (newVersion.value ? `${tagPrefix.value}${newVersion.value}` : ""));
const newVersionValid = computed(
  () =>
    SEMVER.test(newVersion.value) &&
    newVersion.value !== publishedVersion.value &&
    newTag.value !== status.value?.latestTag,
);

const blockers = computed(() => {
  // The manifest-version-already-tagged "blocker" is the normal resting state
  // right after a release — it's not something to fix, so don't alarm on it.
  const raw = status.value?.blockers ?? [];
  return status.value?.released ? raw.filter((b) => !/ already exists\.$/.test(b)) : raw;
});

type Phase = "releasing" | "blocked" | "published" | "ready";
const phase = computed<Phase>(() => {
  if (running.value) return "releasing";
  if (blockers.value.length) return "blocked";
  if (status.value?.released) return "published";
  return "ready";
});
const phaseLabel = computed(
  () =>
    ({ releasing: "Releasing…", blocked: "Blocked", published: "Published", ready: "Ready" })[
      phase.value
    ],
);

const canOpen = computed(
  () =>
    !!status.value?.supported &&
    status.value.clean &&
    status.value.onReleaseBranch &&
    !running.value,
);

/** Wall-clock of the last completed run, from the route's run timestamps. */
const lastRunDuration = computed(() => {
  const r = run.value;
  if (!r?.startedAt || !r.updatedAt || r.state === "idle" || r.state === "running") return "";
  return formatSpan(new Date(r.updatedAt).getTime() - new Date(r.startedAt).getTime());
});

function formatSpan(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = now.value - new Date(iso).getTime();
  if (diff < 0 || Number.isNaN(diff)) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    status.value = await api<ReleaseStatus>("/api/release");
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function openConfirm(): void {
  message.value = "";
  error.value = "";
  runLog.value = "";
  newVersion.value = "";
  debuggerSent.value = false;
  debuggerErr.value = "";
  confirmOpen.value = true;
}

async function release(): Promise<void> {
  if (!newVersionValid.value || running.value) return;
  running.value = true;
  error.value = "";
  runLog.value = "";
  debuggerSent.value = false;
  debuggerErr.value = "";
  try {
    const result = await api<{ run: ReleaseRun }>(
      "/api/release",
      JSON_OPTS("POST", { version: newVersion.value, confirmTag: newTag.value }),
    );
    run.value = result.run;
    startPolling();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    await load();
  } finally {
    if (run.value?.state !== "running") running.value = false;
  }
}

/**
 * Turn a failed `repoos check` / build log into a one-line headline that names
 * the likely cause, so the operator doesn't have to scan the raw output to know
 * whether it's worth a retry or a real regression.
 */
function failureSummary(phaseName: string | null, msg: string): string {
  const where = phaseName ? `during ${phaseName.replace(/_/g, " ")}` : "during the run";
  if (/Test timed out in \d+\s*ms/i.test(msg))
    return `Release failed ${where} — a test timed out. This is usually the known check-gate flake under memory pressure, not a regression; try cutting again before sending it to the Debugger.`;
  if (/\bFAIL\b|\b\d+ failed\b/.test(msg))
    return `Release failed ${where} — one or more tests failed. See output below.`;
  if (/error TS\d+|\bType error\b|\btsc:/i.test(msg))
    return `Release failed ${where} — TypeScript did not compile. See output below.`;
  if (/build is stale|staleness|dist .*out of date/i.test(msg))
    return `Release failed ${where} — the build is stale. See output below.`;
  return `Release failed ${where} — see output below.`;
}

async function pollRun(): Promise<void> {
  try {
    const latest = await api<ReleaseRun>("/api/release/run");
    run.value = latest;
    if (latest.state === "running") return;
    stopPolling();
    running.value = false;
    if (latest.state === "succeeded") {
      message.value = latest.message;
      confirmOpen.value = false;
      await load();
    } else if (latest.state === "failed" && latest.message) {
      // A failed phase reports its full command output (repoos check log, build
      // errors). Classify the common causes into the headline, then show the
      // full log in a scrollable block.
      const lines = latest.message.split("\n").filter((l) => l.trim());
      error.value =
        lines.length > 1 ? failureSummary(latest.phase, latest.message) : latest.message;
      runLog.value = lines.length > 1 ? latest.message : "";
    }
  } catch {
    // Keep the existing stage visible through a short server reload.
  }
}

/**
 * Hand the failed release run to the Debugger agent with enough context to
 * investigate without re-deriving it (phase, target tag, current commit, and
 * the full check/build output), then open the Debugger chat. Mirrors the
 * move-to-done "Fix" handoff in DoneErrorCard.vue.
 */
async function sendToDebugger(): Promise<void> {
  if (debuggerSending.value) return;
  debuggerSending.value = true;
  debuggerErr.value = "";
  try {
    const detail = runLog.value || run.value?.message || error.value;
    await api(
      "/api/debugger/message",
      JSON_OPTS("POST", {
        text: [
          `The "Cut a release" flow failed for version ${newVersion.value || status.value?.version || "?"} (tag ${newTag.value || suggestedTag.value || "?"}).`,
          `Phase: ${run.value?.phase ?? "unknown"}.`,
          `Current commit: ${status.value?.head ?? "unknown"} on ${status.value?.branch ?? "main"}.`,
          `Output:\n${detail}`,
          "Identify the concrete cause and the smallest safe repair so the release can be retried.",
        ].join("\n"),
      }),
    );
    debuggerSent.value = true;
    window.dispatchEvent(new CustomEvent("repoos:open-debugger"));
  } catch (err) {
    debuggerErr.value =
      err instanceof Error && /disabled/i.test(err.message)
        ? "Enable the Debugger on the Agents page to send it this failure."
        : err instanceof Error
          ? err.message
          : String(err);
  } finally {
    debuggerSending.value = false;
  }
}

/** Live elapsed time while a release runs. */
function elapsed(): string {
  if (!run.value?.startedAt) return "";
  return `${formatSpan(now.value - new Date(run.value.startedAt).getTime())} elapsed`;
}

onMounted(() => {
  void load();
  void pollRun();
  startPolling();
});
onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <div class="releases-page">
    <header class="rel-head">
      <div>
        <h1 class="rel-title">Releases</h1>
        <p class="rel-sub">Cut and track tagged releases of this repository.</p>
      </div>
      <Button variant="ghost" size="sm" :disabled="loading" @click="load">Refresh</Button>
    </header>

    <div v-if="loading" class="spin"></div>
    <p v-else-if="error && !status" class="rel-error">{{ error }}</p>

    <template v-else-if="status">
      <div v-if="!status.enabled" class="rel-card rel-empty">
        Releases aren't configured for this repository.
      </div>

      <template v-else>
        <section class="rel-card">
          <div class="rel-card-head">
            <div>
              <div class="rel-provider-name">{{ status.name }}</div>
              <div class="rel-provider-meta">{{ status.provider }} · {{ status.branch }}</div>
            </div>
            <span class="rel-pill" :data-phase="phase">{{ phaseLabel }}</span>
          </div>

          <!-- Version lineage: last shipped → next. Versions are a real
               sequence, so a left-to-right progression is honest structure. -->
          <div class="rel-lineage">
            <div class="rel-node rel-node--past">
              <span class="rel-ver">{{ publishedTag ?? "no releases yet" }}</span>
              <span v-if="status.released" class="rel-node-meta">
                shipped {{ relativeTime(status.latestTagAt) || "—" }}
                <template v-if="status.latestTagSha">
                  · <code>{{ status.latestTagSha }}</code>
                </template>
              </span>
              <span v-else-if="status.latestTag" class="rel-node-meta">
                last tag · {{ relativeTime(status.latestTagAt) || "—" }}
              </span>
            </div>

            <ArrowRight class="rel-arrow" aria-hidden="true" />

            <div class="rel-node rel-node--next">
              <span class="rel-ver">{{ suggestedTag ?? "—" }}</span>
              <span class="rel-node-meta">{{
                pendingVersion ? "ready to cut" : "suggested next"
              }}</span>
            </div>
          </div>

          <div class="rel-context">
            <template v-if="status.head">
              from <code>{{ status.head }}</code> on <code>{{ status.branch }}</code>
            </template>
          </div>

          <div v-if="blockers.length" class="rel-blockers">
            <div v-for="b in blockers" :key="b">{{ b }}</div>
          </div>

          <div class="rel-actions">
            <Button variant="accent" :disabled="!canOpen" @click="openConfirm">
              {{ suggestedVersion ? `Cut ${tagPrefix}${suggestedVersion}` : "Cut a release" }}
            </Button>
            <a
              v-if="status.workflowUrl"
              class="rel-link"
              :href="status.workflowUrl"
              target="_blank"
              rel="noreferrer"
              >CI workflow ↗</a
            >
            <a
              v-if="status.releaseUrl"
              class="rel-link"
              :href="status.releaseUrl"
              target="_blank"
              rel="noreferrer"
              >GitHub release ↗</a
            >
          </div>
        </section>

        <!-- Outcome of the most recent run (survives until the next one). -->
        <section v-if="message && !error" class="rel-outcome rel-outcome--ok" aria-live="polite">
          <div class="rel-outcome-line">
            <strong>{{ message }}</strong>
            <span v-if="lastRunDuration" class="rel-outcome-span">took {{ lastRunDuration }}</span>
          </div>
          <a
            v-if="status.workflowUrl"
            class="rel-link"
            :href="status.workflowUrl"
            target="_blank"
            rel="noreferrer"
            >Watch the build ↗</a
          >
        </section>

        <section v-if="error && !confirmOpen" class="rel-outcome rel-outcome--fail" role="alert">
          <strong>{{ error }}</strong>
          <pre v-if="runLog" class="rel-log">{{ runLog }}</pre>
          <div class="rel-debugger">
            <Button
              variant="outline"
              size="sm"
              :disabled="debuggerSending || debuggerSent"
              @click="sendToDebugger"
            >
              <Bug class="btn-ico" aria-hidden="true" />
              {{
                debuggerSent
                  ? "Sent to Debugger"
                  : debuggerSending
                    ? "Sending…"
                    : "Send to Debugger"
              }}
            </Button>
            <span v-if="debuggerErr" class="rel-debugger-err">{{ debuggerErr }}</span>
          </div>
        </section>

        <Dialog :open="confirmOpen" @update:open="confirmOpen = $event">
          <DialogOverlay />
          <DialogContent class="release-modal">
            <div class="release-modal-head">
              <DialogTitle>Cut a release</DialogTitle>
              <DialogClose class="close-x" aria-label="Close" :disabled="running">×</DialogClose>
            </div>
            <div class="release-modal-body">
              <DialogDescription>
                Runs <code>repoos check</code>, pushes <code>{{ status.branch }}</code
                >, then pushes a tag. CI builds and publishes from that tag.
              </DialogDescription>

              <dl class="rel-modal-facts">
                <div>
                  <dt>Currently published</dt>
                  <dd>{{ publishedTag ?? "nothing yet" }}</dd>
                </div>
                <div>
                  <dt>Suggested next</dt>
                  <dd>{{ suggestedTag ?? "—" }}</dd>
                </div>
              </dl>

              <div v-if="running && run" class="release-progress" aria-live="polite">
                <strong>{{ run.message }}</strong>
                <span>{{ elapsed() }}</span>
                <small v-if="run.phase === 'building'"
                  >Rebuilding so the check runs against fresh output.</small
                >
                <small v-else-if="run.phase === 'checking'"
                  >Full verification usually takes 1–5 minutes.</small
                >
              </div>

              <div v-if="error && !running" class="release-modal-error" role="alert">
                <strong>{{ error }}</strong>
                <pre v-if="runLog" class="rel-log">{{ runLog }}</pre>
                <div class="rel-debugger">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="debuggerSending || debuggerSent"
                    @click="sendToDebugger"
                  >
                    <Bug class="btn-ico" aria-hidden="true" />
                    {{
                      debuggerSent
                        ? "Sent to Debugger"
                        : debuggerSending
                          ? "Sending…"
                          : "Send to Debugger"
                    }}
                  </Button>
                  <span v-if="debuggerErr" class="rel-debugger-err">{{ debuggerErr }}</span>
                </div>
              </div>

              <label v-if="!running" class="rel-version-field">
                <span class="rel-field-label">New version</span>
                <div class="rel-version-input">
                  <input
                    v-model.trim="newVersion"
                    :placeholder="suggestedVersion ?? '0.0.0'"
                    inputmode="decimal"
                    autofocus
                    @keyup.enter="release"
                  />
                  <span class="rel-version-tag" :class="{ dim: !newVersion }">
                    → {{ newTag || `${tagPrefix}${suggestedVersion ?? "0.0.0"}` }}
                  </span>
                </div>
                <span class="rel-field-hint">Just the number — no “{{ tagPrefix }}”.</span>
              </label>
            </div>
            <div class="release-actions">
              <Button variant="accent" :disabled="!newVersionValid || running" @click="release">
                {{ running ? "Publishing…" : newTag ? `Publish ${newTag}` : "Publish" }}
              </Button>
              <DialogClose as-child
                ><Button variant="ghost" :disabled="running">Cancel</Button></DialogClose
              >
            </div>
          </DialogContent>
        </Dialog>
      </template>
    </template>
  </div>
</template>

<style scoped>
.rel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 22px;
}
.rel-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
}
.rel-sub {
  color: var(--txt-dim);
  font-size: 13px;
  margin: 3px 0 0;
}
.rel-error {
  color: var(--red);
  margin: 12px 0;
}

.rel-card {
  border: 1px solid var(--border);
  background: var(--panel-gradient);
  border-radius: 14px;
  padding: 22px;
}
.rel-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.rel-provider-name {
  font-size: 15px;
  font-weight: 700;
}
.rel-provider-meta {
  color: var(--txt-faint);
  font-family: var(--mono);
  font-size: 12px;
  margin-top: 2px;
}
.rel-pill {
  flex-shrink: 0;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border: 1px solid transparent;
}
.rel-pill[data-phase="published"] {
  color: var(--green);
  background: var(--green-tint);
  border-color: var(--green-border-tint);
}
.rel-pill[data-phase="ready"] {
  color: var(--cyan);
  background: var(--cyan-dim);
  border-color: color-mix(in srgb, var(--cyan) 30%, transparent);
}
.rel-pill[data-phase="blocked"] {
  color: var(--amber);
  background: var(--amber-tint);
  border-color: var(--amber-border-tint);
}
.rel-pill[data-phase="releasing"] {
  color: var(--violet);
  background: var(--violet-dim);
  border-color: var(--violet-border-tint);
}

/* Version lineage — the signature of the page. */
.rel-lineage {
  display: flex;
  align-items: center;
  gap: 18px;
  margin: 24px 0 14px;
  flex-wrap: wrap;
}
.rel-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rel-ver {
  font-family: var(--mono);
  font-weight: 700;
  line-height: 1;
}
.rel-node--past .rel-ver {
  font-size: 20px;
  color: var(--txt-dim);
}
.rel-node--next {
  padding: 10px 16px;
  border-radius: 12px;
  background: var(--btn-new-bg);
  border: 1px solid var(--border-bright);
}
.rel-node--next .rel-ver {
  font-size: 26px;
  color: var(--txt);
}
.rel-node-meta {
  font-size: 11.5px;
  color: var(--txt-faint);
}
.rel-node-meta code {
  font-family: var(--mono);
  color: var(--txt-dim);
}
.rel-arrow {
  width: 20px;
  height: 20px;
  color: var(--txt-faint);
  flex-shrink: 0;
}

.rel-context {
  color: var(--txt-faint);
  font-size: 12px;
  min-height: 1em;
}
.rel-context code {
  font-family: var(--mono);
  color: var(--txt-dim);
}

.rel-blockers {
  margin-top: 16px;
  border-left: 2px solid var(--amber);
  padding-left: 12px;
  display: grid;
  gap: 5px;
  color: var(--txt-dim);
  font-size: 13px;
}

.rel-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 22px;
  flex-wrap: wrap;
}
.rel-link {
  color: var(--cyan);
  font-size: 12.5px;
  text-decoration: none;
}
.rel-link:hover {
  text-decoration: underline;
}

.rel-outcome {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  display: grid;
  gap: 8px;
}
.rel-outcome--ok {
  border-color: var(--green-border-tint);
  background: var(--green-tint);
}
.rel-outcome--fail {
  border-color: var(--red-border-tint);
  background: var(--red-tint);
}
.rel-outcome-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.rel-outcome--ok strong {
  color: var(--green);
  font-size: 13.5px;
}
.rel-outcome--fail strong {
  color: var(--red);
  font-size: 13.5px;
  line-height: 1.45;
}
.rel-outcome-span {
  color: var(--txt-faint);
  font-family: var(--mono);
  font-size: 12px;
}

.rel-log {
  max-width: 100%;
  max-height: 260px;
  overflow: auto;
  margin: 0;
  padding: 10px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--txt-dim);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre;
  tab-size: 2;
}
.rel-log::-webkit-scrollbar-corner {
  background: transparent;
}
.rel-debugger {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.rel-debugger-err {
  color: var(--txt-dim);
  font-size: 12px;
}

.rel-empty {
  color: var(--txt-faint);
}

@media (max-width: 560px) {
  .rel-lineage {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .rel-arrow {
    transform: rotate(90deg);
    align-self: center;
  }
}
</style>
