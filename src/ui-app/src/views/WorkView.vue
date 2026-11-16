<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { Columns3, Eye, EyeOff, LoaderCircle, Route, User } from "lucide-vue-next";
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
import { useResponsiveLayout } from "../composables/useResponsiveLayout";
import {
  collapseAllEmpty,
  expandAll,
  hasExpandedEmptyColumn,
  isColumnCollapsed,
  revealArrivals,
} from "../lib/boardCollapse";
import BoardColumn from "../components/BoardColumn.vue";
import PipelineView from "../components/PipelineView.vue";
import Button from "../components/ui/button.vue";
import Select from "../components/ui/select/root.vue";
import SelectContent from "../components/ui/select/content.vue";
import SelectItem from "../components/ui/select/item.vue";
import SelectTrigger from "../components/ui/select/trigger.vue";
import SelectValue from "../components/ui/select/value.vue";
import SelectViewport from "../components/ui/select/viewport.vue";
import IntegrationStatusBar from "../components/IntegrationStatusBar.vue";
import MobileWorkQueue from "../components/MobileWorkQueue.vue";
import {
  applyShotPreviewFixture,
  isShotPreviewCaptureActive,
  readShotPreviewFixtureFromLocation,
} from "../lib/shot-preview-fixtures.js";
import { SHOT_PREVIEW_FIXTURE_TASK_ID } from "../../../core/shot-fixtures.js";
import type { Task } from "../types";

const DRAFT_BAR = "#3a4055";

const STATUS_IDS = new Set(["draft", "inbox", "ready", "active", "review", "done"]);

const repo = useRepoStore();
const ui = useUiStore();
const config = useConfigStore();
const route = useRoute();
const { workDir } = storeToRefs(repo);
const { isNarrow } = useResponsiveLayout();

// #1137 review: the phone queue and the phone detail must be derived from the
// same state, never from the URL alone. A `?task=` param that is still being
// fetched (or whose fetch failed) has no drawer yet — hiding the queue on the
// param alone left a blank page and dropped the old loading/not-found shell.
// `phoneTaskParam` excludes the `new` panel (the drawer owns that), and
// `mobileDetailVisible` is true only when a real surface (the drawer, the new
// panel, or the pending/not-found state) is on screen.
const phoneTaskParam = computed<string | null>(() => {
  if (!isNarrow.value || typeof route.query.task !== "string") return null;
  const id = route.query.task.replace(/^#/, "");
  return id && id !== "new" ? id : null;
});
const phoneTaskPending = computed(() => phoneTaskParam.value !== null && ui.active === null);
const mobileDetailVisible = computed(
  () => isNarrow.value && (ui.active !== null || ui.isNew || phoneTaskPending.value),
);

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
// ?task=new opens the new-task panel. On desktop the task param is cleared
// once the drawer opens; on narrow screens it stays in history as the detail
// page route so Back returns to the queue. Other query keys (e.g. ?status=)
// are preserved. A link that arrives through the login round-trip
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
  () => {
    const shot =
      typeof window !== "undefined" ? readShotPreviewFixtureFromLocation(window.location) : null;
    return shot === "drawer:postMergeSummary"
      ? repo.tasks.find((task) => task.id === SHOT_PREVIEW_FIXTURE_TASK_ID)
      : undefined;
  },
  (task) => {
    // App.vue applies shot fixtures in its parent mounted hook, after this
    // view's own hook. Watch for the seeded task so the drawer opens reliably.
    if (!task || ui.active) return;
    void ui.openTask(task);
    ui.activeTab = "agent";
  },
  { immediate: true },
);
/**
 * Identifies the newest `?task=` open request. A slow fetch or retry that
 * resolves after the param changed (or after Return to Work) must not open a
 * stale task or leave the phone detail stuck on its loading shell.
 */
