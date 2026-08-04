<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import StatCard from "../components/StatCard.vue";
import FeedPanel from "../components/FeedPanel.vue";
import AiTasksPanel from "../components/AiTasksPanel.vue";

const repo = useRepoStore();
const { counts, repoName } = storeToRefs(repo);
</script>

<template>
  <div>
    <div class="page-title">Mission Control</div>
    <div class="page-desc">{{ repoName }} · live from {{ repo.origin }}</div>

    <div class="stat-grid">
      <StatCard glow label="in progress" :value="counts.active || 0" bg="var(--violet-tint)" color="var(--violet)">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M3 12h4l2 5 4-12 2 7h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </StatCard>
      <StatCard label="ready to start" :value="counts.ready || 0" bg="var(--cyan-dim)" color="var(--cyan)">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
          <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </StatCard>
      <StatCard label="awaiting review" :value="counts.review || 0" bg="var(--amber-tint)" color="var(--amber)">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
        </svg>
      </StatCard>
      <StatCard label="done" :value="counts.done || 0" bg="var(--green-tint)" color="var(--green)">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 12l5 5L20 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </StatCard>
      <StatCard label="inbox" :value="counts.inbox || 0" bg="rgba(138,150,180,0.12)" color="var(--txt-dim)">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </StatCard>
      <StatCard label="drafts" :value="counts.draft || 0" bg="var(--chip-bg)" color="var(--txt-faint)">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </StatCard>
    </div>

    <div class="dash-grid">
      <FeedPanel />
      <AiTasksPanel />
    </div>
  </div>
</template>
