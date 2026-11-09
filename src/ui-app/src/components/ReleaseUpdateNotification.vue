<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
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
import {
  readShotPreviewFixtureFromLocation,
  shotFixtureAvailableRelease,
} from "../lib/shot-preview-fixtures";
import type { AvailableRelease } from "../types";

/** localStorage key: the version the user dismissed, so the banner stays gone. */
const DISMISSED_KEY = "repoos.releaseUpdate.dismissedVersion";

const repo = useRepoStore();
const release = ref<AvailableRelease | null>(null);
const dismissed = ref(false);
const open = ref(false);
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

const visible = computed(() => !!release.value?.available && !dismissed.value);
const notesHtml = computed(() =>
  release.value?.releaseNotes ? renderMarkdown(release.value.releaseNotes) : "",
);
const upgradeCommand = computed(() => release.value?.upgradeCommand ?? "repoos upgrade");
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
  if (applyShotFixture()) return;
  try {
    release.value = await api<AvailableRelease>("/api/release/available");
  } catch {
    // Update checks are optional and must never interrupt the application.
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

// The preview capture may mount before `/api/health` has reported the preview
// build, so re-check the fixture once health arrives — otherwise the dialog
// would never open for the shot (#1073). Returns true when it seeded. The
// fixture must override whatever the real `/api/release/available` returned
// (the preview build usually reports no update), so this runs on every health
// change rather than only while `release` is still empty.
function applyShotFixture(): boolean {
  const fixture = repo.health?.isPreviewBuild
    ? shotFixtureAvailableRelease(readShotPreviewFixtureFromLocation(window.location))
    : null;
  if (!fixture) return false;
  release.value = fixture;
  // A capture needs the dialog already open: the fixture stands in for the
  // click that would otherwise open it.
  open.value = true;
  return true;
}

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
  const ok = await copyToClipboard(upgradeCommand.value);
  if (!ok) return;
  copied.value = true;
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <Teleport to="body">
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
              :aria-label="copied ? 'Copied upgrade command' : 'Copy upgrade command'"
              @click="void copyCommand()"
            >
              <Check v-if="copied" class="size-[14px]" />
              <Copy v-else class="size-[14px]" />
              {{ copied ? "Copied" : "Copy" }}
            </Button>
          </div>
          <p class="release-update-muted">
            Runs in your terminal. A server already running keeps the old version until you restart
            it.
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
.release-update-banner {
  position: fixed;
  z-index: 80;
  top: calc(54px + 10px + var(--safe-top));
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(430px, calc(100vw - 28px));
  padding: 9px 11px;
  transform: translateX(-50%);
  border: 1px solid var(--violet-border-tint);
  border-radius: 10px;
  background: color-mix(in srgb, var(--panel-solid) 94%, var(--violet) 6%);
  color: var(--txt);
  text-align: left;
  box-shadow: 0 12px 30px -16px rgba(0, 0, 0, 0.8);
  cursor: pointer;
}
.release-update-mark {
  display: grid;
  place-items: center;
  flex: none;
  color: var(--violet);
}
.release-update-copy {
  display: grid;
  gap: 1px;
  flex: 1;
  min-width: 0;
}
.release-update-copy strong {
  font-size: 12px;
}
.release-update-copy span {
  /* Use the full-contrast text token, not --txt-dim: the banner background is
     a violet-tinted panel mix, and gruvbox-light's --txt-dim only reaches
     4.39:1 on it (the rendered contrast audit caught this). */
  color: var(--txt);
  font-size: 11px;
}
.release-update-arrow {
  color: var(--txt-dim);
  flex: none;
}
.release-update-dismiss,
.release-update-close {
  display: grid;
  place-items: center;
  color: var(--txt-dim);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.release-update-dismiss {
  padding: 3px;
  border-radius: 5px;
}
.release-update-dismiss:hover,
.release-update-close:hover {
  color: var(--txt);
  background: var(--nav-hover-bg);
}
.release-update-modal {
  width: min(520px, calc(100vw - 40px));
  max-height: min(680px, calc(100vh - 40px));
  overflow: auto;
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
  flex: 1 1 100%;
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
  margin: 0 0 8px;
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
  .release-update-banner {
    top: calc(8px + var(--safe-top));
  }
  .release-update-modal {
    padding: 20px;
  }
}
</style>
