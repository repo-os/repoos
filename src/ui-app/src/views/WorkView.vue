<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { User } from "lucide-vue-next";
import { api } from "../api";
import {
  COLUMNS,
  BOARD_SORT_ORDER_OPTIONS,
  useRepoStore,
  columnsWithLabels,
  draftColumnWithLabel,
} from "../stores/repo";
import type { Column, SortOrder } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { useConfigStore } from "../stores/config";
import { useBoardKeyboardNav } from "../composables/useBoardKeyboardNav";
import {
  collapseAllEmpty,
  expandAll,
  hasExpandedEmptyColumn,
  isColumnCollapsed,
  revealArrivals,
} from "../lib/boardCollapse";
import BoardColumn from "../components/BoardColumn.vue";
import Button from "../components/ui/button.vue";
import Select from "../components/ui/select/root.vue";
import SelectContent from "../components/ui/select/content.vue";
import SelectItem from "../components/ui/select/item.vue";
import SelectTrigger from "../components/ui/select/trigger.vue";
import SelectValue from "../components/ui/select/value.vue";
import SelectViewport from "../components/ui/select/viewport.vue";
import IntegrationStatusBar from "../components/IntegrationStatusBar.vue";
import {
  applyShotPreviewFixture,
  isShotPreviewCaptureActive,
  readShotPreviewFixtureFromLocation,
} from "../lib/shot-preview-fixtures.js";
import type { Task } from "../types";

const DRAFT_BAR = "#3a4055";

const STATUS_IDS = new Set(["draft", "inbox", "ready", "active", "review", "done"]);

const repo = useRepoStore();
const ui = useUiStore();
const config = useConfigStore();
const route = useRoute();
const { workDir } = storeToRefs(repo);

const columnLabels = computed(() => config.columnLabels);
const DRAFT_COL = computed(() => draftColumnWithLabel(columnLabels.value));
const labeledColumns = computed(() => columnsWithLabels(columnLabels.value));

const statusFilter = computed<string | null>(() => {
  const s = route.query.status;
  return typeof s === "string" && STATUS_IDS.has(s) ? s : null;
});

const filterCol = computed<Column | null>(() => {
  if (statusFilter.value === "draft") return DRAFT_COL.value;
  return labeledColumns.value.find((c) => c.id === statusFilter.value) ?? null;
});

// ── #0345 Deep-linking: /work?task=<id> opens that task's drawer and
// ?task=new opens the new-task panel. The param is cleared once the panel
// opens (the same router.replace clear pattern as the settings ?focus=
// handler) so a refresh doesn't re-open it, and any other query keys (e.g.
// ?status=) are preserved. A link that arrives through the login round-trip
// survives end-to-end: the router guard redirects with redirect=to.fullPath
// and LoginView restores the full path after sign-in.
//
// #0755: an optional `?tab=<id>` selects the drawer tab when the deep-link
// opens a task — e.g. `/work?task=0755&tab=changes` opens the Changes tab.
// This gives handoff shots a ROUTE that reaches the populated drawer view
// without click steps on placeholder selectors. Unknown tab ids are ignored
// (the drawer keeps its status default), so a stale link degrades gracefully.
const DRAWER_TABS = new Set(["details", "agent", "review", "pm", "changes", "tokens", "debug"]);
function tabFromQuery(raw: unknown): typeof ui.activeTab | null {
  return typeof raw === "string" && DRAWER_TABS.has(raw) ? (raw as typeof ui.activeTab) : null;
}

const router = useRouter();
watch(
  () => route.query.task,
  (v) => {
    if (typeof v !== "string" || !v) return;
    void openFromTaskParam(v);
  },
  { immediate: true },
);

async function clearTaskParam(): Promise<void> {
  const query = { ...route.query };
  delete query.task;
  delete query.tab;
  await router.replace({ query });
}

