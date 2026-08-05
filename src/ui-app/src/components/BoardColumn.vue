<script setup lang="ts">
import { computed, ref } from "vue";
import { useRepoStore } from "../stores/repo";
import type { Column } from "../stores/repo";
import TaskCard from "./TaskCard.vue";

const COLLAPSE_KEY = "repoos.board.collapsed";

let saved: string[] = [];
try {
  saved = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "[]");
} catch {
  saved = [];
}

const collapsedIds = ref<Set<string>>(new Set(saved));

const props = withDefaults(defineProps<{ col: Column; emptyText?: string }>(), {
  emptyText: "—",
});

const repo = useRepoStore();
const collapsed = computed(() => collapsedIds.value.has(props.col.id));

const toggle = () => {
  const s = new Set(collapsedIds.value);
  if (s.has(props.col.id)) s.delete(props.col.id);
  else s.add(props.col.id);
  collapsedIds.value = s;
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
};
</script>

<template>
  <div class="board-col" :class="{ collapsed }">
    <div
      class="col-head"
      role="button"
      tabindex="0"
      :aria-expanded="!collapsed"
      :style="collapsed ? { boxShadow: 'inset 3px 0 0 ' + col.color } : {}"
      @click="toggle"
      @keydown.enter="toggle"
      @keydown.space.prevent="toggle"
    >
      <span class="cdot" :style="{ background: col.color, boxShadow: '0 0 6px ' + col.color }"></span>
      <span class="col-label">{{ col.label }}</span>
      <span class="col-count">{{ repo.byStatus(col.id).length }}</span>
      <svg class="col-chev" viewBox="0 0 24 24" fill="none">
        <path
          d="m6 9 6 6 6-6"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
    <div class="col-body">
      <TaskCard v-for="t in repo.byStatus(col.id)" :key="t.id" :task="t" />
      <div v-if="!repo.byStatus(col.id).length" class="col-empty">{{ emptyText }}</div>
    </div>
  </div>
</template>
