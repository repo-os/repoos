<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ArrowUpRight, Sparkles, X } from "lucide-vue-next";
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import { api } from "../api";
import { renderMarkdown } from "../lib/markdown";

interface AvailableRelease {
  currentVersion: string | null;
  latestVersion: string | null;
  available: boolean;
  releaseNotes: string | null;
  releaseUrl: string | null;
}

const release = ref<AvailableRelease | null>(null);
const dismissed = ref(false);
const open = ref(false);
const visible = computed(() => !!release.value?.available && !dismissed.value);
const notesHtml = computed(() =>
  release.value?.releaseNotes ? renderMarkdown(release.value.releaseNotes) : "",
);

onMounted(async () => {
  try {
    release.value = await api<AvailableRelease>("/api/release/available");
  } catch {
    // Update checks are optional and must never interrupt the application.
  }
});

function dismiss(): void {
  dismissed.value = true;
  open.value = false;
}

function showDetails(): void {
  open.value = true;
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
          Review the changes, then open the release instructions when you’re ready.
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
        <div v-if="notesHtml" class="release-update-notes">
          <span class="release-update-notes-label">Release notes</span>
          <div class="release-update-markdown" v-html="notesHtml"></div>
        </div>
        <p v-else class="release-update-muted">Release notes are not available for this release.</p>
        <div class="release-update-actions">
          <DialogClose as-child>
            <Button variant="ghost" size="sm">Not now</Button>
          </DialogClose>
          <Button
            as="a"
            :href="release.releaseUrl ?? 'https://github.com/repo-os/repoos/releases'"
            target="_blank"
            rel="noreferrer"
            variant="accent"
            size="sm"
          >
            Upgrade <ArrowUpRight class="size-[14px]" />
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
  top: calc(14px + var(--safe-top));
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
  color: var(--txt-dim);
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
