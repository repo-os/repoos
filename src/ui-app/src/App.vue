<script setup lang="ts">
import { onMounted } from "vue";
import { useRepoStore } from "./stores/repo";
import { useDocsStore } from "./stores/docs";
import { useConfigStore } from "./stores/config";
import TopBar from "./components/TopBar.vue";
import Sidebar from "./components/Sidebar.vue";
import MobileTabs from "./components/MobileTabs.vue";
import TaskDrawer from "./components/TaskDrawer.vue";
import TunnelDrawer from "./components/TunnelDrawer.vue";
import ToastPanel from "./components/ToastPanel.vue";

const repo = useRepoStore();
const docs = useDocsStore();
const config = useConfigStore();

onMounted(async () => {
  await repo.init();
  await docs.loadDocs();
  await docs.loadSkills();
  await config.load();
});
</script>

<template>
  <div id="app">
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
    <ToastPanel />
  </div>
</template>
