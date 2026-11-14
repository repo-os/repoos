<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { ArrowUpRight, Check, Copy, Sparkles, X } from "lucide-vue-next";
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import { api } from "../api";
import { renderMarkdown } from "../lib/markdown";
import { copyToClipboard } from "../lib/clipboard";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import {
  readShotPreviewFixtureFromLocation,
  shotFixtureAvailableRelease,
  shotFixturePinnedAvailableReleaseRef,
} from "../lib/shot-preview-fixtures";
import type { AvailableRelease } from "../types";

/** localStorage key: the version the user dismissed, so the banner stays gone. */
const DISMISSED_KEY = "repoos.releaseUpdate.dismissedVersion";
const RESTART_DISMISSED_KEY = "repoos.restartUpdate.dismissedVersion";

const repo = useRepoStore();
const configStore = useConfigStore();
const release = ref<AvailableRelease | null>(null);
const restartStatus = ref<{
  restartPending: boolean;
  restartWhenIdlePending: boolean;
  runningVersion: string | null;
  installedVersion: string | null;
  activeWork: { agents: number; checks: number };
  supervised: boolean;
  manualCommand: string;
} | null>(null);
const restartPendingAction = ref(false);
const restartOpen = ref(false);
const releaseRun = ref<{ state: string; phase: string | null } | null>(null);
const restartFixtureActive = ref(false);
let restartStatusTimer: ReturnType<typeof setInterval> | null = null;
let releaseRunTimer: ReturnType<typeof setInterval> | null = null;
const dismissed = ref(false);
const open = ref(false);
const copied = ref(false);
const copyFailed = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

const updatesCheckEnabled = computed(() => {
  const v = configStore.form["updates.check"];
  return v === undefined ? true : !!v;
});
const visible = computed(
  () => updatesCheckEnabled.value && !!release.value?.available && !dismissed.value,
);
const restartNoticeVisible = computed(
  () =>
    restartStatus.value?.restartPending &&
    restartOpen.value &&
    releaseRun.value?.state !== "running" &&
    release.value?.latestVersion === restartStatus.value?.installedVersion &&
    (restartFixtureActive.value ||
      (() => {
        try {
          return (
            localStorage.getItem(RESTART_DISMISSED_KEY) !== restartStatus.value?.installedVersion
          );
        } catch {
          return true;
        }
      })()),
);
const notesHtml = computed(() =>
  release.value?.releaseNotes ? renderMarkdown(release.value.releaseNotes) : "",
);
const upgradeCommand = computed(() => release.value?.upgradeCommand ?? "");
// How the command should be described in the dialog — names the actual action
// for a package-manager/source install instead of implying `repoos upgrade` works.
const upgradePrefix = computed(() => {
  switch (release.value?.installKind) {
    case "package-manager":
      return "Update it with the same tool you installed it with:";
    case "source":
      return "Update this checkout from source:";
    default:
      return "Run this in a terminal:";
  }
});

/** Read the remembered dismissed version, tolerating disabled/blocked storage. */
function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** Remember (or clear) the dismissed version, ignoring storage failures. */
function writeDismissedVersion(version: string | null): void {
  try {
    if (version) localStorage.setItem(DISMISSED_KEY, version);
    else localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Private mode or a blocked store: dismissal then only lasts this page load.
  }
}

