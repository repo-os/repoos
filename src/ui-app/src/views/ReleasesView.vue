<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Bug } from "lucide-vue-next";
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

interface ReleaseRun {
  state: "idle" | "running" | "succeeded" | "failed";
  phase:
    | "preparing"
    | "committing"
    | "building"
    | "checking"
    | "pushing_main"
    | "tagging"
    | "pushing_tag"
    | null;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
}

const status = ref<ReleaseStatus | null>(null);
const loading = ref(true);
const running = ref(false);
const confirmOpen = ref(false);
const confirmation = ref("");
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

const tagPrefix = computed(() => {
  const tag = status.value?.tag;
  const version = status.value?.version;
  return tag && version && tag.endsWith(version) ? tag.slice(0, -version.length) : "v";
});
const hasUnreleasedManifestVersion = computed(
  () =>
    !!status.value?.tag && !status.value.tagExists && status.value.latestTag !== status.value.tag,
);
const suggestedVersion = computed(() =>
  hasUnreleasedManifestVersion.value
    ? (status.value?.version ?? null)
    : nextReleaseVersion(status.value?.version ?? null),
);
const suggestedTag = computed(() =>
  suggestedVersion.value ? `${tagPrefix.value}${suggestedVersion.value}` : null,
);
const proposedTag = computed(() =>
  newVersion.value ? `${tagPrefix.value}${newVersion.value}` : "",
);
const tagMatches = computed(() => !!proposedTag.value && confirmation.value === proposedTag.value);
const canOpen = computed(
  () =>
    !!status.value?.supported &&
    status.value.clean &&
    status.value.onReleaseBranch &&
    !running.value,
);

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
  newVersion.value = suggestedVersion.value ?? "";
  confirmation.value = "";
  confirmOpen.value = true;
}

