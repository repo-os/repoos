<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { Moon, RefreshCw, RotateCcw, Sun } from "lucide-vue-next";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import SearchBar from "./SearchBar.vue";

const repo = useRepoStore();
const config = useConfigStore();
const { health, connected, newVersion, restarting } = storeToRefs(repo);
const { repoName } = storeToRefs(repo);

const isDark = computed(() => config.effectiveTheme === "dark");
const isPreviewBuild = computed(() => health.value?.isPreviewBuild ?? false);

function toggleTheme(): void {
  void config.setTheme(isDark.value ? "light" : "dark");
}
</script>

<template>
  <div class="topbar">
    <span v-if="isPreviewBuild" class="preview-build-banner">Preview Build</span>
    <div class="logo-mark">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" stroke="var(--cyan)" stroke-width="2" stroke-linejoin="round" />
        <path d="M12 7v10M8 9.5v5M16 9.5v5" stroke="var(--violet)" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </div>
    <div class="brand">RepoOS<small>repo is the os</small></div>
    <div v-if="health" class="repo-pill">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M6 3v12a3 3 0 003 3h6M6 3a2 2 0 100 4 2 2 0 000-4zM18 18a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="1.8" />
      </svg>
      <span class="mono">{{ repoName }}</span>
    </div>
    <div class="spacer"></div>
    <button
      class="theme-toggle"
      type="button"
      :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      @click="toggleTheme"
    >
      <Moon v-if="isDark" :size="15" :stroke-width="1.8" />
      <Sun v-else :size="15" :stroke-width="1.8" />
    </button>
    <SearchBar />
    <button
      v-if="newVersion"
      type="button"
      class="version-notice"
      :disabled="restarting"
      @click="repo.restartServer()"
    >
      <RefreshCw v-if="restarting" class="size-[13px] icon-spin" />
      <RotateCcw v-else class="size-[13px]" />
      <span>{{ restarting ? "Restarting…" : "New version available" }}</span>
    </button>
    <div
      class="conn"
      :class="connected ? 'live' : 'down'"
      :aria-label="connected ? 'Server connection: live' : 'Server connection: offline'"
      :title="connected ? 'Server connection: live' : 'Server connection: offline'"
    >
      <span class="dot"></span><span class="conn-text">{{ connected ? "live" : "offline" }}</span>
    </div>
  </div>
</template>