onMounted(async () => {
  const fixtureState = readShotPreviewFixtureFromLocation(window.location);
  const restartFixture =
    fixtureState === "release:restartPendingLight" || fixtureState === "release:restartPendingDark";
  if (restartFixture) {
    restartFixtureActive.value = true;
    release.value = {
      currentVersion: "0.5.78",
      latestVersion: "0.5.79",
      available: false,
      releaseNotes: null,
      releaseUrl: null,
      installKind: "source",
      upgradeCommand: "just upgrade",
    };
    restartStatus.value = {
      restartPending: true,
      restartWhenIdlePending: false,
      runningVersion: "0.5.78",
      installedVersion: "0.5.79",
      activeWork: { agents: 2, checks: 1 },
      supervised: true,
      manualCommand: "repoos restart",
    };
    restartOpen.value = true;
    releaseRun.value = { state: "idle", phase: null };
    document.documentElement.dataset.theme = fixtureState.endsWith("Dark") ? "dark" : "light";
  }
  if (!restartFixture) {
    try {
      restartStatus.value = await api<typeof restartStatus.value>("/api/update-status");
    } catch {
      /* optional */
    }
  }
  if (restartStatus.value?.restartPending) restartOpen.value = true;
  try {
    releaseRun.value = await api("/api/release/run");
  } catch {
    releaseRun.value = { state: "running", phase: null };
  }
  if (!restartFixture) {
    releaseRunTimer = setInterval(async () => {
      try {
        releaseRun.value = await api("/api/release/run");
      } catch {
        releaseRun.value = { state: "running", phase: null };
      }
    }, 3000);
  }
  watch(restartStatus, (status) => {
    if (status?.restartPending) restartOpen.value = true;
  });
  if (!restartFixture)
    restartStatusTimer = setInterval(async () => {
      try {
        restartStatus.value = await api("/api/update-status");
      } catch {
        /* reconnecting */
      }
    }, 3000);
  if (applyShotFixture()) return;
  if (!restartFixture) {
    try {
      release.value = await api<AvailableRelease>("/api/release/available");
    } catch {
      // Update checks are optional and must never interrupt the application.
    }
  }
  // A capture can mount before `/api/health` reports the preview build, so the
  // real fetch above may have landed first with `available: false`. Re-check
  // the fixture here; the health watch below catches the rest (#1073).
  if (applyShotFixture()) return;
  // Stay dismissed until a *newer* version appears: only re-show when the
  // available version differs from the one the user dismissed (#1073).
  if (release.value?.available) {
    dismissed.value = readDismissedVersion() === release.value.latestVersion;
  }
});

async function restartInstalled(whenIdle = false, cancel = false): Promise<void> {
  restartPendingAction.value = true;
  try {
    await api("/api/update-status/restart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ whenIdle, cancel }),
    });
  } finally {
    restartPendingAction.value = false;
    // The replacement server reconnects through the app's existing health loop.
    setTimeout(async () => {
      try {
        restartStatus.value = await api("/api/update-status");
      } catch {
        /* reconnecting */
      }
    }, 1500);
  }
}
function dismissRestartNotice(): void {
  try {
    if (restartStatus.value?.installedVersion)
      localStorage.setItem(RESTART_DISMISSED_KEY, restartStatus.value.installedVersion);
  } catch {
    /* dismissal lasts until reload */
  }
}

// The preview capture mounts this component before App's own fixture pass runs
// (children mount first), so health alone is not enough — a capture that waited
// on it lost the race against the live `/api/release/available` fetch and never
// opened the dialog (#1073). Read the fixture both from the URL (when health
// already knows it is a preview build) and from the App-pinned payload, which
// arrives reactively. Returns true when it seeded.
function applyShotFixture(): boolean {
  const fixture =
    shotFixturePinnedAvailableReleaseRef.value ??
    (repo.health?.isPreviewBuild
      ? shotFixtureAvailableRelease(readShotPreviewFixtureFromLocation(window.location))
      : null);
  if (!fixture) return false;
  release.value = fixture;
  // A capture needs the dialog already open: the fixture stands in for the
  // click that would otherwise open it.
  open.value = true;
  return true;
}

// The App applies `?shotState=` fixtures after this component mounts, so watch
// the pinned payload rather than depending on `/api/health` timing.
watch(shotFixturePinnedAvailableReleaseRef, (pinned) => {
  if (pinned) applyShotFixture();
});

watch(
  () => repo.health?.isPreviewBuild,
  (isPreview) => {
    if (isPreview) applyShotFixture();
  },
);

function dismiss(): void {
  dismissed.value = true;
  open.value = false;
  if (release.value?.latestVersion) writeDismissedVersion(release.value.latestVersion);
}

function showDetails(): void {
  open.value = true;
}

async function copyCommand(): Promise<void> {
  // An empty command has nothing to copy, so it counts as a failed copy.
  const ok = upgradeCommand.value !== "" && (await copyToClipboard(upgradeCommand.value));
  if (copiedTimer) clearTimeout(copiedTimer);
  // A failed copy must say so — silently doing nothing looks like a dead button
  // (#1073 review).
  copied.value = ok;
  copyFailed.value = !ok;
  copiedTimer = setTimeout(() => {
    copied.value = false;
    copyFailed.value = false;
  }, 2000);
}

async function copyRestartCommand(): Promise<void> {
  const command = restartStatus.value?.manualCommand ?? "";
  const ok = command !== "" && (await copyToClipboard(command));
  if (copiedTimer) clearTimeout(copiedTimer);
  copied.value = ok;
  copyFailed.value = !ok;
  copiedTimer = setTimeout(() => {
    copied.value = false;
    copyFailed.value = false;
  }, 2000);
}

onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer);
  if (restartStatusTimer) clearInterval(restartStatusTimer);
  if (releaseRunTimer) clearInterval(releaseRunTimer);
});
</script>

<template>
  <Teleport to="body">
    <Dialog v-model:open="restartOpen">
      <DialogOverlay />
      <DialogContent
        v-if="restartNoticeVisible"
        class="am-modal release-update-modal"
        data-test-id="installed-restart-notice"
      >
        <div class="release-update-modal-head">
          <DialogTitle>RepoOS v{{ restartStatus.installedVersion }} is installed</DialogTitle>
          <DialogClose
            class="release-update-close"
            aria-label="Dismiss restart notice"
            @click="dismissRestartNotice"
            ><X class="size-[17px]"
          /></DialogClose>
        </div>
        <DialogDescription class="release-update-description">
          This server is still running v{{ restartStatus.runningVersion }}.
          {{ restartStatus.activeWork.agents }} agents and
          {{ restartStatus.activeWork.checks }} checks running. Restart now briefly interrupts work;
          see <a href="https://github.com/repo-os/repoos/issues/214">#0214</a> for how agents
          resume.
        </DialogDescription>
        <div class="release-update-actions">
          <template v-if="restartStatus.supervised">
            <template v-if="!restartStatus.restartWhenIdlePending">
              <Button size="sm" :disabled="restartPendingAction" @click="void restartInstalled()"
                >Restart now</Button
              >
              <Button
                size="sm"
                variant="ghost"
                :disabled="restartPendingAction"
                @click="void restartInstalled(true)"
                >Restart when idle</Button
              >
            </template>
            <template v-else
              ><span role="status"
                >Restart is waiting for agents, reviews and checks to finish.</span
              ><Button
                size="sm"
                variant="ghost"
                :disabled="restartPendingAction"
                @click="void restartInstalled(false, true)"
                >Cancel</Button
              ></template
            >
          </template>
          <div v-else class="release-update-manual">
            <p class="release-update-muted">
              This server is not supervised. Copy the command and run it in a terminal to restart
              safely.
            </p>
            <code class="release-update-code">{{ restartStatus.manualCommand }}</code>
            <Button
              size="sm"
              variant="ghost"
              :aria-label="copied ? 'Copied restart command' : 'Copy restart command'"
              @click="void copyRestartCommand()"
              ><Check v-if="copied" class="size-[14px]" /><Copy v-else class="size-[14px]" />{{
                copied ? "Copied" : "Copy restart command"
              }}</Button
            >
            <p v-if="copyFailed" class="release-update-muted" role="status">
              Couldn’t copy automatically — select the command above and copy it.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <div
      v-if="visible"
      class="release-update-banner"
      role="button"
      tabindex="0"
      aria-label="View available RepoOS update"
      @click="showDetails"
      @keydown.enter="showDetails"
      @keydown.space.prevent="showDetails"
    >
      <span class="release-update-mark"><Sparkles class="size-[15px]" /></span>
      <span class="release-update-copy">
        <strong>RepoOS {{ release?.latestVersion }} is ready</strong>
        <span>See what’s new and upgrade when it suits you.</span>
      </span>
      <ArrowUpRight class="release-update-arrow size-[16px]" />
      <button
        type="button"
        class="release-update-dismiss"
        aria-label="Dismiss update notification"
        @click.stop="dismiss"
      >
        <X class="size-[15px]" />
      </button>
    </div>

    <Dialog v-model:open="open">
      <DialogOverlay />
      <DialogContent v-if="release?.available" class="am-modal release-update-modal">
        <div class="release-update-modal-head">
          <span class="release-update-mark"><Sparkles class="size-[17px]" /></span>
          <DialogClose class="release-update-close" aria-label="Close">
            <X class="size-[17px]" />
          </DialogClose>
        </div>
        <p class="release-update-eyebrow">A fresh build has landed</p>
        <DialogTitle>Upgrade to RepoOS {{ release.latestVersion }}</DialogTitle>
        <DialogDescription class="release-update-description">
          Copy the command to upgrade, or read what changed in the release notes.
        </DialogDescription>
        <div class="release-update-versions">
          <div>
            <span>Installed</span><strong>{{ release.currentVersion ?? "unknown" }}</strong>
          </div>
          <ArrowUpRight class="size-[16px]" />
          <div>
            <span>Available</span><strong>{{ release.latestVersion }}</strong>
          </div>
        </div>
        <div class="release-update-upgrade" data-test-id="release-upgrade-command">
          <span class="release-update-upgrade-label">How to upgrade</span>
          <p class="release-update-upgrade-hint">{{ upgradePrefix }}</p>
          <div class="release-update-code-row">
            <code class="release-update-code">{{ upgradeCommand }}</code>
            <Button
              variant="ghost"
              size="sm"
              :aria-label="
                copied
                  ? 'Copied upgrade command'
                  : copyFailed
                    ? 'Copy failed — select the command and copy it manually'
                    : 'Copy upgrade command'
              "
              @click="void copyCommand()"
            >
              <Check v-if="copied" class="size-[14px]" />
              <Copy v-else class="size-[14px]" />
              {{ copied ? "Copied" : copyFailed ? "Copy failed" : "Copy" }}
            </Button>
          </div>
          <p v-if="copyFailed" class="release-update-muted" role="status">
            Couldn’t copy automatically — select the command above and copy it.
          </p>
          <p class="release-update-muted">
            Runs in your terminal. The dashboard will show when the installed version is waiting for
            a server restart.
          </p>
        </div>
        <div v-if="notesHtml" class="release-update-notes">
          <span class="release-update-notes-label">Release notes</span>
          <div class="release-update-markdown" v-html="notesHtml"></div>
        </div>
        <p v-else class="release-update-muted">Release notes are not available for this release.</p>
        <div class="release-update-actions">
          <DialogClose as-child>
            <Button variant="ghost" size="sm" @click="dismiss">Not now</Button>
          </DialogClose>
          <Button
            as="a"
            :href="release.releaseUrl ?? 'https://github.com/repo-os/repoos/releases'"
            target="_blank"
            rel="noreferrer"
            variant="accent"
            size="sm"
          >
            Release notes <ArrowUpRight class="size-[14px]" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </Teleport>
