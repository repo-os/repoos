<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { X, Play, Pause, Send, CheckCheck, Eye, ExternalLink, Square, ArrowRight, ArrowDown, RotateCcw } from "lucide-vue-next";
import type { ReviewState, Task } from "../types";
import { COLUMNS, statusColor, useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { useConfigStore } from "../stores/config";
import { renderMarkdown } from "../lib/markdown";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import RestartTaskDialog from "./RestartTaskDialog.vue";
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
import SelectSearchGroup from "./SelectSearchGroup.vue";

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
      return;
    }
    // Success, or the no-PM-agent fallback (raw explanation saved as draft):
    // open the resulting task in the drawer's edit view so it can be tweaked.
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
    await repo.createTask({ ...ui.nt });
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

// ---- review → done close-out ----

/** True while the merge+build+check+cleanup request is in flight. */
const doingDone = ref(false);
/** Elapsed seconds shown next to the progress label while the flow runs. */
const doneTicks = ref(0);
let doneTimer: number | undefined;

interface DoneFailure {
  step: string;
  elapsedSeconds: number;
  conflicts: string[];
  message: string;
}
/** Detailed failure state from the last move-to-done attempt. */
const doneFailure = ref<DoneFailure | null>(null);

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
    case "screenshots":
      return "Regenerating screenshots…";
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
  doneFailure.value = null;
  startDoneTimer();
  try {
    await repo.completeTask(ui.active);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const step = ui.active ? repo.doneSteps[ui.active.id] ?? "merge" : "merge";
    const conflicts = extractConflicts(message);
    doneFailure.value = {
      step,
      elapsedSeconds: doneTicks.value,
      conflicts,
      message,
    };
    repo.onError(err);
  } finally {
    doingDone.value = false;
    stopDoneTimer();
    ui.saving = false;
  }
}

