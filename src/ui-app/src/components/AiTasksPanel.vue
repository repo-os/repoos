<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";

const repo = useRepoStore();
const ui = useUiStore();
const { aiTasks } = storeToRefs(repo);
</script>

<template>
  <div class="glass">
    <div class="panel-head">
      <div class="panel-title">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="7" r="3.5" stroke="currentColor" stroke-width="1.8" />
          <path d="M5 20a7 7 0 0114 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        Assigned to AI
      </div>
      <span class="tag" style="background: var(--violet-dim); color: var(--violet)">{{ aiTasks.length }}</span>
    </div>
    <div style="padding: 6px 0">
      <div v-if="!aiTasks.length" class="feed-empty">No tasks assigned to AI yet.</div>
      <div class="feed-item" v-for="t in aiTasks" :key="t.id" style="cursor: pointer" @click="ui.openTask(t)">
        <div class="feed-dot" :style="{ background: repo.statusColor(t.status) }"></div>
        <div class="feed-line"></div>
        <div style="flex: 1; min-width: 0">
          <div class="feed-msg"><b>#{{ t.id }}</b> {{ t.title }}</div>
          <div class="feed-meta">
            <span :style="{ color: repo.statusColor(t.status) }">{{ t.status }}</span>
            <span>{{ t.area }}</span>
            <span v-if="t.branch" style="color: var(--cyan)">{{ t.branch }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
