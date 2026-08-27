<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import Button from "../components/ui/button.vue";
import StatCard from "../components/StatCard.vue";
import FeedPanel from "../components/FeedPanel.vue";
import NeedsYouPanel from "../components/NeedsYouPanel.vue";
import SystemResourcePanel from "../components/SystemResourcePanel.vue";
import UsagePanel from "../components/UsagePanel.vue";
import AutoEngineeringPanel from "../components/AutoEngineeringPanel.vue";
import ReleaseTimeline from "../components/ReleaseTimeline.vue";
import TestRunPanel from "../components/TestRunPanel.vue";

const repo = useRepoStore();
const ui = useUiStore();
const { counts, repoName } = storeToRefs(repo);
</script>

<template>
  <div>
    <div
      style="
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        margin-bottom: 20px;
      "
    >
      <div>
        <div class="page-title">Mission Control</div>
        <div class="page-desc">{{ repoName }} · live from {{ repo.origin }}</div>
      </div>
      <Button variant="accent" class="new-btn" @click="ui.openNewTask()">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        New task
      </Button>
    </div>

    <div class="control-usage">
      <UsagePanel />
    </div>

    <SystemResourcePanel />

    <div class="stat-grid">
      <router-link :to="{ path: '/work', query: { status: 'draft' } }" class="stat-link">
        <StatCard
          label="drafts"
          :value="counts.draft || 0"
          bg="var(--chip-bg)"
          color="var(--txt-faint)"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7h16M4 12h16M4 17h10"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </StatCard>
      </router-link>
      <router-link :to="{ path: '/work', query: { status: 'inbox' } }" class="stat-link">
        <StatCard
          label="inbox"
          :value="counts.inbox || 0"
          bg="rgba(138,150,180,0.12)"
          color="var(--txt-dim)"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M4 6h16M4 12h16M4 18h10"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </StatCard>
      </router-link>
      <router-link :to="{ path: '/work', query: { status: 'ready' } }" class="stat-link">
        <StatCard
          label="ready to start"
          :value="counts.ready || 0"
          bg="var(--cyan-dim)"
          color="var(--cyan)"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
            <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </StatCard>
      </router-link>
      <router-link :to="{ path: '/work', query: { status: 'active' } }" class="stat-link">
        <StatCard
          glow
          label="in progress"
          :value="counts.active || 0"
          bg="var(--violet-tint)"
          color="var(--violet)"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M3 12h4l2 5 4-12 2 7h6"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </StatCard>
      </router-link>
      <router-link :to="{ path: '/work', query: { status: 'review' } }" class="stat-link">
        <StatCard
          label="awaiting review"
          :value="counts.review || 0"
          bg="var(--amber-tint)"
          color="var(--amber)"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M9 12l2 2 4-4"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
          </svg>
        </StatCard>
      </router-link>
      <router-link :to="{ path: '/work', query: { status: 'done' } }" class="stat-link">
        <StatCard
          label="done"
          :value="counts.done || 0"
          bg="var(--green-tint)"
          color="var(--green)"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12l5 5L20 6"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </StatCard>
      </router-link>
    </div>

    <AutoEngineeringPanel />

    <div class="dash-grid">
      <ReleaseTimeline />
      <FeedPanel />
      <NeedsYouPanel />
    </div>

    <TestRunPanel />
  </div>
</template>

<style scoped>
.control-usage {
  margin-bottom: 14px;
}

.dash-grid {
  margin-bottom: 18px;
}
</style>
