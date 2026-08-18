<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { X, Play, Pause, Send, CheckCheck, ExternalLink, Square, ArrowRight, ArrowDown, RotateCcw, ImagePlus, FileText, MessageSquare, Bot, Diff, ShieldCheck, Coins } from "lucide-vue-next";
import type { ReviewState, Task, AgentOutputEntry } from "../types";
import { COLUMNS, statusColor, useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { useConfigStore } from "../stores/config";
import { renderMarkdown } from "../lib/markdown";
import { api, JSON_OPTS } from "../api";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import VoiceDictate from "./VoiceDictate.vue";
import RestartTaskDialog from "./RestartTaskDialog.vue";
import DirtyMainDialog from "./DirtyMainDialog.vue";
import HotfixConfirmDialog from "./HotfixConfirmDialog.vue";
import DoneErrorCard from "./DoneErrorCard.vue";
import { insertTextAtCursor } from "../utils/text-insertion";
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

const repo = useRepoStore();
const ui = useUiStore();
const config = useConfigStore();
const router = useRouter();

/** Task whose dirty-worktree restart choice is awaiting an answer. */
const restartTask = ref<Task | null>(null);

const allStatuses = computed(() => [
  { id: "draft", label: "Draft", color: statusColor("draft") },
  ...COLUMNS,
]);
// Done is a protected close-out workflow, not an ordinary status mutation.
// Keep it visible for already-completed tasks, but do not offer a selector
// choice that the server must reject for every other status.
const selectableStatuses = computed(() =>
  allStatuses.value.filter((status) => status.id !== "done" || ui.active?.status === "done"),
);

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

const freeformTextarea = ref<HTMLTextAreaElement | null>(null);
const specTextareaEl = ref<HTMLTextAreaElement | null>(null);
const draftMsgTextarea = ref<HTMLTextAreaElement | null>(null);
const reviewDraftMsgTextarea = ref<HTMLTextAreaElement | null>(null);

function onFreeformTranscribed(text: string): void {
  if (freeformTextarea.value) {
    insertTextAtCursor(freeformTextarea.value, text);
  }
}

function onSpecTranscribed(text: string): void {
  if (specTextareaEl.value) {
    insertTextAtCursor(specTextareaEl.value, text);
  }
}

function onDraftMsgTranscribed(text: string): void {
  if (draftMsgTextarea.value) {
    insertTextAtCursor(draftMsgTextarea.value, text);
  }
}

function onReviewDraftMsgTranscribed(text: string): void {
  if (reviewDraftMsgTextarea.value) {
    insertTextAtCursor(reviewDraftMsgTextarea.value, text);
  }
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
      return;
    }
    // Success, or the no-PM-agent fallback (raw explanation saved as draft):
    // open the resulting task in the drawer's edit view so it can be tweaked.
    await uploadPendingScreenshots(res.task.id);
    ui.close();
    freeformText.value = "";
    await ui.openTask(res.task);
    router.push("/work");
  } catch (err) {
    freeformError.value = err instanceof Error ? err.message : String(err);
  } finally {
    freeformRunning.value = false;
    freeformRunId.value = null;
    ui.saving = false;
  }
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
  if (!ui.active || review.value?.running) return;
  ui.saving = true;
  doingDone.value = true;
  startDoneTimer();
  try {
    await repo.completeTask(ui.active);
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

/** Spec body is a readable card that expands into a large textarea on click. */
const specEditing = ref(false);
const specTextarea = ref<HTMLTextAreaElement | null>(null);
/** Whether the spec card body is expanded. Collapsed shows just the header. */
const specExpanded = ref(true);

/** Rendered (safe) Markdown for the read-mode spec card. */
const specHtml = computed(() => renderMarkdown(draft.body));

/** Grow the spec textarea to fit its content so editing never feels cramped. */
function autoGrowSpec(): void {
  const el = specTextarea.value;
  if (!el) return;
  // scrollHeight excludes the border (box-sizing: border-box); add it back so
  // the box exactly fits its content and never shows an internal scrollbar.
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
}

watch(specEditing, (editing) => {
  if (editing) nextTick(autoGrowSpec);
});

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
      specEditing.value = false;
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
    specEditing.value = false;
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

function cancelDraft(): void {
  if (ui.active) initDraft(ui.active);
  specEditing.value = false;
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
  if (repo.isRunning(ui.active.id)) return { label: "coding", cls: "rs-coding" };
  return { label: "waiting for human", cls: "rs-human" };
});

/** Compact lifecycle counts: initial engineering is round one; each completed
 * review bounce starts the next engineering pass. A task presently in review
 * is also in its next review pass unless the engineer is actively fixing it. */
