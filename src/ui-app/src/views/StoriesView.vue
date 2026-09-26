<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  mergeStoriesForDisplay,
  type MergedStoryGroup,
  type StoryDefinition,
} from "../../../core/story-display.js";
import { useRepoStore, statusColor } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { useUiStore } from "../stores/ui";
import { relTime } from "../lib/time";
import NewStoryPanel from "../components/NewStoryPanel.vue";
import StoryPanel from "../components/StoryPanel.vue";
import Button from "../components/ui/button.vue";
import ActivityIndicator from "../components/ActivityIndicator.vue";
import CopyableNumber from "../components/CopyableNumber.vue";
import type { Status, Task } from "../types";
import { needsInputStatusLabel, needsInputSuppressedOnReview } from "../lib/needs-input-ui";

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
    number: d.number ?? "",
    path: d.path,
    body: d.body,
    createdAt: d.createdAt,
    createdBy: d.createdBy,
  })),
);

const stories = computed(() => mergeStoriesForDisplay(repo.tasks, definitions.value));

/** Stories the PM agent is still fleshing out after a New story submit. */
const pmWorkingKeys = computed(
  () => new Set(repo.storyDefinitions.filter((d) => d.pmWorking).map((d) => d.key)),
);

/**
 * Resolve a `?story=` value to a story in the current roll-up (#0515) — the
 * same tolerance `InputsView`'s `findInputByRef` has for `?input=`: a leading
 * `#`, a bare `7` and the padded `0007` all find the same story, and the story
 * key is accepted too so a link made before a story was numbered still works.
 */
function findStoryByRef(ref: string): MergedStoryGroup<Task> | undefined {
  const v = ref.replace(/^#/, "").trim();
  if (!v) return undefined;
  const numeric = /^\d+$/.test(v) ? [v, v.padStart(4, "0")] : [v];
  return stories.value.find(
    (s) => (s.number && numeric.includes(s.number)) || s.key === v.toLowerCase(),
  );
}

/**
 * The story the side panel is showing (#0502), or null when it is closed.
 * Held as a key rather than a snapshot so the panel re-reads the merged
 * roll-up on every store update — a task finishing must move the panel's
 * progress without the user reopening it.
 */
const openStoryKey = ref<string | null>(null);

const openStory = computed<MergedStoryGroup<Task> | null>(
  () => stories.value.find((s) => s.key === openStoryKey.value) ?? null,
);

/**
 * Open (or swap to) a story's panel. Selecting a different row while the
 * panel is already open updates the same dialog in place — the panel resets
 * its own tab — rather than closing and reopening it.
 */
function selectStory(key: string): void {
  openStoryKey.value = key;
}

/**
 * Open a deep-linked story once the roll-up has it. The list is derived from
 * the board payload, which arrives asynchronously, so a link opened on a cold
 * load resolves on a later tick — retry briefly rather than silently dropping
 * it. Same shape as `tryOpenInput`.
 */
function tryOpenStory(ref: string, attempt: number): void {
  const found = findStoryByRef(ref);
  if (found) {
    openStoryKey.value = found.key;
    void clearStoryParam();
  } else if (attempt < 20) {
    window.setTimeout(() => tryOpenStory(ref, attempt + 1), 100);
  }
}

/** Drop `?story=` after it has been honoured, so a refresh doesn't re-open. */
function clearStoryParam(): Promise<unknown> {
  const query = { ...route.query };
  delete query.story;
  return router.replace({ query });
}

// Declared after `openStoryKey` on purpose: this watcher runs `immediate`, and
// `?story=` resolves straight into that ref.
//
// `enabled` is watched alongside the query, and that is load-bearing rather than
// belt-and-braces. It reads `config.data`, which `App.vue` loads in its
// `onMounted` — last, after `repo.init()` and the doc/skill loads. On a cold load
// of a copied link (the whole point of a deeplink) the view mounts before config
// arrives, so a watcher tracking only `route.query.story` would gate on
// `!enabled`, bail, and never run again. Re-running when the flag flips is what
// makes "copy link, paste in a new tab" actually work. `InputsView`'s handler
// needs no equivalent because it has no such gate.
watch(
  [() => route.query.story, enabled],
  ([v, on]) => {
    if (!on) return;
    if (typeof v !== "string" || !v) return;
    if (v === "new") {
      ui.openNewStory();
      void clearStoryParam();
      return;
    }
    tryOpenStory(v, 0);
  },
  { immediate: true },
);

function closeStory(): void {
  openStoryKey.value = null;
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
        if (needsInputSuppressedOnReview(task)) {
          return { task, cue: "in review", cueClass: "review" };
        }
        const label = needsInputStatusLabel(
          task.needsInputReason,
          (task.questions?.length ?? 0) > 0,
        );
        return { task, cue: label, cueClass: "attention" };
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
        <!-- #0515: the copy-link number leads the card, in the same upper left
             position and with the same `CopyableNumber` chip the task and input
             cards use. It sits OUTSIDE the `.story-head` button on purpose —
             that button is the card's own control, and a <button> inside a
             <button> is invalid markup browsers are free to flatten, which
             would break both the copy and the click. The task/input cards get
             away with nesting because their clickable surface is the <article>. -->
        <div v-if="story.number" class="story-number-row">
          <CopyableNumber
            :label="`#${story.number}`"
            :path="`/stories?story=${encodeURIComponent(story.number)}`"
            :aria-label="`Copy link to story ${story.number}`"
          />
        </div>

        <button
          type="button"
          class="story-head"
          aria-haspopup="dialog"
          :aria-label="`Open ${story.name} story details`"
          @click="selectStory(story.key)"
        >
          <div class="story-head-main">
            <div class="story-name-row">
              <h2 class="story-name">{{ story.name }}</h2>
              <span v-if="pmWorkingKeys.has(story.key)" class="story-badge story-badge-pm">
                <ActivityIndicator /> PM is working
              </span>
              <span v-else-if="story.complete" class="story-badge story-badge-done">complete</span>
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
          <svg class="story-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 6l6 6-6 6"
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
      </article>
    </div>
    <NewStoryPanel v-if="enabled" />
    <StoryPanel
      :story="openStory"
      :pm-working="openStory ? pmWorkingKeys.has(openStory.key) : false"
      @close="closeStory"
    />
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
/* #0515: the number chip row above the head. Sized off the task card's rhythm
   (13px to the chip row, then the title's own top margin) rather than reusing
   Tailwind utilities, because this view's cards are styled in this block. */
.story-number-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 13px 16px 0;
}
.story-card:has(.story-number-row) .story-head {
  padding-top: 11px;
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
.story-badge-pm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--txt-dim);
  border: 1px solid var(--border-bright);
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
  transition: color 0.15s ease;
}
/* The row now opens the side panel rather than expanding inline, so the
   chevron reads as "go deeper" and brightens on hover instead of rotating. */
.story-head:hover .story-chevron {
  color: var(--cyan);
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
}
</style>
