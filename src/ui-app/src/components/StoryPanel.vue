<script setup lang="ts">
/**
 * Story side panel (#0502): the expanded, read-only view of one story.
 *
 * Built from the same pieces as the task and input panels, so a user moving
 * between the three sees one continuous surface:
 *   - `ui/dialog/*` (radix-vue) for the frame — Escape, focus-on-open, focus
 *     restore on close, the standard scrim (`DialogOverlay` / `.overlay`), and
 *     the body-teleported `position: fixed` the panel needs (AGENTS.md).
 *   - `ui.drawerWidth` + `ui.startResize` for the same draggable edge.
 *   - the global `.drawer-head` / `.drawer-tabs` / `.tab-btn` / `.drawer-body` /
 *     `.md-rendered` classes from `style.css` — the tab strip is the same one
 *     the task drawer, New doc, New skill, Checks and Agents use, not a
 *     near-duplicate, and the body tab is the same `renderMarkdown()` output the
 *     task panel's Task tab renders.
 *
 * Selecting a different story while the panel is open (deep link, programmatic
 * selection, story → task hand-off) swaps the same dialog in place; the panel
 * resets its tab and scroll. Clicking the scrim, ×, or Escape closes it, like
 * every other right-hand sheet (#0544).
 *
 * Story → task navigation reuses `ui.openTask`, the exact call the story list's
 * live-task rows already make. The panel closes first so the two surfaces never
 * fight over focus. Story → *new* task (#0555) hands off the same way, to
 * `ui.openNewTask`, carrying this story as the new task's preset.
 */
import { computed, nextTick, ref, useId, watch, type Component } from "vue";
import { FileText, Info, ListChecks, MessageSquare, X } from "lucide-vue-next";
import type { MergedStoryGroup } from "../../../core/story-display.js";
import type { Status, Task } from "../types";
import { useUiStore } from "../stores/ui";
import { useConfigStore } from "../stores/config";
import {
  SORT_ORDER_OPTIONS,
  sortTasks,
  statusColor,
  useRepoStore,
  type SortOrder,
} from "../stores/repo";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";
import Button from "./ui/button.vue";
import { renderMarkdown } from "../lib/markdown";
import { relTime } from "../lib/time";
import { dependencyBlockerLabel } from "../lib/task-dependencies";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogTitle from "./ui/dialog/title.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import CopyableNumber from "./CopyableNumber.vue";
import StoryPmChat from "./StoryPmChat.vue";

type StoryTab = "story" | "pm" | "tasks" | "details";

/**
 * Strip order — also the arrow-key order. "story" is the reset target. "pm"
 * sits directly after it, matching the task panel's strip (Task · PM · Dev · …)
 * so the two panels are read the same way (#0515).
 */
const TABS: StoryTab[] = ["story", "pm", "tasks", "details"];

const TAB_LABELS: Record<StoryTab, string> = {
  story: "Story",
  pm: "PM",
  tasks: "Tasks",
  details: "Details",
};

const TAB_ICONS: Record<StoryTab, Component> = {
  story: FileText,
  pm: MessageSquare,
  tasks: ListChecks,
  details: Info,
};

