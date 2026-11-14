<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus, RotateCw } from "lucide-vue-next";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { relTime } from "../lib/time";
import type { Task } from "../types";
import Button from "./ui/button.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";

const repo = useRepoStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const statuses = ["all", "draft", "inbox", "ready", "active", "review", "done"] as const;
const status = ref<(typeof statuses)[number]>("all");
const sort = ref<"newest" | "oldest">("newest");
const refreshError = ref("");
const refreshing = ref(false);
const tasks = computed(() => {
  const visible = repo.tasks.filter((task) => !task.isArchived && !task.isHeld);
  return visible
    .filter((task) => status.value === "all" || task.status === status.value)
    .sort((a, b) => {
      const order = (a.updated_at ?? "").localeCompare(b.updated_at ?? "");
      return sort.value === "newest" ? -order : order;
    });
});

function resetQueue(): void {
  status.value = "all";
  sort.value = "newest";
}

async function retryLoad(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  refreshError.value = "";
  try {
    await repo.refresh();
  } catch (error) {
    refreshError.value = error instanceof Error ? error.message : "Could not load tasks.";
  } finally {
    refreshing.value = false;
  }
}

function openTask(task: Task): void {
  void router.push({
    path: "/work",
    query: { ...route.query, task: task.id },
  });
}
</script>

<template>
  <main class="mobile-work" data-testid="mobile-work-queue">
    <header class="mobile-work-heading">
      <div>
        <p class="mobile-work-kicker">REPOOS / WORK</p>
        <h1>Work queue</h1>
        <p class="mobile-work-count">
          {{ tasks.length }} {{ tasks.length === 1 ? "task" : "tasks" }}
        </p>
      </div>
      <Button
        variant="accent"
        class="mobile-new-task"
        data-testid="mobile-new-task"
        @click="ui.openNewTask()"
      >
        <Plus aria-hidden="true" /> New task
      </Button>
    </header>

    <section class="mobile-queue-controls" aria-label="Queue controls">
      <label class="mobile-status-filter">
        <span>Status</span>
        <Select
          :model-value="status"
          @update:model-value="(value) => (status = value as typeof status)"
        >
          <SelectTrigger aria-label="Filter tasks by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectViewport>
              <SelectItem v-for="item in statuses" :key="item" :value="item">
                {{ item === "all" ? "All statuses" : item[0]!.toUpperCase() + item.slice(1) }}
              </SelectItem>
            </SelectViewport>
          </SelectContent>
        </Select>
      </label>
      <button
        class="mobile-sort"
        type="button"
        :aria-label="`Sort by updated time, currently ${sort === 'newest' ? 'newest first' : 'oldest first'}`"
        @click="sort = sort === 'newest' ? 'oldest' : 'newest'"
      >
        <span>Updated</span><strong>{{ sort === "newest" ? "Newest" : "Oldest" }}</strong>
      </button>
      <button
        class="mobile-reset"
        type="button"
        :disabled="status === 'all' && sort === 'newest'"
        @click="resetQueue"
      >
        Reset
      </button>
    </section>

    <section class="mobile-task-list" aria-label="Tasks">
      <div v-if="repo.loading" class="mobile-queue-state" role="status">Loading tasks…</div>
      <div v-else-if="refreshError" class="mobile-queue-state mobile-queue-error" role="alert">
        <p>{{ refreshError }}</p>
        <Button variant="outline" :disabled="refreshing" @click="retryLoad">
          <RotateCw aria-hidden="true" /> {{ refreshing ? "Retrying…" : "Retry" }}
        </Button>
      </div>
      <div v-else-if="!repo.tasks.length" class="mobile-queue-state mobile-queue-empty">
        <h2>No tasks yet</h2>
        <p>Create a task to start building your queue.</p>
        <Button variant="outline" @click="ui.openNewTask()">Create your first task</Button>
      </div>
      <div v-else-if="!tasks.length" class="mobile-queue-state">
        <h2>No {{ status }} tasks</h2>
        <p>Clear the filter to see the full queue.</p>
        <Button variant="outline" @click="resetQueue">Show all tasks</Button>
      </div>
      <ul v-else>
        <li v-for="task in tasks" :key="task.id">
          <button class="mobile-task-card" type="button" @click="openTask(task)">
            <span class="mobile-task-topline">
              <span class="mobile-task-number">#{{ task.id }}</span>
              <time :datetime="task.updated_at ?? undefined">
                {{ task.updated_at ? relTime(task.updated_at) : "No update time" }}
              </time>
            </span>
            <span class="mobile-task-title">{{ task.title }}</span>
            <span class="mobile-task-meta">
              <span class="mobile-task-type">{{ task.type }}</span>
              <span class="mobile-task-priority">{{ task.priority }}</span>
              <span class="mobile-task-status" :data-status="task.status">{{ task.status }}</span>
            </span>
          </button>
        </li>
      </ul>
    </section>
    <div class="mobile-work-bottom-space" aria-hidden="true"></div>
  </main>
