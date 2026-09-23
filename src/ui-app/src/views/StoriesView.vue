<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { mergeStoriesForDisplay, type StoryDefinition } from "../../../core/story-display.js";
import { useRepoStore, statusColor } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { useUiStore } from "../stores/ui";
import { relTime } from "../lib/time";
import TaskCard from "../components/TaskCard.vue";
import NewStoryPanel from "../components/NewStoryPanel.vue";
import Button from "../components/ui/button.vue";
import type { Status, Task } from "../types";

const STATUS_ORDER: Status[] = ["draft", "inbox", "ready", "active", "review", "done"];

const repo = useRepoStore();
const config = useConfigStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();

const enabled = computed(
  () => (config.data?.stories as { enabled?: unknown } | undefined)?.enabled === true,
);

const definitions = computed((): StoryDefinition[] =>
  repo.storyDefinitions.map((d) => ({
    key: d.key,
    name: d.name,
    path: d.path,
    body: d.body,
    createdAt: d.createdAt,
    createdBy: d.createdBy,
  })),
);

const stories = computed(() => mergeStoriesForDisplay(repo.tasks, definitions.value));

watch(
  () => route.query.story,
  (v) => {
    if (!enabled.value) return;
    if (v !== "new") return;
    ui.openNewStory();
    const query = { ...route.query };
    delete query.story;
    void router.replace({ query });
  },
  { immediate: true },
);

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
    <header class="page-header">
      <div>
        <div class="page-title">Stories</div>
        <div class="page-desc" style="margin: 3px 0 0">
          Cross-area delivery slices — registered in <code>stories/</code> and grouped with tasks
          tagged using the same story name. A story is complete only when every one of its tasks is
          done.
        </div>
      </div>
      <div v-if="enabled" class="page-header-actions">
        <Button variant="accent" class="new-btn" @click="ui.openNewStory()"
          ><span class="plus">+</span> New story</Button
        >
      </div>
    </header>

    <div v-if="!enabled" class="glass stories-notice">
      Stories aren't enabled for this repository. Add a <code>[stories]</code> block with
      <code>enabled = true</code> to <a href="/settings?tab=toml">repoos.toml</a> to turn this page
      on.
    </div>

    <div v-else-if="stories.length === 0" class="empty-state">
      <div class="big">No stories yet</div>
      <div>
        Capture a delivery slice with <strong>New story</strong>, or tag a task from the Story field
        in the task drawer.
      </div>
      <Button variant="outline" style="margin-top: 14px" @click="ui.openNewStory()"
        >Create your first story</Button
      >
    </div>

    <div v-else class="stories-grid">
      <article
        v-for="story in stories"
        :key="story.key"
        class="glass story-card"
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
              <span>{{
                story.total > 0 ? `Last activity ${lastActivity(story)}` : "No tasks tagged yet"
              }}</span>
            </div>
            <p v-if="story.excerpt" class="story-excerpt">{{ story.excerpt }}</p>
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

        <div v-if="expanded.has(story.key) && story.body" class="story-description">
          <div class="story-description-inner">{{ story.body }}</div>
        </div>

        <div v-if="expanded.has(story.key)" class="story-members">
          <TaskCard v-for="task in story.tasks" :key="task.id" :task="task" :drag-enabled="false" />
        </div>
      </article>
    </div>
    <NewStoryPanel v-if="enabled" />
  </div>
</template>

<style scoped>
.stories-page {
  width: 100%;
  box-sizing: border-box;
  padding: 0 0 80px;
}
.stories-page :deep(.page-desc code),
.stories-notice code,
.stories-page .empty-state code {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--txt-dim);
}
.stories-notice {
  padding: 22px;
  color: var(--txt-faint);
  font-size: 12.5px;
  line-height: 1.6;
}
.stories-notice a {
  color: var(--cyan);
  text-decoration: none;
}
.stories-notice a:hover {
  text-decoration: underline;
}

.stories-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.story-card {
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
  background: var(--green-tint);
  border: 1px solid var(--green-border-tint);
}
.story-badge-attention {
  color: var(--amber);
  background: var(--amber-tint);
  border: 1px solid var(--amber-border-tint);
}
.story-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--txt-faint);
}
.story-excerpt {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--txt-dim);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.story-description {
  padding: 0 16px 12px;
  border-bottom: 1px solid var(--border);
}
.story-description-inner {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--txt-dim);
  white-space: pre-wrap;
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
  background: var(--chip-bg);
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
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--txt);
  padding: 4px 11px 4px 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--panel);
}
.story-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
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
  background: var(--amber-tint);
  border: 1px solid var(--amber-border-tint);
}
.story-live-cue.review {
  color: var(--amber);
  background: var(--amber-tint);
  border: 1px solid var(--amber-border-tint);
}
.story-live-cue.active {
  color: var(--violet);
  background: var(--violet-tint);
  border: 1px solid var(--violet-border-tint);
}

.story-members {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
  padding: 14px 16px;
  border-top: 1px solid var(--border);
  background: var(--chip-bg);
}

@media (max-width: 720px) {
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
