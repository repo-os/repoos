<script setup lang="ts">
/**
 * Story side panel (#0502): the expanded, read-only view of one story.
 *
 * Deliberately built from the same pieces as the task and input panels, so a
 * user moving between the three sees one continuous surface:
 *   - `ui/dialog/*` (radix-vue) for the frame — that also gives us the Escape
 *     key, focus-on-open, focus restore on close, and the body-teleported
 *     `position: fixed` the panel needs (AGENTS.md: any fixed overlay must be
 *     teleported, and DialogContent already portals).
 *   - `ui.drawerWidth` + `ui.startResize` for the same draggable edge.
 *   - the global `.drawer-head` / `.drawer-tabs` / `.tab-btn` / `.drawer-body` /
 *     `.md-rendered` classes from `style.css` — the tab strip is the same one
 *     the task drawer, New doc, New skill, Checks and Agents use, not a
 *     near-duplicate, and the body tab is the same `renderMarkdown()` output the
 *     task panel's Task tab renders.
 *
 * The one deliberate departure from the task/input panels: this dialog is
 * NON-MODAL and renders no scrim. The spec requires that selecting a different
 * story row "swaps the panel contents in place, without closing and reopening",
 * and a full-screen overlay makes that literally unreachable — the list behind
 * it cannot be clicked. radix-vue's non-modal content drops both the focus trap
 * and the outside-pointer-events lock (DialogContentNonModal in radix-vue
 * 1.9), and suppresses DialogOverlay entirely, so the stories list stays live.
 * The visual treatment is otherwise byte-identical: same `.drawer` sheet, same
 * slide-in, same border and shadow; the `.drawer-wrap` z-index (100) already
 * sits above the page chrome.
 *
 * Non-modal is not on its own enough. radix's DismissableLayer still emits
 * `dismiss` on an outside pointerdown AND when focus moves outside — both are
 * checked against `event.defaultPrevented`, and both fire *before* the click
 * that selects a story row. Left alone, clicking the second row would therefore
 * close the panel on pointerdown and immediately re-open it on click: a
 * flicker, not a swap. Preventing both is what actually makes the in-place
 * swap work. The cost is that a click on empty page chrome no longer closes
 * the panel, which is the right trade for a side panel: × and Escape both
 * still close it, and losing the panel to a stray click is exactly the
 * complaint a non-modal panel exists to fix.
 *
 * Focus still moves into the panel on open and returns to the row that opened
 * it on close (radix's own open/close auto-focus, untouched here).
 *
 * Story → task navigation reuses `ui.openTask`, the exact call the story list's
 * live-task rows already make. The panel closes first so the two surfaces never
 * fight over focus.
 */
import { computed, nextTick, ref, useId, watch, type Component } from "vue";
import { FileText, Info, ListChecks, X } from "lucide-vue-next";
import type { MergedStoryGroup } from "../../../core/story-display.js";
import type { Status, Task } from "../types";
import { useUiStore } from "../stores/ui";
import { useConfigStore } from "../stores/config";
import { statusColor } from "../stores/repo";
import { renderMarkdown } from "../lib/markdown";
import { relTime } from "../lib/time";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogTitle from "./ui/dialog/title.vue";
import ActivityIndicator from "./ActivityIndicator.vue";

type StoryTab = "story" | "tasks" | "details";

/** Strip order — also the arrow-key order. "story" is the reset target. */
const TABS: StoryTab[] = ["story", "tasks", "details"];

const TAB_LABELS: Record<StoryTab, string> = {
  story: "Story",
  tasks: "Tasks",
  details: "Details",
};

const TAB_ICONS: Record<StoryTab, Component> = {
  story: FileText,
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

/** Hand the story over to the task drawer, then get out of its way. */
function openTask(task: Task): void {
  emit("close");
  void ui.openTask(task);
}

/**
 * Stop radix from dismissing on an outside pointerdown or on focus leaving.
 * Both paths run before the click that selects a story row, so without this the
 * panel closes and instantly re-opens instead of swapping in place. Escape and
 * the × close button are untouched — they go through `dismiss` directly.
 */
function keepOpenOnOutsideInteraction(e: Event): void {
  e.preventDefault();
}
</script>

<template>
  <Dialog
    :open="open"
    :modal="false"
    @update:open="
      (v) => {
        if (!v) emit('close');
      }
    "
  >
    <!-- Deliberately no overlay: this panel is non-modal so the stories list
         stays clickable and selecting another row swaps the contents in place
         (see the header comment). radix-vue suppresses the overlay entirely
         when `modal` is false, so there is no scrim here to disable. -->
    <DialogContent
      :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
      @pointer-down-outside="keepOpenOnOutsideInteraction"
      @focus-outside="keepOpenOnOutsideInteraction"
    >
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
      <div class="drawer-head">
        <div class="drawer-head-title">
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

      <div
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

        <!-- Tasks: every related task, clickable straight into the task panel. -->
        <div v-else-if="tab === 'tasks'">
          <div v-if="story && story.tasks.length" class="story-panel-tasks">
            <button
              v-for="task in story.tasks"
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
              <span class="story-panel-task-status">{{
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
