<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import {
  REPRESENTATIVE_SKELETON_BLOCKS,
  SKELETON_MIN_VISIBLE_MS,
  SKELETON_SHOW_DELAY_MS,
  type LoadingSkeletonKind,
} from "../lib/loading-skeleton";
import { INPUT_BOARD_COLUMN_COUNT, WORK_BOARD_COLUMN_COUNT } from "../lib/work-board-columns";

const props = withDefaults(
  defineProps<{
    kind?: LoadingSkeletonKind;
    loading?: boolean;
    defer?: boolean;
    count?: number;
    matrixCount?: number;
  }>(),
  { kind: "rows", loading: true, defer: false },
);
const emit = defineEmits<{ "visibility-change": [visible: boolean] }>();

const visible = ref(false);
const prefersReducedMotion = ref(false);
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let shownAt = 0;
let motionQuery: MediaQueryList | null = null;

function updateMotionPreference(): void {
  prefersReducedMotion.value = motionQuery?.matches ?? false;
}

function clearTimers(): void {
  if (showTimer) clearTimeout(showTimer);
  if (hideTimer) clearTimeout(hideTimer);
  showTimer = null;
  hideTimer = null;
}

function setVisible(next: boolean): void {
  if (visible.value === next) return;
  visible.value = next;
  emit("visibility-change", next);
  if (next) shownAt = Date.now();
}

function updateLoading(loading: boolean): void {
  if (showTimer) clearTimeout(showTimer);
  showTimer = null;

  if (!props.defer) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    setVisible(loading);
    return;
  }

  if (loading) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    if (!visible.value) {
      showTimer = setTimeout(() => {
        showTimer = null;
        setVisible(true);
      }, SKELETON_SHOW_DELAY_MS);
    }
    return;
  }

  if (!visible.value) return;
  const remaining = Math.max(0, SKELETON_MIN_VISIBLE_MS - (Date.now() - shownAt));
  hideTimer = setTimeout(() => {
    hideTimer = null;
    setVisible(false);
  }, remaining);
}

watch(
  () => [props.loading, props.defer] as const,
  ([loading]) => updateLoading(loading),
);
onMounted(() => {
  updateLoading(props.loading);
  if (typeof window.matchMedia === "function") {
    motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    updateMotionPreference();
    motionQuery.addEventListener?.("change", updateMotionPreference);
  }
});
onUnmounted(() => {
  clearTimers();
  motionQuery?.removeEventListener?.("change", updateMotionPreference);
});

const columnCount = (): number => {
  if (props.kind === "board") return WORK_BOARD_COLUMN_COUNT;
  if (props.kind === "inputBoard") return INPUT_BOARD_COLUMN_COUNT;
  return 0;
};

const itemCount = (): number => {
  if (props.kind === "board" || props.kind === "inputBoard") return columnCount();
  return Math.max(REPRESENTATIVE_SKELETON_BLOCKS.length, props.count ?? 0);
};

const matrixCount = (): number =>
  Math.max(REPRESENTATIVE_SKELETON_BLOCKS.length, props.matrixCount ?? 0);
</script>

<template>
  <Transition name="page-skeleton" :css="defer">
    <div
      v-if="visible"
      class="page-skeleton"
      :class="[`page-skeleton--${kind}`, { 'page-skeleton--reduced-motion': prefersReducedMotion }]"
      :style="columnCount() ? { '--skeleton-cols': String(columnCount()) } : undefined"
      aria-label="Loading page content"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span v-for="i in itemCount()" :key="i" class="page-skeleton__item">
        <i></i><i></i><i></i>
      </span>
      <div v-if="kind === 'deployments'" class="page-skeleton__matrix">
        <span v-for="i in matrixCount()" :key="i" class="page-skeleton__item">
          <i></i><i></i><i></i>
        </span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.page-skeleton {
  display: grid;
  gap: 12px;
  width: 100%;
}
.page-skeleton-enter-active,
.page-skeleton-leave-active {
  transition: opacity 140ms ease;
}
.page-skeleton-enter-from,
.page-skeleton-leave-to {
  opacity: 0;
}
.page-skeleton--reduced-motion,
.page-skeleton--reduced-motion .page-skeleton__item i {
  animation: none;
  transition: none;
}
.page-skeleton--cards,
.page-skeleton--deployments {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.page-skeleton--dashboard,
.page-skeleton--rows {
  grid-template-columns: minmax(0, 1fr);
}
.page-skeleton--board,
.page-skeleton--inputBoard {
  grid-template-columns: repeat(var(--skeleton-cols, 6), minmax(0, 1fr));
  align-content: start;
  height: 100%;
}
.page-skeleton--board .page-skeleton__item,
.page-skeleton--inputBoard .page-skeleton__item {
  min-height: 240px;
  align-content: start;
}
.page-skeleton--table {
  gap: 1px;
}
.page-skeleton__item {
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-solid);
}
.page-skeleton--table .page-skeleton__item {
  border-radius: 0;
  grid-template-columns: 1fr 2fr 1fr;
  align-items: center;
}
.page-skeleton--targets .page-skeleton__item {
  min-height: 200px;
  align-content: start;
  gap: 24px;
  padding: 20px;
}
.page-skeleton--dashboard .page-skeleton__item {
  min-height: 220px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
}
.page-skeleton--rows .page-skeleton__item {
  min-height: 74px;
}
.page-skeleton__matrix {
  grid-column: 1 / -1;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.page-skeleton__matrix .page-skeleton__item {
  grid-template-columns: 1fr 2fr 1fr;
  align-items: center;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
}
.page-skeleton__matrix .page-skeleton__item:last-child {
  border-bottom: 0;
}
.page-skeleton__item i {
  display: block;
  height: 12px;
  width: 72%;
  border-radius: 4px;
  background: var(--bg-2);
  animation: page-skeleton-pulse 2.4s ease-in-out infinite alternate;
}
.page-skeleton__item i:first-child {
  width: 42%;
  height: 16px;
}
.page-skeleton__item i:last-child {
  width: 58%;
}
@keyframes page-skeleton-pulse {
  to {
    opacity: 0.45;
  }
}
@media (max-width: 760px) {
  .page-skeleton--board,
  .page-skeleton--inputBoard {
    grid-template-columns: 1fr;
  }
  .page-skeleton--board .page-skeleton__item,
  .page-skeleton--inputBoard .page-skeleton__item {
    min-height: 96px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .page-skeleton-enter-active,
  .page-skeleton-leave-active {
    transition: none;
  }
  .page-skeleton__item i {
    animation: none;
  }
}
</style>
