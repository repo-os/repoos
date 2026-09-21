<script setup lang="ts">
import { computed, ref } from "vue";
import { deriveStories } from "../../../core/stories.js";
import { useRepoStore, statusColor } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { useUiStore } from "../stores/ui";
import { relTime } from "../lib/time";
import TaskCard from "../components/TaskCard.vue";
import type { Status, Task } from "../types";

const STATUS_ORDER: Status[] = ["draft", "inbox", "ready", "active", "review", "done"];

const repo = useRepoStore();
const config = useConfigStore();
const ui = useUiStore();

const enabled = computed(
  () => (config.data?.stories as { enabled?: unknown } | undefined)?.enabled === true,
);

const stories = computed(() => deriveStories(repo.tasks));

/** Stories whose member tasks are revealed. */
const expanded = ref<Set<string>>(new Set());

function toggle(key: string): void {
  const next = new Set(expanded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expanded.value = next;
}

function percent(done: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((done / total) * 100)}%`;
}

interface StatusChip {
  id: Status;
  label: string;
  count: number;
  color: string;
}

function statusChips(counts: Record<Status, number>): StatusChip[] {
  return STATUS_ORDER.filter((id) => counts[id] > 0).map((id) => ({
    id,
    label: config.columnLabels[id] ?? id,
    count: counts[id],
    color: statusColor(id),
  }));
}

interface LiveRow {
  task: Task;
  cue: string;
  cueClass: string;
}

/** Tasks that need attention now: blocked, waiting on input, in review, or active. */
function liveTasks(tasks: Task[]): LiveRow[] {
  const rank = (t: Task): number => {
    if (t.needsInput) return 0;
    if (t.needsMerge) return 1;
    if (t.status === "review") return 2;
    if (t.status === "active") return 3;
    return 4;
  };
  return tasks
    .filter((t) => t.needsInput || t.needsMerge || t.status === "active" || t.status === "review")
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
    })
    .slice(0, 5)
    .map((task) => {
      if (task.needsInput) {
        const reason = task.needsInputReason ? ` · ${task.needsInputReason}` : "";
        return { task, cue: `needs input${reason}`, cueClass: "attention" };
      }
      if (task.needsMerge) return { task, cue: "needs merge", cueClass: "attention" };
      if (task.status === "review") return { task, cue: "in review", cueClass: "review" };
      return { task, cue: "active", cueClass: "active" };
    });
}

function lastActivity(story: { lastActivity: string | null }): string {
  return story.lastActivity ? relTime(story.lastActivity) : "no activity yet";
}
</script>

<template>
  <div class="stories-page">
    <header class="stories-header">
      <div>
        <h1 class="stories-title">Stories</h1>
        <p class="stories-sub">
          Cross-area delivery slices, derived from tasks tagged with a
          <code>story</code>. A story is complete only when every one of its tasks is done.
        </p>
      </div>
    </header>

    <div v-if="!enabled" class="stories-panel stories-empty">
      Stories aren't enabled for this repository. Add a <code>[stories]</code> block with
      <code>enabled = true</code> to <a href="/settings?tab=toml">repoos.toml</a> to turn this page
      on.
    </div>

    <div v-else-if="stories.length === 0" class="stories-panel stories-empty">
      <div class="stories-empty-title">
        {{ repo.tasks.length === 0 ? "No tasks yet" : "No stories yet" }}
      </div>
      <div v-if="repo.tasks.length > 0">
        Tag a task with a story to group it with related work. Use the Story field in the task
        drawer, or <code>repoos update &lt;id&gt; --story "Project updates email"</code>.
      </div>
    </div>

    <div v-else class="stories-grid">
      <article
        v-for="story in stories"
        :key="story.key"
        class="story-card"
        :class="{ complete: story.complete }"
      >
        <button
          type="button"
          class="story-head"
          :aria-expanded="expanded.has(story.key)"
          @click="toggle(story.key)"
        >
          <div class="story-head-main">
            <div class="story-name-row">
              <h2 class="story-name">{{ story.name }}</h2>
              <span v-if="story.complete" class="story-badge story-badge-done">complete</span>
              <span v-else-if="story.attention > 0" class="story-badge story-badge-attention">
                {{ story.attention }} need input
              </span>
            </div>
            <div class="story-meta">
              <span>{{ story.total }} {{ story.total === 1 ? "task" : "tasks" }}</span>
              <span class="story-dot-sep">·</span>
              <span>Last activity {{ lastActivity(story) }}</span>
            </div>
          </div>
          <div class="story-progress-wrap">
            <span class="story-frac">{{ story.done }}/{{ story.total }}</span>
            <div class="story-bar">
              <i :style="{ width: percent(story.done, story.total) }"></i>
            </div>
          </div>
          <svg
            class="story-chevron"
            :class="{ open: expanded.has(story.key) }"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <div class="story-chips">
          <span
            v-for="chip in statusChips(story.counts)"
            :key="chip.id"
            class="story-chip"
            :style="{ '--chip': chip.color }"
          >
            <i class="story-chip-dot"></i>{{ chip.label }} {{ chip.count }}
          </span>
        </div>

        <div v-if="liveTasks(story.tasks).length" class="story-live">
          <button
            v-for="row in liveTasks(story.tasks)"
            :key="row.task.id"
            type="button"
            class="story-live-row"
            @click="ui.openTask(row.task)"
          >
            <span
              class="story-live-dot"
              :style="{ background: statusColor(row.task.status) }"
            ></span>
            <span class="story-live-title">#{{ row.task.id }} {{ row.task.title }}</span>
            <span class="story-live-cue" :class="row.cueClass">{{ row.cue }}</span>
          </button>
        </div>

        <div v-if="expanded.has(story.key)" class="story-members">
          <TaskCard v-for="task in story.tasks" :key="task.id" :task="task" :drag-enabled="false" />
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.stories-page {
  padding: 22px 26px 60px;
  max-width: 1100px;
  margin: 0 auto;
}
.stories-header {
  margin-bottom: 20px;
}
.stories-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 650;
  color: var(--txt);
  letter-spacing: -0.01em;
}
.stories-sub {
  margin: 0;
  max-width: 640px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--txt-dim);
}
.stories-sub code,
.stories-empty code {
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--panel-solid);
  border: 1px solid var(--border);
  color: var(--txt);
}
.stories-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  padding: 28px;
}
.stories-empty {
  color: var(--txt-dim);
  font-size: 13px;
  line-height: 1.6;
}
.stories-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--txt);
  margin-bottom: 6px;
}
.stories-empty a {
  color: var(--cyan);
}

.stories-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.story-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  overflow: hidden;
  transition:
    border-color 0.15s ease,
    opacity 0.15s ease;
}
.story-card:hover {
  border-color: var(--border-bright);
}
.story-card.complete {
  opacity: 0.62;
}
.story-card.complete:hover {
  opacity: 1;
}
.story-head {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 14px 16px;
  background: none;
  border: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.story-head-main {
  min-width: 0;
  flex: 1;
}
.story-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.story-name {
  margin: 0;
  font-size: 14.5px;
  font-weight: 620;
  color: var(--txt);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.story-badge {
  flex: none;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
}
.story-badge-done {
  color: var(--green);
  background: color-mix(in srgb, var(--green) 14%, transparent);
}
.story-badge-attention {
  color: var(--amber);
  background: color-mix(in srgb, var(--amber) 15%, transparent);
}
.story-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--txt-faint);
}
.story-dot-sep {
  opacity: 0.6;
}
.story-progress-wrap {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
}
.story-frac {
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 12px;
  color: var(--txt-dim);
  min-width: 40px;
  text-align: right;
}
.story-bar {
  width: 120px;
  height: 6px;
  border-radius: 999px;
  background: var(--panel-solid);
  border: 1px solid var(--border);
  overflow: hidden;
}
.story-bar i {
  display: block;
  height: 100%;
  background: var(--green);
  transition: width 0.25s ease;
}
.story-chevron {
  flex: none;
  width: 18px;
  height: 18px;
  color: var(--txt-faint);
  transition: transform 0.18s ease;
}
.story-chevron.open {
  transform: rotate(180deg);
}

.story-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 12px;
}
.story-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--txt-dim);
  padding: 2px 8px 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--panel-solid);
}
.story-chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--chip);
}

.story-live {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}
.story-live-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 16px;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--border);
  text-align: left;
  cursor: pointer;
  color: inherit;
  font-size: 12.5px;
}
.story-live-row:last-child {
  border-bottom: 0;
}
.story-live-row:hover {
  background: var(--panel-solid);
}
.story-live-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.story-live-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--txt);
}
.story-live-cue {
  flex: none;
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 999px;
}
.story-live-cue.attention {
  color: var(--amber);
  background: color-mix(in srgb, var(--amber) 15%, transparent);
}
.story-live-cue.review {
  color: var(--amber);
  background: color-mix(in srgb, var(--amber) 12%, transparent);
}
.story-live-cue.active {
  color: var(--violet);
  background: color-mix(in srgb, var(--violet) 14%, transparent);
}

.story-members {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
  padding: 14px 16px;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel-solid) 45%, transparent);
}

@media (max-width: 640px) {
  .stories-page {
    padding: 16px 14px 48px;
  }
  .story-head {
    flex-wrap: wrap;
    gap: 10px;
  }
  .story-progress-wrap {
    order: 3;
    width: 100%;
    justify-content: flex-start;
  }
  .story-bar {
    flex: 1;
    width: auto;
  }
  .story-chevron {
    position: absolute;
    right: 14px;
    top: 16px;
  }
  .story-card {
    position: relative;
  }
  .story-members {
    grid-template-columns: 1fr;
  }
}
</style>