let taskOpenRequest = 0;
watch(
  () => route.query.task,
  (v, previous) => {
    if (typeof v !== "string" || !v) {
      taskOpenRequest++;
      ui.activeDetailLoading = false;
      if (isNarrow.value && typeof previous === "string" && !ui.isNew) ui.close();
      return;
    }
    void openFromTaskParam(v);
  },
  { immediate: true },
);
// A ?tab= change while the same task stays selected (a deep link followed from
// an already-open phone detail) must still move the shared drawer to that tab.
watch(
  () => route.query.tab,
  (raw) => {
    if (typeof route.query.task !== "string" || !ui.active) return;
    const tab = tabFromQuery(raw);
    if (tab) ui.activeTab = tab;
  },
);

async function clearTaskParam(): Promise<void> {
  const query = { ...route.query };
  delete query.task;
  delete query.tab;
  await router.replace({ query });
}

/** Leave the phone loading/not-found shell and go back to the queue. */
async function returnToQueue(): Promise<void> {
  await clearTaskParam();
}

async function openFromTaskParam(raw: string): Promise<void> {
  const request = ++taskOpenRequest;
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
    ui.activeDetailLoading = true;
    try {
      const fetched = await api<Task>(`/api/tasks/${encodeURIComponent(id)}`);
      // A newer open request (or Return to Work) won while this fetch ran.
      if (request !== taskOpenRequest) return;
      ui.open(fetched);
    } catch {
      // Unknown id — leave the param in place so the broken link stays
      // inspectable, and let the phone shell offer Return to Work instead of a
      // blank page. The request token keeps a stale failure from clearing a
      // newer request's loading state.
      return;
    } finally {
      if (request === taskOpenRequest) ui.activeDetailLoading = false;
    }
  }
  // #0755: a deep-linked tab wins over the status default set by `open`, so
  // `/work?task=0755&tab=changes` lands on the Changes tab.
  const tab = tabFromQuery(route.query.tab);
  if (tab) ui.activeTab = tab;
  if (typeof window !== "undefined") {
    const shot = readShotPreviewFixtureFromLocation(window.location);
    const statusShot =
      shot === "drawer:statusDetails" ||
      shot === "drawer:held" ||
      (tab === "debug" && shot === "closeOut:uploading");
    if (statusShot) {
      ui.activeTab = "debug";
      ui.debugView = "status";
    }
  }
  // On narrow screens the task query is the detail-page route. Keeping it in
  // history lets browser Back return to the still-mounted queue and its state.
  if (!isNarrow.value) await clearTaskParam();
}

