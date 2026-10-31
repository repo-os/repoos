<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useRepoStore } from "./stores/repo";
import { useDocsStore } from "./stores/docs";
import { useConfigStore } from "./stores/config";
import { useAuthStore } from "./stores/auth";
import { useNoticesStore } from "./stores/notices";
import TopBar from "./components/TopBar.vue";
import Sidebar from "./components/Sidebar.vue";
import MobileTabs from "./components/MobileTabs.vue";
import TaskDrawer from "./components/TaskDrawer.vue";
import TunnelDrawer from "./components/TunnelDrawer.vue";
import RemoteValidationDrawer from "./components/RemoteValidationDrawer.vue";
import ToastPanel from "./components/ToastPanel.vue";
import FloatingHeads from "./components/FloatingHeads.vue";
import NewInputPanel from "./components/NewInputPanel.vue";
import UiRecoveryBanner from "./components/UiRecoveryBanner.vue";
import CopyInspectorOverlay from "./components/CopyInspectorOverlay.vue";
import ReleaseUpdateNotification from "./components/ReleaseUpdateNotification.vue";
import DependencyOverrideDialog from "./components/DependencyOverrideDialog.vue";
import PageSkeleton from "./components/PageSkeleton.vue";
import { loadingPageHeader, loadingSkeletonKind } from "./lib/loading-skeleton";
import { configureUiRecovery, checkUiBuild, showOffline } from "./lib/uiRecovery";
import {
  applyShotPreviewConfigFixture,
  applyShotPreviewFixture,
  isShotPreviewConfigFixture,
  readShotPreviewFixtureFromLocation,
} from "./lib/shot-preview-fixtures";
import { useUiStore } from "./stores/ui";

const route = useRoute();
const repo = useRepoStore();
const docs = useDocsStore();
const config = useConfigStore();
const auth = useAuthStore();
const ui = useUiStore();
const notices = useNoticesStore();

// Routes marked `public` (currently just /login) render as a standalone
// full-viewport screen with no app chrome — the visitor isn't authenticated
// yet, and the sidebar/topbar assume a signed-in session.
const isPublicRoute = computed(() => route.meta.public === true || route.meta.fullscreen === true);
const loadingKind = computed(() => loadingSkeletonKind(route.path));
const loadingHeader = computed(() => loadingPageHeader(route.path));

const onApiTimeout = (event: Event): void => {
  const detail = (event as CustomEvent<string>).detail;
  showOffline(detail);
};

onMounted(async () => {
  configureUiRecovery({
    isDirty: () =>
      config.rawDirty ||
      ui.pendingScreenshots.length > 0 ||
      ui.inputScreenshots.length > 0 ||
      ui.inputText.trim().length > 0 ||
      ui.pmScreenshots.length > 0 ||
      ui.isNew ||
      ui.isNewDoc ||
      ui.isNewSkill ||
      ui.isNewInput ||
      ui.isNewStory ||
      ui.unsentTaskChatDraft ||
      ui.taskEditorDraft,
    isBusy: () => repo.runningIds.length > 0 || repo.testRun.running,
    clearNewVersion: repo.clearNewVersion,
  });
  window.addEventListener("focus", checkUiBuild);
  window.addEventListener("repoos:api-timeout", onApiTimeout);
  // The router guard already calls this before the first navigation
  // resolves, so it's normally already loaded by the time we mount.
  if (!auth.loaded) await auth.loadMe();
  await repo.init();
  // Board/state fixtures seed client store state only — apply them before the
  // doc/config loads below, which can take seconds. A capture settles (and
  // queries its highlight) right after the board first paints, so a fixture
  // applied later never makes the screenshot: the card:checkpointRecovery
  // fixture task missed the capture entirely and its highlight matched an
  // unrelated card instead (#0834). Config-touching fixtures still wait for
  // config.load() below — they need the loaded config, not just the board.
  applyShotFixturesFromLocation({ config: false });
  // Release-event notices (#0606): poll /api/release/run from anywhere in the
  // app so the bell badge is live on every page, not just /releases.
  notices.start();
  await docs.loadDocs();
  await docs.loadSkills();
  await config.load();
  applyShotFixturesFromLocation();
  // The per-task pickers in the drawer need the live model list too, not just
  // the Agents page — without this they fall back to the static list and can
  // offer models the selected CLI doesn't support (0064). Fire-and-forget:
  // each CLI's list loads independently (#0593), the persisted copy shows
  // immediately, and each dropdown shows its own loading/failed state until
  // its request lands.
  void config.loadModels();
});

function applyShotFixturesFromLocation(opts: { config?: boolean } = {}): void {
  const shotFixture = readShotPreviewFixtureFromLocation(window.location);
  if (!shotFixture || !repo.health?.isPreviewBuild) return;
  applyShotPreviewFixture(repo, shotFixture);
  // Config-touching fixtures run AFTER config.load(), and again on navigation
  // so capture navigations cannot miss bird-trail / editor seeds (#0822).
  if (opts.config !== false && isShotPreviewConfigFixture(shotFixture)) {
    applyShotPreviewConfigFixture(config, shotFixture);
  }
}

// Re-apply after navigation so `?task=` is on the URL before drawer fixtures
// run (a cold load can mount before the route query is visible to the fixture).
// Opening the task resets the drawer to its status default, so the Status
// details shot has to win that reset or the highlight never mounts (#0972).
watch(
  () => route.fullPath,
  async () => {
    applyShotFixturesFromLocation();
    await nextTick();
    const shotFixture = readShotPreviewFixtureFromLocation(window.location);
    if (shotFixture === "drawer:statusDetails" || shotFixture === "drawer:held") {
      ui.activeTab = "debug";
      ui.debugView = "status";
    }
  },
);

onUnmounted(() => {
  window.removeEventListener("focus", checkUiBuild);
  window.removeEventListener("repoos:api-timeout", onApiTimeout);
  notices.stop();
});
</script>

<template>
  <div id="app">
    <UiRecoveryBanner />
    <RouterView v-if="isPublicRoute" />
    <template v-else>
      <TopBar />

      <div class="body">
        <Sidebar />

        <div class="main">
          <div v-if="repo.loading" class="main-route page-loading">
            <header v-if="loadingHeader" class="page-header">
              <div>
                <div class="page-title">{{ loadingHeader.title }}</div>
                <div class="page-desc">{{ loadingHeader.desc }}</div>
              </div>
            </header>
            <PageSkeleton :kind="loadingKind" />
          </div>
          <RouterView v-else class="main-route" />
        </div>
      </div>

      <MobileTabs />
      <TaskDrawer />
      <TunnelDrawer />
      <RemoteValidationDrawer />
      <ToastPanel />
      <CopyInspectorOverlay />
      <ReleaseUpdateNotification />
      <FloatingHeads />
      <NewInputPanel />
      <DependencyOverrideDialog />
    </template>
  </div>
</template>