const taskRounds = computed(() => {
  const task = ui.active;
  if (!task || (!task.branch && task.status === "inbox")) return { engineering: 0, review: 0 };
  const bounced = task.extra?.review_rounds;
  const completedReviews = typeof bounced === "number" && Number.isFinite(bounced)
    ? Math.max(0, Math.floor(bounced))
    : 0;
  return {
    engineering: completedReviews + 1,
    review: completedReviews + (task.status === "review" && !repo.isRunning(task.id) ? 1 : 0),
  };
});

/** Rendered (safe) Markdown of the report body. */
const reviewHtml = computed(() =>
  review.value?.report ? renderMarkdown(review.value.report.markdown) : "",
);

// ---- agent review tab (0110) ----

/** The three canonical verdict labels, most specific first. */
const VERDICTS = [
  { label: "back to the drawing board", tone: "red" },
  { label: "needs some work", tone: "amber" },
  { label: "good to go", tone: "green" },
] as const;

/** The review agent's verdict, derived from the report's verdict line. */
const verdict = computed<{ label: string; tone: string } | null>(() => {
  const md = review.value?.report?.markdown ?? "";
  if (!md) return null;
  const lower = md.toLowerCase();
  for (const v of VERDICTS) {
    if (lower.includes(v.label)) return { label: v.label, tone: v.tone };
  }
  return null;
});

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
    if (!ui.active || ui.activeTab !== "review" || ui.active.status !== "review") return;
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
 * the first instruction of the resumed turn. */
const sendingToEngineer = ref(false);
async function sendToEngineer(): Promise<void> {
  const task = ui.active;
  const report = review.value?.report;
  if (!task || !report || review.value?.running || reviewBusy.value || sendingToEngineer.value) return;

  const instruction = [
    "This task was returned from review for fixes. Resume work in the existing worktree; do not reset or discard the current changes.",
    "Read the reviewer report below, fix every concrete applicable finding, add or update regression coverage where appropriate, then run repoos check before returning the task to review.",
    "Reviewer report:",
    report.markdown,
  ].join("\n\n");

  ui.saving = true;
  sendingToEngineer.value = true;
  try {
    await repo.setStatus(task, "active");
    await repo.startWork(task, "resume", instruction);
    ui.activeTab = "agent";
  } catch (err) {
    repo.onError(err);
  } finally {
    sendingToEngineer.value = false;
    ui.saving = false;
  }
}

/** Hydrate the report whenever the drawer shows a task in review. */
watch(
  () => [ui.active?.id, ui.active?.status],
  () => {
    if (ui.active?.status !== "review") return;
    reviewPane.value = "report";
    void repo.loadReview(ui.active.id);
  },
  { immediate: true },
);

// ---- PM tab ----

/** Generate session ID for PM chat on a specific task. */
function pmSessionId(taskId: string): string {
  return `pm-task-v2:${taskId}`;
}

const pmDraft = ref("");
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
  const optimistic: AgentOutputEntry = { type: "human", text };
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
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  void pmSend();
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

/** Whether the current task has any persisted PM override set. */
const hasPmOverride = computed(() => {
  const t = ui.active;
  return !!(t && (t.pmAgentOverride || t.pmCliOverride || t.pmModelOverride));
});

/** Draft overrides for the PM tab, initialized from the task's persisted values. */
const pmOverrideDraft = reactive({ agent: "", cli: "", model: "" });

/** Snapshot of the last-saved PM override values. */
const pmOverrideSaved = reactive({ agent: "", cli: "", model: "" });

/** Initialize the PM override draft from the current task. */
function initPmOverrideDraft(t: Task | null): void {
  const base = pmBaseAgent.value;
  pmOverrideDraft.agent = t?.pmAgentOverride || base?.name || "";
  pmOverrideDraft.cli = t?.pmCliOverride || base?.cli || "";
  pmOverrideDraft.model = t?.pmModelOverride || base?.model || "";
  pmOverrideSaved.agent = pmOverrideDraft.agent;
  pmOverrideSaved.cli = pmOverrideDraft.cli;
  pmOverrideSaved.model = pmOverrideDraft.model;
}

/** True when the PM override draft differs from the saved values. */
const pmOverrideDirty = computed(
  () =>
    pmOverrideDraft.agent !== pmOverrideSaved.agent ||
    pmOverrideDraft.cli !== pmOverrideSaved.cli ||
    pmOverrideDraft.model !== pmOverrideSaved.model,
);

