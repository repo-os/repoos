<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { COLUMNS, useRepoStore } from "../stores/repo";
import type { Column } from "../stores/repo";
import type { Task } from "../types";
import { useConfigStore } from "../stores/config";
import TaskCard from "./TaskCard.vue";
import RestartTaskDialog from "./RestartTaskDialog.vue";
import {
  applyCollapseDefaults,
  isColumnCollapsed,
  toggleColumnCollapsed,
} from "../lib/boardCollapse";
import { isValidBoardMove, boardMoveRejectionReason } from "../lib/taskTransitions";

const GENZ_EMPTY: Record<string, string> = {
  draft: "no drafts yet — agent ideas land here",
  inbox: "all caught up, nothing waiting",
  active: "nobody's working — go first?",
  review: "no reviews pending, nice",
  done: "nothing shipped yet — send it",
};

const props = withDefaults(
  defineProps<{
    col: Column;
    emptyText?: string;
    barColor?: string;
    forceExpand?: boolean;
    dragEnabled?: boolean;
    highlightId?: string | null;
  }>(),
  { emptyText: "—", barColor: "", forceExpand: false, dragEnabled: true, highlightId: null },
);

const repo = useRepoStore();
const config = useConfigStore();
const collapsed = computed(() => !props.forceExpand && isColumnCollapsed(props.col.id));

const displayEmpty = computed(() =>
  config.uiTheme === "gen z"
    ? (GENZ_EMPTY[props.col.id] ?? "nothing here yet — add something")
    : props.emptyText || "—",
);

watch(
  () => repo.loading,
  (loading) => {
    if (!loading) applyCollapseDefaults({ byStatus: repo.byStatus, columns: COLUMNS });
  },
  { immediate: true },
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

/** Whether the task currently being dragged (if any) could actually land in
 *  this column, and why not — mirrors onDrop's own checks so the cue never
 *  promises a drop that would then fail. Null (no drag in progress, or a
 *  no-op drag back onto its own column) means "not applicable", not
 *  "invalid". The done column's checks need live agent/review state
 *  taskTransitions.ts has no way to know, so they're inlined here rather
 *  than folded into boardMoveRejectionReason. */
const dropCheck = computed<{ valid: boolean; reason: string | null } | null>(() => {
  const t = repo.draggingTask;
  if (!t || t.status === props.col.id) return null;
  if (props.col.id === "done") {
    if (t.status !== "review")
      return { valid: false, reason: "Only review tasks can be moved to done." };
    if (repo.reviewFor(t.id)?.running)
      return { valid: false, reason: "Waiting for automatic review to finish." };
    return { valid: true, reason: null };
  }
  // Mirrors the drawer's Review button, which disables itself while the
  // agent is running: the commit-and-validate gate would otherwise run
  // against a worktree the agent might still be writing to.
  if (t.status === "active" && props.col.id === "review" && repo.isRunning(t.id)) {
    return {
      valid: false,
      reason: "The agent is still coding — Review becomes available when the turn ends.",
    };
  }
  const valid = isValidBoardMove(t.status, props.col.id);
  return { valid, reason: valid ? null : boardMoveRejectionReason(t.status, props.col.id) };
});
const dropIsValid = computed(() => (dropCheck.value === null ? null : dropCheck.value.valid));

function onDragEnter(e: DragEvent): void {
  if (!props.dragEnabled) return;
  dragDepth++;
  dragOver.value = true;
  e.preventDefault();
  // Fire once per genuine column-enter (not nested child re-entries, which
  // also dispatch dragenter) — the toast the user gets on a rejected drop
  // moved here so it shows the moment the drag hovers an invalid column,
  // not only after they release the mouse and the drop silently refuses.
  if (dragDepth === 1 && dropCheck.value?.valid === false && dropCheck.value.reason) {
    repo.pushToast(dropCheck.value.reason, "error");
  }
}

function onDragOver(e: DragEvent): void {
  if (!props.dragEnabled) return;
  // Only allow the drop when it would actually succeed — a dragover that
  // never calls preventDefault means the browser refuses the drop and shows
  // its native "not allowed" cursor on its own, so an invalid target is
  // rejected before the user ever releases the mouse, not after.
  if (dropIsValid.value === false) {
    if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    return;
  }
  e.preventDefault();
}

function onDragLeave(): void {
  if (!props.dragEnabled) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragOver.value = false;
}

/** Task whose dirty-worktree restart choice is awaiting an answer — same
 *  dialog TaskCard/TaskDrawer use for the Start work button, so dragging
 *  ready onto active behaves identically instead of silently picking
 *  resume-or-clean on the human's behalf. */
const restartTask = ref<Task | null>(null);

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
    } else if (props.col.id === "active" && task.status === "ready") {
      // Same as clicking Start work — provisions the worktree/branch and
      // spawns the agent, not a bare status write, so it needs the real
      // action rather than repo.setStatus.
      if (task.git?.dirty) {
        restartTask.value = task;
      } else {
        await repo.startWork(task);
      }
    } else if (props.col.id === "review" && task.status === "active" && repo.isRunning(task.id)) {
      throw new Error("The agent is still coding — Review becomes available when the turn ends.");
    } else {
      await repo.setStatus(task, props.col.id);
    }
    if (isColumnCollapsed(props.col.id)) toggle();
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

const toggle = () => toggleColumnCollapsed(props.col.id);

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
    :class="{
      collapsed,
      scrollable,
      'drag-over': dragOver,
      'drop-invalid': dragOver && dropIsValid === false,
    }"
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
      <div
        v-if="collapsed"
        class="col-cap"
        :style="{ background: collapsedColor, color: barTextColor }"
      >
        <span class="col-cap-count">{{ repo.byStatus(col.id).length }}</span>
        <span
          v-if="unackedBadge"
          class="col-cap-ack"
          :title="`${unackedBadge} fresh done task${unackedBadge === 1 ? '' : 's'} to acknowledge`"
          >{{ unackedBadge }}</span
        >
      </div>
      <span
        v-else
        class="cdot"
        :style="{ background: col.color, boxShadow: '0 0 6px ' + col.color }"
      ></span>
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
  <RestartTaskDialog :task="restartTask" @close="restartTask = null" />
</template>
