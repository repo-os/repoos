<script setup lang="ts">
import { computed } from "vue";
import {
  workQueueFilterChips,
  workQueueSortChip,
  type WorkQueueFilterChip,
  type WorkQueueFilters,
  type WorkQueueSort,
} from "../lib/workQueueFilters";

const props = withDefaults(
  defineProps<{
    filters: WorkQueueFilters;
    /** The URL's sort, applied to the board; null leaves the board's own sort. */
    sort?: WorkQueueSort | null;
    /** URL values that were present but not usable. */
    ignored?: WorkQueueFilterChip[];
    /** False on a view that does not filter (the pipeline), so the bar says so. */
    applied?: boolean;
  }>(),
  { sort: null, ignored: () => [], applied: true },
);
const emit = defineEmits<{ clear: [] }>();

const sortChip = computed(() => workQueueSortChip(props.sort));
const chips = computed(() => [
  ...workQueueFilterChips(props.filters),
  ...(sortChip.value ? [sortChip.value] : []),
  ...props.ignored,
]);
</script>

<template>
  <!-- Shown whenever a search, quick filter, sort or ignored value is in the URL,
       so no view hides tasks or drops a value silently. Clear removes the queue
       filter keys, the board sort and any ignored status; a board status column
       stays, since it has its own bar. -->
  <div class="filter-bar board-queue-filters" role="group" aria-label="Active board filters">
    <ul class="board-queue-filter-chips">
      <li v-for="chip in chips" :key="`${chip.key}-${chip.label}`">
        <span
          class="filter-chip"
          :class="{ 'filter-chip-ignored': chip.ignored }"
          :data-filter-key="chip.key"
          >{{ chip.label }}</span
        >
      </li>
    </ul>
    <p v-if="!applied" class="board-queue-filter-note">
      This view doesn't apply these filters. Switch to Board to filter tasks.
    </p>
    <button type="button" class="filter-clear" @click="emit('clear')">Clear filters</button>
  </div>
</template>

<style scoped>
.board-queue-filters {
  flex-wrap: wrap;
  align-items: flex-start;
}
.board-queue-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 0;
}
.board-queue-filter-chips .filter-chip {
  max-width: 100%;
  overflow-wrap: anywhere;
}
.board-queue-filter-note {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  color: var(--txt-dim);
}
.filter-chip-ignored {
  color: var(--txt-dim);
  border-style: dashed;
}
.board-queue-filters .filter-clear {
  background: none;
  border: 0;
  padding: 6px 0;
  cursor: pointer;
  font-family: inherit;
}
</style>