function extractConflicts(message: string): string[] {
  const prefix = "merge conflict: ";
  const idx = message.indexOf(prefix);
  if (idx === -1) return [];
  return message
    .slice(idx + prefix.length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

/**
 * A preview is available only for active/review tasks with a branch that has a
 * git worktree checked out — the thing the preview server actually serves.
 */
const previewable = computed(() => {
  const t = ui.active;
  if (!t) return false;
  return (
    (t.status === "active" || t.status === "review") &&
    !!t.branch &&
    !!t.git?.worktreeExists
  );
});

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

/** Rendered (safe) Markdown of the report body. */
const reviewHtml = computed(() =>
  review.value?.report ? renderMarkdown(review.value.report.markdown) : "",
);

/** Hydrate the report whenever the drawer shows a task in review. */
watch(
  () => [ui.active?.id, ui.active?.status],
  () => {
    if (ui.active?.status === "review") void repo.loadReview(ui.active.id);
  },
  { immediate: true },
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

/** "$0.031" / "$1.20" — "—" when the CLI hasn't reported a cost. */
function fmtCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  return `$${usd < 1 ? usd.toFixed(3) : usd.toFixed(2)}`;
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
  (t) => { if (t) initOverrideDraft(t); },
  { immediate: true },
);

/** Save the override draft to the task's frontmatter. */
async function saveOverrides(): Promise<void> {
  if (!ui.active) return;
  ui.saving = true;
  try {
    const base = baseAgent.value;
    // Send values that differ from the base agent; send null to clear overrides
    // that match the base (so the server knows to remove them from frontmatter).
    const agentVal = overrideDraft.agent !== (base?.name ?? "") ? overrideDraft.agent : null;
    const cliVal = overrideDraft.cli !== (base?.cli ?? "") ? overrideDraft.cli : null;
    const modelVal = overrideDraft.model !== (base?.model ?? "") ? overrideDraft.model : null;
    await repo.patchTask(ui.active.id, {
      agentOverride: agentVal,
      cliOverride: cliVal,
      modelOverride: modelVal,
    });
    // Re-init from the task's new state after patch (SSE task.updated will sync too).
    overrideSaved.agent = overrideDraft.agent;
    overrideSaved.cli = overrideDraft.cli;
    overrideSaved.model = overrideDraft.model;
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

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
          <template v-if="newMode === 'freeform'">
            <div class="field">
              <label for="nt-freeform">Describe the task</label>
              <textarea
                id="nt-freeform"
                v-model="freeformText"
                class="ff-textarea"
                rows="10"
                placeholder="Type the task however it comes out — like explaining it to a person. The PM agent writes the structured task file."
              ></textarea>
            </div>
            <div class="ff-agent-bar">
              <div class="agent-pick-grid">
                <div class="agent-field">
                  <label>Role</label>
                  <Select v-model="freeformOverride.agent" :disabled="freeformRunning">
                    <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                      <SelectValue placeholder="agent" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                        <SelectItem v-for="a in enabledAgents" :key="a.name" :value="a.name">{{ a.name }}</SelectItem>
                      </SelectViewport>
                    </SelectContent>
                  </Select>
                </div>
                <div class="agent-field">
                  <label>Coding agent</label>
                  <Select v-model="freeformOverride.cli" :disabled="freeformRunning">
                    <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                      <SelectValue placeholder="CLI" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                        <SelectItem v-for="c in cliOptions" :key="c" :value="c">{{ c }}</SelectItem>
                      </SelectViewport>
                    </SelectContent>
                  </Select>
                </div>
                <div class="agent-field">
                  <label>Model</label>
                  <Select v-model="freeformOverride.model" :disabled="freeformRunning">
                    <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                      <SelectValue placeholder="model" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectSearchGroup :options="freeformModelOptions" #default="{ options }">
                        <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                          <SelectItem v-for="m in options" :key="m.value" :value="m.value">{{ m.label }}</SelectItem>
                        </SelectViewport>
                      </SelectSearchGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div v-if="freeformIsCustom" class="agent-override-actions">
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
              :disabled="ui.saving || review?.running"
              :title="review?.running ? 'Waiting for automatic review to finish.' : undefined"
              @click="moveToDone"
            >
              <CheckCheck v-if="!doingDone" class="size-3.5" />
              <ActivityIndicator v-else />
              {{ doingDone ? doneProgress : "Move to done" }}
            </Button>
          </div>
          <p v-if="review?.running" class="review-hint">Waiting for automatic review to finish.</p>
          <span v-if="ui.active.status === 'active' && repo.isRunning(ui.active.id)" class="drawer-run">
            <ActivityIndicator /> agent running
          </span>
          <div v-if="ui.active.status === 'review' && doneFailure" class="done-failure">
            <div class="done-failure-title">
              <X class="size-3.5" />
              Close-out failed at “{{ doneFailure?.step }}”
              <span class="done-failure-time">{{ doneFailure?.elapsedSeconds }}s</span>
            </div>
            <p class="done-failure-msg">{{ doneFailure?.message }}</p>
            <div v-if="doneFailure?.conflicts.length" class="done-failure-files">
              <div class="done-failure-sub">Conflicting files</div>
              <ul>
                <li v-for="f in doneFailure?.conflicts" :key="f" class="mono">{{ f }}</li>
              </ul>
            </div>
            <p class="done-failure-hint">
              RepoOS couldn't sync this branch with main automatically — resolve the
              conflicting files in the worktree, then retry.
            </p>
          </div>
          <div v-if="ui.active.status === 'active' || ui.active.status === 'review'" class="quickbar-row">
            <template v-if="ui.active.preview">
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
            </template>
            <Button
              v-else
              variant="outline"
              :disabled="ui.saving || previewBusy || !previewable"
              @click="startPreview"
            >
              <Eye class="size-3.5" />
              {{ previewBusy ? "Starting…" : "Preview" }}
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
            Details
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: ui.activeTab === 'agent' }"
            @click="ui.activeTab = 'agent'"
          >
            Agent
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
          <div class="field">
            <label>Branch</label>
            <div class="ro-value mono" style="color: var(--cyan)">
              {{ effectiveBranch || "—" }}
              <span v-if="!locked && !ui.active.branch" class="branch-note">auto-derived from title</span>
            </div>
          </div>

          <div v-if="ui.active.status === 'review'" class="field" style="margin-top: 16px">
            <label>Agent review</label>
            <div v-if="review?.running" class="review-running" role="status">
              <ActivityIndicator variant="reviewing" label="Reviewing…" /> Reviewing… the automatic review agent is inspecting this task.
            </div>
            <template v-else-if="review?.report">
              <div class="review-meta">
                <span>{{ repo.fmtDate(review.report.at) }}</span>
                <span class="mono">{{ review.report.agent }} · {{ review.report.cli }}</span>
              </div>
              <div v-if="review.report.state === 'failed'" class="review-failed">
                {{ review.report.markdown }}
              </div>
              <div v-else class="md-card review-card">
                <div class="md-rendered" v-html="reviewHtml"></div>
              </div>
              <p class="review-hint">
                Findings only — you decide whether this task is done.
              </p>
            </template>
            <p v-else-if="review && !review.enabled" class="review-hint">
              The review agent is disabled on the Agents page, so no automatic review runs.
            </p>
            <p v-else class="review-hint">No agent review for this task.</p>
          </div>
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
              <textarea
                ref="specTextarea"
                class="md-edit"
                v-model="draft.body"
                rows="12"
                placeholder="Markdown body"
                @input="autoGrowSpec"
              ></textarea>
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
        <div v-else class="drawer-body" :class="{ 'transition-success': transitioned }">
          <div v-if="ui.active" class="agent-override-bar">
            <div class="agent-pick-grid">
              <div class="agent-field">
                <label>Role</label>
                <Select v-model="overrideDraft.agent" :disabled="ui.saving">
                  <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                    <SelectValue placeholder="agent" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                      <SelectItem v-for="a in enabledAgents" :key="a.name" :value="a.name">{{ a.name }}</SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </Select>
              </div>
              <div class="agent-field">
                <label>Coding agent</label>
                <Select v-model="overrideDraft.cli" :disabled="ui.saving">
                  <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                    <SelectValue placeholder="CLI" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                      <SelectItem v-for="c in cliOptions" :key="c" :value="c">{{ c }}</SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </Select>
              </div>
              <div class="agent-field">
                <label>Model</label>
                <Select v-model="overrideDraft.model" :disabled="ui.saving">
                  <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                    <SelectValue placeholder="model" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectSearchGroup :options="modelOptions" #default="{ options }">
                      <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                        <SelectItem v-for="m in options" :key="m.value" :value="m.value">{{ m.label }}</SelectItem>
                      </SelectViewport>
                    </SelectSearchGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div v-if="isCustom || overrideDirty" class="agent-override-actions">
              <span v-if="isCustom" class="agent-custom-badge">custom</span>
              <template v-if="overrideDirty">
                <Button variant="outline" size="sm" :disabled="ui.saving" @click="saveOverrides">Save</Button>
                <Button variant="ghost" size="sm" :disabled="ui.saving" @click="initOverrideDraft(ui.active)">Cancel</Button>
              </template>
              <Button v-if="hasAgentOverride" variant="ghost" size="sm" :disabled="ui.saving" @click="resetOverrides" title="Reset to default">
                <RotateCcw class="size-3" />
              </Button>
            </div>
          </div>
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
            <textarea
              v-model="draftMsg"
              class="agent-input"
              rows="2"
              placeholder="Send a follow-up to the task's agent session…"
              :disabled="agentBusy || ui.saving"
              @keydown.enter.exact.prevent="sendTurn"
            ></textarea>
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
</template>
