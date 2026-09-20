<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Bug, Check, Copy, Sparkles } from "lucide-vue-next";
import { copyToClipboard } from "../lib/clipboard";
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
  latestStableTag: string | null;
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

/** One configured `[[distribution]]` destination and its live version state. */
interface DistributionChannel {
  name: string;
  kind: string | null;
  url: string | null;
  install: string[];
  version: string | null;
  state: "matching" | "out-of-sync" | "unverified" | "unavailable" | "failed";
  detail: string | null;
}

interface DistributionSummary {
  releaseVersion: string | null;
  releaseTag: string | null;
  channels: DistributionChannel[];
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

const status = ref<ReleaseStatus | null>(null);
const loading = ref(true);
const running = ref(false);
const confirmOpen = ref(false);
const newVersion = ref("");
const message = ref("");
const error = ref("");
/** Optional release notes; empty means the cut ships with none (the default). */
const notes = ref("");
const generatingNotes = ref(false);
const notesError = ref("");
/** Full command output from a failed release phase (repoos check log, build errors). */
const runLog = ref("");
const debuggerSending = ref(false);
const debuggerSent = ref(false);
const debuggerErr = ref("");
const run = ref<ReleaseRun | null>(null);
const now = ref(Date.now());
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** "Published to" destinations for the release being viewed (empty when none). */
const distribution = ref<DistributionChannel[]>([]);
const distributionReleaseVersion = ref<string | null>(null);
const distributionLoading = ref(false);
const copiedCommand = ref("");
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const distributionSync = computed(() => {
  if (!distribution.value.length) return null;
  if (distribution.value.every((channel) => channel.state === "matching")) {
    return { state: "matching", label: "All distribution destinations in sync" };
  }
  return { state: "attention", label: "Some distribution destinations need attention" };
});

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
/** A semver "-" introduces a prerelease identifier (beta/canary/rc/...). */
const isPrerelease = computed(() => !!publishedTag.value?.includes("-"));
/** Only worth a separate line when the shown tag IS a prerelease and there's a different stable one to point at. */
const lastStableTag = computed(() =>
  isPrerelease.value && status.value?.latestStableTag !== publishedTag.value
    ? (status.value?.latestStableTag ?? null)
    : null,
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
/** The version being typed carries a prerelease identifier (-beta.N / -canary.N / -rc.N / …). */
const newIsPrerelease = computed(() => newVersion.value.includes("-"));
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

type Phase = "releasing" | "blocked" | "prerelease" | "published" | "ready";
const phase = computed<Phase>(() => {
  if (running.value) return "releasing";
  if (blockers.value.length) return "blocked";
  if (status.value?.released) return isPrerelease.value ? "prerelease" : "published";
  return "ready";
});
const phaseLabel = computed(
  () =>
    ({
      releasing: "Releasing…",
      blocked: "Blocked",
      prerelease: "Prerelease",
      published: "Published",
      ready: "Ready",
    })[phase.value],
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

/**
 * Load the distribution summary separately from the release status. Its
 * lookups can be slow or fail, and neither must affect the page, so a failure
 * simply hides the section.
 */
async function loadDistribution(): Promise<void> {
  distributionLoading.value = true;
  try {
    const data = await api<DistributionSummary>("/api/release/distribution");
    distribution.value = data.channels ?? [];
    distributionReleaseVersion.value = data.releaseVersion ?? null;
  } catch {
    distribution.value = [];
    distributionReleaseVersion.value = null;
  } finally {
    distributionLoading.value = false;
  }
}

const CHANNEL_STATE_LABELS: Record<DistributionChannel["state"], string> = {
  matching: "Up to date",
  "out-of-sync": "Out of sync",
  unverified: "Unverified",
  unavailable: "Not published yet",
  failed: "Check failed",
};

function channelStateLabel(channel: DistributionChannel): string {
  return CHANNEL_STATE_LABELS[channel.state] ?? "Unverified";
}

/** A one-line, honest status for a channel — never claims a version it can't confirm. */
function channelSummary(channel: DistributionChannel): string {
  switch (channel.state) {
    case "matching":
      return channel.version ? `${channel.version} · matches this release` : "Matches this release";
    case "out-of-sync":
      return channel.version
        ? `${channel.version} · release is ${distributionReleaseVersion.value ?? "different"}`
        : "Out of sync with this release";
    case "unavailable":
      return channel.detail ?? "No version published on this channel yet";
    case "failed":
      return channel.detail ?? "The registry couldn't be reached";
    default:
      return channel.version
        ? `${channel.version} · not compared to a release`
        : "No automatic version check for this channel";
  }
}

/** Derive a short tab label from the command itself (npm, bun, curl, …). */
function installLabel(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "";
}

async function copyCommand(command: string): Promise<void> {
  if (!(await copyToClipboard(command))) return;
  copiedCommand.value = command;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copiedCommand.value = ""), 1600);
}

function openConfirm(): void {
  message.value = "";
  error.value = "";
  runLog.value = "";
  newVersion.value = "";
  notes.value = "";
  notesError.value = "";
  generatingNotes.value = false;
  debuggerSent.value = false;
  debuggerErr.value = "";
  confirmOpen.value = true;
}

/**
 * Ask the server to draft notes from the commits since the last release and
 * drop the draft into the text area. Purely fills the field — it never cuts a
 * release, and a failure leaves whatever the operator typed untouched so the
 * cut can still proceed.
 */
async function generateNotes(): Promise<void> {
  if (generatingNotes.value || running.value) return;
  // Generation replaces the field, so confirm first when that would discard
  // something the operator typed.
  if (
    notes.value.trim() &&
    !confirm("Replace the release notes you've typed with an AI-generated draft?")
  ) {
    return;
  }
  generatingNotes.value = true;
  notesError.value = "";
  try {
    const result = await api<{ notes: string; sinceTag: string | null; commitCount: number }>(
      "/api/release/notes",
      JSON_OPTS("POST", { version: newVersion.value || suggestedVersion.value || undefined }),
    );
    if (result.notes.trim()) {
      notes.value = result.notes;
    } else {
      notesError.value = result.sinceTag
        ? `No commits since ${result.sinceTag} to draft from.`
        : "No commits to draft from.";
    }
  } catch (err) {
    notesError.value = err instanceof Error ? err.message : String(err);
  } finally {
    generatingNotes.value = false;
  }
}

async function release(): Promise<void> {
  if (!newVersionValid.value || running.value) return;
  running.value = true;
  error.value = "";
  runLog.value = "";
  notesError.value = "";
  debuggerSent.value = false;
  debuggerErr.value = "";
  try {
    const result = await api<{ run: ReleaseRun }>(
      "/api/release",
      JSON_OPTS("POST", {
        version: newVersion.value,
        confirmTag: newTag.value,
        notes: notes.value.trim() || undefined,
      }),
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
      await Promise.all([load(), loadDistribution()]);
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
  void loadDistribution();
  void pollRun();
  startPolling();
});
onBeforeUnmount(() => {
  stopPolling();
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <div class="releases-page">
    <header class="rel-head">
      <div>
        <h1 class="rel-title">Releases</h1>
        <p class="rel-sub">Cut and track tagged releases of this repository.</p>
      </div>
      <div class="rel-actions rel-head-actions">
        <a
          class="rel-link"
          href="https://docs.repoos.org/deployments-and-releases"
          target="_blank"
          rel="noreferrer"
          >Release guide ↗</a
        >
        <a class="rel-link" href="/settings?tab=toml">Edit release config</a>
        <Button variant="ghost" size="sm" :disabled="loading" @click="load">Refresh</Button>
      </div>
    </header>

    <div v-if="loading" class="spin"></div>
    <p v-else-if="error && !status" class="rel-error">{{ error }}</p>

    <template v-else-if="status">
      <div v-if="!status.enabled" class="rel-card rel-empty">
        Releases aren't configured for this repository. Add a <code>[release]</code> block in
        <a class="rel-link" href="/settings?tab=toml">repoos.toml</a> to turn this page on.
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

          <div class="rel-current-release">
            <div class="rel-current-version">
              <span class="rel-current-label">Current release</span>
              <span class="rel-current-number">{{ publishedTag ?? "Not released yet" }}</span>
              <span v-if="status.released" class="rel-current-meta">
                shipped {{ relativeTime(status.latestTagAt) || "—" }}
                <template v-if="status.latestTagSha">
                  · <code>{{ status.latestTagSha }}</code>
                </template>
              </span>
              <span v-else-if="status.latestTag" class="rel-current-meta">
                last tag · {{ relativeTime(status.latestTagAt) || "—" }}
              </span>
              <span v-if="lastStableTag" class="rel-current-meta">
                last stable · <code>{{ lastStableTag }}</code>
              </span>
            </div>
            <span
              v-if="distributionSync"
              class="rel-current-sync"
              :data-state="distributionSync.state"
              >{{ distributionSync.label }}</span
            >
          </div>

          <div class="rel-context">
            <template v-if="status.head">
              from <code>{{ status.head }}</code> on <code>{{ status.branch }}</code>
            </template>
          </div>

          <div v-if="blockers.length" class="rel-blockers">
            <div v-for="b in blockers" :key="b">{{ b }}</div>
          </div>

          <div class="rel-next-release">
            <div>
              <span class="rel-next-label">Next release</span>
              <strong>{{ suggestedTag ?? "—" }}</strong>
              <span class="rel-next-hint">{{
                pendingVersion ? "ready to cut" : "suggested when ready"
              }}</span>
            </div>
            <div class="rel-actions rel-next-actions">
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
          </div>
        </section>

        <!-- Where users install this release. Rendered only when the project
             declares [[distribution]] destinations; nothing otherwise. -->
        <section v-if="distribution.length" class="rel-card rel-dist">
          <div class="rel-dist-head">
            <div class="rel-dist-title-row">
              <h2 class="rel-dist-title">Published to</h2>
              <Button
                variant="outline"
                size="sm"
                :disabled="distributionLoading"
                @click="loadDistribution"
              >
                {{ distributionLoading ? "Checking…" : "Check again" }}
              </Button>
            </div>
            <p class="rel-dist-sub">
              Where people can install this release.
              <template v-if="distributionReleaseVersion">
                Comparing each channel to <code>{{ distributionReleaseVersion }}</code
                >.
              </template>
              Registry and package-manager updates can take several minutes after CI succeeds.
            </p>
          </div>

          <div class="rel-dist-channels">
            <article v-for="channel in distribution" :key="channel.name" class="rel-channel">
              <header class="rel-channel-head">
                <a
                  v-if="channel.url"
                  class="rel-channel-name"
                  :href="channel.url"
                  target="_blank"
                  rel="noreferrer"
                  >{{ channel.name }} ↗</a
                >
                <span v-else class="rel-channel-name">{{ channel.name }}</span>
                <span class="rel-channel-state" :data-state="channel.state">{{
                  channelStateLabel(channel)
                }}</span>
              </header>
              <p class="rel-channel-detail">{{ channelSummary(channel) }}</p>
              <ul v-if="channel.install.length" class="rel-installs">
                <li v-for="command in channel.install" :key="command" class="rel-install">
                  <span class="rel-install-label">{{ installLabel(command) }}</span>
                  <code class="rel-install-cmd">{{ command }}</code>
                  <button
                    type="button"
                    class="rel-copy"
                    :aria-label="`Copy ${channel.name} install command`"
                    @click="copyCommand(command)"
                  >
                    <Check
                      v-if="copiedCommand === command"
                      class="rel-copy-ico"
                      aria-hidden="true"
                    />
                    <Copy v-else class="rel-copy-ico" aria-hidden="true" />
                    {{ copiedCommand === command ? "Copied" : "Copy" }}
                  </button>
                </li>
              </ul>
            </article>
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
                    inputmode="text"
                    autocapitalize="none"
                    autocorrect="off"
                    spellcheck="false"
                    autofocus
                    @keyup.enter="release"
                  />
                  <span class="rel-version-tag" :class="{ dim: !newVersion, pre: newIsPrerelease }">
                    → {{ newTag || `${tagPrefix}${suggestedVersion ?? "0.0.0"}` }}
                    <template v-if="newIsPrerelease"> · prerelease</template>
                  </span>
                </div>
                <div class="rel-field-hint">
                  <span>Just the number — no “{{ tagPrefix }}”.</span>
                  <span>
                    <b>Prerelease channel:</b> append <code>-beta.1</code> /
                    <code>-canary.1</code> / <code>-rc.1</code>.
                  </span>
                  <span>
                    CI flags it pre-release — users opt in with
                    <code>repoos upgrade --channel &lt;name&gt;</code>.
                  </span>
                </div>
              </label>

              <div v-if="!running" class="rel-notes-field">
                <div class="rel-notes-head">
                  <label class="rel-field-label" for="rel-notes">
                    Release notes <span class="rel-optional">optional</span>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    :disabled="generatingNotes"
                    @click="generateNotes"
                  >
                    <Sparkles class="btn-ico" aria-hidden="true" />
                    {{ generatingNotes ? "Drafting…" : "Generate with AI" }}
                  </Button>
                </div>
                <textarea
                  id="rel-notes"
                  v-model="notes"
                  class="rel-notes-input"
                  rows="6"
                  placeholder="What's in this release? Type it here, generate a draft from the commits since the last release, or leave empty."
                ></textarea>
                <div v-if="notesError" class="rel-notes-error" role="alert">{{ notesError }}</div>
              </div>
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
.rel-head-actions {
  margin: 0;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
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
.rel-pill[data-phase="prerelease"] {
  color: var(--amber);
  background: var(--amber-tint);
  border-color: var(--amber-border-tint);
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

/* The page answers "what is live now?" before offering the next cut. */
.rel-current-release {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin: 26px 0 14px;
  flex-wrap: wrap;
}
.rel-current-version {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.rel-current-label,
.rel-next-label {
  color: var(--txt-faint);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rel-current-number {
  font-family: var(--mono);
  font-weight: 700;
  line-height: 1;
  color: var(--txt);
  font-size: clamp(32px, 5vw, 48px);
}
.rel-current-meta {
  font-size: 11.5px;
  color: var(--txt-faint);
}
.rel-current-meta code {
  font-family: var(--mono);
  color: var(--txt-dim);
}
.rel-current-sync {
  margin-top: 8px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.rel-current-sync[data-state="matching"] {
  color: var(--green);
  background: var(--green-tint);
  border-color: var(--green-border-tint);
}
.rel-current-sync[data-state="attention"] {
  color: var(--amber);
  background: var(--amber-tint);
  border-color: var(--amber-border-tint);
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

.rel-next-release {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 22px;
  padding: 15px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-2);
}
.rel-next-release > div:first-child {
  display: grid;
  align-items: baseline;
  gap: 2px 10px;
  grid-template-columns: auto auto;
}
.rel-next-release strong {
  color: var(--txt-dim);
  font-family: var(--mono);
  font-size: 17px;
}
.rel-next-hint {
  grid-column: 1 / -1;
  color: var(--txt-faint);
  font-size: 11.5px;
}

.rel-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 22px;
  flex-wrap: wrap;
}
.rel-next-actions {
  margin-top: 0;
  justify-content: flex-end;
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

/* "Published to" — distribution destinations, quiet beside the release card. */
.rel-dist {
  margin-top: 16px;
}
.rel-dist-head {
  margin-bottom: 16px;
}
.rel-dist-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rel-dist-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0;
  letter-spacing: 0.01em;
}
.rel-dist-sub {
  color: var(--txt-faint);
  font-size: 12px;
  margin: 4px 0 0;
}
.rel-dist-sub code {
  font-family: var(--mono);
  color: var(--txt-dim);
}
.rel-dist-channels {
  display: grid;
  gap: 12px;
}
.rel-channel {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--bg-2);
}
.rel-channel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rel-channel-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--txt);
  text-decoration: none;
}
a.rel-channel-name:hover {
  color: var(--cyan);
  text-decoration: underline;
}
.rel-channel-state {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border: 1px solid transparent;
}
.rel-channel-state[data-state="matching"] {
  color: var(--green);
  background: var(--green-tint);
  border-color: var(--green-border-tint);
}
.rel-channel-state[data-state="out-of-sync"] {
  color: var(--amber);
  background: var(--amber-tint);
  border-color: var(--amber-border-tint);
}
.rel-channel-state[data-state="failed"] {
  color: var(--red);
  background: var(--red-tint);
  border-color: var(--red-border-tint);
}
.rel-channel-state[data-state="unavailable"],
.rel-channel-state[data-state="unverified"] {
  color: var(--txt-dim);
  background: var(--btn-new-bg);
  border-color: var(--border);
}
.rel-channel-detail {
  color: var(--txt-faint);
  font-size: 12px;
  margin: 5px 0 0;
}
.rel-installs {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.rel-install {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rel-install-label {
  flex-shrink: 0;
  width: 46px;
  font-size: 11px;
  font-weight: 700;
  color: var(--txt-faint);
}
.rel-install-cmd {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--txt-dim);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 6px 9px;
}
.rel-copy {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  background: var(--btn-new-bg);
  color: var(--txt-dim);
  border-radius: 7px;
  padding: 5px 9px;
  font-size: 11px;
  cursor: pointer;
}
.rel-copy:hover {
  border-color: var(--border-bright);
  color: var(--txt);
}
.rel-copy-ico {
  width: 12px;
  height: 12px;
}

@media (max-width: 560px) {
  .rel-current-release,
  .rel-next-release {
    flex-direction: column;
    align-items: stretch;
  }
  .rel-current-sync {
    align-self: flex-start;
    margin-top: 0;
  }
  .rel-next-actions {
    justify-content: flex-start;
  }
}
</style>