async function release(): Promise<void> {
  if (!tagMatches.value || running.value) return;
  running.value = true;
  error.value = "";
  runLog.value = "";
  debuggerSent.value = false;
  debuggerErr.value = "";
  try {
    const result = await api<{ run: ReleaseRun }>(
      "/api/release",
      JSON_OPTS("POST", { version: newVersion.value, confirmTag: confirmation.value }),
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
function failureSummary(phase: string | null, message: string): string {
  const where = phase ? `during ${phase.replace(/_/g, " ")}` : "during the run";
  if (/Test timed out in \d+\s*ms/i.test(message))
    return `Release failed ${where} — a test timed out. This is usually the known check-gate flake under memory pressure, not a regression; try cutting again before sending it to the Debugger.`;
  if (/\bFAIL\b|\b\d+ failed\b/.test(message))
    return `Release failed ${where} — one or more tests failed. See output below.`;
  if (/error TS\d+|\bType error\b|\btsc:/i.test(message))
    return `Release failed ${where} — TypeScript did not compile. See output below.`;
  if (/build is stale|staleness|dist .*out of date/i.test(message))
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
          `The "Cut new release" flow failed for version ${newVersion.value || status.value?.version || "?"} (tag ${suggestedTag.value ?? "?"}).`,
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

function elapsed(): string {
  if (!run.value?.startedAt) return "";
  const seconds = Math.max(
    0,
    Math.floor((now.value - new Date(run.value.startedAt).getTime()) / 1000),
  );
  return seconds < 60
    ? `${seconds}s elapsed`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s elapsed`;
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
    <div class="releases-head">
      <div>
        <div class="page-title">Releases</div>
        <div class="page-desc">Versioned product releases, configured by this repository.</div>
      </div>
      <Button variant="ghost" size="sm" :disabled="loading" @click="load">Refresh</Button>
    </div>

    <div v-if="loading" class="spin"></div>
    <div v-else-if="error && !status" class="release-error">{{ error }}</div>
    <template v-else-if="status">
      <div v-if="!status.enabled" class="release-card release-empty">
        Releases are not configured for this repository.
      </div>
      <template v-else>
        <section class="release-card">
          <div class="release-card-head">
            <div>
              <div class="release-name">{{ status.name }}</div>
              <div class="release-subtitle">{{ status.provider }} · {{ status.branch }}</div>
            </div>
            <span class="release-state" :class="{ ready: status.ready, released: status.released }">
              {{
                status.released
                  ? "Release pushed"
                  : status.ready
                    ? "Ready to release"
                    : "Needs attention"
              }}
            </span>
          </div>
          <div class="release-facts">
            <div>
              <span>Suggested new tag</span><b>{{ suggestedTag ?? "—" }}</b>
            </div>
            <div>
              <span>Current version</span><b>{{ status.version ?? "—" }}</b>
            </div>
            <div>
              <span>Current commit</span><b>{{ status.head ?? "—" }}</b>
            </div>
            <div>
              <span>Previous tag</span><b>{{ status.latestTag ?? "None" }}</b>
            </div>
          </div>
          <div v-if="status.blockers.length" class="release-blockers">
            <div v-for="blocker in status.blockers" :key="blocker">{{ blocker }}</div>
          </div>
          <div v-if="!status.clean" class="release-dirty">
            Release is disabled because <code>main</code> has uncommitted changes. Commit or stash
            them, then refresh this page.
          </div>
          <div class="release-actions">
            <Button variant="accent" :disabled="!canOpen" @click="openConfirm">
              Cut new release
            </Button>
            <a v-if="status.workflowUrl" :href="status.workflowUrl" target="_blank" rel="noreferrer"
              >Release workflow ↗</a
            >
            <a v-if="status.releaseUrl" :href="status.releaseUrl" target="_blank" rel="noreferrer"
              >GitHub release ↗</a
            >
          </div>
        </section>
        <p v-if="message" class="release-success">{{ message }}</p>
        <template v-if="error && !confirmOpen">
          <p class="release-error">{{ error }}</p>
          <pre v-if="runLog" class="release-output">{{ runLog }}</pre>
          <div class="release-debugger">
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
            <span v-if="debuggerErr" class="release-debugger-err">{{ debuggerErr }}</span>
          </div>
        </template>

        <Dialog :open="confirmOpen" @update:open="confirmOpen = $event">
          <DialogOverlay />
          <DialogContent class="release-modal">
            <div class="release-modal-head">
              <DialogTitle>Cut new release</DialogTitle>
              <DialogClose class="close-x" aria-label="Close" :disabled="running">×</DialogClose>
            </div>
            <div class="release-modal-body">
              <DialogDescription>
                RepoOS commits the version bump, runs <code>repoos check</code>, pushes
                <code>{{ status.branch }}</code
                >, then pushes an annotated tag to trigger CI.
              </DialogDescription>
              <div v-if="running && run" class="release-progress" aria-live="polite">
                <strong>{{ run.message }}</strong>
                <span>{{ elapsed() }}</span>
                <small v-if="run.phase === 'building'"
                  >Rebuilding so the check runs against fresh output.</small
                >
                <small v-else-if="run.phase === 'checking'"
                  >Full verification commonly takes 1–5 minutes.</small
                >
              </div>
              <div v-if="error && !running" class="release-modal-error" role="alert">
                <strong>{{ error }}</strong>
                <pre v-if="runLog" class="release-output">{{ runLog }}</pre>
                <div class="release-debugger">
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
                  <span v-if="debuggerErr" class="release-debugger-err">{{ debuggerErr }}</span>
                </div>
              </div>
              <label>
                <span class="release-field-label">Next version</span>
                <input
                  v-model.trim="newVersion"
                  placeholder="0.0.0"
                  autofocus
                  @keyup.enter="release"
                />
              </label>
              <div class="release-tag-preview">
                Proposed tag: <code>{{ proposedTag || "—" }}</code>
              </div>
              <label>
                <span class="release-field-label"
                  >Type <code>{{ proposedTag }}</code> to confirm</span
                >
                <input v-model="confirmation" :placeholder="proposedTag" @keyup.enter="release" />
              </label>
            </div>
            <div class="release-actions">
              <Button variant="accent" :disabled="!tagMatches || running" @click="release">{{
                running ? "Release in progress…" : "Commit, verify & push"
              }}</Button>
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
.releases-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
}
.release-card {
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: 12px;
  padding: 20px;
}
.release-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.release-name {
  font-size: 16px;
  font-weight: 700;
}
.release-subtitle,
.release-facts span {
  color: var(--txt-faint);
  font-size: 12px;
}
.release-state {
  color: var(--amber);
  background: var(--amber-tint);
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.release-state.ready {
  color: var(--green);
  background: var(--green-tint);
}
.release-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 22px 0;
}
.release-facts div {
  display: grid;
  gap: 4px;
}
.release-facts b {
  font-family: var(--mono);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.release-blockers {
  border-left: 3px solid var(--amber);
  padding-left: 12px;
  color: var(--txt-dim);
  display: grid;
  gap: 5px;
}
.release-dirty {
  margin-top: 16px;
  border: 1px solid color-mix(in srgb, var(--red) 55%, transparent);
  background: color-mix(in srgb, var(--red) 12%, transparent);
  color: var(--red);
  border-radius: 8px;
  padding: 11px 12px;
  font-size: 13px;
  line-height: 1.45;
}
.release-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 20px;
}
.release-actions a {
  color: var(--cyan);
  font-size: 13px;
}
.release-success {
  color: var(--green);
  margin: 12px 0;
}
.release-error {
  color: var(--red);
  margin: 12px 0;
}
.release-output {
  max-width: 100%;
  max-height: 260px;
  overflow: auto;
  margin: 8px 0 0;
  padding: 10px 12px;
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--txt-dim);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre;
  tab-size: 2;
}
.release-output::-webkit-scrollbar-corner {
  background: transparent;
}
.release-debugger {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.release-modal label {
  display: grid;
  gap: 7px;
  color: var(--txt-dim);
  font-size: 13px;
  margin-top: 16px;
}
.release-modal input {
  max-width: 360px;
  background: var(--input);
  color: var(--txt);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 9px;
  font: inherit;
}
.release-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.release-tag-preview {
  margin-top: 16px;
  color: var(--txt-dim);
  font-size: 13px;
}
.release-empty {
  color: var(--txt-faint);
}
.release-card code {
  font-family: var(--mono);
}
@media (max-width: 720px) {
  .release-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
