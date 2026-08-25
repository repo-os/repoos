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
  defineProps<{ col: Column; emptyText?: string; barColor?: string; forceExpand?: boolean; dragEnabled?: boolean; highlightId?: string | null }>(),
  { emptyText: "—", barColor: "", forceExpand: false, dragEnabled: true, highlightId: null }
);

const repo = useRepoStore();
const config = useConfigStore();
const collapsed = computed(() => !props.forceExpand && collapsedIds.value.has(props.col.id));

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

/** Task that just left this column (for ghost animation). */
const leavingTaskName = computed(() => {
  const ts = repo.transitionState;
  if (!ts || ts.from !== props.col.id) return null;
  const t = repo.tasks.find((item) => item.id === ts.id);
  return t?.title ?? null;
});

const dragOver = ref(false);
let dragDepth = 0;

function onDragEnter(e: DragEvent): void {
  if (!props.dragEnabled) return;
  dragDepth++;
  dragOver.value = true;
  e.preventDefault();
}

function onDragOver(e: DragEvent): void {
  if (!props.dragEnabled) return;
  e.preventDefault();
}

function onDragLeave(): void {
  if (!props.dragEnabled) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragOver.value = false;
}

async function onDrop(e: DragEvent): Promise<void> {
  if (!props.dragEnabled) return;
  e.preventDefault();
  clearDragOver();
  const id = e.dataTransfer?.getData("text/plain");
  if (!id) return;
  const task = repo.tasks.find((t) => t.id === id);
  if (!task || task.status === props.col.id) return;
  try {
    if (props.col.id === "done") {
      // Done is never an ordinary board status transition: its endpoint owns
      // the review-running 409, merge, check, and worktree cleanup. This also
      // prevents a drag from bypassing the disabled drawer/card action.
      if (task.status !== "review") {
        throw new Error("Only review tasks can be moved to done");
      }
      if (repo.reviewFor(task.id)?.running) {
        throw new Error("Waiting for automatic review to finish.");
      }
      await repo.completeTask(task);
    } else {
      await repo.setStatus(task, props.col.id);
    }
    if (collapsedIds.value.has(props.col.id)) toggle();
  } catch (err) {
    repo.onError(err);
  }
}

function clearDragOver(): void {
  dragDepth = 0;
  dragOver.value = false;
}

window.addEventListener("repoos:board-dragend", clearDragOver);
onUnmounted(() => window.removeEventListener("repoos:board-dragend", clearDragOver));

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

/** 0278: a fresh-done task must be visible, not hidden behind a collapsed cap.
 *  The moment the done column first holds an unacked done task, expand it
 *  automatically even if it was collapsed (empty-at-load default). A task the
 *  human already acknowledged, or an old done task, does not trigger this. */
watch(
  () => repo.doneAckCount,
  (n, prev) => {
    if (props.col.id === "done" && n > 0 && prev === 0 && collapsed.value) {
      toggle();
    }
  },
);

/** 0278: when the done column stays collapsed by preference, draw attention to
 *  the unacked fresh-done tasks on the cap count with a done-green badge. */
const unackedBadge = computed(() =>
  props.col.id === "done" && repo.doneAckCount > 0 ? repo.doneAckCount : null,
);
</script>

<template>
  <div
    class="board-col"
    :class="{ collapsed, scrollable, 'drag-over': dragOver }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
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
        <span v-if="unackedBadge" class="col-cap-ack" :title="`${unackedBadge} fresh done task${unackedBadge === 1 ? '' : 's'} to acknowledge`">{{ unackedBadge }}</span>
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
      <div v-if="leavingTaskName" class="board-ghost" :key="'ghost-' + repo.transitionState?.id">
        Moved to {{ repo.transitionState?.to }}
      </div>
      <TaskCard
        v-for="t in repo.byStatus(col.id)"
        :key="t.id"
        :task="t"
        :drag-enabled="dragEnabled"
        :highlighted="props.highlightId === t.id"
      />
      <div v-if="!repo.byStatus(col.id).length" class="col-empty">{{ displayEmpty }}</div>
    </div>
  </div>
</template>