</template>

<style scoped>
.mobile-work {
  min-width: 0;
  padding: 4px 0 0;
  color: var(--txt);
}
.mobile-work-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 20px;
}
.mobile-work-kicker {
  margin: 0 0 5px;
  color: var(--cyan);
  font: 600 10px/1.2 var(--font-mono, monospace);
  letter-spacing: 0.11em;
}
.mobile-work-heading h1 {
  margin: 0;
  font-size: 23px;
  line-height: 1.15;
  letter-spacing: -0.035em;
}
.mobile-work-count {
  margin: 5px 0 0;
  color: var(--txt-faint);
  font-size: 12px;
}
.mobile-new-task {
  min-height: 46px;
  flex: 0 0 auto;
  gap: 7px;
  padding: 0 14px;
  border-radius: 11px;
  font-weight: 650;
}
.mobile-new-task :deep(svg) {
  width: 17px;
  height: 17px;
}
.mobile-queue-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel);
}
.mobile-status-filter {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--txt-faint);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.mobile-status-filter :deep(button) {
  width: 100%;
  min-height: 40px;
  color: var(--txt);
  text-transform: none;
  letter-spacing: 0;
  font-size: 13px;
}
.mobile-sort {
  display: grid;
  min-height: 40px;
  align-content: center;
  gap: 2px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--txt-faint);
  text-align: left;
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.mobile-sort strong {
  color: var(--txt);
  font-size: 13px;
  font-weight: 550;
}
.mobile-reset {
  min-height: 40px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--cyan);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.mobile-reset:disabled {
  color: var(--txt-faint);
  opacity: 0.55;
}
.mobile-task-list {
  margin-top: 12px;
}
.mobile-task-list ul {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.mobile-task-card {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel);
  color: var(--txt);
  text-align: left;
  cursor: pointer;
}
.mobile-task-card:active {
  background: var(--bg-secondary);
}
.mobile-task-card:focus-visible,
.mobile-sort:focus-visible,
.mobile-reset:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}
.mobile-task-topline,
.mobile-task-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.mobile-task-topline {
  justify-content: space-between;
  color: var(--txt-faint);
  font-size: 11px;
}
.mobile-task-number {
  color: var(--cyan);
  font-family: var(--font-mono, monospace);
  font-weight: 600;
}
.mobile-task-title {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 15px;
  line-height: 1.4;
  font-weight: 600;
}
.mobile-task-meta > span {
  max-width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  overflow-wrap: anywhere;
  font-size: 10px;
  line-height: 1.1;
}
.mobile-task-type {
  color: var(--txt-muted, var(--txt-faint));
}
.mobile-task-priority {
  color: var(--amber, var(--txt));
  text-transform: uppercase;
}
.mobile-task-status {
  color: var(--txt);
  text-transform: capitalize;
}
.mobile-task-status[data-status="active"] {
  border-color: color-mix(in srgb, var(--cyan) 45%, var(--border));
  color: var(--cyan);
}
.mobile-task-status[data-status="review"] {
  border-color: color-mix(in srgb, var(--purple, var(--cyan)) 45%, var(--border));
}
.mobile-queue-state {
  display: grid;
  justify-items: start;
  gap: 7px;
  padding: 28px 18px;
  border: 1px dashed var(--border);
  border-radius: 13px;
  color: var(--txt-faint);
}
.mobile-queue-state h2,
.mobile-queue-state p {
  margin: 0;
}
.mobile-queue-state h2 {
  color: var(--txt);
  font-size: 16px;
}
.mobile-queue-state p {
  font-size: 13px;
  line-height: 1.5;
}
.mobile-queue-error {
  border-color: var(--red);
}
.mobile-queue-state :deep(button) {
  min-height: 42px;
  gap: 7px;
  margin-top: 5px;
}
.mobile-work-bottom-space {
  height: 120px;
}
</style>
