<script setup lang="ts">
import { useRepoStore } from "../stores/repo";
import type { Column } from "../stores/repo";
import TaskCard from "./TaskCard.vue";

defineProps<{ col: Column }>();

const repo = useRepoStore();
</script>

<template>
  <div>
    <div class="col-head">
      <span class="cdot" :style="{ background: col.color, boxShadow: '0 0 6px ' + col.color }"></span>
      {{ col.label }}
      <span class="col-count">{{ repo.byStatus(col.id).length }}</span>
    </div>
    <div class="col-body">
      <TaskCard v-for="t in repo.byStatus(col.id)" :key="t.id" :task="t" />
      <div
        v-if="!repo.byStatus(col.id).length"
        style="font-size: 10.5px; color: var(--txt-faint); text-align: center; padding: 14px 0; font-family: 'JetBrains Mono', monospace"
      >
        —
      </div>
    </div>
  </div>
</template>