// ── #1141 Show/hide human and held tasks ───────────────────────────────
// The parked lists below the board keep every human/held task reachable, but
// those categories can also clutter the board columns. Two independent header
// toggles filter them out of the queue lists without touching status or
// assignment semantics; the choice persists like the parked-list open states.
// Defaults are visible so the board looks exactly as it did before.
const HUMAN_VISIBLE_KEY = "repoos.work.humanVisible";
const HELD_VISIBLE_KEY = "repoos.work.heldVisible";
function readCategoryVisible(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}
function persistCategoryVisible(key: string, visible: boolean): void {
  try {
    localStorage.setItem(key, visible ? "1" : "0");
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}
const humanVisible = ref(readCategoryVisible(HUMAN_VISIBLE_KEY));
const heldVisible = ref(readCategoryVisible(HELD_VISIBLE_KEY));
function toggleHumanVisible(): void {
  humanVisible.value = !humanVisible.value;
  persistCategoryVisible(HUMAN_VISIBLE_KEY, humanVisible.value);
}
function toggleHeldVisible(): void {
  heldVisible.value = !heldVisible.value;
  persistCategoryVisible(HELD_VISIBLE_KEY, heldVisible.value);
}

/** Ids of the tasks the two header filters currently hide. Membership is the
 *  same as the parked lists (human: not done/archived; held: an active hold on
 *  a live task), so what a filter removes is exactly what its bottom-left list
 *  would show. The categories are independent: each toggle only adds its own
 *  ids, and an overlap (a human task that is also held) hides until the task is
 *  visible in both categories again. */
const hiddenTaskIds = computed<ReadonlySet<string>>(() => {
  const ids = new Set<string>();
  if (!humanVisible.value) for (const t of repo.humanTasks) ids.add(t.id);
  if (!heldVisible.value) for (const t of repo.heldTasks) ids.add(t.id);
  return ids;
});

/** The board's per-status task list with the hidden categories removed. */
function visibleByStatus(status: string): Task[] {
  const hidden = hiddenTaskIds.value;
  const tasks = repo.byStatus(status);
  return hidden.size ? tasks.filter((t) => !hidden.has(t.id)) : tasks;
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
    out.push(...visibleByStatus(col.id));
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
 *  column is toggled, bulk-collapsed, or auto-opened. "Empty" means empty on
 *  screen, so the #1141 category filters count: hiding the last visible task
 *  in a column makes it collapsible. */
const allEmptyCollapsed = computed(() => !hasExpandedEmptyColumn(visibleByStatus, BOARD_IDS.value));

function toggleEmptyColumns(): void {
  if (allEmptyCollapsed.value) expandAll(BOARD_IDS.value);
  else collapseAllEmpty(visibleByStatus, BOARD_IDS.value);
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

// ── #1035 Pipeline | Board toggle ─────────────────────────────────────
// Board stays the default and is unchanged; the last choice persists per
// user in localStorage, mirroring the Inputs page List | Board switch.
type WorkViewMode = "pipeline" | "board";
const WORK_VIEW_STORAGE_KEY = "repoos.work.view-mode";
const viewMode = ref<WorkViewMode>("board");
function loadWorkViewMode(): void {
  try {
    viewMode.value =
      localStorage.getItem(WORK_VIEW_STORAGE_KEY) === "pipeline" ? "pipeline" : "board";
  } catch {
    viewMode.value = "board";
  }
}
function setWorkViewMode(mode: WorkViewMode): void {
  viewMode.value = mode;
  try {
    localStorage.setItem(WORK_VIEW_STORAGE_KEY, mode);
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}
onMounted(loadWorkViewMode);
// Shot captures must land on the track even when the stored preference is
// board-first (`board:pipeline`, `pipeline:*`, or `/work?tab=pipeline`).
// `?shotState=` is enough to force the track before /api/health returns
// `isPreviewBuild` — waiting on health left pipeline shots on the board (#1054).
const effectiveView = computed<WorkViewMode>(() => {
  const shot =
    typeof route.query.shotState === "string"
      ? route.query.shotState
      : readShotPreviewFixtureFromLocation(
          typeof window !== "undefined" ? window.location : { search: "" },
        );
  const captureActive =
    typeof window !== "undefined" && isShotPreviewCaptureActive(window.location);
  if (captureActive) {
    if (shot === "board:pipeline" || shot?.startsWith("pipeline:")) return "pipeline";
    if (route.query.tab === "pipeline") return "pipeline";
  } else if (repo.health?.isPreviewBuild && shot === "board:pipeline") {
    return "pipeline";
  }
  return viewMode.value;
});

// ── #0960 Held list ───────────────────────────────────────────────────
// Tasks parked out of ALL automation live in a collapsible list beside the
// Archived/Human lists, so a hold is visible from the board at a glance. The
// count and rows reuse the violet "Held" cue from the card badge.
const HELD_EXPANDED_KEY = "repoos.work.heldExpanded";
function readHeldExpanded(): boolean {
  try {
    return localStorage.getItem(HELD_EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}
const heldExpanded = ref(readHeldExpanded());
function toggleHeld(): void {
  heldExpanded.value = !heldExpanded.value;
  try {
    localStorage.setItem(HELD_EXPANDED_KEY, heldExpanded.value ? "1" : "0");
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}
function openHeld(task: Task): void {
  void ui.openTask(task);
}
</script>

<template>
  <!-- #1130: the two Work compositions are mutually exclusive by viewport.
       `v-else` used to chain to the old mobile detail, so on a phone with no
       task open the desktop board mounted underneath the mobile queue and
       painted over it. Keep the narrow branch in its own v-if so exactly one
       queue ever renders.

       #1137: the phone task detail is the shared TaskDrawer mounted by App.vue,
       so every entry point renders the same component. WorkView only owns the
       queue here; the ?task= watcher still opens the drawer and applies ?tab=. -->
  <template v-if="isNarrow">
    <MobileWorkQueue v-show="!mobileDetailVisible" />
    <!-- #1137 review: a `?task=` link can point at a task that is still being
         fetched or is gone. The shared drawer only exists once `ui.active`
         resolves, so keep the old phone loading/not-found surface here rather
         than hiding the queue and leaving a blank page. -->
    <main
      v-if="phoneTaskPending"
      class="mobile-detail-state"
      data-testid="mobile-task-detail-state"
      role="status"
    >
      <LoaderCircle
        v-if="ui.activeDetailLoading"
        class="mobile-detail-spinner"
        aria-hidden="true"
      />
      <h1>{{ ui.activeDetailLoading ? "Loading task…" : "Task unavailable" }}</h1>
      <p v-if="!ui.activeDetailLoading">
        This task could not be loaded. Return to the queue and try again.
      </p>
      <Button v-if="!ui.activeDetailLoading" variant="outline" @click="returnToQueue"
        >Return to Work</Button
      >
    </main>
  </template>
  <div v-else class="work-page">
    <div class="work-header">
      <div class="work-header-copy">
        <div class="page-title">Work Queue</div>
        <div class="page-desc" style="margin: 3px 0 0">
          Repo-native tasks ·
          <span class="mono" style="color: var(--cyan)">{{ workDir }}/*.md</span>
        </div>
      </div>
      <div class="work-header-actions">
        <RouterLink to="/client-board" class="client-board-link">Client board</RouterLink>
        <div
          v-if="effectiveView === 'board'"
          class="view-toggle queue-visibility"
          role="group"
          aria-label="Show or hide human and held tasks"
        >
          <button
            type="button"
            class="view-toggle-btn"
            :class="{ active: humanVisible }"
            :aria-pressed="humanVisible"
            :aria-label="humanVisible ? 'Hide human-assigned tasks' : 'Show human-assigned tasks'"
            data-testid="toggle-human-visibility"
            @click="toggleHumanVisible"
          >
            <EyeOff v-if="!humanVisible" class="size-3.5" aria-hidden="true" />
            <Eye v-else class="size-3.5" aria-hidden="true" />
            <span>Human</span>
          </button>
          <button
            type="button"
            class="view-toggle-btn"
            :class="{ active: heldVisible }"
            :aria-pressed="heldVisible"
            :aria-label="heldVisible ? 'Hide held tasks' : 'Show held tasks'"
            data-testid="toggle-held-visibility"
            @click="toggleHeldVisible"
          >
            <EyeOff v-if="!heldVisible" class="size-3.5" aria-hidden="true" />
            <Eye v-else class="size-3.5" aria-hidden="true" />
            <span>Held</span>
          </button>
        </div>
        <Button
          v-if="!statusFilter && effectiveView === 'board'"
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
          v-if="effectiveView === 'board'"
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
        <div class="view-toggle" role="group" aria-label="Work view">
          <button
            type="button"
            class="view-toggle-btn"
            :class="{ active: effectiveView === 'pipeline' }"
            :aria-pressed="effectiveView === 'pipeline'"
            @click="setWorkViewMode('pipeline')"
          >
            <Route class="size-3.5" /><span>Pipeline</span>
          </button>
          <button
            type="button"
            class="view-toggle-btn"
            :class="{ active: effectiveView === 'board' }"
            :aria-pressed="effectiveView === 'board'"
            @click="setWorkViewMode('board')"
          >
            <Columns3 class="size-3.5" /><span>Board</span>
          </button>
        </div>
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

    <div v-if="statusFilter && effectiveView === 'board'" class="filter-bar">
      <span class="filter-chip">
        <span
          class="cdot"
          :style="{ background: filterCol!.color, boxShadow: '0 0 6px ' + filterCol!.color }"
        ></span>
        {{ filterCol!.label }} · {{ visibleByStatus(statusFilter).length }}
      </span>
      <router-link to="/work" class="filter-clear">Show all statuses</router-link>
    </div>

    <PipelineView v-show="effectiveView === 'pipeline'" />

    <div v-show="effectiveView === 'board'" ref="boardEl" class="board">
      <template v-if="statusFilter">
        <BoardColumn
          :col="filterCol!"
          :bar-color="filterCol!.id === 'draft' ? DRAFT_BAR : ''"
          :tasks="visibleByStatus(filterCol!.id)"
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
          :tasks="visibleByStatus(DRAFT_COL.id)"
          empty-text="—"
          :highlight-id="boardKey.highlightId.value"
        />
        <BoardColumn
          v-for="col in labeledColumns"
          :key="col.id"
          :col="col"
          :tasks="visibleByStatus(col.id)"
          :highlight-id="boardKey.highlightId.value"
        />
      </template>
    </div>

    <section
      v-if="
        effectiveView === 'board' &&
        !statusFilter &&
        (repo.humanTasks.length || repo.archivedTasks.length || repo.heldTasks.length)
      "
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
          v-if="repo.heldTasks.length"
          type="button"
          class="held-toggle"
          :aria-expanded="heldExpanded"
          data-tip="Tasks parked out of ALL automation (repoos hold)"
          @click="toggleHeld"
        >
          <svg viewBox="0 0 24 24" fill="none" class="held-chevron" :class="{ open: heldExpanded }">
            <path
              d="m9 6 6 6-6 6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Held ({{ repo.heldTasks.length }})
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
      <ul v-if="heldExpanded && repo.heldTasks.length" class="held-rows">
        <li v-for="t in repo.heldTasks" :key="t.id">
          <button type="button" class="held-row" @click="openHeld(t)">
            <span class="mono held-id">#{{ t.id }}</span>
            <span class="held-title">{{ t.title }}</span>
            <span v-if="t.holdReason" class="held-reason">{{ t.holdReason }}</span>
            <span class="held-status">{{ t.status }}</span>
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
  </div>

  <!-- The integration bar is Work's ambient pipeline status, not part of the
       desktop board. Keeping it outside the desktop-only branch means the
       phone layout still shows it; its own narrow CSS floats it above the
       bottom tab bar and the queue reserves end clearance below.
       `page-fixed-layer` keeps the shared `.main` page padding off this fixed
       wrapper: padding here grows the box upward and detached the bar from the
       viewport bottom (#1136). -->
  <IntegrationStatusBar class="ibar-outer page-fixed-layer" />
</template>

<style scoped>
/* #1139: the header row must wrap instead of clipping its toolbar on
   landscape phones and 768px tablets. The actions drop to a second line while
   the title keeps its full width (one line at these sizes). */
.work-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.work-header-copy {
  min-width: 0;
}
.work-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
@media (max-width: 900px) {
  .work-header {
    align-items: flex-start;
  }
  .work-header-actions {
    width: 100%;
  }
}
/* Pipeline | Board switch — same styled toggle as the Inputs page List | Board. */
.view-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
}
.view-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--txt-faint);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.view-toggle-btn:hover {
  color: var(--txt);
  background: var(--nav-hover-bg);
}
.view-toggle-btn.active {
  color: var(--txt);
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--border);
}
/* Reserve room at the bottom of the scrollable work queue so the pinned
   integration status bar never covers the last board rows. */
.ibar-spacer {
  height: 150px;
}
</style>

<style scoped>
.client-board-link {
  color: var(--cyan);
  font-size: 13px;
  white-space: nowrap;
}
.client-board-link:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 3px;
}
</style>

<style scoped>
/* #1137 review: phone loading/not-found shell for a ?task= link whose drawer
   has not resolved (or failed to). Matches the queue's typography and the old
   MobileTaskDetail state surface. */
.mobile-detail-state {
  display: grid;
  justify-items: start;
  gap: 9px;
  padding: 30px 0;
  color: var(--txt);
}
.mobile-detail-state h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
}
.mobile-detail-state p {
  margin: 0 0 8px;
  color: var(--txt-faint);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.mobile-detail-state :deep(button) {
  min-height: 44px;
}
.mobile-detail-spinner {
  width: 20px;
  height: 20px;
  color: var(--cyan);
  animation: mobile-detail-spin 1s linear infinite;
}
@keyframes mobile-detail-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .mobile-detail-spinner {
    animation-duration: 2.4s;
  }
}
</style>
