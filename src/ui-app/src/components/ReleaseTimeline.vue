<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { releaseTimelineTasks } from "../releases";
import Card from "./ui/card.vue";

const repo = useRepoStore();
const ui = useUiStore();
const { tasks } = storeToRefs(repo);
const releases = computed(() => releaseTimelineTasks(tasks.value));

function releaseDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(new Date(value));
}
</script>

<template>
  <Card class="release-panel">
    <div class="panel-head">
      <div class="panel-title">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12h14M13 6l6 6-6 6"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Feature releases
      </div>
      <span class="tag release-count">{{ releases.length }} recent</span>
    </div>
    <div v-if="!releases.length" class="feed-empty">Completed task merges will appear here.</div>
    <div v-else class="release-list">
      <button
        v-for="task in releases"
        :key="task.id"
        class="release-item"
        type="button"
        :aria-label="`Open task ${task.id}: ${task.title}`"
        @click="ui.openTask(task)"
      >
        <span class="release-rail" aria-hidden="true">
          <span class="release-dot"></span>
          <span class="release-line"></span>
        </span>
        <span class="release-copy">
          <span class="release-title">{{ task.title }}</span>
          <span class="release-meta">#{{ task.id }} · {{ task.area }}</span>
        </span>
        <time :datetime="task.releasedAt || undefined" class="release-date">{{
          releaseDate(task.releasedAt)
        }}</time>
        <svg class="release-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m9 6 6 6-6 6"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </Card>
</template>

<style scoped>
.release-panel {
  margin-bottom: 18px;
}
.release-count {
  background: var(--green-tint);
  color: var(--green);
}
.release-list {
  padding: 4px 0;
}
.release-item {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  width: 100%;
  padding: 11px 17px;
  text-align: left;
  cursor: pointer;
}
.release-item:hover {
  background: var(--nav-hover-bg);
}
.release-item:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: -2px;
}
.release-rail {
  flex: 0 0 auto;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 10px;
}
.release-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
  margin-top: 5px;
  background: var(--green);
  box-shadow: 0 0 7px color-mix(in srgb, var(--green) 65%, transparent);
}
.release-line {
  flex: 1;
  width: 1px;
  background: var(--border);
  margin: 4px 0 0;
}
.release-item:last-child .release-line {
  display: none;
}
.release-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.release-title {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.release-meta,
.release-date {
  color: var(--txt-faint);
  font:
    10px "JetBrains Mono",
    monospace;
}
.release-date {
  flex: 0 0 auto;
}
.release-arrow {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  color: var(--txt-faint);
}
</style>
