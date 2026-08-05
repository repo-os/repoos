<script setup lang="ts">
import { storeToRefs } from "pinia";
import { COLUMNS, useRepoStore } from "../stores/repo";
import type { Column } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import BoardColumn from "../components/BoardColumn.vue";
import Button from "../components/ui/button.vue";

const DRAFT_COL: Column = { id: "draft", label: "Proposed / Drafts", color: "var(--txt-faint)" };
const DRAFT_EMPTY = "No drafts yet. Agent proposals land here.";

const repo = useRepoStore();
const ui = useUiStore();
const { workDir } = storeToRefs(repo);
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
        <div class="page-title">Work Queue</div>
        <div class="page-desc" style="margin: 3px 0 0">
          Repo-native tasks ·
          <span class="mono" style="color: var(--cyan)">{{ workDir }}/*.md</span>
        </div>
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

    <div class="board">
      <BoardColumn :col="DRAFT_COL" :empty-text="DRAFT_EMPTY" />
      <BoardColumn v-for="col in COLUMNS" :key="col.id" :col="col" />
    </div>
  </div>
</template>
