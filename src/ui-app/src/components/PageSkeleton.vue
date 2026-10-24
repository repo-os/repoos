<script setup lang="ts">
withDefaults(defineProps<{ kind?: "cards" | "table" | "rows" }>(), { kind: "rows" });
</script>

<template>
  <div class="page-skeleton" :class="`page-skeleton--${kind}`" aria-label="Loading page content" aria-busy="true">
    <span v-for="i in kind === 'cards' ? 3 : 5" :key="i" class="page-skeleton__item">
      <i></i><i></i><i></i>
    </span>
  </div>
</template>

<style scoped>
.page-skeleton { display: grid; gap: 12px; width: 100%; }
.page-skeleton--cards { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.page-skeleton--table { gap: 1px; }
.page-skeleton__item { display: grid; gap: 10px; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-solid); }
.page-skeleton--table .page-skeleton__item { border-radius: 0; }
.page-skeleton__item i { display: block; height: 12px; width: 72%; border-radius: 4px; background: var(--bg-2); animation: page-skeleton-pulse 1.3s ease-in-out infinite alternate; }
.page-skeleton__item i:first-child { width: 42%; height: 16px; }
.page-skeleton__item i:last-child { width: 58%; }
@keyframes page-skeleton-pulse { to { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .page-skeleton__item i { animation: none; } }
</style>