/** True when the PM overrides differ from the base PM agent defaults. */
const pmIsCustom = computed(() => {
  const base = pmBaseAgent.value;
  if (!base) return false;
  return (
    pmOverrideDraft.agent !== base.name ||
    pmOverrideDraft.cli !== base.cli ||
    pmOverrideDraft.model !== base.model
  );
});

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

/** Reset PM overrides to the base PM agent defaults (persisted). */
async function resetPmOverrides(): Promise<void> {
  if (!ui.active) return;
  try {
    await repo.patchTask(ui.active.id, {
      pmAgentOverride: null,
      pmCliOverride: null,
      pmModelOverride: null,
    });
    initPmOverrideDraft(ui.active);
  } catch (err) {
    repo.onError(err);
  }
}

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

/** Split the diff patch into individual lines for rendering. */
const diffLines = computed(() => {
  if (!taskDiff.value || !taskDiff.value.patch) return [] as string[];
  return taskDiff.value.patch.split("\n");
});

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

/** Whether the current task has any override set. */
const hasAgentOverride = computed(() => {
  const t = ui.active;
  return !!(t && (t.agentOverride || t.cliOverride || t.modelOverride));
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

/** Initialize the override draft from the current task. */
function initOverrideDraft(t: Task | null): void {
  const base = baseAgent.value;
  overrideDraft.agent = t?.agentOverride || base?.name || "";
  overrideDraft.cli = t?.cliOverride || base?.cli || "";
  overrideDraft.model = t?.modelOverride || base?.model || "";
  overrideSaved.agent = overrideDraft.agent;
  overrideSaved.cli = overrideDraft.cli;
  overrideSaved.model = overrideDraft.model;
}

/** True when the override draft differs from the saved values. */
const overrideDirty = computed(
  () =>
    overrideDraft.agent !== overrideSaved.agent ||
    overrideDraft.cli !== overrideSaved.cli ||
    overrideDraft.model !== overrideSaved.model,
);

/** True when the overrides differ from the base agent defaults. */
const isCustom = computed(() => {
  const base = baseAgent.value;
  if (!base) return false;
  return (
    overrideDraft.agent !== base.name ||
    overrideDraft.cli !== base.cli ||
    overrideDraft.model !== base.model
  );
});

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

/** Reset overrides to the base agent defaults. */
async function resetOverrides(): Promise<void> {
  if (!ui.active) return;
  ui.saving = true;
  try {
    await repo.patchTask(ui.active.id, {
      agentOverride: null,
      cliOverride: null,
      modelOverride: null,
    });
    const base = baseAgent.value;
    overrideDraft.agent = base?.name || "";
    overrideDraft.cli = base?.cli || "";
    overrideDraft.model = base?.model || "";
    overrideSaved.agent = overrideDraft.agent;
    overrideSaved.cli = overrideDraft.cli;
    overrideSaved.model = overrideDraft.model;
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

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

/** Reset freeform overrides to the PM agent defaults. */
function resetFreeformOverrides(): void {
  initFreeformOverrides();
}
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
            Manual form
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
                   <div class="agent-field">
                       <div v-if="freeformIsCustom" class="agent-override-actions" style="padding-top:20px">
                         <span class="agent-custom-badge">custom</span>
                         <Button
                           variant="ghost"
                           size="sm"
                           :disabled="freeformRunning"
                           @click="resetFreeformOverrides"
                           title="Reset to PM defaults"
                         >
                           <RotateCcw class="size-3" />
                         </Button>
                       </div>
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
              <span v-if="ui.active.needsInput" class="tc-waiting">needs input</span>
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
              v-if="taskRounds.engineering > 0"
              class="rounds-badge"
              title="Engineering and review passes for this task"
            >
              E{{ taskRounds.engineering }} · R{{ taskRounds.review }}
            </span>
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
              v-if="ui.active.status === 'review'"
              variant="default"
              :disabled="ui.saving || review?.running || repo.isRunning(ui.active.id)"
              :title="review?.running ? 'Waiting for automatic review to finish.' : repo.isRunning(ui.active.id) ? 'The engineer is still coding; Move to done becomes available when the turn ends.' : undefined"
              @click="moveToDone"
            >
              <CheckCheck v-if="!doingDone" class="size-3.5" />
              <ActivityIndicator v-else />
              {{ doingDone ? doneProgress : "Move to done" }}
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
                 no manual start button — the live URL simply appears when ready. -->
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
            v-if="ui.active.status === 'review' || ui.active.status === 'active'"
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
              v-if="!specEditing"
              class="md-card"
              role="button"
              tabindex="0"
              @click="specEditing = true"
              @keydown.enter="specEditing = true"
              @keydown.space.prevent="specEditing = true"
            >
              <div v-if="specHtml" class="md-rendered" v-html="specHtml"></div>
              <div v-else class="md-card-body">No spec yet — click to add.</div>
            </div>
            <template v-else>
              <div class="spec-textarea-wrapper">
                <textarea
                  ref="specTextareaEl"
                  class="md-edit"
                  v-model="draft.body"
                  rows="12"
                  placeholder="Markdown body"
                  @input="autoGrowSpec"
                ></textarea>
                <VoiceDictate @transcribed="onSpecTranscribed" />
              </div>
              <div class="spec-hint">Click Save to apply the spec.</div>
            </template>
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
                  <div v-if="isCustom || overrideDirty" class="agent-override-actions" style='padding-top:20px'>
                    <span v-if="isCustom" class="agent-custom-badge">custom</span>
                    <span v-if="overrideDirty" class="agent-save-hint">saving…</span>
                    <Button v-if="hasAgentOverride" variant="ghost" size="sm" :disabled="ui.saving" @click="resetOverrides" title="Reset to default">
                      <RotateCcw class="size-3" />
                    </Button>
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
              <div class="agent-waiting-sub">The agent needs your input — reply below to continue.</div>
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
                rows="2"
                placeholder="Send a follow-up to the task's agent session…"
                :disabled="agentBusy || ui.saving"
                @keydown.enter.exact.prevent="sendTurn"
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
                  rows="2"
                  placeholder="Ask the reviewer a follow-up question…"
                  :disabled="review?.running || reviewBusy || ui.saving"
                  @keydown.enter.exact.prevent="sendReviewTurn"
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
          <template v-else-if="taskDiff === undefined">
            <p class="changes-empty">Loading diff…</p>
          </template>
          <template v-else-if="!ui.active.git?.worktreeExists && taskDiff.patch === ''">
            <p class="changes-empty">
              No saved code changes are available for this completed task.
            </p>
          </template>
          <template v-else-if="taskDiff && taskDiff.patch === ''">
            <p class="changes-empty">No code changes yet</p>
          </template>
          <template v-else-if="taskDiff">
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
              <div v-else class="diff-stats-loading">Loading change summary…</div>
            </section>
            <div v-if="taskDiff.truncated" class="diff-truncated">
              Diff output was truncated — showing the first ~250 kB.
            </div>
            <pre class="diff-output"><code><template v-for="(line, i) in diffLines" :key="i"><span :class="diffLineClass(line)">{{ line }}</span>
</template></code></pre>
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
              <div class="task-usage-role-list">
                <span v-for="r in taskUsage.roles" :key="r.role" class="task-usage-role">
                  <span class="task-usage-role-name">{{ r.role }}</span>
                  <span>{{ fmtElapsed(r.totalElapsedMs) }}</span>
                  <span>{{ fmtTokens(r.totalTokens) }}</span>
                  <span>{{ fmtCost(r.totalCostUsd, r.costSource) }}</span>
                </span>
              </div>
            </div>
          </div>
          <div v-if="!showStats && (!taskUsage || taskUsage.totalSessions === 0)" class="agent-empty">
            <p>No token or usage data yet.</p>
          </div>
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
               <div class="agent-field" style="padding-top:20px">
                  <div v-if="pmIsCustom || pmOverrideDirty" class="agent-override-actions">
                    <span v-if="pmIsCustom" class="agent-custom-badge">custom</span>
                    <span v-if="pmOverrideDirty" class="agent-save-hint">saving…</span>
                    <Button v-if="hasPmOverride" variant="ghost" size="sm" :disabled="ui.saving" @click="resetPmOverrides" title="Reset to defaults">
                      <RotateCcw class="size-3" />
                    </Button>
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
                  </div>
                </div>
              </template>
              <div v-if="pmBusy" class="pm-thinking" aria-label="PM is thinking">
                <span></span><span></span><span></span>
              </div>
            </template>
          </div>

          <form class="pm-compose" @submit.prevent="pmSend">
            <textarea
              v-model="pmDraft"
              rows="1"
              :disabled="!pmAgentEnabled"
              :placeholder="pmAgentEnabled ? 'Ask PM to edit this task…' : 'Enable PM agent on Agents page'"
              aria-label="Message PM"
              @keydown="pmOnKeydown"
            ></textarea>
            <button type="submit" :disabled="!pmDraft.trim() || pmBusy || !pmAgentEnabled" aria-label="Send message">
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
  max-height: 82px;
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
  padding: 4px 8px;
  text-align: center;
  color: #ff6b6b;
  font-size: 11px;
  font-weight: 500;
  background: rgba(255, 107, 107, 0.1);
  border-radius: 4px;
}

.diff-stats-loading {
  padding: 8px;
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
</style>
