<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { X, Play, Pause, Send, CheckCheck, ExternalLink, Square, ArrowRight, ArrowDown, RotateCcw, ImagePlus, FileText, MessageSquare, Bot, Diff, ShieldCheck, ChevronsDownUp, Coins, Bug } from "lucide-vue-next";
import type { ReviewState, Task, AgentOutputEntry } from "../types";
import { COLUMNS, pmCannedMessagesFor, statusColor, useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { useConfigStore } from "../stores/config";
import { useAuthStore } from "../stores/auth";
import { renderMarkdown } from "../lib/markdown";
import { fmtTime } from "../lib/time";
import { api, JSON_OPTS } from "../api";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import VoiceDictate from "./VoiceDictate.vue";
import RestartTaskDialog from "./RestartTaskDialog.vue";
import DirtyMainDialog from "./DirtyMainDialog.vue";
import HotfixConfirmDialog from "./HotfixConfirmDialog.vue";
import SendToEngineerDialog from "./SendToEngineerDialog.vue";
import SpecEditModal from "./SpecEditModal.vue";
import DoneErrorCard from "./DoneErrorCard.vue";
import DebugPanel from "./DebugPanel.vue";
import { insertTextAtCursor } from "../utils/text-insertion";
import { autoGrowTextarea } from "../utils/textarea-autogrow";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";
import AgentModelControl from "./AgentModelControl.vue";
import { GENERIC_PATCH_TARGETS } from "../lib/taskTransitions";
import { parseReviewVerdict } from "../lib/reviewVerdict";

const repo = useRepoStore();
const ui = useUiStore();
const config = useConfigStore();
const auth = useAuthStore();
const router = useRouter();

/** Task whose dirty-worktree restart choice is awaiting an answer. */
const restartTask = ref<Task | null>(null);

const allStatuses = computed(() => [
  { id: "draft", label: "Draft", color: statusColor("draft") },
  ...COLUMNS,
]);
const selectableStatuses = computed(() => {
  const current = ui.active?.status;
  const reachable = current ? (GENERIC_PATCH_TARGETS[current] ?? []) : [];
  return allStatuses.value.filter((status) => status.id === current || reachable.includes(status.id));
});

const open = computed(() => ui.active !== null || ui.isNew);
function setOpen(v: boolean): void {
  if (!v) ui.close();
}

function onOpenAutoFocus(e: Event): void {
  if (ui.isNew) {
    e.preventDefault();
    requestAnimationFrame(() => {
      const id = newMode.value === "freeform" ? "nt-freeform" : "nt-title";
      document.getElementById(id)?.focus();
    });
  }
}

const taskTypes = ["feature", "bug", "chore", "spec", "refactor"];
const priorities = ["p0", "p1", "p2", "p3"];

// ---- freeform creation flow ----

/** Which new-task flow the drawer is showing (default from settings). */
const newMode = ref<"freeform" | "manual">("freeform");
/** The raw explanation being turned into a task. */
const freeformText = ref("");
/** Visible error from a failed PM-agent call (explanation stays intact). */
const freeformError = ref("");
/** A fallback draft persisted when the agent failed, opened on request. */
const draftSaved = ref<Task | null>(null);

/** True when an enabled `pm` agent exists on the Agents page. */
const pmAgentReady = computed(() => {
  if (!config.loaded) return true;
  return (config.agents ?? []).some((a) => a.name === "pm" && a.enabled);
});

/** True while the freeform PM-agent call is in flight. */
const freeformRunning = ref(false);
/** The client-generated id that tags this run's streamed `agent.output` events. */
const freeformRunId = ref<string | null>(null);
/**
 * True once the user submits a freeform task. The drawer swaps the input form
 * for an acknowledgment panel that lets them keep working or start another
 * task while the PM agent fleshes the draft out in the background (0311).
 */
const freeformSubmitted = ref(false);
/** The draft the user just created, referenced by the acknowledgment panel. */
const submittedTask = ref<Task | null>(null);

const freeformTextarea = ref<HTMLTextAreaElement | null>(null);
const draftMsgTextarea = ref<HTMLTextAreaElement | null>(null);
const reviewDraftMsgTextarea = ref<HTMLTextAreaElement | null>(null);

function onFreeformTranscribed(text: string): void {
  if (freeformTextarea.value) {
    // The freeform compose box keeps its fixed min-height + resize:vertical
    // (a large drafting area, not a one-line chat input), so it is not auto-grown.
    insertTextAtCursor(freeformTextarea.value, text);
  }
}

function onDraftMsgTranscribed(text: string): void {
  if (draftMsgTextarea.value) {
    insertTextAtCursor(draftMsgTextarea.value, text); // dispatches `input` → adjustDraftMsgHeight
  }
}

function adjustDraftMsgHeight(): void {
  autoGrowTextarea(draftMsgTextarea.value);
}

function onReviewDraftMsgTranscribed(text: string): void {
  if (reviewDraftMsgTextarea.value) {
    insertTextAtCursor(reviewDraftMsgTextarea.value, text); // dispatches `input` → adjustReviewHeight
  }
}

function adjustReviewHeight(): void {
  autoGrowTextarea(reviewDraftMsgTextarea.value);
}

watch(
  () => ui.isNew,
  (isNew) => {
    if (!isNew) return;
    newMode.value = config.form.defaultTaskMode === "manual" ? "manual" : "freeform";
    // Deliberately keep freeformText: the draft survives closing and reopening
    // the drawer within a session. It is cleared only after a successful create.
    freeformError.value = "";
    draftSaved.value = null;
    freeformSubmitted.value = false;
    submittedTask.value = null;
    initFreeformOverrides();
  },
);

async function createFreeform(): Promise<void> {
  const text = freeformText.value.trim();
  if (!text) return;
  ui.saving = true;
  freeformRunning.value = true;
  freeformError.value = "";
  draftSaved.value = null;
  // A fresh run id each attempt; the previous run's buffer is dropped so the
  // stream never shows stale output and memory stays bounded to one run.
  if (freeformRunId.value) repo.clearOutput(freeformRunId.value);
  freeformRunId.value = crypto.randomUUID();
  try {
    const overrides = freeformIsCustom.value
      ? { agent: freeformOverride.agent, cli: freeformOverride.cli, model: freeformOverride.model }
      : undefined;
    const res = await repo.createFreeformTask(text, freeformRunId.value, overrides);
    // Agent error: keep the explanation in the textarea, show the error, and
    // point at the draft that preserved the capture.
    if (res.fallback && res.fallbackReason === "agent-failed") {
      draftSaved.value = res.task;
      freeformError.value = res.reason ?? "The PM agent failed";
      await uploadPendingScreenshots(res.task.id);
      if (freeformRunId.value) repo.clearOutput(freeformRunId.value);
      freeformRunId.value = null;
      return;
    }
    // Success, or the no-PM-agent fallback (raw explanation saved as draft):
    // the task is created server-side and the PM agent fleshes it out in the
    // background. Rather than auto-jumping into the draft's edit view and
    // keeping the pane blocked on it, swap to the acknowledgment panel so the
    // user can keep working or start another task (0311).
    await uploadPendingScreenshots(res.task.id);
    submittedTask.value = res.task;
    freeformSubmitted.value = true;
    // Clear the input so a "Create another task" tap starts from a clean form.
    freeformText.value = "";
  } catch (err) {
    freeformError.value = err instanceof Error ? err.message : String(err);
  } finally {
    freeformRunning.value = false;
    ui.saving = false;
  }
}

/** Reset the form + acknowledgment state to queue up another freeform task. */
function createAnotherTask(): void {
  freeformSubmitted.value = false;
  submittedTask.value = null;
  freeformError.value = "";
  if (freeformRunId.value) repo.clearOutput(freeformRunId.value);
  freeformRunId.value = null;
  ui.clearScreenshots();
  requestAnimationFrame(() => {
    document.getElementById("nt-freeform")?.focus();
  });
}

/** Acknowledge the in-flight creation and leave the new-task pane. */
function doneFreeform(): void {
  freeformSubmitted.value = false;
  submittedTask.value = null;
  if (freeformRunId.value) repo.clearOutput(freeformRunId.value);
  freeformRunId.value = null;
  ui.close();
}

function openDraft(): void {
  if (!draftSaved.value) return;
  ui.close();
  void ui.openTask(draftSaved.value);
  router.push("/work");
  draftSaved.value = null;
}

/** Short title for a raw draft, mirroring the server's explanationTitle. */
function draftTitle(text: string): string {
  const line =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => Boolean(l) && l !== "---") ?? "";
  if (line.length > 0) {
    return line.length <= 60 ? line : `${line.slice(0, 57).trimEnd()}…`;
  }
  const flat = text.replace(/\s+/g, " ").replace(/\s*---\s*/g, " ").trim();
  return flat.length <= 60 ? flat || "Untitled task" : `${flat.slice(0, 57).trimEnd()}…`;
}

