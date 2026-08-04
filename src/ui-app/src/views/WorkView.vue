<script setup lang="ts">
import { storeToRefs } from "pinia";
import { COLUMNS, useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import BoardColumn from "../components/BoardColumn.vue";
import TaskCard from "../components/TaskCard.vue";

const repo = useRepoStore();
const ui = useUiStore();
const { workDir } = storeToRefs(repo);
</script>

<template>
  <div>
    <div style="display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 20px">
      <div>
        <div class="page-title">Work Queue</div>
        <div class="page-desc" style="margin: 3px 0 0">
          Repo-native tasks · <span class="mono" style="color: var(--cyan)">{{ workDir }}/*.md</span>
        </div>
      </div>
      <div class="new-btn" @click="ui.openNewTask()">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        New task
      </div>
    </div>

    <div class="board">
      <BoardColumn v-for="col in COLUMNS" :key="col.id" :col="col" />
    </div>

    <!-- PROPOSED (draft tasks) -->
    <div class="draft-section">
      <div class="draft-head">
        <span class="cdot" style="background: var(--txt-faint)"></span>
        Proposed / Drafts
        <span class="col-count" style="margin-left: auto">{{ repo.byStatus("draft").length }}</span>
      </div>
      <div class="draft-body">
        <div
          v-if="!repo.byStatus('draft').length"
          style="font-size: 10.5px; color: var(--txt-faint); text-align: center; padding: 14px 0; font-family: 'JetBrains Mono', monospace"
        >
          No drafts yet. Agent proposals land here.
        </div>
        <TaskCard v-for="t in repo.byStatus('draft')" :key="t.id" :task="t" />
      </div>
    </div>
  </div>
</template>
