<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { COLUMNS, useRepoStore } from "../stores/repo";
import type { Column } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import TaskCard from "./TaskCard.vue";

const COLLAPSE_KEY = "repoos.board.collapsed";

const GENZ_EMPTY: Record<string, string> = {
  draft: "no drafts yet — agent ideas land here",
  inbox: "all caught up, nothing waiting",
  active: "nobody's working — go first?",
  review: "no reviews pending, nice",
  done: "nothing shipped yet — send it",
};

function readSaved(): { ids: string[]; exists: boolean } {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw === null) return { ids: [], exists: false };
    return { ids: JSON.parse(raw) ?? [], exists: true };
  } catch {
    return { ids: [], exists: false };
  }
}

const saved = readSaved();
const collapsedIds = ref<Set<string>>(new Set(saved.ids));

let defaultsApplied = false;
const hasSavedState = saved.exists;

function applyDefaults(repo: ReturnType<typeof useRepoStore>) {
  if (defaultsApplied) return;
  defaultsApplied = true;
  if (hasSavedState) return;
  const ids = ["draft", ...COLUMNS.map((c) => c.id)];
  collapsedIds.value = new Set(ids.filter((id) => repo.byStatus(id).length === 0));
}

const props = withDefaults(
  defineProps<{ col: Column; emptyText?: string; barColor?: string }>(),
  { emptyText: "—", barColor: "" }
);

const repo = useRepoStore();
const config = useConfigStore();
const collapsed = computed(() => collapsedIds.value.has(props.col.id));

const displayEmpty = computed(() =>
  config.uiTheme === "gen z"
    ? GENZ_EMPTY[props.col.id] ?? "nothing here yet — add something"
    : props.emptyText || "—"
);

watch(
  () => repo.loading,
  (loading) => {
    if (!loading) applyDefaults(repo);
  },
  { immediate: true }
);

const bodyEl = ref<HTMLElement | null>(null);
const scrollable = ref(false);

let mo: MutationObserver | null = null;
let ro: ResizeObserver | null = null;

const checkScroll = () => {
  const el = bodyEl.value;
  scrollable.value = !!(el && el.scrollHeight > el.clientHeight + 1);
};

onMounted(() => {
  const el = bodyEl.value;
  if (!el) return;
  checkScroll();
  mo = new MutationObserver(() => checkScroll());
  mo.observe(el, { childList: true, subtree: true });
  if ("ResizeObserver" in window) {
    ro = new ResizeObserver(() => checkScroll());
    ro.observe(el);
  }
  window.addEventListener("resize", checkScroll);
});
onUnmounted(() => {
  mo?.disconnect();
  ro?.disconnect();
  window.removeEventListener("resize", checkScroll);
});
watch(collapsed, () => nextTick(checkScroll));

const collapsedColor = computed(() => props.barColor || props.col.color);

const barTextColor = computed(() => {
  const hex = collapsedColor.value.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#0e1220" : "#ffffff";
});

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
  <div class="board-col" :class="{ collapsed, scrollable }">
    <div
      class="col-head"
      role="button"
      tabindex="0"
      :aria-expanded="!collapsed"
      @click="toggle"
      @keydown.enter="toggle"
      @keydown.space.prevent="toggle"
    >
      <div v-if="collapsed" class="col-cap" :style="{ background: collapsedColor, color: barTextColor }">
        <span class="col-cap-count">{{ repo.byStatus(col.id).length }}</span>
      </div>
      <span v-else class="cdot" :style="{ background: col.color, boxShadow: '0 0 6px ' + col.color }"></span>
      <span class="col-label">{{ col.label }}</span>
      <span v-if="!collapsed" class="col-count">{{ repo.byStatus(col.id).length }}</span>
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
    <div ref="bodyEl" class="col-body">
      <TaskCard v-for="t in repo.byStatus(col.id)" :key="t.id" :task="t" />
      <div v-if="!repo.byStatus(col.id).length" class="col-empty">{{ displayEmpty }}</div>
    </div>
  </div>
</template>

