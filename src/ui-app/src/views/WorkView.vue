<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { COLUMNS, SORT_ORDER_OPTIONS, useRepoStore } from "../stores/repo";
import type { Column, SortOrder } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import BoardColumn from "../components/BoardColumn.vue";
import Button from "../components/ui/button.vue";
import Select from "../components/ui/select/root.vue";
import SelectContent from "../components/ui/select/content.vue";
import SelectItem from "../components/ui/select/item.vue";
import SelectTrigger from "../components/ui/select/trigger.vue";
import SelectValue from "../components/ui/select/value.vue";
import SelectViewport from "../components/ui/select/viewport.vue";
import IntegrationStatusBar from "../components/IntegrationStatusBar.vue";

const DRAFT_COL: Column = { id: "draft", label: "Proposed / Drafts", color: "var(--txt-faint)" };
const DRAFT_EMPTY = "No drafts yet. Agent proposals land here.";
const DRAFT_BAR = "#3a4055";

const STATUS_IDS = new Set(["draft", "inbox", "ready", "active", "review", "done"]);

const repo = useRepoStore();
const ui = useUiStore();
const route = useRoute();
const { workDir } = storeToRefs(repo);

const statusFilter = computed<string | null>(() => {
  const s = route.query.status;
  return typeof s === "string" && STATUS_IDS.has(s) ? s : null;
});

const filterCol = computed<Column | null>(() => {
  if (statusFilter.value === "draft") return DRAFT_COL;
  return COLUMNS.find((c) => c.id === statusFilter.value) ?? null;
});
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
      <div style="display: flex; align-items: center; gap: 10px">
        <Select
          :model-value="repo.sortOrder"
          @update:model-value="(v) => repo.setSortOrder(v as SortOrder)"
        >
          <SelectTrigger class="h-[34px] w-[210px] rounded-[9px] px-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
              <SelectItem v-for="o in SORT_ORDER_OPTIONS" :key="o.value" :value="o.value">{{
                o.label
              }}</SelectItem>
            </SelectViewport>
          </SelectContent>
        </Select>
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
    </div>

    <div v-if="statusFilter" class="filter-bar">
      <span class="filter-chip">
        <span class="cdot" :style="{ background: filterCol!.color, boxShadow: '0 0 6px ' + filterCol!.color }"></span>
        {{ filterCol!.label }} · {{ repo.byStatus(statusFilter).length }}
      </span>
      <router-link to="/work" class="filter-clear">Show all statuses</router-link>
    </div>

    <div class="board">
      <template v-if="statusFilter">
        <BoardColumn
          :col="filterCol!"
          :bar-color="filterCol!.id === 'draft' ? DRAFT_BAR : ''"
          :empty-text="filterCol!.id === 'draft' ? DRAFT_EMPTY : '—'"
          force-expand
          :drag-enabled="false"
        />
      </template>
      <template v-else>
        <BoardColumn :col="DRAFT_COL" :bar-color="DRAFT_BAR" :empty-text="DRAFT_EMPTY" />
        <BoardColumn v-for="col in COLUMNS" :key="col.id" :col="col" />
      </template>
    </div>

    <IntegrationStatusBar />
  </div>
</template>
