<script setup lang="ts">
import { LOADING_SKELETON_ITEM_COUNTS, type LoadingSkeletonKind } from "../lib/loading-skeleton";
import { INPUT_BOARD_COLUMN_COUNT, WORK_BOARD_COLUMN_COUNT } from "../lib/work-board-columns";

const props = withDefaults(defineProps<{ kind?: LoadingSkeletonKind }>(), {
  kind: "rows",
});

const columnCount = (): number => {
  if (props.kind === "board") return WORK_BOARD_COLUMN_COUNT;
  if (props.kind === "inputBoard") return INPUT_BOARD_COLUMN_COUNT;
  return 0;
};

const itemCount = (): number => {
  if (props.kind === "board" || props.kind === "inputBoard") return columnCount();
  // Mission Control's data arrives as one continuous dashboard, not a card
  // collection. Stories is a vertical list, so one representative row suffices.
  if (props.kind === "dashboard" || props.kind === "rows") return 1;
  return LOADING_SKELETON_ITEM_COUNTS[props.kind];
};
</script>

<template>
  <div
    class="page-skeleton"
    :class="`page-skeleton--${kind}`"
    :style="columnCount() ? { '--skeleton-cols': String(columnCount()) } : undefined"
    aria-label="Loading page content"
    role="status"
    aria-live="polite"
  >
    <span v-for="i in itemCount()" :key="i" class="page-skeleton__item">
      <i></i><i></i><i></i>
    </span>
    <div v-if="kind === 'deployments'" class="page-skeleton__matrix">
      <span v-for="i in 4" :key="i" class="page-skeleton__item"><i></i><i></i><i></i></span>
    </div>
  </div>
</template>

<style scoped>
.page-skeleton {
  display: grid;
  gap: 12px;
  width: 100%;
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
  .page-skeleton__item i {
    animation: none;
  }
}
</style>
