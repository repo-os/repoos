<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus, RotateCw, Search, X } from "lucide-vue-next";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { relTime } from "../lib/time";
import { parseTaskAreas } from "../../../core/areas.js";
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

/**
 * The queue's views. `attention` is the default: it is a *grouping* view
 * (Needs you / Review / Active / Ready / Inbox) rather than a status filter, so
 * a phone opens on the work that still needs a person instead of 1,000 done
 * cards. The parked lists (Held / Archived / Human) are real views too, so a
 * task the old queue filtered out forever is reachable from here (#1138).
 */
const statuses = [
  "attention",
  "all",
  "needs",
  "draft",
  "inbox",
  "ready",
  "active",
  "review",
  "done",
  "held",
  "archived",
  "human",
] as const;
type QueueStatus = (typeof statuses)[number];

const STATUS_LABELS: Record<QueueStatus, string> = {
  attention: "Needs attention",
  all: "All statuses",
  needs: "Needs you",
  draft: "Draft",
  inbox: "Inbox",
  ready: "Ready",
  active: "Active",
  review: "Review",
  done: "Done",
  held: "Held",
  archived: "Archived",
  human: "Human",
};

/** Status groups shown by the grouped views, in the order a phone needs them. */
const STATUS_SECTIONS = ["review", "active", "ready", "inbox", "draft", "done"] as const;
const PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
const URL_KEYS = ["status", "q", "priority", "area", "story", "mine", "sort"] as const;

/** Cards rendered per section before "Show more". With the six grouped
 *  sections this keeps the first paint under ~90 cards even on a 1,000-task
 *  board, while still letting the reader expand one section deliberately. */
const PAGE_SIZE = 12;