</template>

<style scoped>
.release-update-manual {
  display: grid;
  gap: 10px;
  width: 100%;
}
.release-update-modal {
  display: flex;
  flex-direction: column;
  width: min(520px, calc(100vw - 40px));
  max-height: min(680px, calc(100vh - 40px));
  overflow: hidden;
  padding: 24px;
  border: 1px solid var(--border-bright);
  border-radius: 16px;
  background: var(--panel-solid);
  /* hardcode-ok: border/shadow tint — decoration, never a text color */
  box-shadow: 0 24px 70px -25px #000;
}
.release-update-modal-head {
  display: flex;
  justify-content: space-between;
}
.release-update-eyebrow {
  margin: 20px 0 5px;
  color: var(--violet);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.release-update-description {
  margin-top: 6px;
  font-size: 12px;
}
.release-update-versions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 22px 0;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--violet);
}
.release-update-versions div {
  display: grid;
  gap: 3px;
  flex: 1;
}
.release-update-versions span,
.release-update-notes-label {
  color: var(--txt-faint);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.release-update-versions strong {
  color: var(--txt);
  font-size: 15px;
}
.release-update-upgrade {
  margin-bottom: 22px;
}
.release-update-upgrade-label {
  color: var(--txt-faint);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.release-update-upgrade-hint {
  margin: 6px 0 8px;
  color: var(--txt-dim);
  font-size: 12px;
}
.release-update-code-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.release-update-code {
  flex: 1 1 auto;
  display: block;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-2);
  color: var(--txt);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.release-update-upgrade .release-update-muted {
  margin: 8px 0 0;
}
.release-update-notes {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}
.release-update-markdown {
  margin-top: 8px;
  color: var(--txt-dim);
  font-size: 12px;
  line-height: 1.55;
}
.release-update-markdown :deep(p) {
  margin: 0 0 12px;
}
.release-update-markdown :deep(ul),
.release-update-markdown :deep(ol) {
  margin: 0 0 12px;
  padding-left: 1.5em;
}
.release-update-markdown :deep(li) {
  margin: 0 0 6px;
}
.release-update-markdown :deep(li:last-child) {
  margin-bottom: 0;
}
.release-update-markdown :deep(a) {
  color: var(--cyan);
}
.release-update-muted {
  color: var(--txt-dim);
  font-size: 12px;
}
.release-update-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}
@media (max-width: 560px) {
  .release-update-modal {
    padding: 20px;
  }
}
</style>