const props = defineProps<{
  /** The story to show, or null when the panel is closed. */
  story: MergedStoryGroup<Task> | null;
  /** True while the PM agent is still fleshing this story out (#0486). */
  pmWorking?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const ui = useUiStore();
const config = useConfigStore();
const repo = useRepoStore();

const open = computed(() => props.story !== null);

const tab = ref<StoryTab>("story");
const bodyEl = ref<HTMLElement | null>(null);

const bodyHtml = computed(() => renderMarkdown(props.story?.body ?? ""));

/**
 * Selecting a different story swaps the panel in place — same dialog, new
 * contents — so reset the tab to the first one and scroll the body back to the
 * top. Without this you would land on the *second* story's "Tasks" tab having
 * only ever looked at the first story's "Story" tab. The scroll reset has to
 * happen after the new content paints, or the browser restores the old
 * offset.
 */
watch(
  () => props.story?.key,
  () => {
    tab.value = TABS[0];
    void nextTick(() => {
      if (bodyEl.value) bodyEl.value.scrollTop = 0;
    });
  },
);

/**
 * The ARIA tabs contract, completed rather than copied from the older drawers:
 * each tab carries `aria-controls` pointing at its own panel id, each panel is
 * labelled back by its tab, and Left/Right/Home/End move between them — which
 * is what a keyboard user expects from a tablist and what the bare buttons in
 * the task/input strips do not give them.
 */
const uid = useId().replaceAll(":", "-");
const tabId = (t: StoryTab): string => `story-panel-tab-${uid}-${t}`;
const panelId = (t: StoryTab): string => `story-panel-body-${uid}-${t}`;

function onTabKeydown(e: KeyboardEvent): void {
  const i = TABS.indexOf(tab.value);
  let next = -1;
  if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
  else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = TABS.length - 1;
  if (next < 0) return;
  e.preventDefault();
  tab.value = TABS[next];
  document.getElementById(tabId(TABS[next]!))?.focus();
}

const STATUS_ORDER: Status[] = ["draft", "inbox", "ready", "active", "review", "done"];

/** Per-status breakdown for the Details tab, omitting empty statuses. */
const breakdown = computed(() => {
  const counts = props.story?.counts;
  if (!counts) return [];
  return STATUS_ORDER.filter((id) => (counts[id] ?? 0) > 0).map((id) => ({
    id,
    label: config.columnLabels[id] ?? id,
    count: counts[id],
    color: statusColor(id),
  }));
});

const summaryLine = computed(() => {
  const s = props.story;
  if (!s) return "";
  return `${s.total} ${s.total === 1 ? "task" : "tasks"} · ${s.done} done`;
});

/** Tasks tab list, sorted by the story-panel sort preference without mutating the prop. */
const sortedStoryTasks = computed(() => {
  const tasks = props.story?.tasks;
  if (!tasks?.length) return [];
  return sortTasks(tasks, repo.storySortOrder);
});

/**
 * #0560: the status pill wears the task's status color — the same
 * `statusColor()` value the work board's columns read, and the same value the
 * 7px dot on this row already uses, so dot and label can never diverge. The
 * border is a color-mix tint of that same color rather than a hard-coded
 * rgba, so it tracks the color; a status `statusColor` falls back for renders
 * the fallback color without throwing.
 */
function taskStatusStyle(task: Task): Record<string, string> {
  const color = statusColor(task.status);
  return {
    color,
    borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
  };
}

/**
 * The copyable deeplink for this story (#0515) — the same `CopyableNumber`
 * chip tasks and inputs lead their cards and panels with, in the same upper
 * left position, pointing at the same kind of `?param=` route. A registered
 * story has a stable `number`; a tag-only story has no file to hold one, so it
 * has nothing to show, exactly as `inputLabel` falls back for an input written
 * before numbering existed.
 */
const numberLabel = computed(() => (props.story?.number ? `#${props.story.number}` : ""));
const numberPath = computed(() =>
  props.story?.number ? `/stories?story=${encodeURIComponent(props.story.number)}` : "",
);

/** Hand the story over to the task drawer, then get out of its way. */
function openTask(task: Task): void {
  emit("close");
  void ui.openTask(task);
}

/**
 * Create a task *from* this story (#0555): close the story panel first — the
 * same hand-off `openTask` makes, so the two surfaces never fight over focus —
 * then open the existing New task panel with the story preset. The preset is
 * per-open form context, so it shows up in the panel's own Story control and
 * is carried by both create modes.
 */
function startNewTask(): void {
  emit("close");
  ui.openNewTask("", props.story?.name ?? "");
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="
      (v) => {
        if (!v) emit('close');
      }
    "
  >
    <DialogOverlay />
    <DialogContent :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }">
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
      <div class="drawer-head">
        <div class="drawer-head-title">
          <!-- #0515: the copy-link number leads the panel header, in the same
               upper left slot and with the same component the task panel and
               the input panel use, so a story reads like either of them. -->
          <div v-if="numberLabel" class="story-panel-ids">
            <CopyableNumber
              :label="numberLabel"
              :path="numberPath"
              :aria-label="`Copy link to story ${story?.number}`"
            />
            <span v-if="story?.path" class="tc-id mono">{{ story.path }}</span>
          </div>
          <DialogTitle>{{ story?.name }}</DialogTitle>
          <DialogDescription class="sr-only">Story details</DialogDescription>
          <div v-if="story" class="story-panel-sub">
            <ActivityIndicator v-if="pmWorking" label="PM is working" />
            <span>{{ pmWorking ? "PM is working · " : "" }}{{ summaryLine }}</span>
          </div>
        </div>
        <DialogClose class="close-x" aria-label="Close story panel"
          ><X class="size-[15px]"
        /></DialogClose>
      </div>

      <div class="drawer-tabs drawer-tabs-scroll" role="tablist" aria-label="Story details">
        <button
          v-for="t in TABS"
          :key="t"
          type="button"
          role="tab"
          :id="tabId(t)"
          class="tab-btn"
          :class="{ active: tab === t }"
          :aria-selected="tab === t"
          :aria-controls="panelId(t)"
          :tabindex="tab === t ? 0 : -1"
          @click="tab = t"
          @keydown="onTabKeydown"
        >
          <component :is="TAB_ICONS[t]" class="tab-icon" />
          {{ TAB_LABELS[t] }}
          <span v-if="t === 'tasks' && story" class="tab-count">{{ story.total }}</span>
        </button>
      </div>

      <!-- PM (#0515): the chat is the tab panel and brings its own
           `drawer-body drawer-session-body`, exactly as the task panel's PM tab
           does — only the transcript scrolls, leaving the compose box
           reachable. Nesting it inside the scrolling `.drawer-body` below
           would give the panel two scroll containers. Fall through to the
           reading body when there is no story to talk about. -->
      <StoryPmChat
        v-if="tab === 'pm' && story"
        :id="panelId('pm')"
        role="tabpanel"
        :aria-labelledby="tabId('pm')"
        tabindex="0"
        :story="story"
      />

      <div
        v-else
        :id="panelId(tab)"
        ref="bodyEl"
        class="drawer-body story-panel-body"
        role="tabpanel"
        :aria-labelledby="tabId(tab)"
        tabindex="0"
      >
        <!-- Story: the full body, markdown-rendered, never truncated. -->
        <div v-if="tab === 'story'">
          <div v-if="bodyHtml" class="md-rendered" v-html="bodyHtml"></div>
          <div v-else class="story-panel-empty">
            <div class="story-panel-empty-title">No story body yet</div>
            <p>
              This story is derived from the tasks tagged with its name, so there is no written
              scope to show. Give it one with <strong>New story</strong>.
            </p>
          </div>
        </div>

        <!-- Tasks: every related task, clickable straight into the task panel.
             The toolbar is hoisted out of the task list's own `v-if` (#0555):
             it holds the New task button a story with NO tasks needs most, so
             it renders in the empty state too — with the sort Select dropped,
             since there is then nothing to sort. -->
        <div v-else-if="tab === 'tasks'" class="story-panel-tasks-wrap">
          <div class="story-panel-tasks-toolbar">
            <Select
              v-if="story && story.tasks.length"
              :model-value="repo.storySortOrder"
              @update:model-value="(v) => repo.setStorySortOrder(v as SortOrder)"
            >
              <SelectTrigger class="h-[34px] w-[210px] rounded-[9px] px-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem v-for="o in SORT_ORDER_OPTIONS" :key="o.value" :value="o.value">{{
                    o.label
                  }}</SelectItem>
                </SelectViewport>
              </SelectContent>
            </Select>
            <Button
              variant="accent"
              size="sm"
              class="story-panel-tasks-new"
              aria-label="New task in this story"
              @click="startNewTask"
            >
              <span class="plus">+</span> New task
            </Button>
          </div>
          <div v-if="story && story.tasks.length" class="story-panel-tasks">
            <button
              v-for="task in sortedStoryTasks"
              :key="task.id"
              type="button"
              class="story-panel-task"
              @click="openTask(task)"
            >
              <span
                class="story-panel-task-dot"
                :style="{ background: statusColor(task.status) }"
              ></span>
              <span class="story-panel-task-id">#{{ task.id }}</span>
              <span class="story-panel-task-title">{{ task.title }}</span>
              <span
                v-for="blocker in task.blockedBy"
                :key="blocker.id"
                class="story-panel-task-blocker"
                :title="dependencyBlockerLabel(blocker)"
                >{{
                  blocker.state === "cancelled"
                    ? `Cancelled #${blocker.id}`
                    : `Blocked by #${blocker.id}`
                }}</span
              >
              <span class="story-panel-task-status" :style="taskStatusStyle(task)">{{
                config.columnLabels[task.status] ?? task.status
              }}</span>
            </button>
          </div>
          <div v-else class="story-panel-empty">
            <div class="story-panel-empty-title">No related tasks</div>
            <p>Nothing is tagged with this story yet, so there is no work to show here.</p>
          </div>
        </div>

        <!-- Details: the metadata the story already carries, nothing new. -->
        <div v-else-if="story" class="story-panel-facts">
          <div class="story-panel-fact">
            <span class="story-panel-fact-label">Story key</span>
            <span class="story-panel-fact-value mono">{{ story.key }}</span>
          </div>
          <div class="story-panel-fact">
            <span class="story-panel-fact-label">Definition</span>
            <span class="story-panel-fact-value mono">{{
              story.registered ? (story.path ?? "—") : "Not registered"
            }}</span>
          </div>
          <div v-if="story.registered" class="story-panel-fact">
            <span class="story-panel-fact-label">Created</span>
            <span class="story-panel-fact-value">{{
              story.createdAt
                ? `${relTime(story.createdAt)} by ${story.createdBy || "Unknown"}`
                : "Unknown"
            }}</span>
          </div>
          <div class="story-panel-fact">
            <span class="story-panel-fact-label">Progress</span>
            <span class="story-panel-fact-value">{{
              story.total === 0
                ? "No tasks tagged yet"
                : `${story.done} of ${story.total} ${story.total === 1 ? "task" : "tasks"} done${story.complete ? " · complete" : ""}`
            }}</span>
          </div>
          <div v-if="breakdown.length" class="story-panel-fact">
            <span class="story-panel-fact-label">By status</span>
            <span class="story-panel-fact-value story-panel-breakdown">
              <span v-for="b in breakdown" :key="b.id" class="story-panel-status">
                <i class="story-panel-status-dot" :style="{ background: b.color }"></i>{{ b.label }}
                {{ b.count }}
              </span>
            </span>
          </div>
          <div v-if="story.attention > 0" class="story-panel-fact">
            <span class="story-panel-fact-label">Needs input</span>
            <span class="story-panel-fact-value"
              >{{ story.attention }} {{ story.attention === 1 ? "task" : "tasks" }} waiting</span
            >
          </div>
          <div class="story-panel-fact">
            <span class="story-panel-fact-label">Last activity</span>
            <span class="story-panel-fact-value">{{
              story.lastActivity ? relTime(story.lastActivity) : "No activity yet"
            }}</span>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
