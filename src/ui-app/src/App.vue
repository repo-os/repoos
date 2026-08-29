<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useRepoStore } from "./stores/repo";
import { useDocsStore } from "./stores/docs";
import { useConfigStore } from "./stores/config";
import { useAuthStore } from "./stores/auth";
import TopBar from "./components/TopBar.vue";
import Sidebar from "./components/Sidebar.vue";
import MobileTabs from "./components/MobileTabs.vue";
import TaskDrawer from "./components/TaskDrawer.vue";
import TunnelDrawer from "./components/TunnelDrawer.vue";
import RemoteValidationDrawer from "./components/RemoteValidationDrawer.vue";
import ToastPanel from "./components/ToastPanel.vue";
import FloatingHeads from "./components/FloatingHeads.vue";
import NewInputPanel from "./components/NewInputPanel.vue";

const route = useRoute();
const repo = useRepoStore();
const docs = useDocsStore();
const config = useConfigStore();
const auth = useAuthStore();

// Routes marked `public` (currently just /login) render as a standalone
// full-viewport screen with no app chrome — the visitor isn't authenticated
// yet, and the sidebar/topbar assume a signed-in session.
const isPublicRoute = computed(() => route.meta.public === true);

onMounted(async () => {
  // The router guard already calls this before the first navigation
  // resolves, so it's normally already loaded by the time we mount.
  if (!auth.loaded) await auth.loadMe();
  await repo.init();
  await docs.loadDocs();
  await docs.loadSkills();
  await config.load();
  // The per-task pickers in the drawer need the live model list too, not just
  // the Agents page — without this they fall back to the static list and can
  // offer models the selected CLI doesn't support (0064). Fire-and-forget: the
  // dropdowns degrade to the static list until it lands.
  void config.loadModels();
});
</script>

<template>
  <div id="app">
    <RouterView v-if="isPublicRoute" />
    <template v-else>
      <TopBar />

      <div class="body">
        <Sidebar />

        <div class="main">
          <div v-if="repo.loading" class="spin"></div>
          <RouterView v-else />
        </div>
      </div>

      <MobileTabs />
      <TaskDrawer />
      <TunnelDrawer />
      <RemoteValidationDrawer />
      <ToastPanel />
      <FloatingHeads />
      <NewInputPanel />
    </template>
  </div>
</template>