async function openFromTaskParam(raw: string): Promise<void> {
  if (raw === "new") {
    ui.openNewTask();
    await clearTaskParam();
    return;
  }
  const id = raw.replace(/^#/, "");
  // Shot capture can mount this view before App.vue's onMounted applies the
  // fixture — seed client state first so ?task=9999 never hits the API (#0817).
  if (typeof window !== "undefined" && isShotPreviewCaptureActive(window.location)) {
    const shotFixture = readShotPreviewFixtureFromLocation(window.location);
    if (shotFixture && repo.health?.isPreviewBuild) {
      applyShotPreviewFixture(repo, shotFixture);
    }
  }
  // The board index is loaded before this view mounts (App.vue gates the
  // router on repo.init()), so the task is normally already local. A local
  // miss means the id is off-board (deleted, or an index that drifted) —
  // settle it with one direct fetch before giving up on an unknown id.
  const local = repo.tasks.find((t) => t.id === id);
  if (local) {
    // Open from the board copy now; openTask's background refresh must not
    // delay clearing the URL (a refresh while the param lingers would
    // re-open the panel).
    void ui.openTask(local);
  } else if (typeof window !== "undefined" && isShotPreviewCaptureActive(window.location)) {
    // Fixture-only id during capture — never request a missing task from the API.
    return;
  } else {
    try {
      ui.open(await api<Task>(`/api/tasks/${encodeURIComponent(id)}`));
    } catch {
      // Unknown id — leave the param in place so the broken link stays
      // inspectable, matching the settings ?focus= handler's give-up behavior.
      return;
    }
  }
  // #0755: a deep-linked tab wins over the status default set by `open`, so
  // `/work?task=0755&tab=changes` lands on the Changes tab.
  const tab = tabFromQuery(route.query.tab);
  if (tab) ui.activeTab = tab;
  await clearTaskParam();
}

// ── #0290 Keyboard navigation over the board ─────────────────────────────
// The board is the primary task list. Reconstruct the flat, DOM-ordered list
// of visible cards (columns render top-to-bottom in this same order) so the
// keyboard highlight index mirrors exactly what is on screen. Collapsed
// columns are skipped so the highlight never lands on a hidden row (req 3).
const visibleTasks = computed<Task[]>(() => {
  const order = statusFilter.value
    ? [filterCol.value!]
    : [DRAFT_COL.value, ...labeledColumns.value];
  const out: Task[] = [];
  for (const col of order) {
    // In the filtered single-column view the column is force-expanded, so it is
    // always on screen even if its id sits in the persisted collapse set.
    if (!statusFilter.value && isColumnCollapsed(col.id)) continue;
    out.push(...repo.byStatus(col.id));
  }
  return out;
});

const boardEl = ref<HTMLElement | null>(null);
const boardKey = useBoardKeyboardNav({
  containerRef: boardEl,
  tasks: visibleTasks,
  open: ui.openTask,
  enabled: computed(() => ui.keyboardNavEnabled),
  panelOpen: computed(() => !!ui.active),
  closePanel: ui.close,
});

// ── #0328 Bulk collapse toggle + auto-open on arrival ────────────────────
// Board columns in render order. The draft column is rendered separately from
// COLUMNS, so it is listed explicitly (same iteration pattern as
// applyCollapseDefaults).
const BOARD_IDS = computed<readonly string[]>(() => [
  "draft",
  ...labeledColumns.value.map((c) => c.id),
]);

/** True when every empty column is already collapsed — the toggle's two
 *  states swap between "collapse the empty columns" and "expand all columns".
 *  With no empty columns at all this is vacuously true, so the button acts as
 *  "expand all". Reads the shared collapse ref, so it flips the moment any
 *  column is toggled, bulk-collapsed, or auto-opened. */
const allEmptyCollapsed = computed(() => !hasExpandedEmptyColumn(repo.byStatus, BOARD_IDS.value));

function toggleEmptyColumns(): void {
  if (allEmptyCollapsed.value) expandAll(BOARD_IDS.value);
  else collapseAllEmpty(repo.byStatus, BOARD_IDS.value);
}

// A task arriving in a collapsed column must be visible, whatever moved it
// there (drag-and-drop, a task-panel action, or an SSE update from another
// client): watch the live per-status counts and auto-open every column whose
// count transitions 0 → ≥1. Gated on the initial load so first-load collapse
// state stays applyCollapseDefaults' job — init() recounts while `loading` is
// still true, so that first transition never reaches revealArrivals. A
// column that merely becomes empty is never auto-closed (one-directional).
const countsSnapshot = computed<Record<string, number>>(() => ({ ...repo.counts }));
watch(countsSnapshot, (now, prev) => {
  if (repo.loading) return;
  revealArrivals(prev ?? {}, now);
});

// ── #0657 Archived list ────────────────────────────────────────────────
// Parked tasks live below the board, minimised by default, with a live count.
// The expanded state persists like the board's column-collapse preference.
const ARCHIVED_EXPANDED_KEY = "repoos.work.archivedExpanded";
function readArchivedExpanded(): boolean {
  try {
    return localStorage.getItem(ARCHIVED_EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}
const archivedExpanded = ref(readArchivedExpanded());
function toggleArchived(): void {
  archivedExpanded.value = !archivedExpanded.value;
  try {
    localStorage.setItem(ARCHIVED_EXPANDED_KEY, archivedExpanded.value ? "1" : "0");
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}
function openArchived(task: Task): void {
  void ui.openTask(task);
}

// ── #0816 Human list ───────────────────────────────────────────────────
// Tasks assigned to a person, beside the Archived list and working the same
// way. The count and rows use the violet person glyph from the card's human
// chip so the list reads as "the cards with that chip, all in one place".
const HUMAN_EXPANDED_KEY = "repoos.work.humanExpanded";
function readHumanExpanded(): boolean {
  try {
    return localStorage.getItem(HUMAN_EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}
const humanExpanded = ref(readHumanExpanded());
function toggleHuman(): void {
  humanExpanded.value = !humanExpanded.value;
  try {
    localStorage.setItem(HUMAN_EXPANDED_KEY, humanExpanded.value ? "1" : "0");
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}
function openHuman(task: Task): void {
  void ui.openTask(task);
}
</script>

<template>
  <div class="work-page">
    <div
      class="work-header"
      style="
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        margin-bottom: 20px;
      "
    >
      <div>
        <div class="page-title">Work Queue</div>
        <div class="page-desc" style="margin: 3px 0 0">
          Repo-native tasks ·
          <span class="mono" style="color: var(--cyan)">{{ workDir }}/*.md</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px">
        <Button
          v-if="!statusFilter"
          variant="outline"
          size="icon"
          class="h-[34px] w-[34px] rounded-[9px]"
          :title="allEmptyCollapsed ? 'Expand all columns' : 'Collapse empty columns'"
          :aria-label="allEmptyCollapsed ? 'Expand all columns' : 'Collapse empty columns'"
          @click="toggleEmptyColumns"
        >
          <svg v-if="allEmptyCollapsed" viewBox="0 0 24 24" fill="none" class="size-4">
            <path
              d="m9 6-4 6 4 6M15 6l4 6-4 6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" class="size-4">
            <path
              d="m5 6 4 6-4 6M19 6l-4 6 4 6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </Button>
        <Select
          :model-value="repo.sortOrder"
          @update:model-value="(v) => repo.setSortOrder(v as SortOrder)"
        >
          <SelectTrigger class="h-[34px] w-[210px] rounded-[9px] px-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
              <SelectItem v-for="o in BOARD_SORT_ORDER_OPTIONS" :key="o.value" :value="o.value">{{
                o.label
              }}</SelectItem>
            </SelectViewport>
          </SelectContent>
        </Select>
        <Button variant="accent" class="new-btn" @click="ui.openNewTask()">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          New task
        </Button>
      </div>
    </div>

    <div v-if="statusFilter" class="filter-bar">
      <span class="filter-chip">
        <span
          class="cdot"
          :style="{ background: filterCol!.color, boxShadow: '0 0 6px ' + filterCol!.color }"
        ></span>
        {{ filterCol!.label }} · {{ repo.byStatus(statusFilter).length }}
      </span>
      <router-link to="/work" class="filter-clear">Show all statuses</router-link>
    </div>

    <div ref="boardEl" class="board">
      <template v-if="statusFilter">
        <BoardColumn
          :col="filterCol!"
          :bar-color="filterCol!.id === 'draft' ? DRAFT_BAR : ''"
          empty-text="—"
          force-expand
          :drag-enabled="false"
          :highlight-id="boardKey.highlightId.value"
        />
      </template>
      <template v-else>
        <BoardColumn
          :col="DRAFT_COL"
          :bar-color="DRAFT_BAR"
          empty-text="—"
          :highlight-id="boardKey.highlightId.value"
        />
        <BoardColumn
          v-for="col in labeledColumns"
          :key="col.id"
          :col="col"
          :highlight-id="boardKey.highlightId.value"
        />
      </template>
    </div>

    <section
      v-if="!statusFilter && (repo.humanTasks.length || repo.archivedTasks.length)"
      class="parked-lists"
    >
      <div class="parked-toggles">
        <button
          v-if="repo.humanTasks.length"
          type="button"
          class="human-toggle"
          :aria-expanded="humanExpanded"
          data-tip="Every task assigned to a human"
          @click="toggleHuman"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            class="human-chevron"
            :class="{ open: humanExpanded }"
          >
            <path
              d="m9 6 6 6-6 6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <User class="human-toggle-icon" aria-hidden="true" />
          Human ({{ repo.humanTasks.length }})
        </button>
        <button
          v-if="repo.archivedTasks.length"
          type="button"
          class="archived-toggle"
          :aria-expanded="archivedExpanded"
          @click="toggleArchived"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            class="archived-chevron"
            :class="{ open: archivedExpanded }"
          >
            <path
              d="m9 6 6 6-6 6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Archived ({{ repo.archivedTasks.length }})
        </button>
      </div>
      <ul v-if="humanExpanded && repo.humanTasks.length" class="human-rows">
        <li v-for="t in repo.humanTasks" :key="t.id">
          <button type="button" class="human-row" @click="openHuman(t)">
            <User class="human-row-icon" aria-hidden="true" />
            <span class="mono human-id">#{{ t.id }}</span>
            <span class="human-title">{{ t.title }}</span>
            <span class="human-status">{{ t.status }}</span>
          </button>
        </li>
      </ul>
      <ul v-if="archivedExpanded && repo.archivedTasks.length" class="archived-rows">
        <li v-for="t in repo.archivedTasks" :key="t.id">
          <button type="button" class="archived-row" @click="openArchived(t)">
            <span class="mono archived-id">#{{ t.id }}</span>
            <span class="archived-title">{{ t.title }}</span>
            <span class="archived-status">{{ t.status }}</span>
          </button>
        </li>
      </ul>
    </section>

    <div class="ibar-spacer" aria-hidden="true"></div>
    <IntegrationStatusBar class="ibar-outer" />
  </div>
</template>

<style scoped>
/* Reserve room at the bottom of the scrollable work queue so the pinned
   integration status bar never covers the last board rows. */
.ibar-spacer {
  height: 150px;
}
</style>
