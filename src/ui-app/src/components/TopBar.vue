<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import SearchBar from "./SearchBar.vue";

const repo = useRepoStore();
const { health, connected } = storeToRefs(repo);
const { repoName } = storeToRefs(repo);
</script>

<template>
  <div class="topbar">
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
    <SearchBar />
    <div class="conn" :class="connected ? 'live' : 'down'">
      <span class="dot"></span>{{ connected ? "live" : "offline" }}
    </div>
  </div>
</template>
