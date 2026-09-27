<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import SearchOverlay from "./SearchOverlay.vue";

const route = useRoute();
const overlayOpen = ref(false);

function openOverlay(): void {
  overlayOpen.value = true;
}

function onGlobalKey(e: KeyboardEvent): void {
  if (route.name === "settings") return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openOverlay();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onGlobalKey);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKey));
</script>

<template>
  <div class="search-wrap">
    <button class="search-input" type="button" @click="openOverlay">
      <svg class="search-ico" width="13" height="13" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <span class="search-placeholder hidden sm:inline">Search tasks, docs, settings…</span>
      <kbd>⌘K</kbd>
    </button>

    <SearchOverlay v-model:open="overlayOpen" scope="all" />
  </div>
</template>