/** Save the raw freeform text as a draft task, bypassing the PM agent. */
async function createDraft(): Promise<void> {
  const text = freeformText.value.trim();
  if (!text) return;
  ui.saving = true;
  freeformError.value = "";
  draftSaved.value = null;
  try {
    await repo.createTask({
      ...ui.nt,
      title: draftTitle(text),
      body: text,
      status: "draft",
    });
    ui.close();
    freeformText.value = "";
    router.push("/work");
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

async function createTask(): Promise<void> {
  if (!ui.nt.title) return;
  ui.saving = true;
  try {
    const created = await repo.createTask({ ...ui.nt });
    await uploadPendingScreenshots(created.id);
    ui.close();
    ui.nt.title = "";
    ui.nt.area = "web";
    ui.nt.priority = "p2";
    ui.nt.type = "feature";
    ui.nt.assignedTo = "";
    router.push("/work");
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

/** Upload the in-panel screenshots to a just-created task. Clears them on success. */
async function uploadPendingScreenshots(taskId: string): Promise<void> {
  for (const s of [...ui.pendingScreenshots]) {
    await repo.uploadScreenshot(taskId, s);
  }
  ui.clearScreenshots();
}

// ---- screenshot picking (file select + drag & drop, 0123) ----
const shotInput = ref<HTMLInputElement | null>(null);
/** Depth counter: dragenter/leave fire once per element boundary. */
const dragDepth = ref(0);

function onShotFiles(e: Event): void {
  const input = e.target as HTMLInputElement;
  if (input.files) ui.addScreenshots(Array.from(input.files));
  input.value = "";
}

function onDragEnter(): void {
  dragDepth.value++;
}

function onDragLeave(): void {
  dragDepth.value = Math.max(0, dragDepth.value - 1);
}

function onDrop(e: DragEvent): void {
  dragDepth.value = 0;
  const files = e.dataTransfer?.files;
  if (files && files.length) ui.addScreenshots(Array.from(files));
}

async function setStatus(status: string): Promise<void> {
  if (!ui.active || ui.active.status === status) return;
  ui.saving = true;
  try {
    await repo.setStatus(ui.active, status);
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

async function startWork(): Promise<void> {
  if (!ui.active) return;
  // A dirty worktree means restarting would either resume prior work or
  // discard it — surface that choice instead of starting silently.
  if (ui.active.git?.dirty) {
    restartTask.value = ui.active;
    return;
  }
  await startWorkIn(ui.active);
}

/** True while the Start-work request (engineer agent launch) is in flight. */
const startingWork = ref(false);

async function startWorkIn(t: Task): Promise<void> {
  ui.saving = true;
  startingWork.value = true;
  try {
    await repo.startWork(t);
    ui.activeTab = "agent";
  } catch (err) {
    repo.onError(err);
  } finally {
    startingWork.value = false;
    ui.saving = false;
  }
}

async function pauseWork(): Promise<void> {
  if (!ui.active) return;
  ui.saving = true;
  try {
    await repo.pauseWork(ui.active);
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

async function abandonWork(): Promise<void> {
  if (!ui.active) return;
  if (!confirm("Stop this task's current work and send it back to ready? The worktree is kept, not deleted.")) return;
  ui.saving = true;
  try {
    await repo.abandonWork(ui.active);
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

async function reopenTask(): Promise<void> {
  if (!ui.active) return;
  if (!confirm("Reopen this done task? It goes back to ready with a fresh branch on the next Start work.")) return;
  ui.saving = true;
  try {
    await repo.reopenTask(ui.active);
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

const confirmDelete = ref(false);
const confirmHotfix = ref(false);

async function deleteTask(): Promise<void> {
  if (!ui.active) return;
  ui.saving = true;
  try {
    await repo.deleteTask(ui.active.id);
    ui.close();
  } catch (err) {
    repo.onError(err);
    confirmDelete.value = false;
  } finally {
    ui.saving = false;
  }
}

async function startHotfix(target: "branch" | "main"): Promise<void> {
  if (!ui.active) return;
  ui.saving = true;
  try {
    await repo.activateHotfix(ui.active, target);
    // Selecting a hotfix target is the start action, not merely a mode
    // setting. Launch the engineer immediately so the user sees the task
    // enter active state and its progress tab without a second click.
    await repo.startWork(ui.active);
    confirmHotfix.value = false;
    ui.activeTab = "agent";
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

// ---- review → done close-out ----

/** True once Move to done has been enqueued and the close-out job for this
 *  task is active or queued in the integration pipeline (mirrors TaskCard's
 *  `inPipeline`, 0207). Unlike `doingDone` below (local component state that
 *  only covers the single in-flight enqueue request and resets on every page
 *  load), this reads the server-authoritative pipeline snapshot — so a
 *  drawer reopened after a refresh mid-pipeline still shows "Integrating…"
 *  instead of inviting a second click on a task that's already merging.
 *  (0309 follow-up.) */
const inPipeline = computed(() => {
  const snap = repo.integration;
  if (!ui.active || !snap) return false;
  return snap.active?.taskId === ui.active.id || snap.queue.includes(ui.active.id);
});

/** The active pipeline stage (sync/merge/build/check/done) for this task, or
 *  null when it's still queued behind another close-out. */
const pipelineStage = computed(() => {
  const active = repo.integration?.active;
  return active && active.taskId === ui.active?.id ? active.stage : null;
});

/** True while the merge+build+check+cleanup request is in flight. */
const doingDone = ref(false);
/** Elapsed seconds shown next to the progress label while the flow runs. */
const doneTicks = ref(0);
let doneTimer: number | undefined;

function startDoneTimer(): void {
  doneTicks.value = 0;
  window.clearInterval(doneTimer);
  doneTimer = window.setInterval(() => {
    doneTicks.value += 1;
  }, 1000);
}

function stopDoneTimer(): void {
  window.clearInterval(doneTimer);
  doneTimer = undefined;
}

/** Human-readable progress label, driven by server `task.progress` events. */
const doneLabel = computed(() => {
  const step = ui.active ? repo.doneSteps[ui.active.id] : undefined;
  switch (step) {
    case "merge":
      return "Merging branch…";
    case "build":
      return "Building…";
    case "check":
      return "Running repoos check…";
    case "done":
      return "Closing out…";
    default:
      return "Merging branch…";
  }
});

/** Progress label plus a live elapsed timer, e.g. "Building… 12s". */
const doneProgress = computed(() => {
  const base = doneLabel.value;
  return doingDone.value && doneTicks.value > 0 ? `${base} ${doneTicks.value}s` : base;
});

async function moveToDone(): Promise<void> {
  if (!ui.active || review.value?.running || inPipeline.value) return;
  ui.saving = true;
  doingDone.value = true;
  startDoneTimer();
  try {
    await repo.completeTask(ui.active);
    // The close-out pipeline just started — show its live progress instead
    // of a now-stale task drawer.
    ui.close();
    ui.expandIntegrationBar();
  } catch (err) {
    // Dirty-main guard (0204): pause and show the confirmation modal instead
    // of an inline failure — the task stays in review until the user decides.
    if (err instanceof Error && err.name === "DirtyMainError") {
      dirtyTask.value = ui.active;
      return;
    }
    // The failure is rendered inline below the button via the store's
    // per-task doneErrorFor; no global toast for this action.
    repo.onError(err);
  } finally {
    doingDone.value = false;
    stopDoneTimer();
    ui.saving = false;
  }
}

/** Dirty-main confirmation (0204): the task whose close-out is paused on
 *  `main` having uncommitted files. `null` hides the modal. */
const dirtyTask = ref<Task | null>(null);

const dirtyFiles = computed(() =>
  dirtyTask.value ? repo.dirtyMainFor(dirtyTask.value.id) : [],
);

async function confirmCommitDirty(): Promise<void> {
  const t = dirtyTask.value;
  const files = dirtyFiles.value;
  dirtyTask.value = null;
  if (!t) return;
  ui.saving = true;
  doingDone.value = true;
  startDoneTimer();
  try {
    await repo.completeTask(t, { commitDirty: true });
    ui.close();
    ui.expandIntegrationBar();
  } catch (err) {
    // Still dirty after commiting (e.g. a new file appeared) — keep asking.
    if (err instanceof Error && err.name === "DirtyMainError") {
      dirtyTask.value = t;
      return;
    }
    repo.onError(err);
  } finally {
    doingDone.value = false;
    stopDoneTimer();
    ui.saving = false;
  }
}

function cancelDirty(): void {
  if (ui.active) repo.clearDirtyMain(ui.active.id);
  dirtyTask.value = null;
}

interface TaskDraft {
  title: string;
  type: string;
  priority: string;
  area: string;
  assignedTo: string;
  body: string;
}

const DRAFT_FIELDS = ["title", "type", "priority", "area", "assignedTo", "body"] as const;

function emptyDraft(): TaskDraft {
  return { title: "", type: "feature", priority: "p2", area: "", assignedTo: "", body: "" };
}

/** Editable field values while the drawer is open. */
const draft = reactive<TaskDraft>(emptyDraft());
/** Snapshot of the fields at the last sync; the baseline Save diffs against. */
const original = reactive<TaskDraft>(emptyDraft());

function baseline(): void {
  for (const k of DRAFT_FIELDS) original[k] = draft[k];
}

function initDraft(t: Task): void {
  draft.title = t.title;
  draft.type = t.type;
  draft.priority = t.priority;
  draft.area = t.area;
  draft.assignedTo = t.assignedTo;
  draft.body = t.body;
  baseline();
}

function changedFields(): (keyof TaskDraft)[] {
  return DRAFT_FIELDS.filter((k) => draft[k] !== original[k]);
}

const dirty = computed(() => changedFields().length > 0);

const transitioned = computed(
  () => !!(ui.active && repo.transitionState?.id === ui.active.id),
);

/** Title and branch are frozen once a task leaves the planning stages. */
const locked = computed(() => {
  const s = ui.active?.status;
  return s === "active" || s === "review" || s === "done";
});

const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Branch is never typed: it derives from the title unless one is already set. */
const derivedBranch = computed(() => `feat/${slugify(draft.title)}`);
const effectiveBranch = computed(() => ui.active?.branch || derivedBranch.value);

/** Whether the spec card body is expanded. Collapsed shows just the header. */
const specExpanded = ref(true);

/** True while the spec edit modal is open. */
const specModalOpen = ref(false);

/** Rendered (safe) Markdown for the read-mode spec card. */
const specHtml = computed(() => renderMarkdown(draft.body));

function openSpecModal(): void {
  specModalOpen.value = true;
}

function applySpec(markdown: string): void {
  draft.body = markdown;
  specModalOpen.value = false;
}

let draftFromId = "";
watch(
  () => ui.active,
  (t) => {
    if (!t) {
      draftFromId = "";
      return;
    }
    if (t.id !== draftFromId) {
      // Different task (or drawer just reopened): load a fresh draft.
      initDraft(t);
      draftFromId = t.id;
      specModalOpen.value = false;
      return;
    }
    // Same task got updated (SSE task.updated). Resync only when the user has
    // no unsaved edits, so concurrent changes never clobber the draft.
    if (!dirty.value) initDraft(t);
  },
);

async function saveDraft(): Promise<void> {
  if (!ui.active || !dirty.value) return;
  const patch: Record<string, string> = {};
  for (const k of changedFields()) patch[k] = draft[k];
  // Auto-derive the branch from the title for planning-stage tasks — but only
  // when the branch is unset or was itself derived. Never clobber an explicit
  // branch such as "feat/0026-delete-tasks".
  if (!locked.value) {
    const prevDerived = `feat/${slugify(original.title)}`;
    const hadDerived = ui.active.branch === "" || ui.active.branch === prevDerived;
    if (patch.title !== undefined && hadDerived && derivedBranch.value !== ui.active.branch) {
      patch.branch = derivedBranch.value;
    }
  }
  ui.saving = true;
  try {
    await repo.patchTask(ui.active.id, patch);
    baseline();
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

function cancelDraft(): void {
  if (ui.active) initDraft(ui.active);
}

// ---- read-only worktree preview ----

/** True while a preview start/stop request is in flight. */
const previewBusy = ref(false);

async function stopPreview(): Promise<void> {
  if (!ui.active || previewBusy.value) return;
  previewBusy.value = true;
  try {
    await repo.stopPreview(ui.active);
  } catch (err) {
    repo.onError(err);
  } finally {
    previewBusy.value = false;
  }
}

/**
 * Manual fallback for the auto-launched review preview (#0198): that
 * auto-launch only fires on the transition INTO `review`, so a task that
 * lands there some other way (or whose agent handoff never emitted the
 * request signal, or that skipped straight past auto-launch for any other
 * reason) can sit in review with no preview and no way to get one short of
 * a fresh agent turn. This button is shown only when review has no live
 * preview yet, so it never duplicates or interferes with the automatic one.
 */
async function startPreview(): Promise<void> {
  if (!ui.active || previewBusy.value) return;
  previewBusy.value = true;
  try {
    await repo.startPreview(ui.active);
  } catch (err) {
    repo.onError(err);
  } finally {
    previewBusy.value = false;
  }
}

// ---- agent review (0101) ----

/**
 * The review agent's report on the open task. It is advisory: it exists to
 * inform the human's sign-off, never to perform it — the "Move to done" button
 * above stays the only way a task reaches `done`.
 */
const review = computed<ReviewState | null>(() =>
  ui.active ? repo.reviews[ui.active.id] ?? null : null,
);

/**
 * The current review substate for a task sitting in `review`:
 * `reviewing` (auto review in progress), `coding` (engineer making changes),
 * or `waiting for human` (review passed, human must approve/merge).
 */
const reviewSubstate = computed<{ label: string; cls: string } | null>(() => {
  if (!ui.active || ui.active.status !== "review") return null;
  if (review.value?.running) return { label: "reviewing", cls: "rs-reviewing" };
  if (repo.isRunning(ui.active.id)) {
    // A running agent on an already-review task, outside auto-review, means
    // the server silently resumed the engineer to fix a post-handoff
    // `repoos check` failure (handoff.ts's scheduleCheckFailureRetry) —
    // never that the task regressed to active. Label it distinctly.
    return ui.active.checkRetryCount
      ? { label: "fixing check failure", cls: "rs-coding" }
      : { label: "coding", cls: "rs-coding" };
  }
  return { label: "waiting for human", cls: "rs-human" };
});

/** Compact lifecycle counts: D = dev passes, R = review passes. The server
 * writes `review_passes` on EVERY completed review run (auto and manual alike),
 * so these track the true round-trips rather than `review_rounds`, which is a
 * separate auto-bounce bookkeeping counter capped at MAX_AUTO_REVIEW_ROUNDS.
 * Fall back to `review_rounds` only for tasks written before that field. */
const taskRounds = computed(() => {
  const task = ui.active;
  if (!task || (!task.branch && (task.status === "draft" || task.status === "inbox"))) {
    return { dev: 0, review: 0 };
  }
  let completed = task.extra?.review_passes;
  if (typeof completed !== "number" || !Number.isFinite(completed)) {
    completed = task.extra?.review_rounds;
  }
  const passes =
    typeof completed === "number" && Number.isFinite(completed)
      ? Math.max(0, Math.floor(completed))
      : 0;
  // Dev rounds that errored out before ever reaching a review pass (#0271
  // follow-up, confirmed live on #0291): an engineer session that crashes
  // never bumps review_passes, so without this a task with a genuine failed
  // dev attempt showed D0 · R0 — the badge simply didn't render at all
  // (`v-if="taskRounds.dev > 0"` below), even though a real, token-spending
  // session happened. See agents.ts's escalateFailedExit for where this is
  // counted.
  let errors = task.extra?.dev_error_count;
  const devErrors =
    typeof errors === "number" && Number.isFinite(errors) ? Math.max(0, Math.floor(errors)) : 0;
  // A task is in (or about to start) a dev pass when it's `ready` or `active`,
  // or back in `review` because the engineer is actively re-coding (post-handoff
  // fix / resume). Otherwise the current dev round is finished: `done` and
  // "waiting for human" review states show exactly the completed passes (D == R).
  // Excluded while `needsInput` is set from a fresh error: that flag marks the
  // SAME round `devErrors` already counted as still open/unresumed, not a new
  // one starting — resuming clears `needsInput`, which is when this becomes
  // eligible again for that (now genuinely new) attempt.
  const inDevPass =
    !task.needsInput &&
    (task.status === "ready" ||
      task.status === "active" ||
      (task.status === "review" && repo.isRunning(task.id)));
  return {
    dev: passes + devErrors + (inDevPass ? 1 : 0),
    review: passes,
  };
});

/** Rendered (safe) Markdown of the report body. */
const reviewHtml = computed(() =>
  review.value?.report ? renderMarkdown(review.value.report.markdown) : "",
);

/** True when a new review is in progress while a previous report is still
 *  shown. The old report is kept for context but must be flagged as stale —
 *  it describes an earlier worktree state and will be replaced as soon as the
 *  fresh run writes its report (RepoOS preserves the prior report until then).
 */
const reviewStale = computed(() =>
  Boolean(review.value?.running && review.value.report),
);

// ---- agent review tab (0110) ----

/** The review agent's verdict, derived from the report's verdict line. */
const verdict = computed(() => parseReviewVerdict(review.value?.report?.markdown));

/** True while a "Review again" / reviewer-chat request is in flight. */
const reviewBusy = ref(false);
/** A follow-up message typed in the Agent Review tab. */
const reviewDraftMsg = ref("");
/** Keep the long-lived reviewer transcript and the completed verdict separate. */
const reviewPane = ref<"chat" | "report">("chat");

/** The rendered reviewer conversation (report streaming + human messages). */
const reviewEntries = computed<DisplayEntry[]>(() => {
  const src = review.value?.lines ?? [];
  const out: DisplayEntry[] = [];
  for (const e of src) {
    if ("type" in e) {
      if (e.type === "text") {
        const text = stripAnsi(e.text);
        const last = out[out.length - 1];
        if (last && last.kind === "text" && text) {
          last.text = `${last.text}\n\n${text}`;
          continue;
        }
        out.push({ key: out.length, kind: "text", text });
      } else if (e.type === "human") {
        out.push({ key: out.length, kind: "human", text: e.text });
      } else if (e.type === "tool") {
        out.push({
          key: out.length,
          kind: "tool",
          toolName: e.tool,
          toolState: e.state,
          toolInput: e.input ? stripAnsi(e.input) : undefined,
          toolOutput: e.output ? stripAnsi(e.output) : undefined,
        });
      } else if (e.type === "step") {
        if (e.kind === "start") continue;
        out.push({
          key: out.length,
          kind: "step",
          stepKind: e.kind,
          stepReason: e.reason,
          stepAt: e.at,
        });
      } else {
        out.push({ key: out.length, kind: "sys", d: stripAnsi(e.d) });
      }
    } else {
      out.push({ key: out.length, kind: "line", s: e.s, d: stripAnsi(e.d) });
    }
  }
  return out;
});

/** Stick-to-bottom for the reviewer conversation, like the agent log. */
const reviewStick = ref(true);
const reviewLogEl = ref<HTMLElement | null>(null);
watch(reviewEntries, () => {
  if (reviewStick.value) {
    nextTick(() => {
      const el = reviewLogEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
});
function onReviewLogScroll(e: Event): void {
  const el = e.target as HTMLElement;
  reviewStick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}
function scrollReviewToBottom(smooth = false): void {
  const el = reviewLogEl.value;
  if (!el) return;
  reviewStick.value = true;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

/** Hydrate the reviewer conversation whenever the Agent Review tab opens. */
watch(
  () => [ui.active?.id, ui.activeTab],
  () => {
    if (!ui.active || ui.activeTab !== "review") return;
    reviewStick.value = true;
    void repo.loadReview(ui.active.id).then(() => nextTick(() => scrollReviewToBottom()));
  },
);

/** Send a follow-up message to the reviewer (its own session, never the engineer's). */
async function sendReviewTurn(): Promise<void> {
  if (!ui.active) return;
  const text = reviewDraftMsg.value.trim();
  if (!text || review.value?.running || reviewBusy.value) return;
  const prev = review.value?.lines ?? [];
  repo.reviews[ui.active.id] = {
    ...(review.value ?? { running: false, enabled: true, report: null, lines: [] }),
    lines: [...prev, { type: "human", text }],
  };
  reviewDraftMsg.value = "";
  reviewStick.value = true;
  nextTick(() => scrollReviewToBottom());
  reviewBusy.value = true;
  try {
    await repo.sendReviewMessage(ui.active.id, text);
  } catch (err) {
    repo.onError(err);
  } finally {
    reviewBusy.value = false;
  }
}

/** Start a fresh review run — a new assessment, not a continuation. */
async function reviewAgain(): Promise<void> {
  if (!ui.active || review.value?.running || reviewBusy.value) return;
  reviewBusy.value = true;
  try {
    await repo.reviewAgain(ui.active.id);
  } catch (err) {
    repo.onError(err);
  } finally {
    reviewBusy.value = false;
  }
}

/** Return a reviewed task to its existing engineer session with the review as
 * the first instruction of the resumed turn. Opens an optional-note dialog
 * first so the human can attach specific instructions for the engineer. */
const sendingToEngineer = ref(false);
const engineerNoteOpen = ref(false);
async function sendToEngineer(): Promise<void> {
  const task = ui.active;
  if (!task || review.value?.running || reviewBusy.value || sendingToEngineer.value) return;
  engineerNoteOpen.value = true;
}
async function confirmSendToEngineer(note: string): Promise<void> {
  const task = ui.active;
  const report = review.value?.report;
  if (!task || !report) return;
  engineerNoteOpen.value = false;

  const parts = [
    "This task was returned from review for fixes. Resume work in the existing worktree; do not reset or discard the current changes.",
    "Read the reviewer report below, fix every concrete applicable finding, add or update regression coverage where appropriate, then run repoos check before returning the task to review.",
  ];
  if (note) parts.push(`Instructions from the reviewer/human:\n${note}`);
  parts.push("Reviewer report:", report.markdown);
  const instruction = parts.join("\n\n");

  ui.saving = true;
  sendingToEngineer.value = true;
  try {
    await repo.setStatus(task, "active", note);
    await repo.startWork(task, "resume", instruction);
    ui.activeTab = "agent";
  } catch (err) {
    repo.onError(err);
  } finally {
    sendingToEngineer.value = false;
    ui.saving = false;
  }
}

/** Hydrate the report whenever the drawer shows a task (any status — the
 * report stays relevant and viewable after sign-off). */
watch(
  () => [ui.active?.id, ui.active?.status],
  () => {
    if (!ui.active) return;
    reviewPane.value = "report";
    void repo.loadReview(ui.active.id);
  },
  { immediate: true },
);

// ---- PM tab ----

/**
 * Generate session ID for PM chat on a specific task. Per-user when auth is
 * on (0248), so teammates sharing one instance each get their own PM
 * conversation per task. Matches the server's pmMessage route.
 */
function pmSessionId(taskId: string): string {
  return auth.email ? `pm-task-v2:${taskId}::${auth.email}` : `pm-task-v2:${taskId}`;
}

const pmDraft = ref("");
const pmDraftTextarea = ref<HTMLTextAreaElement | null>(null);
const pmSubmitting = ref(false);
const pmLog = ref<HTMLElement | null>(null);

/** Check if PM agent is enabled. */
const pmAgentEnabled = computed(() => {
  if (!config.loaded) return true;
  return (config.agents ?? []).some((a) => a.name === "pm" && a.enabled);
});

/** Get PM lines for the current task. */
const pmLines = computed(() => {
  if (!ui.active) return [];
  return repo.outputs[pmSessionId(ui.active.id)] ?? [];
});

/** Check if PM is busy. */
const pmBusy = computed(
  () =>
    pmSubmitting.value ||
    (ui.active && repo.runningIds.includes(pmSessionId(ui.active.id)))
);

const pmHasConversation = computed(() => pmLines.value.length > 0);

/**
 * Canned messages shown above the PM compose box, keyed by task status.
 * Empty (no chips) for statuses without a defined set.
 */
const pmCannedMessages = computed(() => {
  const t = ui.active;
  return t ? pmCannedMessagesFor(t.status) : [];
});

/** Whether to show the canned PM messages: any status with a defined set. */
const showPmCanned = computed(() => pmCannedMessages.value.length > 0);

/** Send the chosen canned message to the PM agent, just like a typed send. */
function pmSendCanned(text: string): void {
  pmDraft.value = text;
  void pmSend();
}

function pmLineKind(entry: AgentOutputEntry): "human" | "assistant" | "status" | "hidden" {
  if ("type" in entry) {
    if (entry.type === "human") return "human";
    if (entry.type === "text") return "assistant";
    if (entry.type === "step") return "hidden";
    return "status";
  }
  return entry.s === "out" ? "assistant" : "status";
}

function pmLineText(entry: AgentOutputEntry): string {
  if ("type" in entry) {
    if (entry.type === "human" || entry.type === "text") return entry.text;
    if (entry.type === "sys") return entry.d;
    if (entry.type === "tool") {
      const state = entry.state ? ` · ${entry.state}` : "";
      return `Checked with ${entry.tool}${state}`;
    }
    return "";
  }
  return entry.d;
}

function pmScrollToLatest(): void {
  nextTick(() => {
    if (pmLog.value) pmLog.value.scrollTop = pmLog.value.scrollHeight;
  });
}

watch(() => pmLines.value.length, () => {
  pmScrollToLatest();
});

async function pmSend(): Promise<void> {
  const text = pmDraft.value.trim();
  if (!text || pmBusy.value || !pmAgentEnabled.value || !ui.active) return;

  pmSubmitting.value = true;
  const optimistic: AgentOutputEntry = { type: "human", text, at: new Date().toISOString() };
  const sessionId = pmSessionId(ui.active.id);
  const optimisticIndex = (repo.outputs[sessionId] ?? []).length;
  repo.outputs[sessionId] = [...(repo.outputs[sessionId] ?? []), optimistic];
  pmDraft.value = "";
  pmScrollToLatest();

  try {
    await api(
      `/api/tasks/${ui.active.id}/pm/message`,
      JSON_OPTS("POST", {
        text,
        agentOverride: pmOverrideDraft.agent || undefined,
        cliOverride: pmOverrideDraft.cli || undefined,
        modelOverride: pmOverrideDraft.model || undefined,
      })
    );
  } catch (error) {
    repo.outputs[sessionId] = (repo.outputs[sessionId] ?? []).filter(
      (_entry, index) => index !== optimisticIndex
    );
    pmDraft.value = text;
    repo.outputs[sessionId] = [
      ...(repo.outputs[sessionId] ?? []),
      { type: "sys", d: error instanceof Error ? error.message : String(error) },
    ];
    repo.onError(error);
  } finally {
    pmSubmitting.value = false;
  }
}

function pmOnKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void pmSend();
}

function adjustPmHeight(): void {
  autoGrowTextarea(pmDraftTextarea.value);
}

/**
 * Interrupt the PM's in-flight response. The server stops the running agent
 * turn and appends a "response interrupted" marker to the conversation.
 * Best-effort — a 404 when nothing is running is harmless.
 */
async function pmInterrupt(): Promise<void> {
  if (!ui.active) return;
  try {
    await api(`/api/tasks/${ui.active.id}/pm/interrupt`, { method: "POST" });
  } catch (error) {
    repo.onError(error);
  }
}

watch(
  () => ui.active?.id,
  () => {
    if (ui.active) {
      pmScrollToLatest();
    }
  },
);

// ---- PM agent override (task detail) ----

/** The base PM agent from the Agents page. */
const pmBaseAgent = computed(() => {
  const list = config.agents?.length ? config.agents : [];
  return list.find((a) => a.enabled && a.name === "pm") ?? null;
});

/** Draft overrides for the PM tab, initialized from the task's persisted values. */
const pmOverrideDraft = reactive({ agent: "", cli: "", model: "" });

/** Snapshot of the last-saved PM override values. */
const pmOverrideSaved = reactive({ agent: "", cli: "", model: "" });

/**
 * True while `initPmOverrideDraft` is assigning the draft from a task/base
 * re-sync. The CLI→model reset watcher below must ignore changes made during
 * this window — otherwise a re-sync that merely resolves `cli` to a
 * different string than before (e.g. because the base agent briefly changed)
 * silently wipes a real, already-saved model override back to "default" and
 * the debounced auto-save persists that wipe to the task file.
 */
let pmCliResetSuppressed = false;

/** Initialize the PM override draft from the current task. */
function initPmOverrideDraft(t: Task | null): void {
  const base = pmBaseAgent.value;
  pmCliResetSuppressed = true;
  pmOverrideDraft.agent = t?.pmAgentOverride || base?.name || "";
  pmOverrideDraft.cli = t?.pmCliOverride || base?.cli || "";
  pmOverrideDraft.model = t?.pmModelOverride || base?.model || "";
  pmOverrideSaved.agent = pmOverrideDraft.agent;
  pmOverrideSaved.cli = pmOverrideDraft.cli;
  pmOverrideSaved.model = pmOverrideDraft.model;
  nextTick(() => {
    pmCliResetSuppressed = false;
  });
}

/** True when the PM override draft differs from the saved values. */
const pmOverrideDirty = computed(
  () =>
    pmOverrideDraft.agent !== pmOverrideSaved.agent ||
    pmOverrideDraft.cli !== pmOverrideSaved.cli ||
    pmOverrideDraft.model !== pmOverrideSaved.model,
);

/** Model options for the PM tab's model select. */
const pmModelOptions = computed(() =>
  config.modelsFor(pmOverrideDraft.cli, pmOverrideDraft.model || undefined),
);

/** Initialize PM overrides when opening the PM tab, unless a draft is dirty. */
watch(
  () => [ui.active, ui.activeTab],
  () => {
    if (ui.activeTab !== "pm") return;
    if (!pmOverrideDirty.value) initPmOverrideDraft(ui.active);
  },
);

/** Debounced auto-save of PM overrides, mirroring the Agent tab. */
let pmOverrideAutoSaveTimer: number | undefined;

function schedulePmOverrideSave(): void {
  const taskId = ui.active?.id;
  if (!taskId) return;
  if (pmOverrideAutoSaveTimer !== undefined) {
    window.clearTimeout(pmOverrideAutoSaveTimer);
  }
  pmOverrideAutoSaveTimer = window.setTimeout(async () => {
    pmOverrideAutoSaveTimer = undefined;
    if (ui.active?.id !== taskId || !pmOverrideDirty.value) return;
    const base = pmBaseAgent.value;
    // Snapshot the values being sent so the saved-baseline sync never claims a
    // newer in-flight draft change was persisted (dirty stays true → re-arms).
    const sent = {
      agent: pmOverrideDraft.agent,
      cli: pmOverrideDraft.cli,
      model: pmOverrideDraft.model,
    };
    const agentVal = sent.agent !== (base?.name ?? "") ? sent.agent : null;
    const cliVal = sent.cli !== (base?.cli ?? "") ? sent.cli : null;
    const modelVal = sent.model !== (base?.model ?? "") ? sent.model : null;
    try {
      await repo.patchTask(taskId, {
        pmAgentOverride: agentVal,
        pmCliOverride: cliVal,
        pmModelOverride: modelVal,
      });
      pmOverrideSaved.agent = sent.agent;
      pmOverrideSaved.cli = sent.cli;
      pmOverrideSaved.model = sent.model;
    } catch (err) {
      repo.onError(err);
    }
  }, 500);
}

/** Same CLI→model reset for the PM tab. */
watch(
  () => pmOverrideDraft.cli,
  (newCli, oldCli) => {
    if (pmCliResetSuppressed) return;
    if (!newCli || newCli === oldCli) return;
    const opts = config.modelsFor(newCli);
    pmOverrideDraft.model = opts.length > 0 ? opts[0].value : "default";
  },
);

watch(
  () => [pmOverrideDraft.agent, pmOverrideDraft.cli, pmOverrideDraft.model],
  () => {
    schedulePmOverrideSave();
  },
);

// ---- review agent override (task detail) ----

/** The base reviewer agent from the Agents page. */
const reviewBaseAgent = computed(() => {
  const list = config.agents?.length ? config.agents : [];
  return list.find((a) => a.enabled && a.name.toLowerCase() === "reviewer") ?? null;
});

/** Draft overrides for the Review tab, initialized from the task's persisted values. */
const reviewOverrideDraft = reactive({ agent: "", cli: "", model: "" });

/** Snapshot of the last-saved review override values. */
const reviewOverrideSaved = reactive({ agent: "", cli: "", model: "" });

/** Same re-sync-vs-user-edit hazard as `pmCliResetSuppressed`, for the Review tab. */
let reviewCliResetSuppressed = false;

/** Initialize the review override draft from the current task. */
function initReviewOverrideDraft(t: Task | null): void {
  const base = reviewBaseAgent.value;
  reviewCliResetSuppressed = true;
  reviewOverrideDraft.agent = t?.reviewAgentOverride || base?.name || "";
  reviewOverrideDraft.cli = t?.reviewCliOverride || base?.cli || "";
  reviewOverrideDraft.model = t?.reviewModelOverride || base?.model || "";
  reviewOverrideSaved.agent = reviewOverrideDraft.agent;
  reviewOverrideSaved.cli = reviewOverrideDraft.cli;
  reviewOverrideSaved.model = reviewOverrideDraft.model;
  nextTick(() => {
    reviewCliResetSuppressed = false;
  });
}

/** True when the review override draft differs from the saved values. */
const reviewOverrideDirty = computed(
  () =>
    reviewOverrideDraft.agent !== reviewOverrideSaved.agent ||
    reviewOverrideDraft.cli !== reviewOverrideSaved.cli ||
    reviewOverrideDraft.model !== reviewOverrideSaved.model,
);

/** Model options for the Review tab's model select. */
const reviewModelOptions = computed(() =>
  config.modelsFor(reviewOverrideDraft.cli, reviewOverrideDraft.model || undefined),
);

/** Initialize review overrides when opening the Review tab, unless a draft is dirty. */
watch(
  () => [ui.active, ui.activeTab],
  () => {
    if (ui.activeTab !== "review") return;
    if (!reviewOverrideDirty.value) initReviewOverrideDraft(ui.active);
  },
);

/** Debounced auto-save of review overrides, mirroring the PM tab. */
let reviewOverrideAutoSaveTimer: number | undefined;

function scheduleReviewOverrideSave(): void {
  const taskId = ui.active?.id;
  if (!taskId) return;
  if (reviewOverrideAutoSaveTimer !== undefined) {
    window.clearTimeout(reviewOverrideAutoSaveTimer);
  }
  reviewOverrideAutoSaveTimer = window.setTimeout(async () => {
    reviewOverrideAutoSaveTimer = undefined;
    if (ui.active?.id !== taskId || !reviewOverrideDirty.value) return;
    const base = reviewBaseAgent.value;
    const sent = {
      agent: reviewOverrideDraft.agent,
      cli: reviewOverrideDraft.cli,
      model: reviewOverrideDraft.model,
    };
    const agentVal = sent.agent !== (base?.name ?? "") ? sent.agent : null;
    const cliVal = sent.cli !== (base?.cli ?? "") ? sent.cli : null;
    const modelVal = sent.model !== (base?.model ?? "") ? sent.model : null;
    try {
      await repo.patchTask(taskId, {
        reviewAgentOverride: agentVal,
        reviewCliOverride: cliVal,
        reviewModelOverride: modelVal,
      });
      reviewOverrideSaved.agent = sent.agent;
      reviewOverrideSaved.cli = sent.cli;
      reviewOverrideSaved.model = sent.model;
    } catch (err) {
      repo.onError(err);
    }
  }, 500);
}

/** Same CLI→model reset for the Review tab. */
watch(
  () => reviewOverrideDraft.cli,
  (newCli, oldCli) => {
    if (reviewCliResetSuppressed) return;
    if (!newCli || newCli === oldCli) return;
    const opts = config.modelsFor(newCli);
    reviewOverrideDraft.model = opts.length > 0 ? opts[0].value : "default";
  },
);

watch(
  () => [reviewOverrideDraft.agent, reviewOverrideDraft.cli, reviewOverrideDraft.model],
  () => {
    scheduleReviewOverrideSave();
  },
);

// ---- agent session tab ----

/** Strip ANSI escape sequences so no `[0m`-style codes ever reach the DOM. */
const ANSI_RE =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");

// ---- freeform PM-agent live stream ----

/** Plain display lines for the in-flight freeform run, fed by agent.output SSE. */
const freeformLines = computed<{ s: "out" | "err"; d: string }[]>(() => {
  const raw = freeformRunId.value ? repo.outputs[freeformRunId.value] ?? [] : [];
  return raw.map((e) => {
    if ("type" in e) {
      return { s: "out", d: stripAnsi(e.type === "text" ? e.text : ((e as { d?: string }).d ?? "")) };
    }
    return { s: e.s === "err" ? "err" : "out", d: stripAnsi(e.d) };
  });
});

const ffLogEl = ref<HTMLElement | null>(null);
watch(freeformLines, () => {
  nextTick(() => {
    const el = ffLogEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
});

interface DisplayEntry {
  key: number;
  kind: "line" | "text" | "human" | "tool" | "step" | "sys";
  s?: "out" | "err" | "sys";
  d?: string;
  text?: string;
  toolName?: string;
  toolState?: string;
  toolInput?: string;
  toolOutput?: string;
  stepKind?: "start" | "finish";
  stepReason?: string;
  stepAt?: string;
}

/**
 * The rendered transcript for the open task. Legacy `{s,d}` lines render
 * as today (ANSI stripped); structured entries become text blocks, tool
 * cards, step markers, and system lines. Consecutive text parts collapse
 * into one block so a multi-part assistant message reads as a single reply.
 */
const displayEntries = computed<DisplayEntry[]>(() => {
  const src = ui.active ? repo.outputs[ui.active.id] ?? [] : [];
  const out: DisplayEntry[] = [];
  for (const e of src) {
    if ("type" in e) {
      if (e.type === "text") {
        const text = stripAnsi(e.text);
        const last = out[out.length - 1];
        if (last && last.kind === "text" && text) {
          last.text = `${last.text}\n\n${text}`;
          continue;
        }
        out.push({ key: out.length, kind: "text", text });
      } else if (e.type === "human") {
        out.push({ key: out.length, kind: "human", text: e.text });
      } else if (e.type === "tool") {
        out.push({
          key: out.length,
          kind: "tool",
          toolName: e.tool,
          toolState: e.state,
          toolInput: e.input ? stripAnsi(e.input) : undefined,
          toolOutput: e.output ? stripAnsi(e.output) : undefined,
        });
      } else if (e.type === "step") {
        // Only finish markers are useful continuation information; drop the
        // "step" start line so the chat is less noisy.
        if (e.kind === "start") continue;
        out.push({
          key: out.length,
          kind: "step",
          stepKind: e.kind,
          stepReason: e.reason,
          stepAt: e.at,
        });
      } else {
        out.push({ key: out.length, kind: "sys", d: stripAnsi(e.d) });
      }
    } else {
      out.push({ key: out.length, kind: "line", s: e.s, d: stripAnsi(e.d) });
    }
  }
  return out;
});
/** A follow-up message typed in the Agent tab. */
const draftMsg = ref("");
/** Stick-to-bottom: only when the user hasn't scrolled up the log. */
const stick = ref(true);
const logEl = ref<HTMLElement | null>(null);
/** True when a turn is in flight (input disabled). */
const agentBusy = computed(
  () =>
    !!ui.active &&
    (ui.active.status === "active" || ui.active.status === "review") &&
    repo.isRunning(ui.active.id),
);

// ---- live run stats: time / tokens / cost / stall (0080) ----

/** Live telemetry for the open task's session, or undefined until one exists. */
const sessionStats = computed(() => (ui.active ? repo.agentStats[ui.active.id] : undefined));
/** Shown once a session has actually produced a transcript. */
const showStats = computed(() => displayEntries.value.length > 0);

/** Ticks once a second, driving the live elapsed-time readout below. */
const nowTick = ref(Date.now());
let statsTimer: number | undefined;
function startStatsTimer(): void {
  if (statsTimer !== undefined) return;
  nowTick.value = Date.now();
  statsTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
}
function stopStatsTimer(): void {
  window.clearInterval(statsTimer);
  statsTimer = undefined;
}
// Only ticks while a turn is actually in flight — once it ends, `turnStartedAt`
// goes null and the timer stops instead of counting up an idle task forever.
watch(
  () => sessionStats.value?.turnStartedAt,
  (turnStartedAt) => {
    if (turnStartedAt) startStatsTimer();
    else stopStatsTimer();
  },
  { immediate: true },
);
onUnmounted(stopStatsTimer);

/** Elapsed ms: completed-turns total, plus the in-flight turn ticked live. */
const elapsedMs = computed(() => {
  const s = sessionStats.value;
  if (!s) return 0;
  const inFlight = s.turnStartedAt ? Math.max(0, nowTick.value - Date.parse(s.turnStartedAt)) : 0;
  return s.accumulatedMs + inFlight;
});

/** "1:03" / "12:03" / "1:02:03" — never NaN, since `elapsedMs` is always a number. */
function fmtElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "842" / "12.3k" — "—" when the CLI hasn't reported a token count. */
function fmtTokens(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** "$0.031" / "$1.20" — "—" when the CLI hasn't reported a cost. Estimates,
 *  Kiro credits, and mixed sources are labeled so they are never read as firm
 *  USD (0230). */
function fmtCost(usd: number | null | undefined, source?: string): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  const n = usd < 1 ? usd.toFixed(3) : usd.toFixed(2);
  if (source === "kiro-credits") return `${n} credits`;
  if (source === "estimate") return `~$${n} est`;
  if (source === "mixed") return `$${n}*`;
  return `$${n}`;
}

/**
 * Prompt-cache hit rate as a percent string: cached input ÷ all input. `null`
 * when no CLI in the set reported cache figures (so the column stays "—"
 * rather than implying a real 0%).
 */
function cacheHitPct(
  input: number | null | undefined,
  read: number | null | undefined,
  creation: number | null | undefined,
): string {
  if (read == null && creation == null) return "—";
  const r = read ?? 0;
  const denom = (input ?? 0) + r + (creation ?? 0);
  if (denom <= 0) return "—";
  return `${Math.round((r / denom) * 100)}%`;
}

/** "Aug 20, 3:14 PM" — local time, for a session's start/end timestamp. */
function fmtSessionTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Human-readable text for why `needsInput` was set — see core/types.ts's NeedsInputReason. */
const NEEDS_INPUT_REASON_LABELS: Record<string, string> = {
  "review-failed": "The reviewer crashed or timed out without producing a report.",
  "dev-error": "The agent exited with an error.",
  "watchdog-stuck": "The task went quiet with no agent running.",
  "cto-escalation": "The CTO agent flagged this for a human decision.",
};

function needsInputReasonText(reason: string | undefined): string {
  return (reason && NEEDS_INPUT_REASON_LABELS[reason]) || "The agent needs your input — reply below to continue.";
}

watch(displayEntries, () => {
  if (stick.value) {
    nextTick(() => {
      const el = logEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
});

function onLogScroll(e: Event): void {
  const el = e.target as HTMLElement;
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

function scrollToBottom(smooth = false): void {
  const el = logEl.value;
  if (!el) return;
  stick.value = true;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

/** Hydrate the transcript whenever the Agent tab opens or the task changes. */
watch(
  () => [ui.active?.id, ui.activeTab],
  () => {
    if (!ui.active || ui.activeTab !== "agent") return;
    stick.value = true;
    void repo.loadOutput(ui.active.id).then(() => nextTick(() => scrollToBottom()));
  },
);

/** Restore the PM conversation after a browser reload or a server handover. */
watch(
  () => [ui.active?.id, ui.activeTab],
  () => {
    if (!ui.active || ui.activeTab !== "pm") return;
    void repo.loadOutput(pmSessionId(ui.active.id)).then(() => nextTick(() => pmScrollToLatest()));
  },
);

/** Diff stats for the active task. */
const taskDiffStats = computed(() => {
  return ui.active ? repo.diffStatsFor(ui.active.id) : undefined;
});

/**
 * A diff this size is almost never the task's own change — it's main having
 * drifted out from under the branch since it was cut. Thresholds are
 * deliberately generous (most real task diffs are well under this) so the
 * warning only fires on genuine divergence.
 */
const diffLooksLikeDrift = computed(() => {
  const s = taskDiffStats.value;
  if (!s) return false;
  return s.filesChanged > 50 || s.additions + s.deletions > 2000;
});

const syncBusy = ref(false);
async function syncWithMain(): Promise<void> {
  if (!ui.active || syncBusy.value) return;
  syncBusy.value = true;
  try {
    await repo.syncTaskBranch(ui.active.id);
  } catch (err) {
    repo.onError(err);
  } finally {
    syncBusy.value = false;
  }
}

/** Load diff stats when task changes or status changes. */
watch(
  () => [ui.active?.id, ui.active?.status, ui.active?.branch],
  () => {
    if (!ui.active) return;
    void repo.loadDiffStats(ui.active.id);
  },
  { immediate: true },
);

/** Historical usage totals for the open task (time/tokens/cost + role breakdown, 0230). */
const taskUsage = computed(() => (ui.active ? repo.taskUsageFor(ui.active.id) : undefined));

/** Whether the "agent / model" column shows the model name under the agent, for every session row (collapsed by default). Clicking any cell in the column toggles all rows together. */
const sessionAgentsExpanded = ref(false);

function toggleSessionAgentExpand(): void {
  sessionAgentsExpanded.value = !sessionAgentsExpanded.value;
}

/** Load the task's durable usage totals when the drawer opens or the task changes. */
watch(
  () => ui.active?.id,
  () => {
    if (!ui.active) return;
    void repo.loadTaskUsage(ui.active.id);
  },
  { immediate: true },
);

/** Full diff patch for the active task. */
const taskDiff = computed(() => {
  return ui.active ? repo.diffFor(ui.active.id) : undefined;
});

/** Load the full diff when the Changes tab opens. */
watch(
  () => [ui.active?.id, ui.activeTab],
  () => {
    if (!ui.active || ui.activeTab !== "changes") return;
    void repo.loadDiff(ui.active.id);
  },
);

/** Parse the unified diff into per-file sections with stats. */
interface DiffFile {
  filename: string;
  lines: string[];
  added: number;
  removed: number;
  type: "added" | "deleted" | "modified";
}

const diffFiles = computed<DiffFile[]>(() => {
  if (!taskDiff.value || !taskDiff.value.patch) return [];
  const sections = taskDiff.value.patch.split(/^diff --git /m);
  const files: DiffFile[] = [];
  for (const section of sections) {
    if (!section.trim()) continue;
    const lines = section.split("\n");
    const diffLines = ["diff --git " + lines[0], ...lines.slice(1)];
    const plusLine = diffLines.find((l) => l.startsWith("+++ "));
    const minusLine = diffLines.find((l) => l.startsWith("--- "));
    const isAdd = diffLines.some((l) => l.startsWith("--- /dev/null"));
    const isDel = diffLines.some((l) => l.startsWith("+++ /dev/null"));
    const plusName = plusLine ? plusLine.slice(6) : "";
    const minusName = minusLine ? minusLine.slice(6) : "";
    const filename = isDel ? minusName : plusName;
    if (!filename || filename === "/dev/null") continue;
    let added = 0;
    let removed = 0;
    for (const l of diffLines) {
      if (l.startsWith("+") && !l.startsWith("+++ ")) added++;
      else if (l.startsWith("-") && !l.startsWith("--- ")) removed++;
    }
    files.push({
      filename,
      lines: diffLines,
      added,
      removed,
      type: isAdd ? "added" : isDel ? "deleted" : "modified",
    });
  }
  return files;
});

/** File IDs that are currently collapsed (all expanded by default). */
const collapsedFiles = reactive(new Set<string>());

function toggleFileCollapse(fileId: string): void {
  if (collapsedFiles.has(fileId)) collapsedFiles.delete(fileId);
  else collapsedFiles.add(fileId);
}

function scrollToDiffFile(fileId: string): void {
  const el = document.getElementById(fileId);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Reset collapsed state when switching tasks or diffs. */
watch(
  () => taskDiff.value,
  () => { collapsedFiles.clear(); },
);

/** Classify a single diff line for syntax highlighting. */
function diffLineClass(line: string): string {
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-rem";
  if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) return "diff-header";
  return "diff-ctx";
}

async function sendTurn(): Promise<void> {
  if (!ui.active) return;
  const text = draftMsg.value.trim();
  if (!text || agentBusy.value) return;
  // Optimistically render the human message so it appears instantly, in the
  // correct chronological position, without waiting for the server round-trip.
  const prev = repo.outputs[ui.active.id] ?? [];
  repo.outputs[ui.active.id] = [...prev, { type: "human", text }];
  draftMsg.value = "";
  stick.value = true;
  nextTick(() => scrollToBottom());
  ui.saving = true;
  try {
    await repo.sendMessage(ui.active.id, text);
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

// ---- per-task agent override ----

/** Enabled agents from the Agents page, used for the agent select. */
const enabledAgents = computed(() => (config.agents ?? []).filter((a) => a.enabled));

/** CLI options from agentsMeta. */
const cliOptions = computed(() => config.agentsMeta.clis ?? []);
/**
 * Models offered for the CLI currently selected in each picker — not a flat
 * list. Uses the same `config.modelsFor` the Agents page uses, so a given CLI
 * offers identical options in both places (e.g. claude code offers its model
 * aliases, never another CLI's provider/model ids).
 */
const modelOptions = computed(() =>
  config.modelsFor(overrideDraft.cli, overrideDraft.model || undefined),
);
const freeformModelOptions = computed(() =>
  config.modelsFor(freeformOverride.cli, freeformOverride.model || undefined),
);

/** The base agent for the current task (engineer by default, or the configured role). */
const baseAgent = computed(() => {
  const list = config.agents?.length ? config.agents : [];
  return list.find((a) => a.enabled && a.name === "engineer") ?? null;
});

/** Draft overrides for the agent tab. These are the values the user is editing
 *  but haven't saved yet. They are initialized from the task's current overrides
 *  (or the base agent's defaults when none are set). */
const overrideDraft = reactive({
  agent: "",
  cli: "",
  model: "",
});

/** Snapshot of the last-saved override values, used to detect changes. */
const overrideSaved = reactive({
  agent: "",
  cli: "",
  model: "",
});

/** Same re-sync-vs-user-edit hazard as `pmCliResetSuppressed`, for the Engineer tab. */
let agentCliResetSuppressed = false;

/** Initialize the override draft from the current task. */
function initOverrideDraft(t: Task | null): void {
  const base = baseAgent.value;
  agentCliResetSuppressed = true;
  overrideDraft.agent = t?.agentOverride || base?.name || "";
  overrideDraft.cli = t?.cliOverride || base?.cli || "";
  overrideDraft.model = t?.modelOverride || base?.model || "";
  overrideSaved.agent = overrideDraft.agent;
  overrideSaved.cli = overrideDraft.cli;
  overrideSaved.model = overrideDraft.model;
  nextTick(() => {
    agentCliResetSuppressed = false;
  });
}

/** True when the override draft differs from the saved values. */
const overrideDirty = computed(
  () =>
    overrideDraft.agent !== overrideSaved.agent ||
    overrideDraft.cli !== overrideSaved.cli ||
    overrideDraft.model !== overrideSaved.model,
);

watch(
  () => ui.active,
  (t) => { if (t && !overrideDirty.value) initOverrideDraft(t); },
  { immediate: true },
);

/** Debounced auto-save of the agent override draft (no explicit Save button). */
let agentOverrideAutoSaveTimer: number | undefined;

function scheduleAgentOverrideSave(): void {
  const taskId = ui.active?.id;
  if (!taskId) return;
  if (agentOverrideAutoSaveTimer !== undefined) {
    window.clearTimeout(agentOverrideAutoSaveTimer);
  }
  agentOverrideAutoSaveTimer = window.setTimeout(async () => {
    agentOverrideAutoSaveTimer = undefined;
    if (ui.active?.id !== taskId || !overrideDirty.value) return;
    const base = baseAgent.value;
    // Snapshot the values being sent so the saved-baseline sync never claims a
    // newer in-flight draft change was persisted (dirty stays true → re-arms).
    const sent = {
      agent: overrideDraft.agent,
      cli: overrideDraft.cli,
      model: overrideDraft.model,
    };
    // Send values that differ from the base agent; send null to clear overrides
    // that match the base (so the server knows to remove them from frontmatter).
    const agentVal = sent.agent !== (base?.name ?? "") ? sent.agent : null;
    const cliVal = sent.cli !== (base?.cli ?? "") ? sent.cli : null;
    const modelVal = sent.model !== (base?.model ?? "") ? sent.model : null;
    try {
      await repo.patchTask(taskId, {
        agentOverride: agentVal,
        cliOverride: cliVal,
        modelOverride: modelVal,
      });
      overrideSaved.agent = sent.agent;
      overrideSaved.cli = sent.cli;
      overrideSaved.model = sent.model;
    } catch (err) {
      repo.onError(err);
    }
  }, 500);
}

/**
 * When the CLI changes, reset the model to the new CLI's default.
 * This must happen synchronously during the same microtask as the v-model
 * update so the auto-save (which fires via a separate watch) captures the
 * correct model value — no flicker, no stale-model-then-fix cycle.
 */
watch(
  () => overrideDraft.cli,
  (newCli, oldCli) => {
    if (agentCliResetSuppressed) return;
    if (!newCli || newCli === oldCli) return;
    const opts = config.modelsFor(newCli);
    overrideDraft.model = opts.length > 0 ? opts[0].value : "default";
  },
);

watch(
  () => [overrideDraft.agent, overrideDraft.cli, overrideDraft.model],
  () => {
    scheduleAgentOverrideSave();
  },
);

onUnmounted(() => {
  if (agentOverrideAutoSaveTimer !== undefined) {
    window.clearTimeout(agentOverrideAutoSaveTimer);
  }
  if (pmOverrideAutoSaveTimer !== undefined) {
    window.clearTimeout(pmOverrideAutoSaveTimer);
  }
});

// ---- freeform agent override (one-shot) ----

/** The PM agent's base config, for the freeform readout. */
const freeformPmBase = computed(() => {
  const list = config.agents?.length ? config.agents : [];
  return list.find((a) => a.enabled && a.name === "pm") ?? null;
});

/** One-shot override state for the freeform pane. */
const freeformOverride = reactive({
  agent: "",
  cli: "",
  model: "",
});

/** Initialize freeform overrides from the PM agent defaults. */
function initFreeformOverrides(): void {
  const base = freeformPmBase.value;
  freeformOverride.agent = base?.name || "";
  freeformOverride.cli = base?.cli || "";
  freeformOverride.model = base?.model || "";
}

/** Whether the freeform overrides differ from the PM agent defaults. */
const freeformIsCustom = computed(() => {
  const base = freeformPmBase.value;
  if (!base) return false;
  return (
    freeformOverride.agent !== base.name ||
    freeformOverride.cli !== base.cli ||
    freeformOverride.model !== base.model
  );
});

/** Same CLI→model reset for the freeform pane. */
watch(
  () => freeformOverride.cli,
  (newCli, oldCli) => {
    if (!newCli || newCli === oldCli) return;
    const opts = config.modelsFor(newCli);
    freeformOverride.model = opts.length > 0 ? opts[0].value : "default";
  },
);

// Re-fit each compose textarea when its value changes programmatically (the
// post-send reset, a restored draft) — those paths emit no `input` event, and
// `immediate` covers a value already populated when the field first mounts.
// Live typing is handled by each field's `@input` binding.
watch(() => pmDraft.value, () => nextTick(adjustPmHeight), { immediate: true });
watch(() => reviewDraftMsg.value, () => nextTick(adjustReviewHeight), { immediate: true });
watch(() => draftMsg.value, () => nextTick(adjustDraftMsgHeight), { immediate: true });

</script>

<template>
  <Dialog :open="open" @update:open="setOpen">
    <DialogOverlay />
    <DialogContent
      :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
      @open-auto-focus="onOpenAutoFocus"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>

      <!-- NEW TASK -->
      <template v-if="ui.isNew">
        <div class="drawer-head">
          <DialogTitle>New task</DialogTitle>
          <DialogDescription class="sr-only">Create a new task</DialogDescription>
          <DialogClose class="close-x">
            <X class="size-[15px]" />
          </DialogClose>
        </div>
        <div class="drawer-tabs">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: newMode === 'freeform' }"
            @click="newMode = 'freeform'"
          >
            Freeform
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: newMode === 'manual' }"
            @click="newMode = 'manual'"
          >
            Manual
          </button>
        </div>
        <div class="drawer-body">
          <div class="field" style="margin-top: 4px">
            <label>Screenshots</label>
            <div
              class="shot-dropzone"
              :class="{ over: dragDepth > 0 }"
              role="button"
              tabindex="0"
              @click="shotInput?.click()"
              @keydown.enter="shotInput?.click()"
            >
              <ImagePlus class="size-4" />
              <span>{{
                ui.pendingScreenshots.length
                  ? `Add more — ${ui.pendingScreenshots.length} screenshot${ui.pendingScreenshots.length === 1 ? "" : "s"} added`
                  : "Click to add screenshots, or drop them anywhere on this panel"
              }}</span>
              <input
                ref="shotInput"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
                multiple
                class="shot-input"
                @change="onShotFiles"
                @click.stop
              />
            </div>
            <div v-if="ui.pendingScreenshots.length" class="shot-grid">
              <div v-for="(s, i) in ui.pendingScreenshots" :key="s.name + i" class="shot-thumb">
                <img :src="s.dataUrl" :alt="s.name" />
                <button
                  type="button"
                  class="shot-remove"
                  :aria-label="`Remove ${s.name}`"
                  title="Remove screenshot"
                  @click.stop="ui.removeScreenshot(i)"
                >
                  <X class="size-3.5" />
                </button>
                <span class="shot-name" :title="s.name">{{ s.name }}</span>
              </div>
            </div>
            <p class="shot-hint" v-else>
              PNG, JPEG, GIF, WebP, AVIF or BMP — attached to the new task when you create it.
            </p>
          </div>
          <template v-if="newMode === 'freeform'">
            <div v-if="freeformSubmitted" class="ff-done">
              <div class="ff-done-head">
                <ActivityIndicator />
                <span>Creating your task</span>
              </div>
              <p class="ff-done-copy">
                This may take a few minutes. Your task
                <template v-if="submittedTask"><span class="mono">#{{ submittedTask.id }}</span> —</template>
                is being created in the background and will be updated automatically when it's
                ready. You can keep working, or start another task while you wait — nothing is lost.
              </p>
              <div class="btn-row" style="margin-top: 18px">
                <Button variant="default" @click="createAnotherTask">Create another task</Button>
                <Button variant="outline" @click="doneFreeform">Done</Button>
              </div>
              <div v-if="freeformLines.length" class="ff-stream" style="margin-top: 16px">
                <div class="ff-stream-head">
                  <ActivityIndicator />
                  PM agent
                </div>
                <div class="ff-stream-log" ref="ffLogEl">
                  <div
                    v-for="(line, i) in freeformLines"
                    :key="i"
                    class="ff-stream-line"
                    :class="line.s === 'err' ? 'err' : ''"
                  >
                    {{ line.d }}
                  </div>
                </div>
              </div>
            </div>
            <template v-else>
            <div class="field">
              <div class="field-header">
                <label for="nt-freeform">Describe the task</label>
              </div>
              <div class="agent-input-wrapper">
                <textarea
                    id="nt-freeform"
                    ref="freeformTextarea"
                    v-model="freeformText"
                    class="ff-textarea"
                    rows="10"
                    placeholder="Type the task however it comes out — like explaining it to a person. The PM agent writes the structured task file."
                ></textarea>
                <VoiceDictate @transcribed="onFreeformTranscribed" style="margin-bottom:14px" />
              </div>
            </div>
            <div class="ff-agent-bar">
              <div class="agent-pick-grid">
                <div class="agent-field" style="grid-column: 1 / -1">
                  <AgentModelControl
                    :cli-options="cliOptions"
                    :model-options="freeformModelOptions"
                    v-model:cli="freeformOverride.cli"
                    v-model:model="freeformOverride.model"
                    :disabled="freeformRunning"
                  />
                </div>
              </div>
            </div>
            <div v-if="!pmAgentReady" class="ff-notice">
              No PM agent is configured.
              <router-link :to="{ name: 'agents' }" @click="ui.close()">
                Set one up on the Agents page
              </router-link>
              — until then your explanation is saved as a draft task.
            </div>
            <div v-if="draftSaved" class="ff-error">
              The PM agent failed:
              <span class="mono">{{ freeformError }}</span>
              — your explanation was saved as draft
              <span class="mono">#{{ draftSaved.id }}</span> so it isn't lost.
              <Button variant="outline" size="sm" @click="openDraft">Open draft</Button>
            </div>
            <div v-else-if="freeformError" class="ff-error">{{ freeformError }}</div>
            <div class="btn-row" style="margin-top: 20px">
              <Button variant="outline" @click="ui.close()">Cancel</Button>
              <Button
                variant="outline"
                @click="createDraft"
                :disabled="ui.saving || !freeformText.trim()"
              >
                Create draft
              </Button>
              <Button
                variant="default"
                @click="createFreeform"
                :disabled="ui.saving || !freeformText.trim()"
              >
                <ActivityIndicator v-if="freeformRunning" />
                {{ freeformRunning ? "Asking the PM agent…" : "Create task" }}
              </Button>
            </div>
            <div v-if="freeformLines.length" class="ff-stream">
              <div class="ff-stream-head">
                <ActivityIndicator />
                PM agent
              </div>
              <div class="ff-stream-log" ref="ffLogEl">
                <div
                  v-for="(line, i) in freeformLines"
                  :key="i"
                  class="ff-stream-line"
                  :class="line.s === 'err' ? 'err' : ''"
                >
                  {{ line.d }}
                </div>
              </div>
            </div>
            </template>
          </template>
          <template v-else>
            <div class="field">
              <label for="nt-title">Title</label>
              <Input
                id="nt-title"
                v-model="ui.nt.title"
                placeholder="Add company dashboard"
                @keyup.enter="createTask"
              />
            </div>
            <div class="field-row">
              <div class="field">
                <label>Type</label>
                <Select v-model="ui.nt.type">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectViewport
                      class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                    >
                      <SelectItem v-for="t in taskTypes" :key="t" :value="t">{{ t }}</SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </Select>
              </div>
              <div class="field">
                <label>Priority</label>
                <Select v-model="ui.nt.priority">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectViewport
                      class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                    >
                      <SelectItem v-for="p in priorities" :key="p" :value="p">{{ p }}</SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label>Area</label>
                <Input v-model="ui.nt.area" placeholder="web" />
              </div>
              <div class="field">
                <label>Assign to</label>
                <Select
                  :model-value="ui.nt.assignedTo === '' ? 'unassigned' : ui.nt.assignedTo"
                  @update:model-value="
                    (v) => (ui.nt.assignedTo = v === 'unassigned' ? '' : (v ?? ''))
                  "
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectViewport
                      class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                    >
                      <SelectItem value="unassigned">unassigned</SelectItem>
                      <SelectItem value="ai">AI agent</SelectItem>
                      <SelectItem value="human">human</SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="btn-row" style="margin-top: 20px">
              <Button variant="outline" @click="ui.close()">Cancel</Button>
              <Button variant="default" @click="createTask" :disabled="ui.saving || !ui.nt.title">
                Create
              </Button>
            </div>
          </template>
        </div>
      </template>

      <!-- TASK DETAIL -->
      <template v-else-if="ui.active">
        <div class="drawer-head">
          <div style="flex: 1">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 7px">
              <span class="tc-id mono">{{ ui.active.path }}</span>
              <span class="cdot" :style="{ background: statusColor(ui.active.status) }"></span>
              <span
                :style="{ color: statusColor(ui.active.status), fontSize: '11px', fontWeight: 600 }"
              >
                {{ ui.active.status }}
              </span>
              <span
                v-if="ui.active.needsInput"
                class="tc-waiting"
                :title="needsInputReasonText(ui.active.needsInputReason)"
              >needs input</span>
              <span
                v-if="reviewSubstate"
                class="rs-chip"
                :class="reviewSubstate.cls"
                :title="reviewSubstate.label"
              >{{ reviewSubstate.label }}</span>
              <span class="tc-prio" :class="ui.active.priority" style="margin-left: auto">
                {{ ui.active.priority }}
              </span>
            </div>
            <DialogTitle>{{ ui.active.title }}</DialogTitle>
            <DialogDescription class="sr-only">{{
              ui.active.body || "Task details"
            }}</DialogDescription>
          </div>
          <DialogClose class="close-x">
            <X class="size-[15px]" />
          </DialogClose>
        </div>
        <div class="drawer-quickbar">
          <div class="quickbar-row">
            <Select :model-value="ui.active.status" @update:model-value="(v) => setStatus(v ?? '')">
              <SelectTrigger :disabled="ui.saving">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem v-for="col in selectableStatuses" :key="col.id" :value="col.id">
                    <span class="cdot" :style="{ background: col.color }"></span>{{ col.label }}
                  </SelectItem>
                </SelectViewport>
              </SelectContent>
            </Select>
            <span
              v-if="taskRounds.dev > 0"
              class="rounds-badge"
              title="Dev and review passes for this task"
            >
              D{{ taskRounds.dev }} · R{{ taskRounds.review }}
            </span>
            <Button
              v-if="ui.active.status === 'draft'"
              variant="outline"
              :disabled="ui.saving"
              @click="setStatus('inbox')"
            >
              <ArrowRight class="size-3.5" />
              Move to inbox
            </Button>
            <Button
              v-if="ui.active.status === 'inbox'"
              variant="outline"
              :disabled="ui.saving"
              @click="setStatus('ready')"
            >
              <ArrowRight class="size-3.5" />
              Move to ready
            </Button>
            <Button
              v-if="(ui.active.status === 'ready' || ui.active.status === 'active') && (ui.active.status === 'ready' || !repo.isRunning(ui.active.id))"
              variant="accent"
              :disabled="ui.saving"
              @click="startWork"
            >
              <Play v-if="!startingWork" class="size-3.5" />
              <ActivityIndicator v-else />
              {{ startingWork ? "Starting work…" : ui.active.status === "active" ? "Restart work" : "Start work" }}
            </Button>
            <Button
              v-if="ui.active.status === 'active' && !repo.isRunning(ui.active.id)"
              variant="destructive"
              :disabled="ui.saving"
              title="Run the normal commit-and-check guard, then send this paused task to review"
              @click="setStatus('review')"
            >
              <Send class="size-3.5" />
              Review
            </Button>
            <Button
              v-if="ui.active.status === 'active' && repo.isRunning(ui.active.id)"
              variant="outline"
              :disabled="ui.saving"
              @click="pauseWork"
            >
              <Pause class="size-3.5" />
              Pause work
            </Button>
            <Button
              v-if="ui.active.status === 'active' || ui.active.status === 'review'"
              variant="outline"
              :disabled="ui.saving"
              title="Send this task back to ready — stops the agent/review, keeps the worktree"
              @click="abandonWork"
            >
              <Square class="size-3.5" />
              Stop work
            </Button>
            <Button
              v-if="ui.active.status === 'done'"
              variant="outline"
              :disabled="ui.saving"
              title="Send this task back to ready with a fresh branch on the next Start work"
              @click="reopenTask"
            >
              <RotateCcw class="size-3.5" />
              Reopen
            </Button>
            <Button
              v-if="ui.active.status === 'review'"
              variant="default"
              :disabled="ui.saving || review?.running || repo.isRunning(ui.active.id) || inPipeline"
              :title="inPipeline ? 'Already in the integration pipeline — merging, building, and checking. See the pipeline bar for live progress.' : review?.running ? 'Waiting for automatic review to finish.' : repo.isRunning(ui.active.id) ? 'The engineer is still coding; Move to done becomes available when the turn ends.' : undefined"
              @click="moveToDone"
            >
              <CheckCheck v-if="!doingDone && !inPipeline" class="size-3.5" />
              <ActivityIndicator v-else />
              {{ inPipeline ? `Integrating…${pipelineStage ? ` (${pipelineStage})` : ""}` : doingDone ? doneProgress : "Move to done" }}
            </Button>
          </div>
          <span v-if="review?.running" class="drawer-run reviewing" role="status">
            <ActivityIndicator variant="reviewing" label="Reviewing…" />
            Reviewer is reviewing this task…
          </span>
          <span v-if="ui.active.status === 'active' && repo.isRunning(ui.active.id)" class="drawer-run">
            <ActivityIndicator /> agent coding
          </span>
          <DoneErrorCard
            v-if="ui.active.status === 'review' && repo.doneErrorFor(ui.active.id)"
            class="drawer-done-error"
            mode="panel"
            :message="repo.doneErrorFor(ui.active.id)!.message"
            :step="repo.doneErrorFor(ui.active.id)!.step"
            :conflicts="repo.doneErrorFor(ui.active.id)!.conflicts"
            :detail="repo.doneErrorFor(ui.active.id)!.detail"
            :hint="repo.doneErrorFor(ui.active.id)!.hint"
            :task-id="ui.active.id"
            :task-title="ui.active.title"
          />
          <div
            v-if="(ui.active.status === 'active' || ui.active.status === 'review') && ui.active.preview"
            class="quickbar-row"
          >
            <!-- Previews are auto-launched when a task lands in review (#0198);
                 the live URL simply appears when ready. A manual "Start preview"
                 fallback (below) covers review tasks where that didn't happen. -->
            <div class="preview-live">
              <span class="preview-dot"></span>
              <a :href="ui.active.preview.url" target="_blank" rel="noopener" class="preview-url">
                <ExternalLink class="size-3.5" />
                {{ ui.active.preview.url }}
              </a>
            </div>
            <Button
              variant="outline"
              :disabled="ui.saving || previewBusy"
              @click="stopPreview"
            >
              <Square class="size-3.5" />
              Stop preview
            </Button>
          </div>
          <p
            v-if="(ui.active.status === 'active' || ui.active.status === 'review') && !ui.active.preview && !ui.active.branch"
            class="preview-hint"
          >
            No branch yet — start work to create the worktree this previews.
          </p>
          <p
            v-else-if="(ui.active.status === 'active' || ui.active.status === 'review') && !ui.active.preview && !ui.active.git?.worktreeExists"
            class="preview-hint"
          >
            No git worktree is checked out for
            <span class="mono">{{ ui.active.branch }}</span>.
          </p>
          <div
            v-else-if="ui.active.status === 'review' && !ui.active.preview"
            class="quickbar-row"
          >
            <p class="preview-hint">
              No preview running — the agent didn't request one before handoff.
            </p>
            <Button
              variant="outline"
              :disabled="ui.saving || previewBusy"
              @click="startPreview"
            >
              <Play class="size-3.5" />
              Start preview
            </Button>
          </div>
        </div>
        <div class="drawer-tabs">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: ui.activeTab === 'details' }"
            @click="ui.activeTab = 'details'"
          >
            <FileText class="tab-icon" />
            Task
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: ui.activeTab === 'pm' }"
            @click="ui.activeTab = 'pm'"
          >
            <MessageSquare class="tab-icon" />
            PM
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: ui.activeTab === 'agent' }"
            @click="ui.activeTab = 'agent'"
          >
            <Bot class="tab-icon" />
            Dev
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: ui.activeTab === 'review' }"
            @click="ui.activeTab = 'review'"
          >
            <ShieldCheck class="tab-icon" />
            Review
            <ActivityIndicator
              v-if="ui.activeTab !== 'review' && review?.running"
              variant="reviewing"
              label="Reviewing…"
            />
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: ui.activeTab === 'changes' }"
            @click="ui.activeTab = 'changes'"
          >
            <Diff class="tab-icon" />
            Changes
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: ui.activeTab === 'tokens' }"
            @click="ui.activeTab = 'tokens'"
          >
            <Coins class="tab-icon" />
            Tokens
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: ui.activeTab === 'debug' }"
            @click="ui.activeTab = 'debug'"
          >
            <Bug class="tab-icon" />
            Debug
          </button>
        </div>
        <div v-if="ui.activeTab === 'details'" class="drawer-body" :class="{ 'transition-success': transitioned }">
          <template v-if="!locked">
            <div class="field">
              <label for="et-title">Title</label>
              <Input id="et-title" v-model="draft.title" placeholder="Task title" />
            </div>
          </template>
          <template v-else>
            <div class="field">
              <label>Title</label>
              <div class="ro-value">{{ ui.active.title }}</div>
            </div>
          </template>

          <div class="field-row" style="margin-top: 16px">
            <div class="field">
              <label>Type</label>
              <Select v-model="draft.type">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport
                    class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                  >
                    <SelectItem v-for="t in taskTypes" :key="t" :value="t">{{ t }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div class="field">
              <label>Priority</label>
              <Select v-model="draft.priority">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport
                    class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                  >
                    <SelectItem v-for="p in priorities" :key="p" :value="p">{{ p }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="et-area">Area</label>
              <Input id="et-area" v-model="draft.area" placeholder="web" />
            </div>
            <div class="field">
              <label for="et-assignee">Assigned to</label>
              <Input id="et-assignee" v-model="draft.assignedTo" list="assignee-options" placeholder="unassigned" />
              <datalist id="assignee-options">
                <option value="ai"></option>
                <option value="human"></option>
              </datalist>
            </div>
          </div>
          <div class="md-h spec-head" style="margin-top: 18px">
            <button
              type="button"
              class="spec-toggle"
              :aria-expanded="specExpanded"
              @click="specExpanded = !specExpanded"
            >
              <svg
                class="spec-chev"
                :class="{ collapsed: !specExpanded }"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="m6 9 6 6 6-6"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              spec
            </button>
          </div>
          <div v-if="specExpanded">
            <div
              class="md-card"
              role="button"
              tabindex="0"
              @click="openSpecModal"
              @keydown.enter="openSpecModal"
              @keydown.space.prevent="openSpecModal"
            >
              <div v-if="specHtml" class="md-rendered" v-html="specHtml"></div>
              <div v-else class="md-card-body">No spec yet — click to add.</div>
            </div>
          </div>
          <div class="md-h" style="margin-top: 4px">meta</div>
          <div class="meta-grid">
            <div class="meta-cell">
              <div class="k">id</div>
              <div class="v mono" style="font-size: 11px">{{ ui.active.id }}</div>
            </div>
            <div class="meta-cell">
              <div class="k">created_by</div>
              <div class="v">{{ ui.active.createdBy || "—" }}</div>
            </div>
            <div class="meta-cell">
              <div class="k">created</div>
              <div class="v mono" style="font-size: 11px">
                {{ repo.fmtDate(ui.active.created_at) }}
              </div>
            </div>
            <div class="meta-cell">
              <div class="k">updated</div>
              <div class="v mono" style="font-size: 11px">
                {{ repo.fmtDate(ui.active.updated_at) }}
              </div>
            </div>
            <div class="meta-cell">
              <div class="k">branch in git</div>
              <div class="v mono" style="color: var(--cyan); font-size: 11px">
                {{ ui.active.git?.branchExists ? "exists" : "no local branch" }}
              </div>
            </div>
            <div class="meta-cell">
              <div class="k">last commit</div>
              <div class="v mono" style="font-size: 11px">
                {{ ui.active.git?.lastCommit ?? "—" }}
              </div>
            </div>
          </div>
          <div class="delete-zone">
            <template v-if="!confirmDelete">
              <Button
                variant="destructive"
                size="sm"
                :disabled="ui.saving"
                @click="confirmDelete = true"
              >
                Delete task
              </Button>
              <Button
                v-if="!ui.active?.hotfix && ui.active?.status === 'ready'"
                variant="outline"
                size="sm"
                :disabled="ui.saving"
                @click="confirmHotfix = true"
              >
                Hotfix
              </Button>
            </template>
            <template v-else>
              <p class="delete-prompt">
                Delete task #{{ ui.active.id }}? The file will be removed. Committed changes are
                recoverable from git; uncommitted or never-committed work is lost.
              </p>
              <div class="delete-actions">
                <Button variant="outline" size="sm" :disabled="ui.saving" @click="confirmDelete = false">
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" :disabled="ui.saving" @click="deleteTask">
                  Delete
                </Button>
              </div>
            </template>
          </div>
        </div>
        <div v-else-if="ui.activeTab === 'agent'" class="drawer-body drawer-session-body" :class="{ 'transition-success': transitioned }">
          <div v-if="ui.active" class="agent-override-bar">
            <div class="agent-pick-grid">
              <div class="agent-field" style="grid-column: 1 / -1">
                <AgentModelControl
                  :cli-options="cliOptions"
                  :model-options="modelOptions"
                  v-model:cli="overrideDraft.cli"
                  v-model:model="overrideDraft.model"
                  :disabled="ui.saving"
                />
              </div>
              <div class="agent-field">
                  <div v-if="overrideDirty" class="agent-override-actions" style='padding-top:20px'>
                    <span class="agent-save-hint">saving…</span>
                  </div>
              </div>
            </div>
          </div>
          <div v-if="sessionStats?.stalled" class="agent-stalled">
            <span class="agent-stalled-dot"></span>
            <div>
              <div class="agent-stalled-title">quiet — may be stalled</div>
              <div class="agent-stalled-sub">
                No new output for a while. This isn't proof it's stuck — a slow step looks the
                same from here — but if it stays quiet, check in.
              </div>
            </div>
          </div>
          <div v-if="ui.active && ui.active.needsInput" class="agent-waiting">
            <span class="agent-waiting-dot"></span>
            <div>
              <div class="agent-waiting-title">waiting for you</div>
              <div class="agent-waiting-sub">{{ needsInputReasonText(ui.active.needsInputReason) }}</div>
            </div>
          </div>
          <div class="agent-log-wrap">
            <div class="agent-log" ref="logEl" @scroll="onLogScroll">
              <template v-if="displayEntries.length === 0">
                <div class="agent-empty">
                  No agent session yet.
                  <br />
                  Start work to launch the coding agent; its output streams here.
                </div>
              </template>
              <div v-for="entry in displayEntries" :key="entry.key" class="agent-entry">
                <!-- legacy plain line (claude / qwen / codex / pre-JSON sessions) -->
                <div v-if="entry.kind === 'line'" class="agent-line" :class="entry.s">
                  <span class="agent-pfx" :class="entry.s">{{
                    entry.s === "err" ? "✕" : entry.s === "sys" ? "·" : "›"
                  }}</span>
                  <span class="agent-d">{{ entry.d }}</span>
                </div>
                <!-- system / notice line -->
                <div v-else-if="entry.kind === 'sys'" class="agent-line sys">
                  <span class="agent-pfx">·</span>
                  <span class="agent-d">{{ entry.d }}</span>
                </div>
                <!-- human / user message -->
                <div v-else-if="entry.kind === 'human'" class="agent-human">
                  <div class="agent-human-bubble">{{ entry.text }}</div>
                </div>
                <!-- assistant text block -->
                <div v-else-if="entry.kind === 'text'" class="agent-text">{{ entry.text }}</div>
                <!-- step boundary marker -->
                <div
                  v-else-if="entry.kind === 'step'"
                  class="agent-step"
                  :class="{ fin: entry.stepKind === 'finish' }"
                >
                  <span class="agent-step-dot"></span>
                  <span>{{ entry.stepReason === "stop" ? "done" : "continue" }}</span>
                  <span v-if="entry.stepReason !== 'stop' && entry.stepAt" class="agent-step-time">{{
                    repo.fmtDate(entry.stepAt)
                  }}</span>
                  <span v-if="entry.stepReason" class="agent-step-reason">{{ entry.stepReason }}</span>
                </div>
                <!-- collapsible tool card -->
                <details v-else class="agent-tool" :class="entry.toolState">
                  <summary>
                    <span class="agent-tool-icon">{{ entry.toolState === "error" ? "✕" : "›" }}</span>
                    <span class="agent-tool-name">{{ entry.toolName }}</span>
                    <span v-if="entry.toolInput" class="agent-tool-cmd" :title="entry.toolInput">{{
                      entry.toolInput
                    }}</span>
                    <span v-if="entry.toolState" class="agent-tool-state" :class="entry.toolState">{{
                      entry.toolState
                    }}</span>
                  </summary>
                  <div class="agent-tool-out">{{ entry.toolOutput || entry.toolInput }}</div>
                </details>
              </div>
            </div>
            <button
              v-if="!stick"
              type="button"
              class="agent-jump"
              @click="scrollToBottom(true)"
              aria-label="Jump to latest message"
            >
              <ArrowDown class="size-3.5" />
              Latest
            </button>
          </div>
          <div class="agent-input-row">
            <div class="agent-reply-input-wrapper">
              <textarea
                ref="draftMsgTextarea"
                v-model="draftMsg"
                class="agent-input"
                rows="1"
                placeholder="Send a follow-up to the task's agent session…"
                :disabled="agentBusy || ui.saving"
                @keydown.enter.exact.prevent="sendTurn"
                @input="adjustDraftMsgHeight"
              ></textarea>
              <VoiceDictate
                :disabled="agentBusy || ui.saving"
                @transcribed="onDraftMsgTranscribed"
              />
            </div>
            <Button
              variant="accent"
              size="sm"
              :disabled="agentBusy || ui.saving || !draftMsg.trim()"
              @click="sendTurn"
            >
              <Send class="size-3.5" />
              Send
            </Button>
          </div>
          <div v-if="agentBusy" class="agent-hint">
            <ActivityIndicator /> agent is working — wait for this turn to finish
          </div>
          <div
            v-else-if="
              ui.active && ui.active.status !== 'active' && ui.active.status !== 'review'
            "
            class="agent-hint"
          >
            Task is {{ ui.active.status }} — start work to run an agent turn.
          </div>
        </div>
        <div v-else-if="ui.activeTab === 'review'" class="drawer-body drawer-session-body">
          <div v-if="ui.active" class="agent-override-bar">
            <div class="agent-pick-grid">
              <div class="agent-field" style="grid-column: 1 / -1">
                <AgentModelControl
                  :cli-options="cliOptions"
                  :model-options="reviewModelOptions"
                  v-model:cli="reviewOverrideDraft.cli"
                  v-model:model="reviewOverrideDraft.model"
                  :disabled="ui.saving"
                />
              </div>
               <div class="agent-field">
                  <div v-if="reviewOverrideDirty" class="agent-override-actions" style="padding-top:20px">
                    <span class="agent-save-hint">saving…</span>
                  </div>
              </div>
            </div>
          </div>
          <div class="review-toolbar">
            <div v-if="review?.report" class="review-pane-tabs" role="tablist" aria-label="Reviewer content">
              <button
                type="button"
                class="review-pane-tab"
                :class="{ active: reviewPane === 'report' }"
                role="tab"
                :aria-selected="reviewPane === 'report'"
                @click="reviewPane = 'report'"
              >
                Report
              </button>
              <button
                type="button"
                class="review-pane-tab"
                :class="{ active: reviewPane === 'chat' }"
                role="tab"
                :aria-selected="reviewPane === 'chat'"
                @click="reviewPane = 'chat'"
              >
                Chat
              </button>
            </div>
            <Button
              v-if="ui.active.status === 'review'"
              variant="outline"
              size="sm"
              :disabled="ui.saving || reviewBusy || review?.running"
              :title="review?.running ? 'Waiting for the current review run to finish.' : 'Start a fresh review of the current worktree state'"
              @click="reviewAgain"
            >
              <RotateCcw v-if="!reviewBusy" class="size-3.5" />
              <ActivityIndicator v-else />
              {{ reviewBusy ? "Starting…" : "Review again" }}
            </Button>
            <Button
              v-if="ui.active.status === 'review'"
              variant="accent"
              size="sm"
              :disabled="ui.saving || sendingToEngineer || reviewBusy || review?.running || !review?.report"
              :title="!review?.report ? 'Wait for a completed review before sending this task back to the engineer.' : 'Return this task to active and resume the engineer with the reviewer findings'"
              @click="sendToEngineer"
            >
              <Send v-if="!sendingToEngineer" class="size-3.5" />
              <ActivityIndicator v-else />
              {{ sendingToEngineer ? "Sending…" : "Send engineer" }}
            </Button>
          </div>

          <section v-if="review?.report && reviewPane === 'report'" class="review-pane review-report-pane" role="tabpanel">
            <div v-if="reviewStale" class="review-stale" role="status">
              <ActivityIndicator variant="reviewing" />
              <div class="review-stale-body">
                <span class="review-stale-title">This report is stale</span>
                <span class="review-stale-sub">A new review is running and will replace it shortly.</span>
              </div>
            </div>
            <div v-if="review.report.state === 'failed'" class="review-failed">
              {{ review.report.markdown }}
            </div>
            <template v-else>
              <div
                v-if="verdict"
                class="verdict-callout"
                :class="`tone-${verdict.tone}`"
                role="status"
              >
                <span class="verdict-dot"></span>
                <span class="verdict-label">{{ verdict.label }}</span>
              </div>
              <div class="review-meta">
                <span>{{ repo.fmtDate(review.report.at) }}</span>
                <span class="mono">{{ review.report.agent }} · {{ review.report.cli }}</span>
              </div>
              <div class="md-card review-card">
                <div class="md-rendered" v-html="reviewHtml"></div>
              </div>
            </template>
            <p class="review-hint">Findings only — you decide whether this task is done.</p>
          </section>

          <section v-else class="review-pane review-chat-pane" role="tabpanel">
            <div v-if="review?.running" class="review-running" role="status">
              <ActivityIndicator variant="reviewing" label="Reviewing…" />
              Reviewer is reviewing this task…
            </div>
            <p v-else-if="review && !review.enabled" class="review-hint">
              The review agent is disabled on the Agents page, so no automatic review runs.
            </p>
            <p v-else-if="!review?.report" class="review-hint">No agent review for this task yet.</p>

            <div class="review-log-wrap">
              <div class="agent-log review-log" ref="reviewLogEl" @scroll="onReviewLogScroll">
              <template v-if="reviewEntries.length === 0">
                <div v-if="review?.running" class="review-thinking" role="status">
                  <ActivityIndicator variant="reviewing" label="Reviewing…" />
                  The reviewer is thinking…
                </div>
                <div v-else class="agent-empty">
                  The reviewer's conversation appears here once a review runs.
                  <br />
                  Start a review to see the reviewer at work, then chat below.
                </div>
              </template>
              <div v-for="entry in reviewEntries" :key="entry.key" class="agent-entry">
                <div v-if="entry.kind === 'line'" class="agent-line" :class="entry.s">
                  <span class="agent-pfx" :class="entry.s">{{
                    entry.s === "err" ? "✕" : entry.s === "sys" ? "·" : "›"
                  }}</span>
                  <span class="agent-d">{{ entry.d }}</span>
                </div>
                <div v-else-if="entry.kind === 'sys'" class="agent-line sys">
                  <span class="agent-pfx">·</span>
                  <span class="agent-d">{{ entry.d }}</span>
                </div>
                <div v-else-if="entry.kind === 'human'" class="agent-human">
                  <div class="agent-human-bubble">{{ entry.text }}</div>
                </div>
                <div v-else-if="entry.kind === 'text'" class="agent-text">{{ entry.text }}</div>
                <div
                  v-else-if="entry.kind === 'step'"
                  class="agent-step"
                  :class="{ fin: entry.stepKind === 'finish' }"
                >
                  <span class="agent-step-dot"></span>
                  <span>{{ entry.stepReason === "stop" ? "done" : "continue" }}</span>
                  <span v-if="entry.stepReason" class="agent-step-reason">{{ entry.stepReason }}</span>
                </div>
                <details v-else class="agent-tool" :class="entry.toolState">
                  <summary>
                    <span class="agent-tool-icon">{{ entry.toolState === "error" ? "✕" : "›" }}</span>
                    <span class="agent-tool-name">{{ entry.toolName }}</span>
                    <span v-if="entry.toolInput" class="agent-tool-cmd" :title="entry.toolInput">{{
                      entry.toolInput
                    }}</span>
                    <span v-if="entry.toolState" class="agent-tool-state" :class="entry.toolState">{{
                      entry.toolState
                    }}</span>
                  </summary>
                  <div class="agent-tool-out">{{ entry.toolOutput || entry.toolInput }}</div>
                </details>
              </div>
              </div>
              <button
                v-if="!reviewStick"
                type="button"
                class="agent-jump"
                @click="scrollReviewToBottom(true)"
                aria-label="Jump to latest review message"
              >
                <ArrowDown class="size-3.5" />
                Latest
              </button>
            </div>

            <div class="agent-input-row">
              <div class="agent-reply-input-wrapper">
                <textarea
                  ref="reviewDraftMsgTextarea"
                  v-model="reviewDraftMsg"
                  class="agent-input"
                  rows="1"
                  placeholder="Ask the reviewer a follow-up question…"
                  :disabled="review?.running || reviewBusy || ui.saving"
                  @keydown.enter.exact.prevent="sendReviewTurn"
                  @input="adjustReviewHeight"
                ></textarea>
                <VoiceDictate
                  :disabled="review?.running || reviewBusy || ui.saving"
                  @transcribed="onReviewDraftMsgTranscribed"
                />
              </div>
              <Button
                variant="accent"
                size="sm"
                :disabled="review?.running || reviewBusy || ui.saving || !reviewDraftMsg.trim()"
                @click="sendReviewTurn"
              >
                <Send class="size-3.5" />
                Send
              </Button>
            </div>
            <div v-if="review?.running" class="agent-hint">
              <ActivityIndicator /> reviewer is working — wait for this turn to finish
            </div>
          </section>
        </div>
        <div v-else-if="ui.activeTab === 'changes'" class="drawer-body">
          <template v-if="!ui.active">
            <p class="changes-empty">Select a task to view changes.</p>
          </template>
          <template v-else-if="!ui.active.branch">
            <p class="changes-empty">No branch yet — start work to create the worktree.</p>
          </template>
          <template v-else-if="!ui.active.git?.worktreeExists && taskDiff !== undefined && taskDiff.patch === ''">
            <p class="changes-empty">
              No saved code changes are available for this completed task.
            </p>
          </template>
          <template v-else-if="taskDiff && taskDiff.patch === ''">
            <p class="changes-empty">No code changes yet</p>
          </template>
          <template v-else>
            <section class="changes-summary" aria-label="Code changes summary">
              <div class="changes-summary-title">Code changes</div>
              <div v-if="taskDiffStats" class="diff-stats">
                <div class="diff-stat-item">
                  <span class="stat-label">Files:</span>
                  <span class="stat-value">{{ taskDiffStats.filesChanged }}</span>
                </div>
                <div class="diff-stat-item">
                  <span class="stat-label">Added:</span>
                  <span class="stat-value" style="color: #4ef0a8;">+{{ taskDiffStats.additions }}</span>
                </div>
                <div class="diff-stat-item">
                  <span class="stat-label">Deleted:</span>
                  <span class="stat-value" style="color: #ff6b6b;">−{{ taskDiffStats.deletions }}</span>
                </div>
              </div>
              <div v-else class="diff-stats-loading">
                <ActivityIndicator size="sm" label="Loading diff…" />
                Loading changes…
              </div>
              <div v-if="diffLooksLikeDrift" class="diff-stat-warning">
                This diff looks much bigger than the task — main has likely drifted since the branch was cut.
                <template v-if="ui.active?.status === 'review'">
                  <Button
                    variant="outline"
                    size="sm"
                    class="diff-sync-btn"
                    :disabled="syncBusy || ui.saving"
                    @click="syncWithMain"
                  >
                    {{ syncBusy ? "Syncing…" : "Sync with main" }}
                  </Button>
                </template>
              </div>
            </section>
            <div v-if="taskDiff === undefined" class="diff-loading-note">
              <ActivityIndicator size="sm" label="Loading full diff…" />
              <span>Loading full diff… this may take a moment for large changes.</span>
            </div>
            <template v-else>
            <div v-if="diffFiles.length > 0" class="diff-file-list">
              <button
                v-for="file in diffFiles"
                :key="file.filename"
                type="button"
                class="diff-file-item"
                @click="scrollToDiffFile(file.filename)"
              >
                <span
                  class="diff-file-badge"
                  :class="`diff-file-badge-${file.type}`"
                >{{ file.type === 'added' ? 'A' : file.type === 'deleted' ? 'D' : 'M' }}</span>
                <span class="diff-file-name" :title="file.filename">{{ file.filename }}</span>
                <span class="diff-file-delta">
                  <span v-if="file.added > 0" class="diff-file-add">+{{ file.added }}</span>
                  <span v-if="file.removed > 0" class="diff-file-rem">−{{ file.removed }}</span>
                </span>
              </button>
              <button
                v-if="diffFiles.length > 8"
                type="button"
                class="diff-file-collapse-all"
                @click="collapsedFiles.size === diffFiles.length ? collapsedFiles.clear() : diffFiles.forEach(f => collapsedFiles.add(f.filename))"
              >
                <ChevronsDownUp class="size-3" />
                {{ collapsedFiles.size === diffFiles.length ? 'Expand all' : 'Collapse all' }}
              </button>
            </div>
            <div v-if="taskDiff.truncated" class="diff-truncated">
              Diff output was truncated — showing the first ~250 kB.
            </div>
            <div class="diff-sections">
              <div v-for="file in diffFiles" :key="file.filename" :id="file.filename" class="diff-section">
                <div
                  class="diff-section-header"
                  role="button"
                  tabindex="0"
                  @click="toggleFileCollapse(file.filename)"
                  @keydown.enter="toggleFileCollapse(file.filename)"
                >
                  <svg class="diff-section-chevron" :class="{ collapsed: collapsedFiles.has(file.filename) }" viewBox="0 0 24 24" fill="none">
                    <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <span class="diff-file-badge" :class="`diff-file-badge-${file.type}`">{{ file.type === 'added' ? 'A' : file.type === 'deleted' ? 'D' : 'M' }}</span>
                  <span class="diff-section-name">{{ file.filename }}</span>
                  <span class="diff-file-delta">
                    <span v-if="file.added > 0" class="diff-file-add">+{{ file.added }}</span>
                    <span v-if="file.removed > 0" class="diff-file-rem">−{{ file.removed }}</span>
                  </span>
                </div>
                <pre v-if="!collapsedFiles.has(file.filename)" class="diff-section-content"><code><template v-for="(line, i) in file.lines" :key="i"><span :class="diffLineClass(line)">{{ line }}</span>
</template></code></pre>
              </div>
            </div>
            </template>
          </template>
        </div>
        <div v-else-if="ui.activeTab === 'tokens'" class="drawer-body">
          <div v-if="showStats" class="agent-stats">
            <ActivityIndicator v-if="agentBusy" size="sm" />
            <span class="agent-stat">
              <span class="agent-stat-label">time</span>
              <span class="agent-stat-value">{{ fmtElapsed(elapsedMs) }}</span>
            </span>
            <span class="agent-stat">
              <span class="agent-stat-label">tokens</span>
              <span class="agent-stat-value">{{ fmtTokens(sessionStats?.tokens) }}</span>
            </span>
            <span class="agent-stat">
              <span class="agent-stat-label">cost</span>
              <span class="agent-stat-value">{{ fmtCost(sessionStats?.costUsd) }}</span>
            </span>
          </div>
          <div v-if="taskUsage && taskUsage.totalSessions > 0" class="task-usage">
            <div class="task-usage-title">usage — all roles &amp; sessions</div>
            <div class="task-usage-grid">
              <span class="agent-stat">
                <span class="agent-stat-label">total time</span>
                <span class="agent-stat-value">{{ fmtElapsed(taskUsage.totalElapsedMs) }}</span>
              </span>
              <span class="agent-stat">
                <span class="agent-stat-label">total tokens</span>
                <span class="agent-stat-value">{{ fmtTokens(taskUsage.totalTokens) }}</span>
              </span>
              <span
                class="agent-stat"
                title="Input tokens served from the provider's prompt cache ÷ all input tokens, summed across this task's sessions. '—' when no CLI reported cache figures."
              >
                <span class="agent-stat-label">cache hit</span>
                <span class="agent-stat-value">{{
                  cacheHitPct(
                    taskUsage.totalInputTokens,
                    taskUsage.totalCacheReadTokens,
                    taskUsage.totalCacheCreationTokens,
                  )
                }}</span>
              </span>
              <span class="agent-stat">
                <span class="agent-stat-label">total cost</span>
                <span class="agent-stat-value">{{ fmtCost(taskUsage.totalCostUsd, taskUsage.costSource) }}</span>
              </span>
              <span class="agent-stat">
                <span class="agent-stat-label">sessions</span>
                <span class="agent-stat-value">{{ taskUsage.totalSessions }}</span>
              </span>
            </div>
            <div v-if="taskUsage.roles && taskUsage.roles.length > 1" class="task-usage-roles">
              <span class="agent-stat-label">by role</span>
              <div class="task-usage-table-wrap">
                <table class="task-usage-table">
                  <thead>
                    <tr>
                      <th class="ta-left">role</th>
                      <th class="ta-right">time</th>
                      <th class="ta-right">tokens</th>
                      <th class="ta-right">cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in taskUsage.roles" :key="r.role" class="task-usage-role">
                      <td class="task-usage-role-name ta-left">{{ r.role }}</td>
                      <td class="ta-right">{{ fmtElapsed(r.totalElapsedMs) }}</td>
                      <td class="ta-right">{{ fmtTokens(r.totalTokens) }}</td>
                      <td class="ta-right">{{ fmtCost(r.totalCostUsd, r.costSource) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-if="taskUsage.sessions && taskUsage.sessions.length > 0" class="task-usage-sessions">
              <div class="task-usage-title">individual sessions</div>
              <div class="task-usage-table-wrap">
                <table class="task-usage-table">
                  <thead>
                    <tr class="task-usage-session-head">
                      <th class="ta-left">type</th>
                      <th class="ta-left">agent / model</th>
                      <th class="ta-left">started</th>
                      <th class="ta-left">ended</th>
                      <th class="ta-right">time</th>
                      <th class="ta-right">tokens</th>
                      <th class="ta-right" title="Cached input tokens (share of this session's input served from the prompt cache)">cache</th>
                      <th class="ta-right">cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="s in taskUsage.sessions"
                      :key="s.sessionId"
                      class="task-usage-session-row"
                      :class="{ 'task-usage-session-active': s.status === 'active' }"
                    >
                      <td class="task-usage-session-type ta-left">{{ s.sessionType }}</td>
                      <td
                        class="ta-left task-usage-session-agent"
                        :title="sessionAgentsExpanded ? 'Click to collapse' : 'Click to show model'"
                        @click="toggleSessionAgentExpand()"
                      >
                        <div>{{ s.codingAgent }}</div>
                        <div v-if="sessionAgentsExpanded" class="task-usage-session-model">{{ s.model }}</div>
                      </td>
                      <td class="ta-left">{{ fmtSessionTime(s.startedAt) }}</td>
                      <td class="ta-left">{{ s.endedAt ? fmtSessionTime(s.endedAt) : (s.status === "active" ? "running…" : "—") }}</td>
                      <td class="ta-right">{{ fmtElapsed(s.elapsedMs) }}</td>
                      <td class="ta-right">{{ fmtTokens(s.totalTokens) }}</td>
                      <td
                        class="ta-right"
                        :title="`${cacheHitPct(s.inputTokens, s.cacheReadTokens, s.cacheCreationTokens)} of input cached` + (s.cacheCreationTokens ? ` · ${fmtTokens(s.cacheCreationTokens)} written` : '')"
                      >{{ fmtTokens(s.cacheReadTokens) }}</td>
                      <td class="ta-right">{{ fmtCost(s.costUsd, s.costSource) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div v-if="!showStats && (!taskUsage || taskUsage.totalSessions === 0)" class="agent-empty">
            <p>No token or usage data yet.</p>
          </div>
        </div>
        <div v-else-if="ui.activeTab === 'debug'" class="drawer-body">
          <DebugPanel v-if="ui.active" :task="ui.active" />
        </div>
        <div v-else-if="ui.activeTab === 'pm'" class="drawer-body drawer-session-body">
          <div v-if="ui.active" class="agent-override-bar">
            <div class="agent-pick-grid">
              <div class="agent-field" style="grid-column: 1 / -1">
                <AgentModelControl
                  :cli-options="cliOptions"
                  :model-options="pmModelOptions"
                  v-model:cli="pmOverrideDraft.cli"
                  v-model:model="pmOverrideDraft.model"
                  :disabled="ui.saving"
                />
              </div>
               <div class="agent-field">
                  <div v-if="pmOverrideDirty" class="agent-override-actions" style="padding-top:20px">
                    <span class="agent-save-hint">saving…</span>
                  </div>
              </div>
            </div>
          </div>
          <div ref="pmLog" class="agent-log-wrap pm-log-wrap" role="log" aria-live="polite">
            <div v-if="!pmHasConversation" class="agent-empty pm-empty">
              <div class="pm-welcome-icon">PM</div>
              <strong>Chat about this task</strong>
              <p>Ask the PM to edit the task, suggest changes, or discuss progress.</p>
            </div>
            <template v-else>
              <template v-for="(entry, index) in pmLines" :key="index">
                <div v-if="pmLineKind(entry) !== 'hidden'" class="pm-row" :class="`pm-row-${pmLineKind(entry)}`">
                  <div v-if="pmLineKind(entry) === 'assistant'" class="pm-mini-avatar">PM</div>
                  <div class="pm-bubble" :class="`pm-bubble-${pmLineKind(entry)}`">
                    <div v-if="pmLineKind(entry) === 'assistant'" class="pm-markdown" v-html="renderMarkdown(pmLineText(entry))"></div>
                    <span v-else>{{ pmLineText(entry) }}</span>
                    <span v-if="pmLineKind(entry) !== 'status' && entry.at" class="msg-time">{{ fmtTime(entry.at) }}</span>
                  </div>
                </div>
              </template>
              <div v-if="pmBusy" class="pm-thinking" aria-label="PM is thinking">
                <span></span><span></span><span></span>
              </div>
            </template>
          </div>

          <div v-if="showPmCanned" class="pm-canned" role="list" aria-label="Suggested prompts">
            <div v-for="(msg, i) in pmCannedMessages" :key="i" class="pm-canned-item" role="button" tabindex="0" @click="pmSendCanned(msg)" @keydown.enter="pmSendCanned(msg)">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 4 3 10l5 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10h11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
              <span>{{ msg }}</span>
            </div>
          </div>
          <form class="pm-compose" @submit.prevent="pmSend">
            <textarea
              ref="pmDraftTextarea"
              v-model="pmDraft"
              rows="1"
              :disabled="!pmAgentEnabled"
              :placeholder="pmAgentEnabled ? 'Ask PM to edit this task…' : 'Enable PM agent on Agents page'"
              aria-label="Message PM"
              @keydown="pmOnKeydown"
              @input="adjustPmHeight"
            ></textarea>
            <button
              v-if="pmBusy"
              type="button"
              class="pm-stop"
              aria-label="Stop PM response"
              title="Stop response"
              @click="pmInterrupt"
            >
              <svg viewBox="0 0 20 20" fill="none"><rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" /></svg>
            </button>
            <button v-else type="submit" :disabled="!pmDraft.trim() || pmBusy || !pmAgentEnabled" aria-label="Send message">
              <svg viewBox="0 0 20 20" fill="none"><path d="m3 9 13-6-5.5 14-2-5.5L3 9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /><path d="m8.5 11.5 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
            </button>
          </form>
        </div>
        <div v-if="dirty" class="save-bar">
          <div class="save-callout">
            <span class="save-dot"></span>
            <div>
              <div class="save-title">Unsaved changes</div>
              <div class="save-sub">Save to apply your edits</div>
            </div>
          </div>
          <div class="save-actions">
            <Button variant="outline" size="sm" :disabled="ui.saving" @click="cancelDraft">
              Cancel
            </Button>
            <Button variant="default" size="sm" :disabled="ui.saving" @click="saveDraft">
              Save
            </Button>
          </div>
        </div>
      </template>
    </DialogContent>
  </Dialog>

  <RestartTaskDialog
    :task="restartTask"
    @close="restartTask = null"
    @started="ui.activeTab = 'agent'"
  />

  <DirtyMainDialog
    :task="dirtyTask"
    :files="dirtyFiles"
    @commit="confirmCommitDirty"
    @cancel="cancelDirty"
  />

  <HotfixConfirmDialog
    :open="confirmHotfix"
    :task-id="ui.active?.id"
    :busy="ui.saving"
    @cancel="confirmHotfix = false"
    @start="startHotfix"
  />

  <SendToEngineerDialog
    :open="engineerNoteOpen"
    :busy="ui.saving"
    :title="'Send to engineer'"
    @cancel="engineerNoteOpen = false"
    @confirm="confirmSendToEngineer"
  />

  <SpecEditModal
    :open="specModalOpen"
    :body="draft.body"
    @update:open="(v) => (specModalOpen = v)"
    @save="applySpec"
  />
</template>

<style scoped>
.pm-log-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.pm-empty {
  margin: auto 0;
  text-align: center;
  padding: 22px 12px;
  color: var(--txt-dim);
}

.pm-welcome-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 0 auto 12px;
  font-size: 16px;
  font-weight: 800;
  border-radius: 10px;
  color: var(--violet);
  background: var(--violet-dim);
  border: 1px solid var(--border);
}

.pm-empty strong {
  display: block;
  color: var(--txt);
  font-size: 14px;
  margin-bottom: 6px;
}

.pm-empty p {
  font-size: 11.5px;
  line-height: 1.55;
  max-width: 280px;
  margin: 0 auto;
}

.pm-row {
  display: flex;
  align-items: flex-end;
  gap: 7px;
}

.pm-row-human {
  justify-content: flex-end;
}

.pm-mini-avatar {
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 800;
  display: grid;
  place-items: center;
  color: var(--violet);
  background: var(--violet-dim);
  border: 1px solid var(--border);
}

.pm-bubble {
  max-width: 84%;
  padding: 9px 11px;
  border-radius: 13px;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.pm-bubble-human {
  color: var(--btn-primary-color);
  background: var(--btn-primary-bg);
  border: 1px solid var(--border-bright);
  border-bottom-right-radius: 4px;
}

.pm-bubble-assistant {
  color: var(--txt);
  background: var(--panel);
  border: 1px solid var(--border);
  border-bottom-left-radius: 4px;
}

.msg-time {
  display: block;
  margin-top: 3px;
  text-align: right;
  color: var(--txt-faint);
  font: 500 8.5px 'JetBrains Mono', monospace;
  opacity: 0.8;
}

.pm-row-status {
  justify-content: center;
}

.pm-bubble-status {
  padding: 4px 8px;
  background: transparent;
  color: var(--txt-faint);
  font: 500 9.5px 'JetBrains Mono', monospace;
  text-align: center;
}

.pm-markdown :deep(p) {
  margin: 0 0 7px;
}

.pm-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.pm-markdown :deep(ul),
.pm-markdown :deep(ol) {
  padding-left: 17px;
  margin: 5px 0;
}

.pm-markdown :deep(code) {
  font: 10.5px 'JetBrains Mono', monospace;
  background: var(--md-body-bg);
  border-radius: 4px;
  padding: 1px 4px;
}

.pm-markdown :deep(pre) {
  overflow: auto;
  margin: 7px 0;
  padding: 8px;
  background: var(--md-body-bg);
  border-radius: 7px;
}

.pm-markdown :deep(pre code) {
  padding: 0;
  background: none;
}

.pm-markdown :deep(a) {
  color: var(--cyan);
}

.pm-thinking {
  display: flex;
  gap: 4px;
  align-self: flex-start;
  margin-left: 31px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel);
}

.pm-thinking span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--txt-faint);
  animation: pm-bounce 1.2s infinite;
}

.pm-thinking span:nth-child(2) {
  animation-delay: 0.15s;
}

.pm-thinking span:nth-child(3) {
  animation-delay: 0.3s;
}

.pm-compose {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 0 12px;
  padding: 8px 9px 8px 12px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--panel-solid);
}

.pm-compose:focus-within {
  border-color: var(--border-bright);
  box-shadow: 0 0 0 3px var(--violet-dim);
}

.pm-compose textarea {
  flex: 1;
  min-height: 24px;
  max-height: 120px;
  overflow-y: auto;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--txt);
  font: 12.5px / 1.55 var(--font-sans);
}

.pm-compose textarea::placeholder {
  color: var(--txt-faint);
}

.pm-compose button {
  width: 31px;
  height: 31px;
  display: grid;
  place-items: center;
  flex: none;
  border: 0;
  border-radius: 9px;
  background: var(--btn-primary-bg);
  color: var(--violet);
  cursor: pointer;
}

.pm-compose button:disabled {
  opacity: 0.4;
  cursor: default;
}

.pm-compose button svg {
  width: 18px;
  height: 18px;
}

.pm-compose button.pm-stop {
  background: color-mix(in srgb, var(--red, #ef5b5b) 16%, var(--btn-primary-bg));
  color: var(--red, #ef5b5b);
}

.pm-canned {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 12px 10px;
}

.pm-canned-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--panel-solid);
  color: var(--txt);
  font-size: 12.5px;
  line-height: 1.4;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.pm-canned-item svg {
  width: 15px;
  height: 15px;
  flex: none;
  color: var(--violet);
}

.pm-canned-item:hover,
.pm-canned-item:focus-visible {
  border-color: var(--violet);
  background: var(--violet-dim);
  outline: none;
}

@keyframes pm-bounce {
  0%, 70%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  35% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

.diff-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 8px;
  background: var(--panel);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.diff-stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.stat-label {
  color: var(--txt-faint);
  font-weight: 500;
}

.stat-value {
  color: var(--txt);
  font-weight: 600;
}

.diff-stat-warning {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  text-align: center;
  color: #ff6b6b;
  font-size: 11px;
  font-weight: 500;
  background: rgba(255, 107, 107, 0.1);
  border-radius: 4px;
}

.diff-sync-btn {
  color: var(--txt);
}

.diff-stats-loading {
  padding: 8px;
  color: var(--txt-faint);
  font-size: 12px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.diff-loading-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 8px;
  color: var(--txt-faint);
  font-size: 12px;
  text-align: center;
}

.rounds-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--txt-faint);
  font: 600 10px/1 var(--font-mono);
  letter-spacing: .04em;
  white-space: nowrap;
}

/* Changes tab — full diff output */
.changes-summary {
  margin-bottom: 12px;
}

.changes-summary-title {
  margin: 0 0 7px;
  color: var(--txt-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.changes-empty {
  padding: 24px;
  text-align: center;
  color: var(--txt-faint);
  font-size: 13px;
}

.diff-truncated {
  padding: 8px 12px;
  margin-bottom: 8px;
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.25);
  border-radius: 6px;
  color: #ffc107;
  font-size: 12px;
  font-weight: 500;
}

.diff-output {
  margin: 0;
  padding: 12px;
  background: #0d1117;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow-x: auto;
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
  color: #c9d1d9;
  max-height: 70vh;
  overflow-y: auto;
}

.diff-header {
  color: #8b949e;
}

.diff-hunk {
  color: #79c0ff;
}

.diff-add {
  color: #7ee787;
}

.diff-rem {
  color: #ff7b72;
}

.diff-ctx {
  color: #c9d1d9;
}

/* File list */
.diff-file-list {
  display: flex;
  flex-direction: column;
  max-height: 224px;
  overflow-y: auto;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
}

.diff-file-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 4px 10px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--txt);
  cursor: pointer;
  font: 11.5px/1.5 var(--font-mono);
  text-align: left;
}

.diff-file-item:last-child {
  border-bottom: none;
}

.diff-file-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.diff-file-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  flex: none;
  border-radius: 3px;
  font: 600 9px/1 var(--font-mono);
  font-weight: 700;
}

.diff-file-badge-modified {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
}

.diff-file-badge-added {
  background: rgba(78, 240, 168, 0.15);
  color: #4ef0a8;
}

.diff-file-badge-deleted {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.diff-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--txt);
}

.diff-file-delta {
  display: flex;
  gap: 4px;
  flex: none;
  font: 600 10px/1 var(--font-mono);
}

.diff-file-add {
  color: #4ef0a8;
}

.diff-file-rem {
  color: #ff6b6b;
}

.diff-file-collapse-all {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: none;
  border-top: 1px solid var(--border);
  background: transparent;
  color: var(--txt-faint);
  cursor: pointer;
  font: 10px/1 var(--font-sans);
}

.diff-file-collapse-all:hover {
  color: var(--txt);
}

/* Diff sections */
.diff-sections {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diff-section-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: 8px;
  user-select: none;
}

.diff-section-header:hover {
  background: rgba(255, 255, 255, 0.07);
}

.diff-section-chevron {
  width: 13px;
  height: 13px;
  flex: none;
  color: var(--txt-faint);
  transition: transform 0.15s ease;
  transform: rotate(0deg);
}

.diff-section-chevron.collapsed {
  transform: rotate(-90deg);
}

.diff-section-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 12px/1.4 var(--font-mono);
  color: #c9d1d9;
}

.diff-section-content {
  padding: 12px;
  background: #0d1117;
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 8px 8px;
  overflow-x: auto;
  font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
  color: #c9d1d9;
  max-height: 70vh;
  overflow-y: auto;
}
</style>