function stringParam(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

function readStatus(raw: unknown): QueueStatus {
  const value = stringParam(raw);
  return (statuses as readonly string[]).includes(value) ? (value as QueueStatus) : "attention";
}

const initial = route.query;
const status = ref<QueueStatus>(readStatus(initial.status));
const query = ref(stringParam(initial.q));
const priority = ref(PRIORITIES.includes(stringParam(initial.priority) as (typeof PRIORITIES)[number])
  ? stringParam(initial.priority)
  : "");
const area = ref(stringParam(initial.area) || "any");
const story = ref(stringParam(initial.story) || "any");
const mine = ref(initial.mine === "1");
const sort = ref<"newest" | "oldest">(initial.sort === "oldest" ? "oldest" : "newest");
const refreshError = ref("");
const refreshing = ref(false);
/** Per-section "Show more" page count, reset whenever the filters change. */
const page = ref<Record<string, number>>({});

function taskAreaNames(task: Task): string[] {
  return parseTaskAreas(task.areas?.length ? task.areas : task.area);
}

/** Shared queue search (#1138): id, title and area, the three things a phone
 *  user scans a card by. Uses the same canonical area parser as global search. */
function matchesQuery(task: Task, needle: string): boolean {
  if (task.id.toLowerCase().includes(needle)) return true;
  if (task.title.toLowerCase().includes(needle)) return true;
  return taskAreaNames(task).some((name) => name.toLowerCase().includes(needle));
}

/** Reuse the board's selectors instead of re-deriving held/human membership. */
const heldIds = computed(() => new Set(repo.heldTasks.map((task) => task.id)));

/** "Needs you" is the board's bell list, restated for the queue: a human is
 *  assigned it, it is waiting on an answer, or a hold is active. Archived
 *  tasks are parked and never demand action. */
function needsYou(task: Task): boolean {
  if (task.isArchived) return false;
  return (
    (task.assignee === "human" && task.status !== "done") ||
    (task.needsInput && task.status !== "done") ||
    heldIds.value.has(task.id)
  );
}

/**
 * The pool a view starts from, before search and quick filters. Archived tasks
 * are reachable only through their own view; done tasks never show in the
 * default attention view (the point of #1138: 1,035 done cards were burying the
 * one review task).
 */
const basePool = computed<Task[]>(() => {
  const all = repo.tasks;
  switch (status.value) {
    case "held":
      return repo.heldTasks;
    case "archived":
      return repo.archivedTasks;
    case "human":
      return repo.humanTasks;
    case "needs":
      return all.filter(needsYou);
    case "all":
      return all.filter((task) => !task.isArchived);
    case "attention":
      return all.filter((task) => !task.isArchived && task.status !== "done");
    default:
      return all.filter((task) => !task.isArchived && task.status === status.value);
  }
});

const areaOptions = computed(() => {
  const names = new Map<string, string>();
  for (const task of repo.tasks) {
    for (const name of taskAreaNames(task)) {
      const key = name.toLowerCase();
      if (name && !names.has(key)) names.set(key, name);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
});

const storyOptions = computed(() => {
  const names = new Set<string>();
  for (const task of repo.tasks) if (task.story) names.add(task.story);
  return [...names].sort((a, b) => a.localeCompare(b));
});

const filtered = computed<Task[]>(() => {
  const needle = query.value.trim().toLowerCase().replace(/^#/, "");
  const wantedArea = area.value.toLowerCase();
  const wantedStory = story.value;
  return basePool.value
    .filter((task) => {
      if (priority.value && task.priority !== priority.value) return false;
      if (wantedArea && wantedArea !== "any") {
        if (!taskAreaNames(task).some((name) => name.toLowerCase() === wantedArea)) return false;
      }
      if (wantedStory && wantedStory !== "any" && (task.story ?? "") !== wantedStory) return false;
      if (mine.value && task.assignee !== "human") return false;
      return !needle || matchesQuery(task, needle);
    })
    .sort((a, b) => {
      const order = (a.updated_at ?? "").localeCompare(b.updated_at ?? "");
      return sort.value === "newest" ? -order : order;
    });
});

interface QueueSection {
  id: string;
  label: string;
  tasks: Task[];
  visible: Task[];
  limit: number;
}

const sections = computed<QueueSection[]>(() => {
  const list = filtered.value;
  const grouped = status.value === "attention" || status.value === "all";
  const groups: { id: string; label: string; tasks: Task[] }[] = [];

  if (grouped) {
    const needs: Task[] = [];
    const buckets = new Map<string, Task[]>();
    for (const task of list) {
      if (needsYou(task)) {
        needs.push(task);
        continue;
      }
      const bucket = buckets.get(task.status);
      if (bucket) bucket.push(task);
      else buckets.set(task.status, [task]);
    }
    if (needs.length) groups.push({ id: "needs", label: STATUS_LABELS.needs, tasks: needs });
    for (const id of STATUS_SECTIONS) {
      // Done is behind its own filter in the default view; "All statuses" shows
      // it last, after every task that needs attention.
      if (status.value === "attention" && id === "done") continue;
      const tasks = buckets.get(id);
      if (tasks?.length) {
        groups.push({ id, label: STATUS_LABELS[id], tasks });
      }
    }
  } else {
    groups.push({ id: status.value, label: STATUS_LABELS[status.value], tasks: list });
  }

  return groups.map((group) => {
    const limit = page.value[group.id] ?? PAGE_SIZE;
    return { ...group, limit, visible: group.tasks.slice(0, limit) };
  });
});

const matchingCount = computed(() => filtered.value.length);
const renderedCount = computed(() =>
  sections.value.reduce((total, section) => total + section.visible.length, 0),
);
const countLabel = computed(() => {
  if (!matchingCount.value) return "No matching tasks";
  const noun = matchingCount.value === 1 ? "task" : "tasks";
  if (renderedCount.value < matchingCount.value) {
    return `${renderedCount.value} of ${matchingCount.value} ${noun}`;
  }
  return `${matchingCount.value} ${noun}`;
});

const emptyTitle = computed(() => {
  if (status.value === "attention") return "Nothing needs attention";
  if (status.value === "all") return "No tasks";
  return `No ${STATUS_LABELS[status.value].toLowerCase()} tasks`;
});

const filtersActive = computed(
  () =>
    status.value !== "attention" ||
    sort.value !== "newest" ||
    query.value.trim() !== "" ||
    priority.value !== "" ||
    area.value !== "any" ||
    story.value !== "any" ||
    mine.value,
);

function showMore(section: QueueSection): void {
  page.value = { ...page.value, [section.id]: section.limit + PAGE_SIZE };
}

function togglePriority(value: string): void {
  priority.value = priority.value === value ? "" : value;
}

function toggleParked(value: QueueStatus): void {
  status.value = status.value === value ? "attention" : value;
}

function resetQueue(): void {
  status.value = "attention";
  sort.value = "newest";
  query.value = "";
  priority.value = "";
  area.value = "any";
  story.value = "any";
  mine.value = false;
  page.value = {};
}

/** Reset paging whenever the result set changes under the reader. */
watch([status, query, priority, area, story, mine, sort], () => {
  page.value = {};
});

function desiredQuery(): Record<string, string> {
  const next: Record<string, string> = {};
  if (status.value !== "attention") next.status = status.value;
  if (query.value) next.q = query.value;
  if (priority.value) next.priority = priority.value;
  if (area.value !== "any") next.area = area.value;
  if (story.value !== "any") next.story = story.value;
  if (mine.value) next.mine = "1";
  if (sort.value !== "newest") next.sort = sort.value;
  return next;
}

function currentQueueParams(): Record<string, string> {
  const current: Record<string, string> = {};
  for (const key of URL_KEYS) current[key] = stringParam(route.query[key]);
  return current;
}

// Filter + search state lives in the URL (#1138) so `/work?status=review` opens
// the review view and reload/Back keep the reader where they were. `replace`
// (not `push`) keeps typing a search from stacking one history entry per key.
watch([status, query, priority, area, story, mine, sort], () => {
  const desired = desiredQuery();
  const current = currentQueueParams();
  if (URL_KEYS.every((key) => (desired[key] ?? "") === current[key])) return;
  const next: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(route.query)) {
    if (typeof value === "string") next[key] = value;
    else if (Array.isArray(value)) next[key] = value.filter((v): v is string => typeof v === "string");
  }
  for (const key of URL_KEYS) delete next[key];
  Object.assign(next, desired);
  void router.replace({ query: next });
});

// A Back/forward or an external link changes the URL without touching our
// refs — adopt it, then let the write-back watcher settle on the same values.
watch(
  () => currentQueueParams(),
  (current) => {
    status.value = readStatus(current.status);
    query.value = current.q;
    priority.value = PRIORITIES.includes(current.priority as (typeof PRIORITIES)[number])
      ? current.priority
      : "";
    area.value = current.area || "any";
    story.value = current.story || "any";
    mine.value = current.mine === "1";
    sort.value = current.sort === "oldest" ? "oldest" : "newest";
  },
);

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
        <p class="mobile-work-count" data-testid="mobile-queue-count">{{ countLabel }}</p>
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
      <div class="mobile-search-row">
        <Search class="mobile-search-icon" aria-hidden="true" />
        <input
          v-model="query"
          class="mobile-search-input"
          type="search"
          inputmode="search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="Search id, title or area"
          aria-label="Search tasks"
          data-testid="mobile-queue-search"
        />
        <button
          v-if="query"
          class="mobile-search-clear"
          type="button"
          aria-label="Clear search"
          @click="query = ''"
        >
          <X aria-hidden="true" />
        </button>
      </div>

      <div class="mobile-queue-row">
        <label class="mobile-status-filter">
          <span>Show</span>
          <Select
            :model-value="status"
            @update:model-value="(value) => (status = value as QueueStatus)"
          >
            <SelectTrigger aria-label="Filter tasks by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectViewport>
                <SelectItem v-for="item in statuses" :key="item" :value="item">
                  {{ STATUS_LABELS[item] }}
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
          :disabled="!filtersActive"
          @click="resetQueue"
        >
          Reset
        </button>
      </div>

      <div class="mobile-chip-row" role="group" aria-label="Quick filters">
        <span class="mobile-chip-label">Priority</span>
        <button
          v-for="p in PRIORITIES"
          :key="p"
          class="mobile-chip"
          :class="{ active: priority === p }"
          type="button"
          :aria-pressed="priority === p"
          @click="togglePriority(p)"
        >
          {{ p.toUpperCase() }}
        </button>

        <span class="mobile-chip-label">Area</span>
        <Select
          :model-value="area"
          @update:model-value="(value) => (area = String(value))"
        >
          <SelectTrigger class="mobile-chip-select" aria-label="Filter tasks by area">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectViewport>
              <SelectItem value="any">Any area</SelectItem>
              <SelectItem v-for="item in areaOptions" :key="item" :value="item">
                {{ item }}
              </SelectItem>
            </SelectViewport>
          </SelectContent>
        </Select>

        <span class="mobile-chip-label">Story</span>
        <Select
          :model-value="story"
          @update:model-value="(value) => (story = String(value))"
        >
          <SelectTrigger class="mobile-chip-select" aria-label="Filter tasks by story">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectViewport>
              <SelectItem value="any">Any story</SelectItem>
              <SelectItem v-for="item in storyOptions" :key="item" :value="item">
                {{ item }}
              </SelectItem>
            </SelectViewport>
          </SelectContent>
        </Select>

        <button
          class="mobile-chip"
          :class="{ active: mine }"
          type="button"
          :aria-pressed="mine"
          @click="mine = !mine"
        >
          Assigned to you
        </button>

        <button
          v-if="repo.heldTasks.length || status === 'held'"
          class="mobile-chip mobile-chip-parked"
          :class="{ active: status === 'held' }"
          type="button"
          :aria-pressed="status === 'held'"
          data-testid="mobile-filter-held"
          @click="toggleParked('held')"
        >
          Held ({{ repo.heldTasks.length }})
        </button>
        <button
          v-if="repo.archivedTasks.length || status === 'archived'"
          class="mobile-chip mobile-chip-parked"
          :class="{ active: status === 'archived' }"
          type="button"
          :aria-pressed="status === 'archived'"
          data-testid="mobile-filter-archived"
          @click="toggleParked('archived')"
        >
          Archived ({{ repo.archivedTasks.length }})
        </button>
        <button
          v-if="repo.humanTasks.length || status === 'human'"
          class="mobile-chip mobile-chip-parked"
          :class="{ active: status === 'human' }"
          type="button"
          :aria-pressed="status === 'human'"
          data-testid="mobile-filter-human"
          @click="toggleParked('human')"
        >
          Human ({{ repo.humanTasks.length }})
        </button>
      </div>
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
      <div v-else-if="!matchingCount" class="mobile-queue-state">
        <h2>{{ emptyTitle }}</h2>
        <p>{{ filtersActive ? "Clear the filters to see the full queue." : "Nothing to show yet." }}</p>
        <Button v-if="filtersActive" variant="outline" @click="resetQueue">
          Show all tasks
        </Button>
      </div>
      <template v-else>
        <section
          v-for="section in sections"
          :key="section.id"
          class="mobile-queue-section"
          :data-section="section.id"
        >
          <header class="mobile-section-head">
            <h2>
              {{ section.label }}
              <span class="mobile-section-count">{{ section.tasks.length }}</span>
            </h2>
            <button
              v-if="section.tasks.length > section.limit"
              class="mobile-section-more"
              type="button"
              @click="showMore(section)"
            >
              Show {{ Math.min(PAGE_SIZE, section.tasks.length - section.limit) }} more
            </button>
          </header>
          <ul>
            <li v-for="task in section.visible" :key="task.id" :data-task-id="task.id">
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
                  <span class="mobile-task-status" :data-status="task.status">
                    {{ task.status }}
                  </span>
                  <span v-if="task.area" class="mobile-task-area">{{ task.area }}</span>
                  <span v-if="task.assignee === 'human'" class="mobile-task-human">human</span>
                  <span v-if="heldIds.has(task.id)" class="mobile-task-held">held</span>
                  <span v-if="task.needsInput" class="mobile-task-needs">needs input</span>
                </span>
              </button>
            </li>
          </ul>
        </section>
      </template>
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
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel);
}
.mobile-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 6px 0 11px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
}
.mobile-search-row:focus-within {
  border-color: var(--cyan);
}
.mobile-search-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--txt-faint);
}
.mobile-search-input {
  min-width: 0;
  flex: 1;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--txt);
  font: inherit;
  /* 16px keeps iOS Safari from zooming the page when the field takes focus. */
  font-size: 16px;
}
.mobile-search-input::placeholder {
  color: var(--txt-faint);
}
.mobile-search-input:focus {
  outline: none;
}
.mobile-search-input::-webkit-search-cancel-button {
  display: none;
}
.mobile-search-clear {
  display: inline-grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--txt-faint);
  cursor: pointer;
}
.mobile-search-clear :deep(svg) {
  width: 16px;
  height: 16px;
}
.mobile-search-clear:focus-visible,
.mobile-chip:focus-visible,
.mobile-section-more:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}
.mobile-queue-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
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
  min-height: 44px;
  color: var(--txt);
  text-transform: none;
  letter-spacing: 0;
  font-size: 13px;
}
.mobile-sort {
  display: grid;
  min-height: 44px;
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
  min-height: 44px;
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
.mobile-chip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.mobile-chip-row::-webkit-scrollbar {
  display: none;
}
.mobile-chip-label {
  flex: 0 0 auto;
  color: var(--txt-faint);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.mobile-chip {
  display: inline-flex;
  min-height: 34px;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  color: var(--txt-muted, var(--txt-faint));
  font: inherit;
  font-size: 12px;
  font-weight: 550;
  white-space: nowrap;
  cursor: pointer;
}
.mobile-chip.active {
  border-color: color-mix(in srgb, var(--cyan) 55%, var(--border));
  background: color-mix(in srgb, var(--cyan) 12%, transparent);
  color: var(--cyan);
}
.mobile-chip-parked {
  border-style: dashed;
}
.mobile-chip-select {
  min-height: 34px;
  flex: 0 0 auto;
  padding: 0 11px;
  border-radius: 999px;
  font-size: 12px;
}
.mobile-task-list {
  margin-top: 12px;
}
.mobile-queue-section {
  margin-bottom: 18px;
}
.mobile-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 1px 8px;
}
.mobile-section-head h2 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: var(--txt-muted, var(--txt-faint));
  font: 700 10px/1.2 var(--font-mono, monospace);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.mobile-section-count {
  min-width: 20px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--txt-faint);
  text-align: center;
  font-size: 10px;
  letter-spacing: 0;
}
.mobile-section-more {
  min-height: 34px;
  padding: 0 6px;
  border: 0;
  background: transparent;
  color: var(--cyan);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.mobile-queue-section ul {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.mobile-queue-section li {
  /* Long queues only paint the cards near the viewport (#1138). */
  content-visibility: auto;
  contain-intrinsic-size: auto 104px;
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
.mobile-task-area {
  color: var(--txt-muted, var(--txt-faint));
}
.mobile-task-human {
  border-color: color-mix(in srgb, var(--purple, var(--cyan)) 55%, var(--border));
  color: var(--purple, var(--cyan));
}
.mobile-task-held {
  border-style: dashed;
  color: var(--txt-muted, var(--txt-faint));
}
.mobile-task-needs {
  border-color: color-mix(in srgb, var(--amber, var(--cyan)) 55%, var(--border));
  color: var(--amber, var(--txt));
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
  /* The routed shell already carries --page-bottom-inset on its scroller, so
     the queue only needs a small final breath — not a second full tab-bar gap. */
  height: 16px;
}
</style>
