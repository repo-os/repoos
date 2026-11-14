<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { navFromConfig } from "../nav";
import { useConfigStore } from "../stores/config";

const config = useConfigStore();
const open = ref(false);
const moreButton = ref<HTMLButtonElement | null>(null);
const nav = computed(() => navFromConfig(config.data));
const work = computed(() => nav.value.find((item) => item.id === "work")!);
const settings = computed(() => nav.value.find((item) => item.id === "settings")!);
const searchIcon = '<svg viewBox="0 0 24 24" fill="none"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const moreIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
const secondary = computed(() => nav.value.filter((item) => item.id !== "work" && item.id !== "settings").map((item) =>
  item.id === "dashboard" ? { ...item, label: "Activity" } : item,
));

function openSearch(): void {
  window.dispatchEvent(new Event("repoos:open-search"));
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && open.value) {
    open.value = false;
    nextTick(() => moreButton.value?.focus());
  }
}
watch(open, (value) => {
  if (value) nextTick(() => document.querySelector<HTMLElement>(".mobile-more-link")?.focus());
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
window.addEventListener("keydown", onKeydown);
</script>

<template>
  <nav class="tabbar" aria-label="Mobile navigation">
    <RouterLink :to="work.path" class="tab" active-class="active" exact-active-class="active">
      <span v-html="work.icon"></span><span>Work</span>
    </RouterLink>
    <button class="tab" type="button" aria-label="Search" @click="openSearch">
      <span v-html="searchIcon"></span><span>Search</span>
    </button>
    <button
      ref="moreButton"
      class="tab"
      type="button"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="open = !open"
    >
      <span v-html="moreIcon"></span><span>More</span>
    </button>
    <RouterLink :to="settings.path" class="tab" active-class="active" exact-active-class="active">
      <span v-html="settings.icon"></span><span>Settings</span>
    </RouterLink>
  </nav>

  <Teleport to="body">
    <div v-if="open" class="mobile-more-layer" data-overlay-layer="floating">
      <button class="mobile-more-scrim" aria-label="Close navigation menu" @click="open = false"></button>
      <section class="mobile-more-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title">
        <div class="mobile-more-grip" aria-hidden="true"></div>
        <h2 id="mobile-more-title">More</h2>
        <nav aria-label="More destinations">
          <RouterLink
            v-for="item in secondary"
            :key="item.id"
            :to="item.path"
            class="mobile-more-link"
            @click="open = false"
          >
            <span class="mobile-more-icon" v-html="item.icon"></span>
            <span>{{ item.label }}</span>
            <span class="mobile-more-arrow" aria-hidden="true">›</span>
          </RouterLink>
        </nav>
      </section>
    </div>
  </Teleport>
</template>
