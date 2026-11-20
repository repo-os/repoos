<script setup lang="ts">
import { computed } from "vue";
import { workQueueFilterChips, type WorkQueueFilters } from "../lib/workQueueFilters";

const props = defineProps<{ filters: WorkQueueFilters }>();
const emit = defineEmits<{ clear: [] }>();

const chips = computed(() => workQueueFilterChips(props.filters));
</script>

<template>
  <!-- Shown on the desktop board whenever a search or quick filter is in the
       URL, so the board never silently hides tasks. Clear removes only the
       queue filter keys; status and sort stay as they are. -->
  <div class="filter-bar board-queue-filters" role="group" aria-label="Active board filters">
    <ul class="board-queue-filter-chips">
      <li v-for="chip in chips" :key="chip.key">
        <span class="filter-chip" :data-filter-key="chip.key">{{ chip.label }}</span>
      </li>
    </ul>
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
.board-queue-filters .filter-clear {
  background: none;
  border: 0;
  padding: 6px 0;
  cursor: pointer;
  font-family: inherit;
}
</style>
