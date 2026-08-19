<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { LogOut, Moon, RefreshCw, RotateCcw, Sun } from "lucide-vue-next";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { useAuthStore } from "../stores/auth";
import SearchBar from "./SearchBar.vue";

const repo = useRepoStore();
const config = useConfigStore();
const auth = useAuthStore();
const { health, connected, loading, newVersion, restarting } = storeToRefs(repo);
const { repoName } = storeToRefs(repo);

const isDark = computed(() => config.effectiveTheme === "dark");
const isPreviewBuild = computed(() => health.value?.isPreviewBuild ?? false);

// Connection indicator: while the app is still starting up (initial bundle +
// first health/SSE handshake) we don't yet know whether we're online, so show
// a "loading" state instead of a premature "offline" (0205). "offline" is only
// shown once startup has completed and the connection was actually lost.
const connState = computed<"loading" | "live" | "offline">(() => {
  if (loading.value) return "loading";
  return connected.value ? "live" : "offline";
});

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
    <div class="brand hidden sm:inline">RepoOS<small>repo is the os</small></div>
    <div v-if="health" class="repo-pill">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M6 3v12a3 3 0 003 3h6M6 3a2 2 0 100 4 2 2 0 000-4zM18 18a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="1.8" />
      </svg>
      <span class="mono">{{ repoName }}</span>
    </div>
    <div class="spacer"></div>
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
    <div v-if="auth.authEnabled && auth.authenticated" class="user-chip" :title="auth.email ?? undefined">
      <span class="user-chip-email mono hidden sm:inline">{{ auth.email }}</span>
      <button class="logout-btn" type="button" aria-label="Log out" title="Log out" @click="auth.logout()">
        <LogOut :size="14" :stroke-width="1.8" />
      </button>
    </div>
    <div
      class="conn"
      :class="connState"
      :aria-label="`Server connection: ${connState}`"
      :title="`Server connection: ${connState}`"
    >
      <span class="dot"></span><span class="conn-text">{{ connState }}</span>
    </div>
  </div>
</template>
