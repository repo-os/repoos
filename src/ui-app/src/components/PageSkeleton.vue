<script setup lang="ts">
withDefaults(defineProps<{ kind?: "cards" | "table" | "rows" | "targets" | "deployments" }>(), {
  kind: "rows",
});
</script>

<template>
  <div class="page-skeleton" :class="`page-skeleton--${kind}`" aria-label="Loading page content">
    <span
      v-for="i in kind === 'cards' || kind === 'deployments' ? 3 : kind === 'targets' ? 2 : 5"
      :key="i"
      class="page-skeleton__item"
    >
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
  animation: page-skeleton-pulse 1.3s ease-in-out infinite alternate;
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
@media (prefers-reduced-motion: reduce) {
  .page-skeleton__item i {
    animation: none;
  }
}
</style>
