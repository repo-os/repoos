<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { randomId } from "../lib/random-id";
import { useRouter } from "vue-router";
import {
  X,
  Play,
  Pause,
  Send,
  CheckCheck,
  ExternalLink,
  Square,
  ArrowRight,
  ArrowDown,
  RotateCcw,
  ImagePlus,
  Info,
  Paperclip,
  FileText,
  MessageSquare,
  Bot,
  Diff,
  Expand,
  ShieldCheck,
  Coins,
  Bug,
  Lightbulb,
  Trash2,
} from "lucide-vue-next";
import type {
  ReviewState,
  Task,
  AgentOutputEntry,
  SessionUsage,
  DetectedAgent,
  CheckRunRow,
} from "../types";
import {
  COLUMNS,
  columnsWithLabels,
  PM_FLESH_OUT_CANNED_MESSAGE,
  pmCannedMessagesFor,
  statusColor,
  useRepoStore,
} from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { useConfigStore } from "../stores/config";
import { useAuthStore } from "../stores/auth";
import { useNoticesStore } from "../stores/notices";
import { renderMarkdown } from "../lib/markdown";
import { fmtTime, formatDuration, relTime } from "../lib/time";
import { fmtTokens } from "../lib/format";
import { api, JSON_OPTS } from "../api";
import { checkRunSkipped } from "../../../core/check-skip.js";
import { PRIORITIES, TASK_TYPES } from "../../../core/types.js";
import {
  needsInputBannerText,
  needsInputPrimaryAction,
  needsInputStatusLabel,
  needsInputSuggestionText,
  needsInputSuppressedOnReview,
  needsInputSurfaces,
  resolveNeedsInputReasonKey,
  STALE_REVIEW_DEV_ERROR_BANNER,
} from "../lib/needs-input-ui";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import VoiceDictate from "./VoiceDictate.vue";
import AiChatThinking from "./AiChatThinking.vue";
import ChatJumpToLatest from "./ChatJumpToLatest.vue";
import ChatDiagnosticRow from "./ChatDiagnosticRow.vue";
import ChatToolCallRow from "./ChatToolCallRow.vue";
import { useChatScroll } from "../composables/useChatScroll";
import { useCopyChatMessage } from "../composables/useCopyChatMessage";
import { bubbleRole, toDisplayRows, type DisplayRow } from "../lib/chat-rows";
import { confirmDependencyOverride } from "../lib/task-dependencies";
import DependencyChip from "./DependencyChip.vue";
import RestartTaskDialog from "./RestartTaskDialog.vue";
import DirtyCheckoutDialog from "./DirtyCheckoutDialog.vue";
import WorktreeHandoffConflictDialog from "./WorktreeHandoffConflictDialog.vue";
import HotfixConfirmDialog from "./HotfixConfirmDialog.vue";
import HotfixBadge from "./HotfixBadge.vue";
import { hotfixBannerText } from "../lib/hotfix";
import ReviewConfirmDialog from "./ReviewConfirmDialog.vue";
import SendToEngineerDialog from "./SendToEngineerDialog.vue";
import SpecEditModal from "./SpecEditModal.vue";
import ScreenshotViewer from "./ScreenshotViewer.vue";
import ScreenshotExpandButton from "./ScreenshotExpandButton.vue";
import { isImageMime, pendingToShots, type ScreenshotShot } from "../lib/screenshot-viewer";
import { shotProblems, shotRows, uncapturedDeclared } from "../lib/shot-rows";
import type { DeclaredShot } from "../../../core/shot-plan.js";
import type { ShotMeta } from "../types";
import AddShotModal from "./AddShotModal.vue";
import DeleteShotDialog from "./DeleteShotDialog.vue";
import DoneErrorCard from "./DoneErrorCard.vue";
import DebugPanel from "./DebugPanel.vue";
import DiffFileViewer from "./DiffFileViewer.vue";
import type { DiffFile } from "../lib/diff-files";
import StopWorkConfirmModal from "./StopWorkConfirmModal.vue";
import DeleteTaskDialog from "./DeleteTaskDialog.vue";
import ArchiveTaskDialog from "./ArchiveTaskDialog.vue";
import { storyDeepLinkRef, storyOpenLabel } from "../lib/story-deep-link";
import { normalizeStoryName } from "../../../core/stories.js";
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
import { useModelMemory } from "../composables/useModelMemory";
import { GENERIC_PATCH_TARGETS } from "../lib/taskTransitions";
import { parseReviewVerdict } from "../lib/reviewVerdict";
import { reportPredatesLatestHandoff, reviewSupersededByFixRound } from "../lib/reviewFreshness";
import { autoRepairHint, retryCountFrom } from "../lib/retryHints";
import { resolveEffectiveAgent } from "../lib/effective-agent";
import CopyableNumber from "./CopyableNumber.vue";
import PmChatSurface from "./PmChatSurface.vue";
import AreaPicker from "./AreaPicker.vue";
import { defaultTaskArea, formatTaskAreas, parseTaskAreas } from "../../../core/areas.js";

const repo = useRepoStore();
const ui = useUiStore();
const notices = useNoticesStore();

/** Every prerequisite, blocking ones flagged, each resolvable to a title. */
const dependencyRows = computed(() => {
  const t = ui.active;
  if (!t) return [];
  const blockers = new Map((t.blockedBy ?? []).map((b) => [b.id, b]));
  return (t.dependsOn ?? []).map((id) => {
    const blocker = blockers.get(id) ?? null;
    const known = repo.tasks.find((x) => x.id === id);
    const stateLabel = blocker
      ? blocker.state === "cancelled"
        ? "cancelled"
        : blocker.state === "archived"
          ? "archived"
          : "not merged"
      : "done";
    return { id, blocker, title: known?.title ?? "", stateLabel };
  });
});

async function openDependency(id: string): Promise<void> {
  const known = repo.tasks.find((x) => x.id === id);
  if (known) return void ui.openTask(known);
  try {
    void ui.openTask(await api<Task>(`/api/tasks/${id}`));
  } catch {
    /* archived or missing: nothing to open */
  }
}
const config = useConfigStore();
const auth = useAuthStore();
const router = useRouter();
const { recall: recallModelForCli } = useModelMemory();
const { onTaskDrawerBubbleClick } = useCopyChatMessage();

const GEMINI_MIGRATION_URL = "https://antigravity.google/docs/cli/gcli-migration/";

function isLegacyGeminiCli(cli: string): boolean {
  return cli.toLowerCase() === "gemini";
}

/**
 * Model to apply when a picker's CLI changes. Prefer a remembered pin for this
 * context+CLI (#0342 / #0360); never blindly take `modelsFor(cli)[0]` ("default").
 */
function modelForCliSwitch(memoryKey: string, cli: string): string {
  const remembered = recallModelForCli(memoryKey, cli);
  if (!remembered) return "default";
  return config.isKnownModelForCli(cli, remembered) ? remembered : "default";
}

/** Task whose dirty-worktree restart choice is awaiting an answer. */
const restartTask = ref<Task | null>(null);
const restartOverrideDependencies = ref(false);

/**
 * A clock for the auto-repair hint's "stuck · silent Ns" variant (#0385):
 * mirrors TaskCard's own tick so the drawer recomputes staleness without
 * needing any store event to fire while an agent sits quiet.
 */
const now = ref(Date.now());
let nowTimer: number | undefined;
onMounted(() => {
  nowTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 15_000);
});
onUnmounted(() => {
  window.clearInterval(nowTimer);
});

// Per-task overrides share the Agents page's discovery rule: Antigravity is a
// new choice only when the official `agy` binary is installed and drivable.
// A saved value remains in the list so historical configuration is visible and
// can be deliberately migrated instead of being silently rewritten.
const detectedDrivableClis = ref<Set<string>>(new Set());
async function refreshDetectedDrivableClis(): Promise<void> {
  try {
    const data = await api<{ agents: DetectedAgent[] }>("/api/agents/detect");
    detectedDrivableClis.value = new Set(
      data.agents.filter((a) => a.installed && a.drivable).map((a) => a.id),
    );
  } catch {
    detectedDrivableClis.value = new Set();
  }
}
onMounted(() => {
  void refreshDetectedDrivableClis();
});

/** The auto-repair hint in flight for the open task, or null when no covered
 *  retry is running (#0385). For a review task this is the close-out error's
 *  check/merge-conflict retry; for an `active` task it is the missed-handoff
 *  retry (shown next to "agent coding"). Null once the retry cap is hit, so
 *  the drawer falls back to the normal dead-end error + Fix button. */
const autoRepairRetryHint = computed(() => {
  const t = ui.active;
  if (!t) return null;
  return autoRepairHint({
    task: t,
    running: repo.isRunning(t.id),
    lastActivity: repo.agentActivityAt[t.id] ?? repo.runningSince[t.id],
    now: now.value,
  });
});

const allStatuses = computed(() => {
  const draftLabel = config.columnLabels.draft;
  return [
    {
      id: "draft",
      label: draftLabel,
      color: statusColor("draft"),
    },
    ...columnsWithLabels(config.columnLabels),
  ];
});
const selectableStatuses = computed(() => {
  const current = ui.active?.status;
  const reachable = current ? (GENERIC_PATCH_TARGETS[current] ?? []) : [];
  return allStatuses.value.filter(
    (status) => status.id === current || reachable.includes(status.id),
  );
});

/**
 * #0507: a handoff finalization is running for this task, so the Review
 * affordances must read as busy. A task is in this state for as long as the
 * check takes — which is exactly why the status is NOT flipped optimistically:
 * the drawer keeps saying "active" while this is true, and a naive read of it
 * would otherwise invite a second, concurrent request.
 */
const handoffBusy = computed(() =>
  ui.active?.status === "active" ? repo.handoffInFlight(ui.active.id) : false,
);

/** #0507: the last handoff finalization failure, shown while the task is still active. */
const handoffError = computed(() => (ui.active ? repo.handoffErrorFor(ui.active.id) : null));

/** Human label for the live handoff step, e.g. "Running repoos check…". */
const handoffStepLabel = computed(() => {
  const step = ui.active ? repo.handoffSteps[ui.active.id] : undefined;
  switch (step) {
    case "check":
      return "Running repoos check…";
    case "commit":
      return "Committing the branch…";
    case "review":
      return "Moving to review…";
    case "started":
      return "Starting checks…";
    default:
      return "Running checks…";
  }
});

// ── live check chip (#0564) ──────────────────────────────────────────────────
// The task page should say what a check is doing while it runs — which
// machine, how long — and show the result inline instead of burying it in the
// Debug tab. Live state comes from the task-check SSE events; the machine of
// the REMOTE half comes from the durable run history, which it lands in
// mid-gate — so the rows are re-fetched on a short interval while a run is
// active, not just when the run identity changes.

/** Durable run rows for the open task, newest first. */
const checkRows = ref<CheckRunRow[]>([]);

/** How often the durable rows are re-fetched while a run is active. */
const CHECK_ROWS_POLL_MS = 5_000;

async function refreshCheckRows(taskId: string): Promise<void> {
  try {
    const r = await api<{ ok: boolean; runs: CheckRunRow[] }>(
      `/api/check-runs?taskId=${encodeURIComponent(taskId)}&limit=20`,
    );
    checkRows.value = r.runs ?? [];
  } catch {
    /* keep whatever the last fetch produced — the chip degrades, not breaks */
  }
}

const activeCheckRun = computed(() => {
  const id = ui.active?.id;
  if (!id) return null;
  return (repo.taskChecks[id] ?? []).find((r) => r.running) ?? null;
});

const lastCheckRun = computed(() => {
  const id = ui.active?.id;
  if (!id) return null;
  const runs = repo.taskChecks[id] ?? [];
  return runs.filter((r) => !r.running).at(-1) ?? null;
});

/**
 * Newest durable row for this task that carries the gate's FINAL verdict.
 * A remote row is one half of a gate; prefer the local half, which completes
 * last. Used when the in-memory run is gone (server restart) — the durable
 * history survives it.
 */
const lastDurableCheck = computed(() => {
  const local = checkRows.value.find((r) => !r.remote);
  return local ?? checkRows.value[0] ?? null;
});

/** Ticks once a second while a check runs, so the elapsed time stays live. */
const checkNow = ref(Date.now());
let checkTick: ReturnType<typeof setInterval> | undefined;
let checkRowsTimer: ReturnType<typeof setInterval> | undefined;

function stopCheckLoops(): void {
  if (checkTick) {
    clearInterval(checkTick);
    checkTick = undefined;
  }
  if (checkRowsTimer) {
    clearInterval(checkRowsTimer);
    checkRowsTimer = undefined;
  }
}

function startCheckLoops(taskId: string): void {
  stopCheckLoops();
  void refreshCheckRows(taskId);
  checkNow.value = Date.now();
  checkTick = setInterval(() => (checkNow.value = Date.now()), 1000);
  checkRowsTimer = setInterval(() => void refreshCheckRows(taskId), CHECK_ROWS_POLL_MS);
}

watch(
  () => [ui.active?.id, activeCheckRun.value?.id, lastCheckRun.value?.finishedAt],
  ([taskId]) => {
    if (!taskId) {
      stopCheckLoops();
      checkRows.value = [];
      return;
    }
    // Bootstrap the in-memory runs from the server (0564 review): after a
    // page reload mid-gate this store slice is empty — SSE only delivers
    // events from now on — so the chip would sit on the stale durable row
    // instead of "Checks running on …" until the Debug tab happened to open.
    // Only when we have nothing: an SSE-fed slice is fresher than a snapshot.
    if ((repo.taskChecks[taskId as string] ?? []).length === 0) {
      void repo.refreshTaskChecks(taskId as string);
    }
    if (activeCheckRun.value) {
      startCheckLoops(taskId as string);
    } else {
      // Not running: hydrate once so the done-state fallback can read the
      // durable history (covers runs that finished before this session, or
      // while the drawer was closed — in-memory runs die with the server).
      stopCheckLoops();
      void refreshCheckRows(taskId as string);
    }
  },
  { immediate: true },
);
onUnmounted(stopCheckLoops);

/**
 * The machine the current gate is running on. Prefer the remote host when the
 * durable history shows the remote half ran within this gate's window (it
 * lands there mid-gate, while the chip is still showing "running"); fall back
 * to the local machine the SSE started event already carries.
 */
const checkMachine = computed(() => {
  const run = activeCheckRun.value;
  if (!run) return null;
  const since = Date.parse(run.startedAt) - 60_000;
  const row = checkRows.value.find(
    (r) => r.remote && r.machine && Date.parse(r.startedAt) >= since,
  );
  return row?.machine ?? run.machine ?? null;
});

/** Durable fallback stops being useful long after the tree it tested changed. */
const DURABLE_CHIP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const checkChip = computed(() => {
  const run = activeCheckRun.value;
  if (run) {
    const elapsed = formatDuration(Math.max(0, checkNow.value - Date.parse(run.startedAt)));
    const machine = checkMachine.value;
    const taskId = ui.active?.id;
    // #0720: the server flags an in-flight run past 1.5x its kind median; the
    // badge keeps that visible on the task itself, not only in the bell.
    const slow = taskId ? notices.slowRunByTask[taskId] : undefined;
    return {
      state: "running" as const,
      slow: !!slow,
      slowDetail: slow?.detail ?? null,
      label: `Checks running${machine ? ` on ${machine}` : ""} · ${elapsed}`,
      title: slow?.detail
        ? slow.detail
        : run.scope === "full"
          ? "The check gate is running — open the Debug tab for live output"
          : `Changed-path check (${run.scope}) — open the Debug tab for live output`,
    };
  }
  // Done state: the in-memory run when we have one; otherwise the durable
  // history, which survives a server restart. The remote half alone is not
  // the gate's verdict, so lastDurableCheck prefers the local row.
  const last = lastCheckRun.value;
  if (last) {
    // #0592: a skipped gate exits 0, so the exit code alone would read as a
    // green pass — treat as skipped only when the run passed; the server's
    // `skipped` flag or the notice in output both require exit 0 so a FAILED
    // run that echoes the notice (or a stale `skipped` flag) still reads failed.
    if (last.passed === true && (last.skipped === true || checkRunSkipped(last.output))) {
      return {
        state: "skip" as const,
        label: "No checks configured",
        title:
          "The check gate was skipped — nothing was verified because this repo has no check " +
          "plan. Open the Debug tab for the reminder and the setup task shortcut.",
      };
    }
    const dur = formatDuration(last.durationMs ?? 0);
    return last.passed
      ? { state: "pass" as const, label: `Checks passed · ${dur}`, title: "Open the Debug tab" }
      : { state: "fail" as const, label: `Checks failed · ${dur}`, title: "Open the Debug tab" };
  }
  const row = lastDurableCheck.value;
  if (!row || row.outcome === "cancelled") return null;
  if (Date.now() - Date.parse(row.startedAt) > DURABLE_CHIP_MAX_AGE_MS) return null;
  const dur = row.durationMs != null ? ` · ${formatDuration(row.durationMs)}` : "";
  const title = `Last recorded check run (${relTime(row.startedAt)}) — open the Debug tab`;
  if (row.outcome === "skipped") {
    return {
      state: "skip" as const,
      label: `No checks configured${dur}`,
      title:
        "The last recorded check run was skipped — this repo has no check plan, so nothing " +
        "was verified. Open the Debug tab for the reminder.",
    };
  }
  return row.outcome === "pass"
    ? { state: "pass" as const, label: `Checks passed${dur}`, title }
    : { state: "fail" as const, label: `Checks failed${dur}`, title };
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

// Single source of truth (#0656): the Select controls below can only ever
// emit one of these, so the drawer cannot send an invalid priority or type.
const taskTypes = [...TASK_TYPES];
const priorities = [...PRIORITIES];

/** The Stories surface is opt-in; hide the story control entirely when off. */
const storiesEnabled = computed(
  () => (config.data?.stories as { enabled?: unknown } | undefined)?.enabled === true,
);

/** Existing story names across the board and registered definitions, deduped. */
const storyOptions = computed(() => {
  const seen = new Map<string, string>();
  for (const d of repo.storyDefinitions) {
    if (!seen.has(d.key)) seen.set(d.key, d.name);
  }
  for (const t of repo.tasks) {
    const name = (t.story ?? "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
});

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
/**
 * The story the task on the acknowledgment panel was created with (#0555).
 * Captured here rather than read back from `ui.nt.story`, which is cleared the
 * moment the create succeeds — the form has to start clean for the next task,
 * but **Done** and the PM-finished auto-open still need to find their way back
 * to the story this create belonged to.
 */
const freeformStory = ref("");

const freeformTextarea = ref<HTMLTextAreaElement | null>(null);
const draftMsgTextarea = ref<HTMLTextAreaElement | null>(null);
const reviewDraftMsgTextarea = ref<HTMLTextAreaElement | null>(null);

function onFreeformTranscribed(text: string): void {
  if (freeformTextarea.value) {
    // insertTextAtCursor dispatches input, which refits the auto-growing field.
    insertTextAtCursor(freeformTextarea.value, text);
  }
}

function adjustFreeformHeight(): void {
  autoGrowTextarea(freeformTextarea.value, 420);
}

watch(freeformText, adjustFreeformHeight, { flush: "post" });

function clearFreeformDraft(): void {
  freeformText.value = "";
  ui.clearScreenshots();
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
    freeformStory.value = "";
    // Unlike freeformText, a leftover freeformRunId is NOT something to keep:
    // it only gets set once the user actually clicks "Create task" (not just by
    // typing), and closing the drawer before that run's stream finishes left it
    // dangling — reopening then rendered the old run's buffered output as if a
    // PM agent were live right now. Drop it so a reopen always starts clean.
    if (freeformRunId.value) repo.clearOutput(freeformRunId.value);
    freeformRunId.value = null;
    freeformRunning.value = false;
    initFreeformOverrides();
    // The textarea remounts with the preserved draft when the drawer reopens.
    void nextTick(adjustFreeformHeight);
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
  freeformRunId.value = randomId();
  try {
    const overrides = freeformIsCustom.value
      ? { agent: freeformOverride.agent, cli: freeformOverride.cli, model: freeformOverride.model }
      : undefined;
    // #0555: Freeform is the default mode, so this is the path most story
    // hand-offs take — the tag rides in the POST body and lands on the draft
    // before the PM agent ever sees it.
    const res = await repo.createFreeformTask(
      text,
      freeformRunId.value,
      overrides,
      undefined,
      ui.nt.story,
    );
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
    // Capture the story BEFORE clearing it: `nt.story` is per-open context and
    // must not leak into the next task queued from this panel, but the ack's
    // dismissal paths still navigate by it (#0555).
    freeformStory.value = ui.nt.story;
    // Clear the input so a "Create another task" tap starts from a clean form.
    freeformText.value = "";
    // The story went with this create (#0555); per-open context, so the next
    // task queued from this acknowledgment panel starts untagged.
    ui.nt.story = "";
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
  const story = freeformStory.value;
  freeformSubmitted.value = false;
  submittedTask.value = null;
  if (freeformRunId.value) repo.clearOutput(freeformRunId.value);
  freeformRunId.value = null;
  ui.close();
  // #0555: a freeform create that carried a story ends on that story — the
  // same destination the manual path takes, and the same "close this surface,
  // then navigate" hand-off the story panel makes. With no story the
  // acknowledgment keeps the navigation-free dismissal it has always had.
  if (story) routeAfterCreate(story);
}

// The user reported staying stuck on the "Creating your task" acknowledgment
// panel even after the PM agent finished — it never opened the finished task,
// so it looked like creation hadn't happened. `task.pmFinished` (fired on
// every exit path server-side, see routes/tasks.ts) clears `pmWorkingFor`; if
// the user is still sitting on this panel (hasn't clicked "Done"/"Create
// another task", hasn't navigated the drawer away from "new") when that
// happens, open the finished task instead of leaving them hanging.
watch(
  () => repo.pmWorkingFor(submittedTask.value?.id ?? ""),
  (working, wasWorking) => {
    if (!wasWorking || working) return;
    if (!freeformSubmitted.value || !submittedTask.value || !ui.isNew) return;
    const task = submittedTask.value;
    const story = freeformStory.value;
    freeformSubmitted.value = false;
    submittedTask.value = null;
    if (freeformRunId.value) repo.clearOutput(freeformRunId.value);
    freeformRunId.value = null;
    if (story) {
      // #0555: this create came from a story, so the wait ends on that story
      // rather than on /work — the same destination Done takes above. Opening
      // the task drawer as well would put the story panel and the task drawer
      // on screen at once; the finished task is one click away in the story's
      // Tasks tab, which is what #0311 wanted the user to see: creation
      // happened, and here it is.
      ui.close();
      routeAfterCreate(story);
      return;
    }
    void ui.openTask(task);
    router.push("/work");
  },
);

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
  const flat = text
    .replace(/\s+/g, " ")
    .replace(/\s*---\s*/g, " ")
    .trim();
  return flat.length <= 60 ? flat || "Untitled task" : `${flat.slice(0, 57).trimEnd()}…`;
}

/**
 * Where a create takes the user (#0555): back to the story the task was
 * created from — the `?story=` resolver takes a registered story's number or
 * a tag-only story's key, which is exactly what `storyDeepLinkRef` produces —
 * and to the board when it carries no story, i.e. the unconditional `/work`
 * push every create made before this.
 */
function routeAfterCreate(story: string): void {
  const ref = storyDeepLinkRef(story, repo.storyDefinitions);
  if (ref) {
    router.push({ name: "stories", query: { story: ref } });
    return;
  }
  router.push("/work");
}

/** Save the raw freeform text as a draft task, bypassing the PM agent. */
async function createDraft(): Promise<void> {
  const text = freeformText.value.trim();
  if (!text) return;
  ui.saving = true;
  freeformError.value = "";
  draftSaved.value = null;
  // Captured before the close: the draft carries `ui.nt.story`, so it lands
  // back on the story it belongs to rather than on a board that shows none.
  const story = ui.nt.story;
  try {
    await repo.createTask({
      ...ui.nt,
      title: draftTitle(text),
      body: text,
      status: "draft",
    });
    ui.close();
    freeformText.value = "";
    routeAfterCreate(story);
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

async function createTask(): Promise<void> {
  if (!ui.nt.title) return;
  ui.saving = true;
  // Captured before the reset below — this is where "created from a story"
  // would otherwise be lost.
  const story = ui.nt.story;
  try {
    const created = await repo.createTask({ ...ui.nt });
    await uploadPendingScreenshots(created.id);
    ui.close();
    ui.nt.title = "";
    ui.nt.body = "";
    ui.nt.area = defaultTaskArea(areaOptions.value);
    ui.nt.priority = "p2";
    ui.nt.type = "feature";
    ui.nt.assignedTo = "";
    // Per-open context, not a draft: the next New task starts untagged.
    ui.nt.story = "";
    routeAfterCreate(story);
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
const pendingViewerOpen = ref(false);
const pendingViewerStart = ref(0);
const pendingViewerShots = computed(() => pendingToShots(ui.pendingScreenshots));
function openPendingViewer(index: number): void {
  pendingViewerStart.value = index;
  pendingViewerOpen.value = true;
}

// ---- captured preview shots (#0582) ----
/** Shots captured by `repoos shot`, listed from the task's `shots/` folder. */
const taskShots = computed(() => (ui.active ? repo.shotsFor(ui.active.id) : []));
/**
 * The same shots as UI-changes rows (#0611): one per captured file, carrying the
 * matching `## Shots` spec detail (label, target · route, selector, steps) that
 * `ShotMeta` alone doesn't have. Order matches `taskShots`, so a row index is
 * still the viewer's start index.
 */
const uiChangeRows = computed(() => shotRows(taskShots.value, ui.active?.body));
/** Capture failures/skips since the newest shot, and the declared shots that never landed. */
const uiShotProblems = computed(() => shotProblems(ui.active?.body, taskShots.value));
const uiMissingShots = computed(() =>
  uiShotProblems.value.length ? uncapturedDeclared(taskShots.value, ui.active?.body) : [],
);
/** Area/target mismatch warning for the open task, or undefined. */
const shotWarning = computed(() => (ui.active ? repo.shotWarningFor(ui.active.id) : undefined));
/** Last handoff browser verification (#0680), when loaded. */
const uiHandoffVerification = computed(() =>
  ui.active ? repo.uiVerificationFor(ui.active.id) : undefined,
);
const shotsViewerOpen = ref(false);
const shotsViewerStart = ref(0);
const shotsViewerShots = computed<ScreenshotShot[]>(() =>
  // #0603: the viewer's caption carries the provenance ("declared: …" /
  // "auto: matched …"), not the raw filename.
  taskShots.value.map((s) => ({ src: s.url, name: s.provenance || s.label || s.name })),
);
function openShotsViewer(index: number): void {
  shotsViewerStart.value = index;
  shotsViewerOpen.value = true;
}

// ---- add / delete shots from the drawer (#0627) ----
/**
 * Shot management shows while the task is `active` or `review` and has a
 * branch: a capture needs the worktree's preview, and a delete needs the
 * task's `## Shots` body. Everything else stays read-only.
 */
const canManageShots = computed(
  () =>
    !!ui.active &&
    !!ui.active.branch &&
    (ui.active.status === "active" || ui.active.status === "review"),
);
const addShotOpen = ref(false);
const addShotBusy = ref(false);
const addShotError = ref<string | undefined>(undefined);
const addShotWarning = ref<string | undefined>(undefined);
const deleteShotTarget = ref<ShotMeta | null>(null);
const deleteShotBusy = ref(false);

function openAddShot(): void {
  addShotError.value = undefined;
  addShotWarning.value = undefined;
  addShotOpen.value = true;
}
function onAddShotOpen(v: boolean): void {
  addShotOpen.value = v;
  if (!v) addShotWarning.value = undefined;
}

async function submitAddShot(entry: DeclaredShot): Promise<void> {
  if (!ui.active) return;
  addShotBusy.value = true;
  addShotError.value = undefined;
  addShotWarning.value = undefined;
  const result = await repo.addShot(ui.active.id, entry);
  addShotBusy.value = false;
  if (!result.ok) {
    addShotError.value = result.error;
    return;
  }
  // A warning (highlight/selector matched nothing, declaration not updated)
  // stays in the modal where the user is looking; they close it themselves.
  if (result.warning) {
    addShotWarning.value = result.warning;
    return;
  }
  addShotOpen.value = false;
  repo.pushToast(`Shot captured (${entry.label || entry.target})`, "success");
}

async function confirmDeleteShot(): Promise<void> {
  const target = deleteShotTarget.value;
  const task = ui.active;
  if (!target || !task) return;
  deleteShotBusy.value = true;
  const result = await repo.deleteShot(task.id, target.name);
  deleteShotBusy.value = false;
  deleteShotTarget.value = null;
  if (!result.ok) {
    repo.pushToast(result.error, "error");
    return;
  }
  if (result.warning) repo.pushToast(result.warning, "error");
  else repo.pushToast("Shot deleted", "success");
}

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

// ---- screenshot format info popover (#0571) ----
// The accepted-format/attachment help used to sit permanently under the
// dropzone; it now opens on hover/focus of a small control beside the
// Screenshots label. The pane is teleported to <body> (#0460's stage-pane is
// the reference) because the drawer's stacking context would trap a fixed
// child, and it is anchored under the control.
const shotInfoEl = ref<HTMLButtonElement | null>(null);
const shotHintOpen = ref(false);
const shotHintStyle = ref<Record<string, string>>({});

/** Position the pane just under the info control, clamped into the viewport. */
function positionShotHint(): void {
  const rect = shotInfoEl.value?.getBoundingClientRect();
  if (!rect || typeof window === "undefined") return;
  const maxW = Math.min(320, Math.max(200, window.innerWidth - 28));
  const left = Math.min(Math.max(rect.left, 14), window.innerWidth - maxW - 14);
  shotHintStyle.value = {
    left: `${left}px`,
    top: `${rect.bottom + 8}px`,
    maxWidth: `${maxW}px`,
  };
}

function showShotHint(): void {
  shotHintOpen.value = true;
  positionShotHint();
}

function hideShotHint(): void {
  shotHintOpen.value = false;
}

/** Keep the pane glued to its control if the drawer scrolls or the window resizes. */
function onShotHintViewportChange(): void {
  if (shotHintOpen.value) positionShotHint();
}
onMounted(() => {
  window.addEventListener("resize", onShotHintViewportChange);
  window.addEventListener("scroll", onShotHintViewportChange, true);
});
onUnmounted(() => {
  window.removeEventListener("resize", onShotHintViewportChange);
  window.removeEventListener("scroll", onShotHintViewportChange, true);
});

async function setStatus(status: string): Promise<void> {
  if (!ui.active || ui.active.status === status) return;
  // #0507: `review` is a request, not a write — it starts the handoff
  // finalization, so it goes through the confirm modal (run checks / skip
  // checks) instead of a bare PATCH. Every other status is still a plain write.
  if (status === "review") {
    openReviewConfirm();
    return;
  }
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
  const task = ui.active;
  const overrideDependencies = await confirmDependencyOverride(task.blockedBy);
  // Opening the body-teleported dialog can dismiss the drawer behind it.
  // Restore the task for either choice so Cancel returns to where Start began.
  if (!ui.active) ui.open(task);
  if (task.blockedBy?.length && !overrideDependencies) return;
  // A dirty worktree means restarting would either resume prior work or
  // discard it — surface that choice instead of starting silently.
  if (task.git?.dirty) {
    restartTask.value = task;
    restartOverrideDependencies.value = overrideDependencies;
    return;
  }
  await startWorkIn(task, overrideDependencies);
}

/** True while the Start-work request (engineer agent launch) is in flight. */
const startingWork = ref(false);

async function startWorkIn(t: Task, overrideDependencies = false): Promise<void> {
  ui.saving = true;
  startingWork.value = true;
  try {
    await repo.startWork(t, "resume", undefined, overrideDependencies);
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
  stopWorkTask.value = ui.active;
  confirmStopWork.value = true;
}

async function confirmAbandonWork(): Promise<void> {
  const task = stopWorkTask.value;
  if (!task) {
    repo.onError(new Error("No task selected to stop."));
    return;
  }
  ui.saving = true;
  try {
    await repo.abandonWork(task);
    confirmStopWork.value = false;
    // The body-teleported modal can dismiss the drawer while it is open.
    // Close intentionally after the request so the result is not dependent
    // on whether the parent drawer survived the modal interaction.
    ui.close();
    // Success: release the captured task. On failure we deliberately keep
    // `stopWorkTask` so the user can dismiss and retry without reopening the
    // drawer — clearing it here would make a retry report "No task selected".
    stopWorkTask.value = null;
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

/** Explicit cancel from the modal: close it and release the captured task. */
function cancelAbandonWork(): void {
  confirmStopWork.value = false;
  stopWorkTask.value = null;
}

/** After a task error's Fix is sent, land on this task's own Debugger view. */
function openDebuggerFromError(): void {
  ui.activeTab = "debug";
  ui.debugView = "debugger";
}

/** Land on this task's Merge conflict view to see exactly what conflicts. */
function openConflictFromError(): void {
  ui.activeTab = "debug";
  ui.debugView = "conflict";
}

/** The Support page is the next step after a failed close-out. Close this
 * drawer only after the local navigation succeeds so the destination is
 * immediately visible instead of sitting behind the task panel. */
async function openSupportFromError(): Promise<void> {
  await router.push({ name: "settings", query: { tab: "support" } });
  ui.close();
}

async function reopenTask(): Promise<void> {
  if (!ui.active) return;
  if (
    !confirm(
      "Reopen this done task? It goes back to ready with a fresh branch on the next Start work.",
    )
  )
    return;
  ui.saving = true;
  try {
    await repo.reopenTask(ui.active);
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

const deleteTaskTarget = ref<{ id: string; title: string } | null>(null);
// Archive confirmation (#0657). Body-teleported like DeleteTaskDialog, so the
// task identity is snapshotted on open — the drawer's dismiss-on-outside can
// null `ui.active` before the confirm handler runs.
const archiveTaskTarget = ref<{ id: string; title: string } | null>(null);
const archiveBusy = ref(false);
const unarchiveBusy = ref(false);
const confirmHotfix = ref(false);
// Stop work confirmation modal state
const confirmStopWork = ref(false);
// The body-teleported confirmation can dismiss the drawer before its confirm
// handler runs, so retain the task identity captured when it was opened.
const stopWorkTask = ref<Task | null>(null);

// HotfixConfirmDialog is body-teleported, so opening it trips the drawer's
// modal dismiss-on-outside and nulls `ui.active` before `startHotfix` runs.
// Snapshot the task on open — same pattern as the send-to-engineer note dialog.
const hotfixTask = ref<Task | null>(null);
function openHotfixConfirm(): void {
  hotfixTask.value = ui.active;
  confirmHotfix.value = true;
}

// #0507: moving to `review` is a REQUEST that starts the handoff finalization
// (scoped `repoos check` → commit gate → `review`), not a status write, so
// every route into it — this drawer's Review button, its status dropdown, the
// board's drag-drop — goes through one confirm modal. ReviewConfirmDialog is
// body-teleported, so snapshot the task on open for the same reason as above:
// the drawer's dismiss-on-outside can null `ui.active` first.
const confirmReview = ref(false);
const reviewTask = ref<Task | null>(null);
function openReviewConfirm(): void {
  if (!ui.active || ui.active.status === "review") return;
  reviewTask.value = ui.active;
  confirmReview.value = true;
}
function closeReviewConfirm(): void {
  confirmReview.value = false;
  reviewTask.value = null;
}
async function confirmReviewWith(runChecks: boolean): Promise<void> {
  const task = reviewTask.value;
  closeReviewConfirm();
  if (!task) return;
  ui.saving = true;
  try {
    await repo.requestReview(task, { skipChecks: !runChecks, origin: "ui-review" });
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

async function deleteTask(): Promise<void> {
  const task = deleteTaskTarget.value;
  if (!task) return;
  ui.saving = true;
  try {
    await repo.deleteTask(task.id);
    deleteTaskTarget.value = null;
    ui.close();
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

function openDeleteConfirm(): void {
  if (ui.active) deleteTaskTarget.value = { id: ui.active.id, title: ui.active.title };
}

function cancelDelete(): void {
  deleteTaskTarget.value = null;
}

function openArchiveConfirm(): void {
  if (ui.active) archiveTaskTarget.value = { id: ui.active.id, title: ui.active.title };
}

function cancelArchive(): void {
  if (!archiveBusy.value) archiveTaskTarget.value = null;
}

async function confirmArchive(detail: string): Promise<void> {
  const task = archiveTaskTarget.value;
  if (!task) return;
  archiveBusy.value = true;
  ui.saving = true;
  try {
    await repo.archiveTask(task, detail);
    archiveTaskTarget.value = null;
    // The task leaves the board for the Archived list; close the drawer rather
    // than leave it pointing at a card that is no longer there.
    ui.close();
  } catch (err) {
    repo.onError(err);
  } finally {
    archiveBusy.value = false;
    ui.saving = false;
  }
}

async function unarchiveActive(): Promise<void> {
  const task = ui.active;
  if (!task) return;
  unarchiveBusy.value = true;
  ui.saving = true;
  try {
    await repo.unarchiveTask(task);
  } catch (err) {
    repo.onError(err);
  } finally {
    unarchiveBusy.value = false;
    ui.saving = false;
  }
}

async function startHotfix(target: "branch" | "main"): Promise<void> {
  const task = hotfixTask.value ?? ui.active;
  if (!task) return;
  const overrideDependencies = await confirmDependencyOverride(task.blockedBy);
  if (task.blockedBy?.length && !overrideDependencies) return;
  ui.saving = true;
  try {
    await repo.activateHotfix(task, target);
    // Selecting a hotfix target is the start action, not merely a mode
    // setting. Launch the engineer immediately so the user sees the task
    // enter active state and its progress tab without a second click.
    await repo.startWork(task, "resume", undefined, overrideDependencies);
    confirmHotfix.value = false;
    // Opening the confirm dialog dismissed the drawer; bring it back on the
    // agent tab where the engineer is now streaming.
    ui.open(repo.tasks.find((t) => t.id === task.id) ?? task);
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
    // Dirty-checkout guard (0204/#0512): pause and show the confirmation modal
    // instead of an inline failure — the task stays in review until the user
    // decides what happens to the uncommitted files.
    if (err instanceof Error && err.name === "DirtyCheckoutError") {
      dirtyTask.value = ui.active;
      return;
    }
    if (err instanceof Error && err.name === "WorktreeHandoffConflictError") {
      handoffConflictTask.value = ui.active;
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

/** True while a Stop MTD request is in flight (#0459). */
const stoppingDone = ref(false);

/**
 * Stop an in-flight close-out (#0459). The server aborts the job and returns
 * the task to `review`; its branch is untouched, so Move to done can be
 * clicked again once the user has inspected what went wrong.
 */
async function stopMtd(): Promise<void> {
  if (!ui.active || stoppingDone.value) return;
  const id = ui.active.id;
  stoppingDone.value = true;
  try {
    await repo.cancelDone(id);
  } catch (err) {
    repo.onError(err);
  } finally {
    stoppingDone.value = false;
  }
}

/** Uncommitted-changes confirmation (0204/#0512): the task whose close-out is
 *  paused on a dirty checkout — `main` (the merge would abort) or the task's own
 *  worktree (close-out would delete the changes). `null` hides the modal. */
const dirtyTask = ref<Task | null>(null);

const dirtyFiles = computed(() => (dirtyTask.value ? repo.dirtyFilesFor(dirtyTask.value.id) : []));
const dirtyScope = computed(() =>
  dirtyTask.value ? repo.dirtyScopeFor(dirtyTask.value.id) : ("main" as const),
);

async function confirmCommitDirty(): Promise<void> {
  const t = dirtyTask.value;
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
    if (err instanceof Error && err.name === "DirtyCheckoutError") {
      dirtyTask.value = t;
      return;
    }
    if (err instanceof Error && err.name === "WorktreeHandoffConflictError") {
      handoffConflictTask.value = t;
      return;
    }
    repo.onError(err);
  } finally {
    doingDone.value = false;
    stopDoneTimer();
    ui.saving = false;
  }
}

const handoffConflictTask = ref<Task | null>(null);
const handoffConflictMessage = computed(() =>
  handoffConflictTask.value
    ? (repo.worktreeHandoffConflictFor(handoffConflictTask.value.id)?.message ?? "")
    : "",
);
const handoffConflictFiles = computed(() =>
  handoffConflictTask.value
    ? (repo.worktreeHandoffConflictFor(handoffConflictTask.value.id)?.dirtyFiles ?? [])
    : [],
);

async function discardHandoffConflict(): Promise<void> {
  const t = handoffConflictTask.value;
  handoffConflictTask.value = null;
  if (!t) return;
  ui.saving = true;
  try {
    await repo.discardWorktreeHandoffEdits(t);
    repo.pushToast("Post-handoff edits discarded — retry Move to done when ready.", "info");
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

async function sendBackHandoffConflict(): Promise<void> {
  const t = handoffConflictTask.value;
  handoffConflictTask.value = null;
  if (!t) return;
  ui.saving = true;
  try {
    await repo.sendBackFromHandoffConflict(t);
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

function cancelHandoffConflict(): void {
  const id = handoffConflictTask.value?.id ?? ui.active?.id;
  if (id) repo.clearWorktreeHandoffConflict(id);
  handoffConflictTask.value = null;
}

function cancelDirty(): void {
  // Use the captured task, not ui.active — the body-teleported dialog dismissed
  // the drawer's modal, so ui.active may already be null here.
  const id = dirtyTask.value?.id ?? ui.active?.id;
  if (id) repo.clearDirtyCheckout(id);
  dirtyTask.value = null;
}

interface TaskDraft {
  title: string;
  type: string;
  priority: string;
  area: string;
  story: string;
  assignedTo: string;
  body: string;
}

const DRAFT_FIELDS = ["title", "type", "priority", "area", "story", "assignedTo", "body"] as const;

function emptyDraft(): TaskDraft {
  return {
    title: "",
    type: "feature",
    priority: "p2",
    area: "",
    story: "",
    assignedTo: "",
    body: "",
  };
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
  draft.story = t.story ?? "";
  draft.assignedTo = t.assignedTo;
  draft.body = t.body;
  baseline();
}

function changedFields(): (keyof TaskDraft)[] {
  return DRAFT_FIELDS.filter((k) => draft[k] !== original[k]);
}

const dirty = computed(() => changedFields().length > 0);
watch(
  dirty,
  (value) => {
    ui.taskEditorDraft = value;
  },
  { immediate: true },
);

/** Radix Select reserves `""` for placeholders; map cleared story to this sentinel. */
const STORY_NONE_SELECT = "__none__";

const storySelectValue = computed(() => {
  const name = draft.story.replace(/\s+/g, " ").trim();
  return name ? name : STORY_NONE_SELECT;
});

const storySelectLabel = computed(() => {
  const name = draft.story.replace(/\s+/g, " ").trim();
  return name || "No story";
});

function onStorySelectUpdate(v: string | null): void {
  draft.story = !v || v === STORY_NONE_SELECT ? "" : v;
}

const assignedStoryName = computed(() => draft.story.replace(/\s+/g, " ").trim());

/**
 * The New task panel's own story control (#0555): same options, same "none"
 * sentinel, same label as the details form's — but bound to `ui.nt`, the
 * new-task form. The two never render at once (`ui.isNew` vs `ui.active`), and
 * sharing the state object between the create form and the edit form would let
 * one leak into the other.
 */
const ntStorySelectValue = computed(() => normalizeStoryName(ui.nt.story) || STORY_NONE_SELECT);
const ntStorySelectLabel = computed(() => normalizeStoryName(ui.nt.story) || "No story");

function onNtStorySelectUpdate(v: string | null): void {
  ui.nt.story = normalizeStoryName(!v || v === STORY_NONE_SELECT ? "" : v);
}

const showStoryOpenLink = computed(() => storiesEnabled.value && Boolean(assignedStoryName.value));

const storyOpenAccessibleLabel = computed(() => storyOpenLabel(draft.story, repo.storyDefinitions));

function openAssignedStory(): void {
  const ref = storyDeepLinkRef(draft.story, repo.storyDefinitions);
  if (!ref) return;
  ui.close();
  void router.push({ name: "stories", query: { story: ref } });
}

/**
 * "Open in editor" on the Spec row (#0636). Reuses the copy-inspector's
 * configured editor command (`dev.inspector.editorCommand`) and its dev-only
 * API gate, so a task markdown can be opened in the same editor with no
 * separate setting. The link only appears when it can actually work: the dev
 * API is available and a command is configured.
 */
const editorConfigured = computed(() => {
  const inspector = (
    config.data?.dev as { inspector?: { enabled?: boolean; editorCommand?: string } } | undefined
  )?.inspector;
  if (inspector?.enabled === false) return false;
  const cmd = inspector?.editorCommand;
  return repo.health?.copyInspectorAvailable === true && typeof cmd === "string" && !!cmd.trim();
});

const openInEditorLabel = "Open this task's markdown file in your configured editor";

async function openTaskInEditor(): Promise<void> {
  const task = ui.active;
  if (!task || !editorConfigured.value) return;
  try {
    await api("/api/dev/open-in-editor", JSON_OPTS("POST", { file: task.path }));
  } catch (err) {
    repo.pushToast(err instanceof Error ? err.message : "Could not open editor", "error");
  }
}

const transitioned = computed(() => !!(ui.active && repo.transitionState?.id === ui.active.id));

// ---- Area multi-select (#0583) ----
//
// Both the edit form and the New task panel keep their area value as the
// canonical comma-joined string (exactly what the API writes); the picker
// works on the parsed list. The effective vocabulary comes from the server's
// computed `areaVocabulary` (`[areas]` + every preview target area) — with
// none configured the picker degrades to its free-text entry only.

/** The effective area vocabulary; empty until the config load lands. */
const areaOptions = computed<{ name: string; description?: string }[]>(() => {
  const v = (config.data ?? {})["areaVocabulary"];
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => {
      if (typeof e === "string") return { name: e };
      const o = e as { name?: unknown; description?: unknown };
      if (typeof o.name !== "string" || !o.name.trim()) return null;
      return {
        name: o.name,
        ...(typeof o.description === "string" && o.description.trim()
          ? { description: o.description }
          : {}),
      };
    })
    .filter((e): e is { name: string; description?: string } => e !== null);
});

/**
 * Whether the user has edited the New task area for the current open (#0587).
 * The default is applied when the drawer opens, but `/api/config` may not have
 * landed yet at that point; once the vocabulary arrives we fill a still-empty,
 * untouched field — and never override a deliberate choice, including clearing.
 */
const ntAreaTouched = ref(false);

/** List view of the New task form's comma-joined area field. */
const ntAreaList = computed<string[]>({
  get: () => parseTaskAreas(ui.nt.area),
  set: (v) => {
    ntAreaTouched.value = true;
    ui.nt.area = v.length ? formatTaskAreas(v) : "";
  },
});

// A new open starts untouched, so the late-arriving default can apply.
watch(
  () => ui.isNew,
  (open) => {
    if (open) ntAreaTouched.value = false;
  },
);

/**
 * Backfill the New task default once the vocabulary lands (#0587): opening the
 * drawer before `/api/config` resolves would otherwise leave the field empty
 * for a repo that does declare areas.
 */
watch(
  () => [ui.isNew, areaOptions.value.map((o) => o.name).join("\n")] as const,
  () => {
    if (!ui.isNew || ntAreaTouched.value || ui.nt.area) return;
    const first = areaOptions.value[0]?.name;
    if (first) ui.nt.area = first;
  },
  { immediate: true },
);

/** List view of the edit draft's comma-joined area field. */
const draftAreaList = computed<string[]>({
  get: () => parseTaskAreas(draft.area),
  set: (v) => {
    draft.area = v.length ? formatTaskAreas(v) : "";
  },
});

/**
 * Offer a newly typed area to the repo's declared vocabulary: add it to the
 * persisted `[areas]` list (descriptions of unchanged names are preserved
 * server-side). Uses `config.save`, which PATCHes and then re-reads the
 * /api/config payload — so `areaVocabulary` (and the picker's rows) update
 * live and repeat adds never depend on a page reload. Two drawers saved at
 * once are still last-write-wins on the whole list (there is no per-row
 * append endpoint), but the window is a single round-trip and a re-opened
 * Settings always shows the server's truth.
 */
async function addAreaToVocabulary(name: string): Promise<void> {
  const current = parseTaskAreas(config.form.areas as unknown);
  if (!current.some((s) => s.toLowerCase() === name.toLowerCase())) current.push(name);
  await config.save({ areas: current });
}

/**
 * Planning has ended, so the branch is frozen. The title is deliberately NOT
 * gated by this (#0569): renaming a task never rewrites its branch, and the
 * title stays editable in place for the whole life of the task.
 */
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

/** Opens the spec edit modal on a real click, but not when the mouseup that
 *  ends a text-selection drag also fires as a click on the card — otherwise
 *  highlighting a line of the spec to copy it immediately yanks you into the
 *  editor instead. */
function handleSpecCardClick(): void {
  if (window.getSelection()?.toString()) return;
  openSpecModal();
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

// ---- in-place title editing (#0569) ----
//
// The header title is the single title surface. Clicking it swaps the text for
// an input in the same slot. Enter or blur commits and autosaves through the
// same `patchTask` path the details form uses; Esc cancels the edit. The title
// stays editable after planning (unlike the branch): renaming a task never
// touches its branch, so this only derives a new branch while `locked` is false
// (same rule as saveDraft).

/** True while the header title is showing its input. */
const titleEditing = ref(false);
/** Working copy of the title while editing; never bound to `ui.active`. */
const titleDraft = ref("");
const titleInputEl = ref<HTMLInputElement | null>(null);

function beginTitleEdit(): void {
  if (!ui.active) return;
  titleDraft.value = ui.active.title;
  titleEditing.value = true;
  void nextTick(() => {
    const el = titleInputEl.value;
    if (!el) return;
    el.focus();
    el.select();
  });
}

function cancelTitleEdit(): void {
  titleEditing.value = false;
  titleDraft.value = "";
}

async function commitTitleEdit(): Promise<void> {
  // Guard against the blur that follows the unmount in cancel/commit.
  if (!titleEditing.value) return;
  const next = titleDraft.value.trim();
  titleEditing.value = false;
  titleDraft.value = "";
  if (!ui.active || !next || next === ui.active.title) return;
  await saveTitle(next);
}

/** Autosaves an in-place title edit; mirrors saveDraft's branch rule. */
async function saveTitle(title: string): Promise<void> {
  const t = ui.active;
  if (!t) return;
  const patch: Record<string, string> = { title };
  if (!locked.value) {
    const prevDerived = `feat/${slugify(t.title)}`;
    const hadDerived = t.branch === "" || t.branch === prevDerived;
    if (hadDerived) patch.branch = `feat/${slugify(title)}`;
  }
  ui.saving = true;
  try {
    await repo.patchTask(t.id, patch);
    // Keep the details draft in step so a later Save of another field neither
    // re-sends the title nor derives the branch from a stale value.
    draft.title = title;
    original.title = title;
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

// Opening a different task (or closing the drawer) abandons any in-flight edit.
watch(
  () => ui.active?.id,
  () => {
    titleEditing.value = false;
    titleDraft.value = "";
  },
);

// ---- read-only worktree preview ----

/** True while a preview start/stop request is in flight. */
const previewBusy = ref(false);
/**
 * Which task the in-flight preview action belongs to. The drawer is a single
 * component instance whose content swaps to whatever `ui.active` is — if the
 * user opens a different task while a previous task's preview request is
 * still in flight, `previewBusy` alone would make the NEW task's drawer show
 * "Starting preview…" too, even though that request is for a different task
 * entirely (found live, 2026-09-17). `isPreviewBusyForActive` below is what
 * the template must check, never the bare `previewBusy`.
 */
const previewTaskId = ref<string | null>(null);
const isPreviewBusyForActive = computed(
  () => previewBusy.value && previewTaskId.value === ui.active?.id,
);
/** Which preview action is in flight, so the progress state can name it. */
const previewAction = ref<"start" | "stop" | null>(null);
/**
 * Preview targets the open task's area resolves to (#0379). Supplied by the
 * server (board + GET /api/tasks/:id); more than one means the area is claimed
 * by several `[[preview.targets]]` and the user must choose.
 */
const previewTargets = computed(() => ui.active?.previewTargets ?? []);
/** True when the user must pick a target before starting (#0379). */
const previewTargetChoiceRequired = computed(() => previewTargets.value.length > 1);
/** The target the user picked from the multi-target picker (#0379). */
const previewTarget = ref<string | null>(null);
/**
 * The target a start would serve: the explicit pick, else the sole matching
 * target. Null while the user must choose one and hasn't.
 */
const effectivePreviewTarget = computed<string | null>(
  () =>
    previewTarget.value ??
    (previewTargets.value.length === 1 ? (previewTargets.value[0]?.name ?? null) : null),
);
// A target picked for one task must never carry over to another — reset the
// choice (not the targets, which come from the task) whenever the drawer swaps.
// When several targets are listed, the top-ranked one is already the default
// choice, so the dropdown shows the same selection the server would resolve.
watch(
  () => ui.active?.id,
  () => {
    previewTarget.value = previewTargets.value[0]?.name ?? null;
  },
);
watch(
  () => previewTargets.value.map((t) => t.name).join("|"),
  () => {
    if (!previewTargets.value.length) {
      previewTarget.value = null;
      return;
    }
    if (!previewTarget.value || !previewTargets.value.some((t) => t.name === previewTarget.value)) {
      previewTarget.value = previewTargets.value[0]?.name ?? null;
    }
  },
  { immediate: true },
);
/** When the in-flight preview action began, for the live elapsed readout. */
const previewStartedAt = ref<number | null>(null);
/** Ticks once a second while a preview action is in flight (see below). */
const previewTick = ref(Date.now());
let previewTimer: number | undefined;

function startPreviewTimer(): void {
  if (previewTimer !== undefined) return;
  previewTick.value = Date.now();
  previewTimer = window.setInterval(() => {
    previewTick.value = Date.now();
  }, 1000);
}
function stopPreviewTimer(): void {
  window.clearInterval(previewTimer);
  previewTimer = undefined;
}
onUnmounted(stopPreviewTimer);

/**
 * Elapsed ms of the in-flight preview action; 0 when idle.
 *
 * The readout in the template only appears after the first second: a fast
 * preview (sub-2s) flashes the spinner and resolves before a "0s" counter is
 * ever shown, while a slow command gets a steadily ticking elapsed time — the
 * two no longer look identical (#0374). There is no artificial minimum
 * duration; the state clears the instant the request resolves.
 *
 * Backend boot progress is deliberately not surfaced here: `preview.ts` only
 * captures stderr, which a successful boot usually has none of, and streaming
 * it would need a new SSE event plus a drawer log region — a full log viewer,
 * well beyond this feedback task. A spinner + ticking elapsed covers the wait.
 */
const previewElapsedMs = computed(() =>
  previewStartedAt.value === null ? 0 : Math.max(0, previewTick.value - previewStartedAt.value),
);

/**
 * Run one preview start/stop request with shared busy/label state. Start and
 * stop are separate buttons but share `previewBusy`, so routing both through
 * here is what keeps the timer/label from drifting between them.
 */
async function runPreviewAction(action: "start" | "stop"): Promise<void> {
  if (!ui.active || previewBusy.value) return;
  // Never silently pick when the task matches several targets: the Start
  // button is disabled until one is chosen, and this guards the API path too.
  if (action === "start" && previewTargetChoiceRequired.value && !effectivePreviewTarget.value)
    return;
  const task = ui.active;
  previewBusy.value = true;
  previewTaskId.value = task.id;
  previewAction.value = action;
  previewStartedAt.value = Date.now();
  startPreviewTimer();
  try {
    if (action === "start")
      await repo.startPreview(task, effectivePreviewTarget.value ?? undefined);
    else await repo.stopPreview(task);
  } catch (err) {
    repo.onError(err);
  } finally {
    previewBusy.value = false;
    previewTaskId.value = null;
    previewAction.value = null;
    previewStartedAt.value = null;
    stopPreviewTimer();
  }
}

function stopPreview(): Promise<void> {
  return runPreviewAction("stop");
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
function startPreview(): Promise<void> {
  return runPreviewAction("start");
}

// ---- agent review (0101) ----

/**
 * The review agent's report on the open task. It is advisory: it exists to
 * inform the human's sign-off, never to perform it — the "Move to done" button
 * above stays the only way a task reaches `done`.
 */
const review = computed<ReviewState | null>(() =>
  ui.active ? (repo.reviews[ui.active.id] ?? null) : null,
);

/** An older verdict must not be presented as the result of a newer handoff. */
const previousReview = computed(() => {
  const task = ui.active;
  const report = review.value?.report;
  return Boolean(task && report && reportPredatesLatestHandoff(task, report.at));
});
const awaitingFreshReview = computed(
  () =>
    ui.active?.status === "review" &&
    ui.active.needsInputReason !== "review-failed" &&
    previousReview.value &&
    !review.value?.running &&
    !repo.isRunning(ui.active.id) &&
    !inPipeline.value,
);

/**
 * The skill-suggestion task auto-created from this task's session (#0405), if
 * one was. The server records the created task's id in the origin task's
 * frontmatter as `skill_suggestion`; it surfaces here as a one-line note in
 * the Review tab so the reviewer sees it alongside the code review.
 */
const skillSuggestionId = computed<string | null>(() => {
  const v = ui.active?.extra?.skill_suggestion;
  return typeof v === "string" && v ? v : null;
});

function openSkillSuggestion(): void {
  const id = skillSuggestionId.value;
  if (!id) return;
  const suggestion = repo.tasks.find((t) => t.id === id);
  if (suggestion) void ui.openTask(suggestion);
}

/**
 * The current review substate for a task sitting in `review`:
 * `reviewing` (auto review in progress), `coding` (engineer making changes),
 * or nothing when the review passed (good to go) and no chip is warranted.
 */
const activeNeedsInputQuestions = computed(() => (ui.active?.questions?.length ?? 0) > 0);

/**
 * The Debugger's one-line tl;dr for the current failure (#0570), rendered as a
 * callout above the tabs. Additive to the "waiting for you" banner: it only
 * exists while the flag behind that banner is set, and the "diagnosing…"
 * hint covers the window between the failure and the sentence arriving (it
 * disappears for good if the Debugger is disabled or its run fails).
 */
const activeTldrSentence = computed(() => ui.active?.debugTldr?.trim() || "");
const activeTldrDiagnosing = computed(
  () => !!ui.active && !activeTldrSentence.value && repo.debugTldrWorkingFor(ui.active.id),
);

/** Agent `questions:` frontmatter — one dedicated banner, not the generic needs-input strip. */
const showAgentQuestionsBanner = computed(() => {
  if (!ui.active?.needsInput || !ui.active.questions?.length) return false;
  if (handoffBusy.value || awaitingFreshReview.value || staleNeedsInputOnReview.value) {
    return false;
  }
  const key = resolveNeedsInputReasonKey(ui.active.needsInputReason, true);
  return key === "questions" || key === "cto-escalation";
});

const staleNeedsInputOnReview = computed(() =>
  ui.active ? needsInputSuppressedOnReview(ui.active) : false,
);

const needsInputHeaderChip = computed<{ label: string; cls: string } | null>(() => {
  if (!ui.active || !needsInputSurfaces(ui.active)) return null;
  // The dedicated question banner already signals this — avoid a second chip (#0566).
  if (showAgentQuestionsBanner.value) return null;
  // A stale flag must not hide a live review or engineer session (#0511 R2).
  if (review.value?.running || repo.isRunning(ui.active.id) || handoffBusy.value) return null;
  return {
    label: needsInputStatusLabel(ui.active.needsInputReason, activeNeedsInputQuestions.value),
    cls: "rs-needs-input",
  };
});

const reviewSubstate = computed<{ label: string; cls: string } | null>(() => {
  if (!ui.active || ui.active.status !== "review") return null;
  if (review.value?.running) return { label: "reviewing", cls: "rs-reviewing" };
  if (awaitingFreshReview.value) return { label: "awaiting fresh review", cls: "rs-reviewing" };
  if (repo.isRunning(ui.active.id)) {
    // A running agent on an already-review task, outside auto-review, means
    // the server silently resumed the engineer to fix a post-handoff
    // `repoos check` failure or resolve a close-out merge conflict
    // (handoff.ts's scheduleCheckFailureRetry / scheduleMergeConflictRetry) —
    // never that the task regressed to active. Label it distinctly. The
    // counters are read through the shared helper so they survive the full
    // Task a `task.updated` SSE payload carries (they live in `extra` there).
    if (retryCountFrom(ui.active, "mergeConflict")) {
      return { label: "fixing merge conflict", cls: "rs-coding" };
    }
    return retryCountFrom(ui.active, "check")
      ? { label: "fixing check failure", cls: "rs-coding" }
      : { label: "coding", cls: "rs-coding" };
  }
  if (review.value?.report?.state === "incomplete") {
    return { label: "review incomplete", cls: "rs-incomplete" };
  }
  // A "good to go" verdict needs nothing from the human beyond the normal
  // Move to done, so it shows no chip: a "waiting for human" label read like
  // an unanswered question (needs_input has its own chip).
  if (verdict.value?.label === "good to go") return null;
  if (verdict.value) {
    return { label: "review findings", cls: "rs-incomplete" };
  }
  return null;
});

/** Compact lifecycle counts: D = dev passes, R = review passes. The server
 * bumps `review_passes` only when a review finishes with a parseable verdict
 * (auto and manual "Review again" alike), so these track completed review
 * rounds rather than `review_rounds`, which is a separate auto-bounce
 * bookkeeping counter capped at MAX_AUTO_REVIEW_ROUNDS. Fall back to
 * `review_rounds` only for tasks written before that field. */
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
const reviewSuperseded = computed(() => {
  const task = ui.active;
  const report = review.value?.report;
  return reviewSupersededByFixRound(
    task ?? { status: "inbox", body: "" },
    report?.at,
    Boolean(task && repo.isRunning(task.id)),
  );
});

const reviewStale = computed(() =>
  Boolean(
    review.value?.report &&
    (review.value.running || previousReview.value || reviewSuperseded.value),
  ),
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

/**
 * The rendered reviewer conversation (report streaming + human messages).
 * Grouped exactly like the engineer log — same `toDisplayRows`, same shared
 * tool-call row — so a review reads the same way the work did.
 */
const reviewEntries = computed<DisplayRow[]>(() => toDisplayRows(review.value?.lines ?? []));

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
// SendToEngineerDialog is a body-teleported layer, so opening it (or moving
// focus into it) trips the drawer's modal dismiss-on-outside and nulls
// `ui.active` before the confirm handler runs. Snapshot the task and its report
// when the dialog opens — same pattern as RestartTaskDialog / DirtyCheckoutDialog.
const engineerNoteTask = ref<Task | null>(null);
const engineerNoteReport = ref<ReviewState["report"]>(null);
async function sendToEngineer(): Promise<void> {
  const task = ui.active;
  const report = review.value?.report ?? null;
  if (!task || !report || reviewStale.value || reviewBusy.value || sendingToEngineer.value) return;
  engineerNoteTask.value = task;
  engineerNoteReport.value = report;
  engineerNoteOpen.value = true;
}
async function confirmSendToEngineer(note: string): Promise<void> {
  const task = engineerNoteTask.value;
  const report = engineerNoteReport.value;
  if (!task || !report) {
    // Surface the failure rather than silently discarding the typed note: keep
    // the dialog open so the human keeps their text and can retry once the
    // review report is available.
    repo.onError(
      new Error(
        report
          ? "No task selected to send to engineer."
          : "Reviewer report is not ready yet. Wait for the review to finish, then try again.",
      ),
    );
    return;
  }
  const overrideDependencies = await confirmDependencyOverride(task.blockedBy);
  if (task.blockedBy?.length && !overrideDependencies) return;
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
    await repo.startWork(task, "resume", instruction, overrideDependencies);
    // Opening the note dialog dismissed the drawer (see above), so bring it
    // back on the agent tab where the resumed engineer is now streaming.
    ui.open(repo.tasks.find((t) => t.id === task.id) ?? task);
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
/** Open task questions for the PM answer flow, scoped to one task id. */
const pmAnswerContext = ref<{ taskId: string; questions: string[] } | null>(null);
const pmSubmitting = ref(false);
/** The shared PM chat surface, for focusing the composer after routing to PM. */
const pmSurface = ref<InstanceType<typeof PmChatSurface> | null>(null);

// 0513: pending PM screenshots open the shared full-size viewer. Kept here, in
// the host, because the host owns the shot list — the shared <PmChatSurface>
// only reports which index was clicked.
const pmViewerOpen = ref(false);
const pmViewerStart = ref(0);
const pmViewerShots = computed(() => pendingToShots(ui.pmScreenshots));
function openPmViewer(index: number): void {
  pmViewerStart.value = index;
  pmViewerOpen.value = true;
}

/** Screenshots picked for the next PM message (0381), into the shared buffer. */
function onPmShotFiles(files: File[]): void {
  if (files.length) ui.addPmScreenshots(files);
}

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
  () => pmSubmitting.value || (ui.active && repo.runningIds.includes(pmSessionId(ui.active.id))),
);

// The PM chat's scroll, transcript grouping, compose box, Enter-to-send,
// auto-grow and canned-prompt behaviour all live in <PmChatSurface> (#0515) —
// this drawer passes data in and handles events. It deliberately keeps no
// `useChatScroll` of its own: a second instance here would hold a ref to a log
// element that no longer exists in this component, and the drawer's other chats
// (Dev, Review) have their own.

/**
 * Canned messages shown above the PM compose box, keyed by task status.
 * Empty (no chips) for statuses without a defined set.
 */
// The surface decides whether the canned prompts are visible and sends the
// chosen one, so this only supplies the list.
const pmCannedMessages = computed(() => {
  const t = ui.active;
  return t ? pmCannedMessagesFor(t.status) : [];
});

function openPmToAnswerQuestions(): void {
  if (!ui.active?.questions?.length) return;
  ui.activeTab = "pm";
  pmAnswerContext.value = { taskId: ui.active.id, questions: [...ui.active.questions] };
  pmDraft.value = "";
  void nextTick(() => pmSurface.value?.focusDraft());
}

function clearPmAnswerContext(clearDraft = false): void {
  pmAnswerContext.value = null;
  if (clearDraft) pmDraft.value = "";
}

function pmOpenQuestionsForActive(): string[] {
  const ctx = pmAnswerContext.value;
  if (!ctx || !ui.active || ctx.taskId !== ui.active.id) return [];
  return ctx.questions;
}

async function pmSend(): Promise<void> {
  const text = pmDraft.value.trim();
  if (!text || pmBusy.value || !pmAgentEnabled.value || !ui.active) return;

  const sendTaskId = ui.active.id;
  pmSubmitting.value = true;
  const ctx = pmAnswerContext.value;
  const answeringQuestions =
    ctx && ctx.taskId === sendTaskId && ctx.questions.length > 0 ? [...ctx.questions] : null;
  const optimistic: AgentOutputEntry = { type: "human", text, at: new Date().toISOString() };
  const sessionId = pmSessionId(sendTaskId);
  const optimisticIndex = (repo.outputs[sessionId] ?? []).length;
  repo.outputs[sessionId] = [...(repo.outputs[sessionId] ?? []), optimistic];
  pmDraft.value = "";
  if (answeringQuestions) clearPmAnswerContext(false);
  // Same wire shape as the per-task attachment upload: base64 without the
  // data-URL prefix. Kept locally until the send succeeds so a failure
  // doesn't lose the user's picks.
  const shots = ui.pmScreenshots.map((s) => ({
    name: s.name,
    mime: s.mime,
    data: s.dataUrl.split(",")[1] ?? "",
  }));
  // No explicit scroll-to-latest: the optimistic line above grows the log, and
  // the surface's `useChatScroll` follows it because the reader is at the
  // bottom (they just typed). Same rule every other chat follows.

  try {
    await api(
      `/api/tasks/${sendTaskId}/pm/message`,
      JSON_OPTS("POST", {
        text,
        answeringQuestions: answeringQuestions ?? undefined,
        agentOverride: pmOverrideDraft.agent || undefined,
        cliOverride: pmOverrideDraft.cli || undefined,
        modelOverride: pmOverrideDraft.model || undefined,
        images: shots.length ? shots : undefined,
      }),
    );
    ui.clearPmScreenshots();
  } catch (error) {
    repo.outputs[sessionId] = (repo.outputs[sessionId] ?? []).filter(
      (_entry, index) => index !== optimisticIndex,
    );
    if (ui.active?.id === sendTaskId) {
      pmDraft.value = text;
      if (answeringQuestions) {
        pmAnswerContext.value = { taskId: sendTaskId, questions: answeringQuestions };
      }
    }
    repo.outputs[sessionId] = [
      ...(repo.outputs[sessionId] ?? []),
      { type: "sys", d: error instanceof Error ? error.message : String(error) },
    ];
    repo.onError(error);
  } finally {
    pmSubmitting.value = false;
  }
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

// Switching tasks changes the surface's `chatId`, and `useChatScroll` restores
// that conversation's remembered position itself (or opens on the newest
// message) — so there is no per-task scroll reset to do here.

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
    const key = ui.active ? `task:${ui.active.id}:pm` : "";
    pmOverrideDraft.model = modelForCliSwitch(key, newCli);
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
    const key = ui.active ? `task:${ui.active.id}:review` : "";
    reviewOverrideDraft.model = modelForCliSwitch(key, newCli);
  },
);

watch(
  () => [reviewOverrideDraft.agent, reviewOverrideDraft.cli, reviewOverrideDraft.model],
  () => {
    scheduleReviewOverrideSave();
  },
);

// ---- agent session tab ----

/**
 * The rendered transcript for the open task. Legacy `{s,d}` lines render as
 * today (ANSI stripped); structured entries become text blocks, human turns,
 * grouped tool-call rows and system lines.
 *
 * All of that is decided by the shared `toDisplayRows` (#0506) — this log, the
 * reviewer conversation and every other chat in the app draw the same rows, so
 * a run of tool calls is one expandable row with counts and the time it
 * finished, everywhere, for every agent.
 */
const displayEntries = computed<DisplayRow[]>(() => {
  const src = ui.active ? (repo.outputs[ui.active.id] ?? []) : [];
  return toDisplayRows(src);
});
/** A follow-up message typed in the Agent tab. */
const draftMsg = ref("");
function updateChatDraftDirty(): void {
  ui.unsentTaskChatDraft =
    pmDraft.value.trim().length > 0 ||
    reviewDraftMsg.value.trim().length > 0 ||
    draftMsg.value.trim().length > 0;
}
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

/** "@shared fmtTokens" — "1.842M" / "0.013M" / "842", "—" when unreported. */

/** "$0.031" / "$1.20" — "unknown" when the CLI hasn't reported a cost, so it
 *  is never read as firm USD or as zero. Kiro credits and mixed sources are
 *  labeled too (0230 / #0676). */
function fmtCost(usd: number | null | undefined, source?: string): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd) || source === "estimate") {
    return "unknown";
  }
  const n = usd < 1 ? usd.toFixed(3) : usd.toFixed(2);
  if (source === "kiro-credits") return `${n} credits`;
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

/** Tooltip for a session's cache cell: raw read/write counts, or a "not reported" note. */
function cacheCellTitle(s: SessionUsage): string {
  if (s.cacheReadTokens == null && s.cacheCreationTokens == null) {
    return "no prompt-cache figures reported by this CLI";
  }
  const parts = [`${fmtTokens(s.cacheReadTokens)} read from cache`];
  if (s.cacheCreationTokens) parts.push(`${fmtTokens(s.cacheCreationTokens)} written`);
  return `${parts.join(" · ")} — cumulative over the turn's model calls`;
}

/**
 * Local-time label for a session's start/end timestamp. `withDate` is false by
 * default so the columns show only the time ("3:14 PM"); passing true adds the
 * month/day ("Aug 20, 3:14 PM"). Local time, never UTC — `toLocale*` with
 * explicit options, no manual math.
 */
function fmtSessionTime(iso: string | null, withDate = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const opts: Intl.DateTimeFormatOptions = withDate
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { hour: "numeric", minute: "2-digit" };
  return d.toLocaleString(undefined, opts);
}

const needsInputPrimary = computed(() => {
  if (!ui.active?.needsInput) return null;
  return needsInputPrimaryAction(ui.active.needsInputReason, activeNeedsInputQuestions.value, {
    status: ui.active.status,
    agentRunning: repo.isRunning(ui.active.id),
  });
});

const dismissNeedsInputBusy = ref(false);

// The "Dismiss" button itself is the confirmation — it's a deliberate,
// clearly-labeled secondary action, never the default/primary one, so a
// native browser confirm() on top of it was a redundant second prompt.
async function dismissNeedsInputFlag(): Promise<void> {
  if (!ui.active || dismissNeedsInputBusy.value) return;
  const task = ui.active;
  dismissNeedsInputBusy.value = true;
  try {
    const updated = await repo.dismissNeedsInput(task.id);
    ui.syncActive(updated);
  } catch (err) {
    repo.onError(err);
  } finally {
    dismissNeedsInputBusy.value = false;
  }
}

const clearWorktreeBusy = ref(false);

// Discards the kept worktree, so the button label names it; the server refuses
// unless the task is done and its branch is already merged into main.
async function clearKeptWorktree(): Promise<void> {
  if (!ui.active || clearWorktreeBusy.value) return;
  const task = ui.active;
  clearWorktreeBusy.value = true;
  try {
    const updated = await repo.clearKeptWorktree(task.id);
    ui.syncActive(updated);
  } catch (err) {
    repo.onError(err);
  } finally {
    clearWorktreeBusy.value = false;
  }
}

async function runNeedsInputPrimaryAction(): Promise<void> {
  if (!ui.active || !needsInputPrimary.value) return;
  const action = needsInputPrimary.value;
  if (action.kind === "restart") {
    await startWork();
    return;
  }
  if (action.kind === "review") {
    ui.activeTab = "review";
    await reviewAgain();
    return;
  }
  if (action.kind === "send-engineer") {
    ui.activeTab = "review";
    await sendToEngineer();
    return;
  }
  if (action.kind === "send-pm") {
    if (!pmAgentEnabled.value) {
      repo.onError(new Error("PM agent is not configured — enable it on the Agents page"));
      return;
    }
    if (pmBusy.value) {
      repo.onError(new Error("PM is busy — wait for the current run to finish"));
      return;
    }
    ui.activeTab = "pm";
    pmDraft.value = PM_FLESH_OUT_CANNED_MESSAGE;
    await pmSend();
    return;
  }
  if (ui.active.questions?.length) {
    openPmToAnswerQuestions();
    return;
  }
  ui.activeTab = "pm";
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
    void repo.loadOutput(pmSessionId(ui.active.id));
  },
);

/** Diff stats for the active task. */
const taskDiffStats = computed(() => {
  return ui.active ? repo.diffStatsFor(ui.active.id) : undefined;
});

/**
 * #0647 — the worktree has edits that aren't committed on the branch yet, so
 * the branch is dirty. The Changes tab's patch already carries them: `getDiff`
 * diffs the merge-base against the *working tree*, so staged and unstaged
 * edits land in the same patch as the commits. This only decides whether to
 * offer the shortcut to the full-screen diff — it is never a second renderer.
 */
const worktreeDirty = computed(() => !!ui.active?.git?.dirty);

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
    void repo.loadDiffStats(ui.active.id, { priority: true });
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

/** Whether the started/ended columns show the date along with the time
 *  (collapsed by default, so they show time-only — local, not UTC). Clicking
 *  either column header toggles both columns together (same affordance as the
 *  agent/model column above). */
const sessionTimesExpanded = ref(false);

function toggleSessionTimeExpand(): void {
  sessionTimesExpanded.value = !sessionTimesExpanded.value;
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

/**
 * Load captured preview shots (#0582) whenever the drawer's task changes — not
 * just when the Changes tab opens, so the area/target mismatch warning is
 * available next to the preview control too. Re-loading on a tab switch means a
 * shot captured while the drawer was open appears when you return to Changes.
 */
watch(
  () => [ui.active?.id, ui.activeTab],
  () => {
    const id = ui.active?.id;
    if (id) {
      void repo.loadShots(id);
      void repo.loadUiVerification(id);
    }
  },
  { immediate: true },
);

/**
 * Open the full-screen diff view (`DiffView`) for the active task and close the
 * drawer behind it. The per-file expand buttons pass that file so the view
 * lands on it; #0647's dirty-worktree button passes nothing, and `DiffView`
 * falls back to the first file in the patch. One navigation, two callers.
 */
function openFullDiff(file?: DiffFile): void {
  if (!ui.active) return;
  const taskId = ui.active.id;
  ui.close();
  router.push({
    name: "diff",
    params: { taskId },
    query: file ? { file: file.filename } : {},
  });
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
function cliOptionsFor(currentCli: string): string[] {
  const options = cliOptions.value.filter(
    (cli) =>
      cli !== "antigravity" || detectedDrivableClis.value.has("antigravity") || cli === currentCli,
  );
  // Keep a legacy or otherwise historical saved value visible until the user
  // chooses a replacement; this does not make it a new selectable assignment.
  return currentCli && !options.includes(currentCli) ? [currentCli, ...options] : options;
}
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

/**
 * The agent the engineer run will ACTUALLY use, resolved by the shared
 * `resolveEffectiveAgent` helper (the same logic the server's
 * `resolveAgentForTask` applies, and the board card's robot toggle shows).
 *
 * Shown in the run header so "which agent is coding this" is never a guess
 * (the field report's driver believed two tasks ran on Cursor when they ran on
 * DeepSeek, #0684).
 */
const effectiveEngineer = computed(() => {
  const t = ui.active;
  if (!t) return null;
  return resolveEffectiveAgent(
    config.agents ?? [],
    { agentOverride: t.agentOverride, cliOverride: t.cliOverride, modelOverride: t.modelOverride },
    "engineer",
  );
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
  (t) => {
    if (t && !overrideDirty.value) initOverrideDraft(t);
  },
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
 * When the CLI changes, restore a remembered pin for this task+CLI (#0342 /
 * #0360) — never blindly take `modelsFor(cli)[0]` ("default"). Runs in the
 * same flush as the v-model update so the auto-save watch captures the
 * correct model — no flicker, no stale-model-then-fix cycle.
 */
watch(
  () => overrideDraft.cli,
  (newCli, oldCli) => {
    if (agentCliResetSuppressed) return;
    if (!newCli || newCli === oldCli) return;
    const key = ui.active ? `task:${ui.active.id}:agent` : "";
    overrideDraft.model = modelForCliSwitch(key, newCli);
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

/**
 * True while `initFreeformOverrides` is assigning from the PM base. Without
 * this, the CLI→model watcher sees `"" → "opencode"` on first open and wipes
 * the just-copied PM pin with `"default"` (#0400).
 */
let freeformCliResetSuppressed = false;

/** Initialize freeform overrides from the PM agent defaults. */
function initFreeformOverrides(): void {
  const base = freeformPmBase.value;
  freeformCliResetSuppressed = true;
  freeformOverride.agent = base?.name || "";
  freeformOverride.cli = base?.cli || "";
  freeformOverride.model = base?.model || "";
  nextTick(() => {
    freeformCliResetSuppressed = false;
  });
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
    if (freeformCliResetSuppressed) return;
    if (!newCli || newCli === oldCli) return;
    freeformOverride.model = modelForCliSwitch("panel:new-task", newCli);
  },
);

// Re-fit each compose textarea when its value changes programmatically (the
// post-send reset, a restored draft) — those paths emit no `input` event, and
// `immediate` covers a value already populated when the field first mounts.
// Live typing is handled by each field's `@input` binding.
watch(
  () => pmDraft.value,
  () => {
    updateChatDraftDirty();
    // No auto-grow call here: the surface grows its own textarea whenever the
    // draft changes (#0515).
  },
  { immediate: true },
);
watch(
  () => ui.active?.id,
  (newId, oldId) => {
    if (oldId != null && newId !== oldId) {
      const hadAnswerFlow = pmAnswerContext.value?.taskId === oldId;
      clearPmAnswerContext(hadAnswerFlow);
    }
  },
);
watch(
  () => reviewDraftMsg.value,
  () => {
    updateChatDraftDirty();
    nextTick(adjustReviewHeight);
  },
  { immediate: true },
);
watch(
  () => draftMsg.value,
  () => {
    updateChatDraftDirty();
    nextTick(adjustDraftMsgHeight);
  },
  { immediate: true },
);
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
          <div class="drawer-head-title">
            <DialogTitle>New task</DialogTitle>
            <DialogDescription class="sr-only">Create a new task</DialogDescription>
          </div>
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
            <div class="shot-label-row">
              <label>Screenshots</label>
              <button
                ref="shotInfoEl"
                type="button"
                class="field-info"
                aria-label="Accepted screenshot formats"
                @mouseenter="showShotHint"
                @mouseleave="hideShotHint"
                @focus="showShotHint"
                @blur="hideShotHint"
              >
                <Info class="size-3.5" />
              </button>
            </div>
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
            <div
              v-if="ui.pendingScreenshots.length"
              class="ff-pending-files"
              aria-label="Selected attachments"
            >
              <div
                v-for="(s, i) in ui.pendingScreenshots"
                :key="s.name + s.size + i"
                class="ff-pending-file"
              >
                <img
                  v-if="isImageMime(s.mime)"
                  :src="s.dataUrl"
                  :alt="s.name"
                  @click="openPendingViewer(i)"
                />
                <div v-else class="ff-pending-file-icon"><Paperclip class="size-4" /></div>
                <span class="ff-pending-file-name" :title="s.name">{{ s.name }}</span>
                <ScreenshotExpandButton
                  v-if="isImageMime(s.mime)"
                  :name="s.name"
                  @click="openPendingViewer(i)"
                />
                <button
                  type="button"
                  class="ff-pending-file-remove"
                  :aria-label="`Remove ${s.name}`"
                  title="Remove attachment"
                  @click.stop="ui.removeScreenshot(i)"
                >
                  <X class="size-3.5" />
                </button>
              </div>
            </div>
          </div>
          <!-- Format/attachment help (#0571) used to be a permanent line under
               the dropzone. It now lives in a themed pane, teleported to <body>
               (the drawer's stacking context would trap a fixed child) and
               anchored under the info control beside the label. -->
          <Teleport to="body">
            <div v-if="shotHintOpen" class="field-info-pane" role="tooltip" :style="shotHintStyle">
              <p>
                PNG, JPEG, GIF, WebP, AVIF or BMP — attached to the new task when you create it.
              </p>
            </div>
          </Teleport>
          <!-- #0555: story, shared by both modes so Freeform (the default)
               can't silently drop the tag. It sits with the other mode-
               independent field (Screenshots) rather than inside the Manual
               grid, and it is gated on the same `storiesEnabled` check the
               details form's control uses. -->
          <div v-if="storiesEnabled" class="field">
            <label for="nt-story">Story</label>
            <Select :model-value="ntStorySelectValue" @update:model-value="onNtStorySelectUpdate">
              <SelectTrigger id="nt-story">
                <SelectValue placeholder="No story">
                  {{ ntStorySelectLabel }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectViewport
                  class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                >
                  <SelectItem :value="STORY_NONE_SELECT">No story</SelectItem>
                  <SelectItem v-for="name in storyOptions" :key="name" :value="name">
                    {{ name }}
                  </SelectItem>
                </SelectViewport>
              </SelectContent>
            </Select>
          </div>
          <template v-if="newMode === 'freeform'">
            <div v-if="freeformSubmitted" class="ff-done">
              <div class="ff-done-head">
                <ActivityIndicator />
                <span>Creating your task</span>
              </div>
              <p class="ff-done-copy">
                This may take a few minutes. Your task
                <template v-if="submittedTask"
                  ><span class="mono">#{{ submittedTask.id }}</span> —</template
                >
                is being created in the background and will be updated automatically when it's
                ready. You can keep working, or start another task while you wait — nothing is lost.
              </p>
              <div class="btn-row" style="margin-top: 18px">
                <Button variant="default" @click="createAnotherTask">Create another task</Button>
                <Button variant="outline" @click="doneFreeform">Done</Button>
              </div>
            </div>
            <template v-else>
              <div class="field">
                <div class="field-header">
                  <label for="nt-freeform">Describe the task</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Clear draft"
                    :disabled="!freeformText.trim() && !ui.pendingScreenshots.length"
                    @click="clearFreeformDraft"
                    >Clear</Button
                  >
                </div>
                <div class="agent-input-wrapper">
                  <textarea
                    id="nt-freeform"
                    ref="freeformTextarea"
                    v-model="freeformText"
                    class="ff-textarea ff-textarea-autogrow"
                    rows="10"
                    placeholder="Type the task however it comes out — like explaining it to a person. The PM agent writes the structured task file."
                  ></textarea>
                  <VoiceDictate @transcribed="onFreeformTranscribed" style="margin-bottom: 14px" />
                </div>
              </div>
              <div class="ff-agent-bar">
                <div class="agent-pick-grid">
                  <div class="agent-field" style="grid-column: 1 / -1">
                    <AgentModelControl
                      :cli-options="cliOptionsFor(freeformOverride.cli)"
                      :model-options="freeformModelOptions"
                      memory-key="panel:new-task"
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
            <div class="field">
              <label for="nt-body">Body <span class="field-optional">(optional)</span></label>
              <textarea
                id="nt-body"
                v-model="ui.nt.body"
                class="nt-body-textarea"
                rows="5"
                placeholder="Add any additional context or markdown for this task"
              ></textarea>
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
                <AreaPicker
                  id="nt-area"
                  v-model="ntAreaList"
                  :options="areaOptions"
                  placeholder="area"
                  @add-to-vocabulary="addAreaToVocabulary"
                />
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
              <CopyableNumber
                :label="`#${ui.active.id}`"
                :path="`/work?task=${encodeURIComponent(ui.active.id)}`"
                :aria-label="`Copy link to task ${ui.active.id}`"
              />
              <span class="tc-id mono">{{ ui.active.path }}</span>
              <span
                v-if="reviewSubstate"
                class="rs-chip"
                :class="reviewSubstate.cls"
                :title="reviewSubstate.label"
                >{{ reviewSubstate.label }}</span
              >
              <span
                v-else-if="needsInputHeaderChip"
                class="rs-chip"
                :class="needsInputHeaderChip.cls"
                :title="needsInputBannerText(ui.active.needsInputReason, activeNeedsInputQuestions)"
                >{{ needsInputHeaderChip.label }}</span
              >
              <button
                v-if="checkChip"
                type="button"
                class="ck-chip"
                :class="`ck-chip-${checkChip.state}`"
                :title="checkChip.title"
                @click="ui.activeTab = 'debug'"
              >
                <ActivityIndicator v-if="checkChip.state === 'running'" class="ck-chip-spin" />
                {{ checkChip.label }}
                <span
                  v-if="checkChip.slow"
                  class="ck-slow-badge"
                  data-test-id="task-check-slow"
                >
                  slow
                </span>
              </button>
              <span class="tc-prio" :class="ui.active.priority" style="margin-left: auto">
                {{ ui.active.priority }}
              </span>
              <HotfixBadge
                v-if="ui.active.hotfix"
                :target="ui.active.hotfixTarget"
                :branch="ui.active.branch"
              />
            </div>
            <!-- #0569: the header title IS the title editor. Click it to edit
                 in place; Enter/blur commits and autosaves, Esc cancels. -->
            <DialogTitle class="task-title" :aria-label="ui.active.title">
              <input
                v-if="titleEditing"
                ref="titleInputEl"
                v-model="titleDraft"
                class="task-title-input"
                aria-label="Task title"
                @keydown.enter.prevent="commitTitleEdit"
                @keydown.esc.stop.prevent="cancelTitleEdit"
                @blur="commitTitleEdit"
              />
              <span
                v-else
                class="task-title-text"
                role="button"
                tabindex="0"
                title="Click to edit title"
                @click="beginTitleEdit"
                @keydown.enter.prevent="beginTitleEdit"
                @keydown.space.prevent="beginTitleEdit"
                >{{ ui.active.title }}</span
              >
            </DialogTitle>
            <DialogDescription class="sr-only">{{
              ui.active.body || "Task details"
            }}</DialogDescription>
          </div>
          <DialogClose class="close-x">
            <X class="size-[15px]" />
          </DialogClose>
        </div>
        <p v-if="ui.active.hotfix" class="hotfix-note hotfix-banner" role="status">
          {{ hotfixBannerText(ui.active.hotfixTarget, ui.active.branch) }}
        </p>
        <!-- #0657: an archived task is parked. Show a prominent reason card
             (when one was given) and a single Unarchive action in place of
             every lifecycle control, which does not apply while archived. -->
        <div v-if="ui.active.isArchived" class="archived-panel">
          <div v-if="ui.active.archiveDetail" class="agent-waiting archived-reason" role="status">
            <div>
              <div class="agent-waiting-title">archived</div>
              <div class="agent-waiting-sub">
                This task is parked. Its status, branch and worktree are unchanged.
              </div>
              <div class="agent-waiting-detail">{{ ui.active.archiveDetail }}</div>
            </div>
          </div>
          <div class="quickbar-row">
            <Button
              variant="default"
              :disabled="ui.saving || unarchiveBusy"
              @click="unarchiveActive"
            >
              <ActivityIndicator v-if="unarchiveBusy" />
              <RotateCcw v-else class="size-3.5" />
              {{ unarchiveBusy ? "Unarchiving…" : "Unarchive" }}
            </Button>
          </div>
        </div>
        <div v-else class="drawer-quickbar">
          <!-- #0507: the handoff finalization is in flight. The task is still
               `active` on purpose, so without this it would read as "nothing
               happened" for the whole length of the check. -->
          <div v-if="handoffBusy" class="ff-notice drawer-handoff-banner">
            <ActivityIndicator />
            <span>{{ handoffStepLabel }}</span>
            <span class="drawer-handoff-sub">
              This task stays <strong>active</strong> until the checks pass.
            </span>
          </div>
          <div
            v-else-if="awaitingFreshReview"
            class="ff-notice drawer-handoff-banner"
            role="status"
          >
            <span
              ><strong>Awaiting a new review.</strong> The report below is from before the latest
              engineering handoff.</span
            >
            <span class="drawer-handoff-sub"
              >RepoOS should start the reviewer automatically. If it does not, use
              <strong>Review again</strong> in the Review tab.</span
            >
          </div>
          <div v-else-if="handoffError" class="ff-error drawer-handoff-banner">
            <span>
              <strong>Not moved to review.</strong> The handoff finalization stopped:
              {{ handoffError }}
            </span>
            <span class="drawer-handoff-sub">Fix it and click Review again.</span>
          </div>
          <div class="quickbar-row">
            <Select :model-value="ui.active.status" @update:model-value="(v) => setStatus(v ?? '')">
              <SelectTrigger :disabled="ui.saving || handoffBusy">
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
              variant="status"
              :style="{ '--tone': statusColor('inbox') }"
              :disabled="ui.saving"
              @click="setStatus('inbox')"
            >
              <ArrowRight class="size-3.5" />
              Move to inbox
            </Button>
            <Button
              v-if="ui.active.status === 'inbox'"
              variant="status"
              :style="{ '--tone': statusColor('ready') }"
              :disabled="ui.saving"
              @click="setStatus('ready')"
            >
              <ArrowRight class="size-3.5" />
              Move to ready
            </Button>
            <Button
              v-if="
                (ui.active.status === 'ready' || ui.active.status === 'active') &&
                (ui.active.status === 'ready' || !repo.isRunning(ui.active.id))
              "
              variant="status"
              :style="{ '--tone': statusColor('active') }"
              :disabled="ui.saving"
              @click="startWork"
            >
              <Play v-if="!startingWork" class="size-3.5" />
              <ActivityIndicator v-else />
              {{
                startingWork
                  ? "Starting work…"
                  : ui.active.status === "active"
                    ? "Restart work"
                    : "Start work"
              }}
            </Button>
            <Button
              v-if="ui.active.status === 'active' && !repo.isRunning(ui.active.id)"
              variant="status"
              :style="{ '--tone': statusColor('review') }"
              :disabled="ui.saving || handoffBusy"
              :title="
                handoffBusy
                  ? 'RepoOS is already running the handoff finalization for this task'
                  : 'Ask RepoOS to commit, run the checks, and move this task to review'
              "
              @click="setStatus('review')"
            >
              <ActivityIndicator v-if="handoffBusy" />
              <Send v-else class="size-3.5" />
              {{ handoffBusy ? "Running checks…" : "Review" }}
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
              variant="status"
              :style="{ '--tone': statusColor('done') }"
              :disabled="
                ui.saving ||
                review?.running ||
                awaitingFreshReview ||
                repo.isRunning(ui.active.id) ||
                inPipeline
              "
              :title="
                inPipeline
                  ? 'Already in the integration pipeline — merging, building, and checking. See the pipeline bar for live progress.'
                  : review?.running
                    ? 'Waiting for automatic review to finish.'
                    : awaitingFreshReview
                      ? 'Waiting for a fresh review of the latest engineering handoff.'
                      : repo.isRunning(ui.active.id)
                        ? 'The engineer is still coding; Move to done becomes available when the turn ends.'
                        : undefined
              "
              @click="moveToDone"
            >
              <CheckCheck v-if="!doingDone && !inPipeline" class="size-3.5" />
              <ActivityIndicator v-else />
              {{
                inPipeline
                  ? `Integrating…${pipelineStage ? ` (${pipelineStage})` : ""}`
                  : doingDone
                    ? doneProgress
                    : "Move to done"
              }}
            </Button>
            <Button
              v-if="ui.active.status === 'review' && inPipeline"
              variant="destructive"
              :disabled="ui.saving || stoppingDone"
              title="Cancel this close-out and return the task to review. Nothing is merged; the branch is left untouched."
              @click="stopMtd"
            >
              <ActivityIndicator v-if="stoppingDone" />
              <Square v-else class="size-3.5" />
              {{ stoppingDone ? "Stopping…" : "Stop MTD" }}
            </Button>
          </div>
          <span v-if="review?.running" class="drawer-run reviewing" role="status">
            <ActivityIndicator variant="reviewing" label="Reviewing…" />
            Reviewer is reviewing this task…
          </span>
          <span
            v-if="ui.active.status === 'active' && repo.isRunning(ui.active.id)"
            class="drawer-run"
          >
            <ActivityIndicator />
            {{ autoRepairRetryHint ? autoRepairRetryHint.label : "agent coding" }}
            <span
              v-if="effectiveEngineer"
              class="drawer-run-agent"
              title="Effective agent for this run"
            >
              {{ effectiveEngineer.name }} · {{ effectiveEngineer.cli }} ·
              {{ effectiveEngineer.model }}
            </span>
          </span>
          <!-- 0381: PM at work on this task — a draft flesh-out OR a live PM
               chat turn (the flag is the same server-side registry). Cleared
               on every run exit path server-side. -->
          <span v-if="repo.pmWorkingFor(ui.active.id)" class="drawer-run" role="status">
            <ActivityIndicator />
            {{
              ui.active.status === "draft"
                ? "PM is working on this draft…"
                : "PM is working on this task…"
            }}
          </span>
          <DoneErrorCard
            v-if="ui.active.status === 'review' && repo.doneErrorFor(ui.active.id)"
            class="drawer-done-error"
            mode="panel"
            :message="repo.doneErrorFor(ui.active.id)!.message"
            :step="repo.doneErrorFor(ui.active.id)!.step"
            :conflicts="repo.doneErrorFor(ui.active.id)!.conflicts"
            :detail="repo.doneErrorFor(ui.active.id)!.detail"
            :log-path="repo.doneErrorFor(ui.active.id)!.logPath"
            :hint="repo.doneErrorFor(ui.active.id)!.hint"
            :failed-at="repo.doneErrorFor(ui.active.id)!.failedAt"
            :tldr="repo.doneErrorFor(ui.active.id)!.tldr"
            :summary="repo.doneErrorFor(ui.active.id)!.summary"
            :action="repo.doneErrorFor(ui.active.id)!.action"
            :tldr-diagnosing="
              !repo.doneErrorFor(ui.active.id)!.tldr && repo.debugTldrWorkingFor(ui.active.id)
            "
            :retry-hint="autoRepairRetryHint"
            :task-id="ui.active.id"
            :task-title="ui.active.title"
            @open-debugger="openDebuggerFromError"
            @open-support="openSupportFromError"
            @open-conflict="openConflictFromError"
            @dismiss="repo.dismissDoneError(ui.active.id)"
            @refresh-install-retry="repo.refreshInstallAndRetryIntegration(ui.active.id)"
          />
          <div
            v-if="
              (ui.active.status === 'active' || ui.active.status === 'review') &&
              ui.active.preview &&
              !ui.active.hotfix
            "
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
              <!-- Which target/frontend is being served (#0379), so "a preview
                   is running" is never the whole story. -->
              <span v-if="ui.active.preview.label" class="preview-target-name">
                {{ ui.active.preview.label }}
              </span>
            </div>
            <span
              v-if="isPreviewBusyForActive && previewAction === 'stop'"
              class="preview-progress"
              role="status"
            >
              <ActivityIndicator label="Stopping preview" />
              Stopping preview…
              <span v-if="previewElapsedMs >= 1000" class="preview-progress-elapsed">
                {{ formatDuration(previewElapsedMs) }}
              </span>
            </span>
            <Button
              v-else
              variant="outline"
              :disabled="ui.saving || isPreviewBusyForActive"
              @click="stopPreview"
            >
              <Square class="size-3.5" />
              Stop preview
            </Button>
          </div>
          <p
            v-if="
              (ui.active.status === 'active' || ui.active.status === 'review') &&
              !ui.active.preview &&
              !ui.active.branch &&
              !ui.active.hotfix
            "
            class="preview-hint"
          >
            No branch yet — start work to create the worktree this previews.
          </p>
          <p
            v-else-if="
              (ui.active.status === 'active' || ui.active.status === 'review') &&
              !ui.active.preview &&
              !ui.active.git?.worktreeExists &&
              !ui.active.hotfix
            "
            class="preview-hint"
          >
            No git worktree is checked out for
            <span class="mono">{{ ui.active.branch }}</span
            >.
          </p>
          <div
            v-else-if="
              (ui.active.status === 'active' || ui.active.status === 'review') &&
              !ui.active.preview &&
              !ui.active.hotfix
            "
            class="quickbar-row"
          >
            <p class="preview-hint">
              <template v-if="previewTargetChoiceRequired">
                Choose which preview target to serve.
              </template>
              <template v-else> No preview running. </template>
            </p>
            <!-- #0379: when several configured targets exist, make the choice
                 explicit rather than silently serving the first one. -->
            <Select v-if="previewTargetChoiceRequired" v-model="previewTarget">
              <SelectTrigger
                class="preview-target-select h-[34px] max-w-[180px] rounded-[9px] px-[11px]"
                :disabled="ui.saving || isPreviewBusyForActive"
                aria-label="Preview target"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem v-for="t in previewTargets" :key="t.name" :value="t.name">
                    {{ t.name }}
                  </SelectItem>
                </SelectViewport>
              </SelectContent>
            </Select>
            <span
              v-else-if="effectivePreviewTarget"
              class="preview-target-name"
              :title="`Preview target: ${effectivePreviewTarget}`"
            >
              {{ effectivePreviewTarget }}
            </span>
            <span
              v-if="isPreviewBusyForActive && previewAction === 'start'"
              class="preview-progress"
              role="status"
            >
              <ActivityIndicator label="Starting preview" />
              Starting preview…
              <span v-if="previewElapsedMs >= 1000" class="preview-progress-elapsed">
                {{ formatDuration(previewElapsedMs) }}
              </span>
            </span>
            <Button
              v-else
              variant="outline"
              :disabled="
                ui.saving ||
                isPreviewBusyForActive ||
                (previewTargetChoiceRequired && !effectivePreviewTarget)
              "
              @click="startPreview"
            >
              <Play class="size-3.5" />
              Start preview
            </Button>
          </div>
          <p
            v-if="
              ui.active.hotfix && (ui.active.status === 'active' || ui.active.status === 'review')
            "
            class="hotfix-note"
          >
            Hotfix tasks run in the main checkout — no preview is served.
          </p>
          <p
            v-if="ui.active && shotWarning"
            class="preview-hint shot-warning-preview"
            role="status"
          >
            {{ shotWarning }}
          </p>
        </div>
        <!-- Critical status lives above the tabs so it is visible no matter
             which tab is open — a "needs input" / "reviewer crashed" message
             buried in one tab is a message the human never sees. -->
        <div v-if="showAgentQuestionsBanner && ui.active" class="drawer-critical">
          <div class="questions-for-you-banner" role="region" aria-label="Questions for you">
            <div class="questions-for-you-head">
              <span class="questions-for-you-badge">Questions for you</span>
              <span class="questions-for-you-sub">{{
                needsInputBannerText(ui.active.needsInputReason, true)
              }}</span>
            </div>
            <ol class="questions-for-you-list">
              <li v-for="(question, index) in ui.active.questions" :key="index">
                {{ question }}
              </li>
            </ol>
            <div class="questions-for-you-actions">
              <Button
                variant="default"
                size="sm"
                class="questions-for-you-answer"
                :disabled="!pmAgentEnabled || pmBusy || pmSubmitting"
                @click="openPmToAnswerQuestions"
              >
                Answer in PM
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :disabled="ui.saving || dismissNeedsInputBusy"
                @click="dismissNeedsInputFlag"
              >
                <ActivityIndicator v-if="dismissNeedsInputBusy" />
                {{ dismissNeedsInputBusy ? "Dismissing…" : "Dismiss" }}
              </Button>
            </div>
          </div>
        </div>
        <div
          v-else-if="ui.active && ui.active.needsInput && !handoffBusy && !awaitingFreshReview"
          class="drawer-critical"
        >
          <div class="agent-waiting" :class="{ 'agent-waiting-static': staleNeedsInputOnReview }">
            <span v-if="!staleNeedsInputOnReview" class="agent-waiting-dot"></span>
            <div>
              <div class="agent-waiting-title">
                {{ staleNeedsInputOnReview ? "stale flag" : "waiting for you" }}
              </div>
              <div class="agent-waiting-sub">
                {{
                  staleNeedsInputOnReview
                    ? STALE_REVIEW_DEV_ERROR_BANNER
                    : ui.active.needsInputReason === "review-rounds-exhausted" && review?.running
                      ? "A fresh review is running. Its result will determine whether this still needs your attention."
                      : needsInputBannerText(ui.active.needsInputReason, activeNeedsInputQuestions)
                }}
              </div>
              <!-- needsInputDetail for dev-error is internal skill-routing
                   metadata — not meaningful to users, so we hide it. -->
              <div
                v-if="ui.active.needsInputDetail && ui.active.needsInputReason !== 'dev-error'"
                class="agent-waiting-detail"
              >
                {{ ui.active.needsInputDetail }}
              </div>
              <div
                v-if="
                  !staleNeedsInputOnReview &&
                  needsInputSuggestionText(ui.active.needsInputReason, activeNeedsInputQuestions)
                "
                class="agent-waiting-suggestion"
              >
                {{
                  needsInputSuggestionText(ui.active.needsInputReason, activeNeedsInputQuestions)
                }}
              </div>
              <div class="agent-waiting-actions">
                <Button
                  v-if="needsInputPrimary && !staleNeedsInputOnReview"
                  variant="outline"
                  size="sm"
                  :disabled="
                    ui.saving ||
                    startingWork ||
                    reviewBusy ||
                    review?.running ||
                    dismissNeedsInputBusy ||
                    (needsInputPrimary.kind === 'send-engineer' &&
                      (sendingToEngineer || reviewStale || !review?.report)) ||
                    (needsInputPrimary.kind === 'send-pm' &&
                      (!pmAgentEnabled || pmBusy || pmSubmitting))
                  "
                  @click="runNeedsInputPrimaryAction"
                >
                  <Play
                    v-if="needsInputPrimary.kind === 'restart' && !startingWork"
                    class="size-3.5"
                  />
                  <ActivityIndicator
                    v-else-if="needsInputPrimary.kind === 'restart' && startingWork"
                  />
                  <ActivityIndicator
                    v-else-if="
                      needsInputPrimary.kind === 'review' && (reviewBusy || review?.running)
                    "
                  />
                  {{
                    needsInputPrimary.kind === "restart" && startingWork
                      ? "Starting work…"
                      : needsInputPrimary.kind === "review" && (reviewBusy || review?.running)
                        ? "Reviewing…"
                        : needsInputPrimary.label
                  }}
                </Button>
                <Button
                  v-if="ui.active.needsInputReason === 'closeout-worktree-dirty'"
                  variant="outline"
                  size="sm"
                  :disabled="ui.saving || clearWorktreeBusy || dismissNeedsInputBusy"
                  @click="clearKeptWorktree"
                >
                  <ActivityIndicator v-if="clearWorktreeBusy" />
                  {{ clearWorktreeBusy ? "Clearing…" : "Clear worktree" }}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="ui.saving"
                  @click="dismissNeedsInputFlag"
                >
                  <ActivityIndicator v-if="dismissNeedsInputBusy" />
                  {{ dismissNeedsInputBusy ? "Dismissing…" : "Dismiss" }}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <!-- The Debugger's one-line tl;dr for the current failure (#0570):
             the plain-language "what happened / what to do" summary, additive
             to the banner and the raw detail in the tabs below. Lives above
             the tabs so it is visible no matter which tab is open. -->
        <div v-if="activeTldrSentence || activeTldrDiagnosing" class="drawer-critical">
          <div class="debug-tldr" role="status">
            <Lightbulb class="debug-tldr-icon" />
            <div class="debug-tldr-body">
              <div class="debug-tldr-label">tl;dr — what happened</div>
              <div v-if="activeTldrSentence" class="debug-tldr-sentence">
                {{ activeTldrSentence }}
              </div>
              <div v-else class="debug-tldr-diagnosing">
                <ActivityIndicator label="Debugger diagnosing" />
                Diagnosing…
              </div>
            </div>
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
            <!-- 0381: the PM is doing something on this task (chat turn or
                 draft flesh-out) while another tab is open — surface it here
                 so it's visible without switching to the PM tab. -->
            <ActivityIndicator
              v-if="ui.activeTab !== 'pm' && ui.active && repo.pmWorkingFor(ui.active.id)"
              label="PM working"
            />
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
            :data-tip="
              ui.active.hotfix
                ? 'Hotfix tasks skip the review report — the change lands through the hotfix flow instead.'
                : undefined
            "
            @click="ui.activeTab = 'review'"
          >
            <ShieldCheck class="tab-icon" />
            Review
            <span v-if="ui.active.hotfix" class="tab-hotfix-skip">skipped</span>
          </button>
          <button
            type="button"
            class="tab-btn"
            data-test-id="task-tab-changes"
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
        <div
          v-if="ui.activeTab === 'details'"
          class="drawer-body"
          :class="{ 'transition-success': transitioned }"
        >
          <div v-if="dependencyRows.length" class="field dep-row">
            <label>Depends on</label>
            <div class="dep-list">
              <button
                v-for="dep in dependencyRows"
                :key="dep.id"
                type="button"
                class="dep-item"
                :class="{ 'dep-item-blocking': dep.blocker }"
                @click="openDependency(dep.id)"
              >
                <DependencyChip v-if="dep.blocker" :blocker="dep.blocker" />
                <span v-else class="dep-item-id"
                  ><CheckCheck class="dep-chip-icon" />#{{ dep.id }}</span
                >
                <span class="dep-item-title">{{ dep.title }}</span>
                <span class="dep-item-state">{{ dep.stateLabel }}</span>
              </button>
            </div>
          </div>
          <div class="field-row">
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
              <AreaPicker
                id="et-area"
                v-model="draftAreaList"
                :options="areaOptions"
                placeholder="area"
                @add-to-vocabulary="addAreaToVocabulary"
              />
            </div>
            <div v-if="storiesEnabled" class="field">
              <div class="field-header">
                <label for="et-story">Story</label>
                <button
                  v-if="showStoryOpenLink"
                  type="button"
                  class="page-help-link"
                  :title="storyOpenAccessibleLabel"
                  :aria-label="storyOpenAccessibleLabel"
                  @click="openAssignedStory"
                >
                  go to story ↗
                </button>
              </div>
              <Select :model-value="storySelectValue" @update:model-value="onStorySelectUpdate">
                <SelectTrigger id="et-story">
                  <SelectValue placeholder="No story">
                    {{ storySelectLabel }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport
                    class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                  >
                    <SelectItem :value="STORY_NONE_SELECT">No story</SelectItem>
                    <SelectItem v-for="name in storyOptions" :key="name" :value="name">
                      {{ name }}
                    </SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div v-else class="field">
              <label for="et-assignee">Assigned to</label>
              <Input
                id="et-assignee"
                v-model="draft.assignedTo"
                list="assignee-options"
                placeholder="unassigned"
              />
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
            <button
              v-if="editorConfigured"
              type="button"
              class="page-help-link"
              data-test-id="open-in-editor"
              :aria-label="openInEditorLabel"
              @click="openTaskInEditor"
            >
              Open in editor ↗
            </button>
          </div>
          <div v-if="specExpanded">
            <div
              class="md-card"
              role="button"
              tabindex="0"
              @click="handleSpecCardClick"
              @keydown.enter="openSpecModal"
              @keydown.space.prevent="openSpecModal"
            >
              <div v-if="specHtml" class="md-rendered" v-html="specHtml"></div>
              <div v-else-if="!ui.activeDetailLoading" class="md-card-body">
                No spec yet — click to add.
              </div>
              <div
                v-if="ui.activeDetailLoading"
                class="md-loading"
                role="status"
                data-testid="spec-loading"
              >
                <span class="md-loading-dot" aria-hidden="true"></span>
                Loading full spec…
              </div>
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
            <Button
              variant="destructive"
              size="sm"
              :disabled="ui.saving"
              @click="openDeleteConfirm"
            >
              Delete task
            </Button>
            <Button
              v-if="!ui.active?.isArchived"
              variant="outline"
              size="sm"
              class="delete-zone-archive"
              data-test-id="archive-task"
              :disabled="ui.saving"
              title="Park this task without changing its status, branch or worktree"
              @click="openArchiveConfirm"
            >
              Archive task
            </Button>
            <Button
              v-if="!ui.active?.hotfix && ui.active?.status === 'ready'"
              variant="outline"
              size="sm"
              :disabled="ui.saving"
              @click="openHotfixConfirm"
            >
              Hotfix
            </Button>
          </div>
        </div>
        <div
          v-else-if="ui.activeTab === 'agent'"
          class="drawer-body drawer-session-body"
          :class="{ 'transition-success': transitioned }"
        >
          <div v-if="ui.active" class="agent-override-bar">
            <div class="agent-pick-grid">
              <div class="agent-field" style="grid-column: 1 / -1">
                <AgentModelControl
                  :cli-options="cliOptionsFor(overrideDraft.cli)"
                  :model-options="modelOptions"
                  :memory-key="'task:' + ui.active.id + ':agent'"
                  v-model:cli="overrideDraft.cli"
                  v-model:model="overrideDraft.model"
                  :disabled="ui.saving"
                />
                <div
                  v-if="isLegacyGeminiCli(overrideDraft.cli)"
                  class="agent-legacy-notice"
                  role="status"
                >
                  <strong>Deprecated Gemini CLI</strong> — this saved task override is preserved,
                  but new runs should use
                  <a :href="GEMINI_MIGRATION_URL" target="_blank" rel="noopener noreferrer"
                    >Antigravity CLI (agy)</a
                  >.
                </div>
              </div>
              <div class="agent-field">
                <div v-if="overrideDirty" class="agent-override-actions" style="padding-top: 20px">
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
                No new output for a while. This isn't proof it's stuck — a slow step looks the same
                from here — but if it stays quiet, check in.
              </div>
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
              <div v-for="row in displayEntries" :key="row.key" class="agent-entry">
                <!-- legacy plain line (claude / qwen / codex / pre-JSON sessions) -->
                <ChatDiagnosticRow
                  v-if="row.kind === 'line' && row.s === 'err'"
                  :text="row.text"
                  :at="row.at"
                />
                <div v-else-if="row.kind === 'line'" class="agent-line" :class="row.s">
                  <span class="agent-pfx" :class="row.s">{{
                    row.s === "err" ? "✕" : row.s === "sys" ? "·" : "›"
                  }}</span>
                  <span class="agent-d">{{ row.text }}</span>
                </div>
                <!-- system / notice line -->
                <div v-else-if="row.kind === 'sys'" class="agent-line sys">
                  <time v-if="row.at" class="entry-time">{{ fmtTime(row.at) }}</time>
                  <span class="agent-pfx">·</span>
                  <span class="agent-d">{{ row.text }}</span>
                </div>
                <!-- human / user message -->
                <div v-else-if="row.kind === 'human'" class="agent-human">
                  <time v-if="row.at" class="entry-time">{{ fmtTime(row.at) }}</time>
                  <div class="agent-human-bubble" @click="onTaskDrawerBubbleClick(row, $event)">
                    {{ row.text }}
                  </div>
                </div>
                <!-- assistant text block -->
                <div
                  v-else-if="row.kind === 'text'"
                  class="agent-text"
                  @click="onTaskDrawerBubbleClick(row, $event)"
                >
                  <time v-if="row.at" class="entry-time">{{ fmtTime(row.at) }}</time>
                  {{ row.text }}
                </div>
                <!-- one row per run of adjacent tool calls (#0506) -->
                <ChatToolCallRow v-else :calls="row.calls" :at="row.at" />
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
            v-else-if="ui.active && ui.active.status !== 'active' && ui.active.status !== 'review'"
            class="agent-hint"
          >
            Task is {{ ui.active.status }} — start work to run an agent turn.
          </div>
        </div>
        <div v-else-if="ui.activeTab === 'review'" class="drawer-body drawer-session-body">
          <p v-if="ui.active.hotfix" class="hotfix-note" role="status">
            Hotfix tasks skip the review report — the change lands through the hotfix flow instead.
          </p>
          <div v-if="ui.active" class="agent-override-bar">
            <div class="agent-pick-grid">
              <div class="agent-field" style="grid-column: 1 / -1">
                <AgentModelControl
                  :cli-options="cliOptionsFor(reviewOverrideDraft.cli)"
                  :model-options="reviewModelOptions"
                  :memory-key="'task:' + ui.active.id + ':review'"
                  v-model:cli="reviewOverrideDraft.cli"
                  v-model:model="reviewOverrideDraft.model"
                  :disabled="ui.saving"
                />
                <div
                  v-if="isLegacyGeminiCli(reviewOverrideDraft.cli)"
                  class="agent-legacy-notice"
                  role="status"
                >
                  <strong>Deprecated Gemini CLI</strong> — this saved review override is preserved,
                  but new runs should use
                  <a :href="GEMINI_MIGRATION_URL" target="_blank" rel="noopener noreferrer"
                    >Antigravity CLI (agy)</a
                  >.
                </div>
              </div>
              <div class="agent-field">
                <div
                  v-if="reviewOverrideDirty"
                  class="agent-override-actions"
                  style="padding-top: 20px"
                >
                  <span class="agent-save-hint">saving…</span>
                </div>
              </div>
            </div>
          </div>
          <div class="review-toolbar">
            <div
              v-if="review?.report"
              class="review-pane-tabs"
              role="tablist"
              aria-label="Reviewer content"
            >
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
              v-if="ui.active.status === 'review' && !ui.active.isArchived"
              variant="outline"
              size="sm"
              :disabled="ui.saving || reviewBusy || review?.running || handoffBusy"
              :title="
                review?.running
                  ? 'Waiting for the current review run to finish.'
                  : 'Start a fresh review of the current worktree state'
              "
              @click="reviewAgain"
            >
              <RotateCcw v-if="!reviewBusy" class="size-3.5" />
              <ActivityIndicator v-else />
              {{ reviewBusy ? "Starting…" : "Review again" }}
            </Button>
            <Button
              v-if="ui.active.status === 'review' && !ui.active.isArchived"
              variant="accent"
              size="sm"
              :disabled="
                ui.saving || sendingToEngineer || reviewBusy || reviewStale || !review?.report
              "
              :title="
                !review?.report
                  ? 'Wait for a completed review before sending this task back to the engineer.'
                  : reviewStale
                    ? 'Wait for the new review before sending findings to the engineer.'
                    : 'Return this task to active and resume the engineer with the reviewer findings'
              "
              @click="sendToEngineer"
            >
              <Send v-if="!sendingToEngineer" class="size-3.5" />
              <ActivityIndicator v-else />
              {{ sendingToEngineer ? "Sending…" : "Send engineer" }}
            </Button>
          </div>

          <button
            v-if="skillSuggestionId"
            type="button"
            class="skill-suggestion-note"
            @click="openSkillSuggestion"
          >
            Skill suggestion: #{{ skillSuggestionId }}
          </button>

          <section
            v-if="review?.report && reviewPane === 'report'"
            class="review-pane review-report-pane"
            role="tabpanel"
          >
            <div v-if="reviewStale" class="review-stale" role="status">
              <div class="review-stale-body">
                <span class="review-stale-title">Previous review</span>
                <span class="review-stale-sub">{{
                  review?.running
                    ? "A new review is running and will replace this report."
                    : reviewSuperseded
                      ? "The engineer is applying review feedback — this report is from before that fix round."
                      : awaitingFreshReview
                        ? "The latest engineering handoff is awaiting a new review. Use Review again if it does not start."
                        : "This report predates the latest engineering work."
                }}</span>
              </div>
            </div>
            <div v-if="review.report.state === 'failed'" class="review-failed">
              {{ review.report.markdown }}
            </div>
            <template v-else>
              <div
                v-if="review.report.state === 'incomplete'"
                class="review-incomplete"
                role="status"
              >
                Review finished without a parseable verdict. The partial report is below for
                debugging — use <strong>Review again</strong> to rerun the reviewer.
              </div>
              <div
                v-else-if="verdict"
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
              <ul
                v-if="review.history && review.history.length > 0"
                class="review-history"
                aria-label="Review pass history"
              >
                <li v-for="h in review.history" :key="h.pass">
                  Pass {{ h.pass }} · {{ repo.fmtDate(h.at) }} ·
                  {{ h.verdict ?? h.state }}
                </li>
              </ul>
              <div class="md-card review-card">
                <div class="md-rendered" v-html="reviewHtml"></div>
              </div>
            </template>
            <p class="review-hint">Findings only — you decide whether this task is done.</p>
          </section>

          <section v-else class="review-pane review-chat-pane" role="tabpanel">
            <p v-if="review && !review.enabled" class="review-hint">
              The review agent is disabled on the Agents page, so no automatic review runs.
            </p>
            <p v-else-if="!review?.running && !review?.report" class="review-hint">
              No agent review for this task yet.
            </p>

            <div class="review-log-wrap">
              <div class="agent-log review-log" ref="reviewLogEl" @scroll="onReviewLogScroll">
                <template v-if="reviewEntries.length === 0">
                  <div class="agent-empty">
                    <template v-if="review?.running">
                      Waiting for the reviewer's first output…
                    </template>
                    <template v-else>
                      The reviewer's conversation appears here once a review runs.
                      <br />
                      Start a review to see the reviewer at work, then chat below.
                    </template>
                  </div>
                </template>
                <div v-for="row in reviewEntries" :key="row.key" class="agent-entry">
                  <ChatDiagnosticRow
                    v-if="row.kind === 'line' && row.s === 'err'"
                    :text="row.text"
                    :at="row.at"
                  />
                  <div v-else-if="row.kind === 'line'" class="agent-line" :class="row.s">
                    <span class="agent-pfx" :class="row.s">{{
                      row.s === "err" ? "✕" : row.s === "sys" ? "·" : "›"
                    }}</span>
                    <span class="agent-d">{{ row.text }}</span>
                  </div>
                  <div v-else-if="row.kind === 'sys'" class="agent-line sys">
                    <time v-if="row.at" class="entry-time">{{ fmtTime(row.at) }}</time>
                    <span class="agent-pfx">·</span>
                    <span class="agent-d">{{ row.text }}</span>
                  </div>
                  <div v-else-if="row.kind === 'human'" class="agent-human">
                    <time v-if="row.at" class="entry-time">{{ fmtTime(row.at) }}</time>
                    <div class="agent-human-bubble" @click="onTaskDrawerBubbleClick(row, $event)">
                      {{ row.text }}
                    </div>
                  </div>
                  <div
                    v-else-if="row.kind === 'text'"
                    class="agent-text"
                    @click="onTaskDrawerBubbleClick(row, $event)"
                  >
                    <time v-if="row.at" class="entry-time">{{ fmtTime(row.at) }}</time>
                    {{ row.text }}
                  </div>
                  <ChatToolCallRow v-else :calls="row.calls" :at="row.at" />
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
          </section>
        </div>
        <div v-else-if="ui.activeTab === 'changes'" class="drawer-body">
          <div v-if="ui.active && shotWarning" class="shot-warning shot-warning-changes">
            {{ shotWarning }}
            <span class="shot-warning-hint">
              Pick the right target from the preview control above.
            </span>
          </div>
          <section
            v-if="ui.active && uiHandoffVerification"
            class="changes-summary ui-verification-evidence"
            aria-label="Handoff UI verification"
          >
            <div class="changes-summary-title">Handoff UI verification</div>
            <p class="ui-verification-meta">
              {{ repo.fmtDate(uiHandoffVerification.at) }}
              · {{ uiHandoffVerification.captures }} capture(s)
            </p>
            <p v-if="uiHandoffVerification.issues.length === 0" class="ui-verification-ok">
              No console errors, failed same-origin requests, overflow, or blank captures at
              handoff.
            </p>
            <ul v-else class="ui-verification-issues">
              <li v-for="(issue, idx) in uiHandoffVerification.issues" :key="idx">
                <span class="mono">[{{ issue.kind }}]</span> {{ issue.message }}
                <span v-if="issue.viewportWidth !== undefined" class="ui-verification-detail">
                  @{{ issue.viewportWidth }}px
                </span>
                <span v-if="issue.url" class="ui-verification-detail" :title="issue.url">{{
                  issue.url
                }}</span>
              </li>
            </ul>
          </section>
          <!-- Captured preview shots (#0611). Same one-per-row shape as the New
               task / New input pending attachments (ff-pending-*), because a
               thumbnail grid had no room for the `## Shots` spec the reviewer
               actually reads: label, target · route, selector, steps. -->
          <section
            v-if="ui.active && (uiChangeRows.length || uiShotProblems.length || canManageShots)"
            class="changes-summary ui-changes"
            aria-label="UI changes"
          >
            <div class="changes-summary-title changes-summary-head">
              <span>UI changes</span>
              <!-- #0627: add a shot and delete one, right here. Shown while the
                   task is active/review with a branch — a capture needs the
                   worktree's preview, and both edit only the task .md plus the
                   gitignored attachments tree. -->
              <Button
                v-if="canManageShots"
                variant="outline"
                size="sm"
                data-test-id="add-shot"
                :disabled="addShotBusy"
                @click="openAddShot"
              >
                {{ addShotBusy ? "Capturing…" : "Add shot" }}
              </Button>
            </div>
            <div
              v-for="problem in uiShotProblems"
              :key="problem.at + problem.detail"
              class="shot-warning shot-problem"
              role="alert"
            >
              <strong>Shots {{ problem.status }}:</strong> {{ problem.detail }}
            </div>
            <div
              v-if="uiMissingShots.length"
              class="ff-pending-files shot-rows"
              aria-label="Declared shots that were not captured"
            >
              <div
                v-for="row in uiMissingShots"
                :key="row.title + row.context"
                class="ff-pending-file shot-row shot-row-missing"
              >
                <div class="shot-row-text">
                  <span class="ff-pending-file-name" :title="row.title">{{ row.title }}</span>
                  <span class="shot-row-detail">not captured</span>
                  <span v-if="row.context" class="shot-row-detail">{{ row.context }}</span>
                  <span v-if="row.selector" class="shot-row-detail" :title="row.selector">
                    <span class="shot-row-key">selector</span>{{ row.selector }}
                  </span>
                  <span v-if="row.stepsText" class="shot-row-detail" :title="row.stepsText">
                    <span class="shot-row-key">steps</span>{{ row.stepsText }}
                  </span>
                </div>
              </div>
            </div>
            <div class="ff-pending-files shot-rows" aria-label="Captured preview shots">
              <div
                v-for="(row, i) in uiChangeRows"
                :key="row.meta.name"
                class="ff-pending-file shot-row"
              >
                <img :src="row.meta.url" :alt="row.title" @click="openShotsViewer(i)" />
                <div class="shot-row-text">
                  <span class="ff-pending-file-name" :title="row.title">{{ row.title }}</span>
                  <span v-if="row.context" class="shot-row-detail" :title="row.context">
                    {{ row.context }}
                  </span>
                  <!-- #0603's "why this shot exists" caption, carried onto the
                       row rather than left behind on the old thumbnail grid. -->
                  <span v-if="row.provenance" class="shot-row-detail" :title="row.provenance">{{
                    row.provenance
                  }}</span>
                  <span v-if="row.selector" class="shot-row-detail" :title="row.selector">
                    <span class="shot-row-key">selector</span>{{ row.selector }}
                  </span>
                  <span v-if="row.stepsText" class="shot-row-detail" :title="row.stepsText">
                    <span class="shot-row-key">steps</span>{{ row.stepsText }}
                  </span>
                </div>
                <!-- Stacked: expand on top, delete below, both the same size. -->
                <div class="shot-row-actions">
                  <ScreenshotExpandButton :name="row.title" @click="openShotsViewer(i)" />
                  <!-- #0627: per-shot delete, confirm through the shared dialog.
                       Same remove button the pending-attachment rows use. -->
                  <button
                    v-if="canManageShots"
                    type="button"
                    class="ff-pending-file-remove"
                    data-test-id="shot-delete"
                    aria-label="Delete shot"
                    :disabled="deleteShotBusy"
                    @click="deleteShotTarget = row.meta"
                  >
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </section>
          <template v-if="!ui.active">
            <p class="changes-empty">Select a task to view changes.</p>
          </template>
          <template v-else-if="!ui.active.branch">
            <p class="changes-empty">No branch yet — start work to create the worktree.</p>
          </template>
          <template
            v-else-if="
              !ui.active.git?.worktreeExists && taskDiff !== undefined && taskDiff.patch === ''
            "
          >
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
                  <span class="stat-value" style="color: var(--green)"
                    >+{{ taskDiffStats.additions }}</span
                  >
                </div>
                <div class="diff-stat-item">
                  <span class="stat-label">Deleted:</span>
                  <span class="stat-value" style="color: var(--red)"
                    >−{{ taskDiffStats.deletions }}</span
                  >
                </div>
              </div>
              <div v-else class="diff-stats-loading">
                <ActivityIndicator size="sm" label="Loading diff…" />
                Loading changes…
              </div>
              <!-- #0647: a dirty worktree means part of what you see below is
                   not on the branch yet. The patch already includes those
                   edits, so this is navigation to the same full-screen diff
                   the per-file expand buttons open — nothing is re-rendered
                   here, and the row only exists while files are actually
                   uncommitted. -->
              <div v-if="worktreeDirty" class="diff-dirty">
                <span class="diff-dirty-text">
                  This worktree has uncommitted changes. They are in this diff, but not on the
                  branch yet.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  class="diff-dirty-btn"
                  data-test-id="changes-view-diff"
                  title="Open the full-screen diff view"
                  @click="openFullDiff()"
                >
                  <Expand class="size-3.5" />
                  View diff
                </Button>
              </div>
              <div v-if="diffLooksLikeDrift" class="diff-stat-warning">
                This diff looks much bigger than the task — main has likely drifted since the branch
                was cut.
                <template v-if="ui.active?.branch">
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
              <DiffFileViewer
                :patch="taskDiff.patch"
                :truncated="taskDiff.truncated"
                expandable
                @expand="openFullDiff"
              />
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
          <div v-if="taskUsage && taskUsage.totalSessions > 0" class="task-sections">
            <section class="task-section">
              <header class="task-section-head">
                <div class="task-section-title">task totals</div>
                <div class="task-section-desc">Whole-task summary across every session.</div>
              </header>
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
                  <span class="agent-stat-value">{{
                    fmtCost(taskUsage.totalCostUsd, taskUsage.costSource)
                  }}</span>
                </span>
                <span
                  class="agent-stat"
                  title="Total model round-trips across this task's sessions (one turn may run several tool calls). '—' when no CLI reported it."
                >
                  <span class="agent-stat-label">turns</span>
                  <span class="agent-stat-value">{{ taskUsage.totalTurns ?? "—" }}</span>
                </span>
                <span class="agent-stat">
                  <span class="agent-stat-label">sessions</span>
                  <span class="agent-stat-value">{{ taskUsage.totalSessions }}</span>
                </span>
              </div>
            </section>
            <section
              v-if="taskUsage.roles && taskUsage.roles.length > 1"
              class="task-section"
              aria-labelledby="task-section-role"
            >
              <header class="task-section-head">
                <div id="task-section-role" class="task-section-title">by role</div>
                <div class="task-section-desc">Who spent what, broken down by role.</div>
              </header>
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
            </section>
            <section
              v-if="taskUsage.sessions && taskUsage.sessions.length > 0"
              class="task-section"
              aria-labelledby="task-section-sessions"
            >
              <header class="task-section-head">
                <div id="task-section-sessions" class="task-section-title">individual sessions</div>
                <div class="task-section-desc">The raw session log — one row per session.</div>
              </header>
              <div class="task-usage-table-wrap">
                <table class="task-usage-table">
                  <thead>
                    <tr class="task-usage-session-head">
                      <th class="ta-left">type</th>
                      <th class="ta-left">agent / model</th>
                      <th
                        class="ta-left task-usage-session-time"
                        :title="
                          sessionTimesExpanded
                            ? 'Click to show time only'
                            : 'Click to show date and time'
                        "
                        @click="toggleSessionTimeExpand()"
                      >
                        started
                      </th>
                      <th
                        class="ta-left task-usage-session-time"
                        :title="
                          sessionTimesExpanded
                            ? 'Click to show time only'
                            : 'Click to show date and time'
                        "
                        @click="toggleSessionTimeExpand()"
                      >
                        ended
                      </th>
                      <th class="ta-right">time</th>
                      <th class="ta-right">tokens</th>
                      <th
                        class="ta-right"
                        title="Share of this session's input served from the provider's prompt cache (hover a cell for raw token counts)"
                      >
                        cache
                      </th>
                      <th
                        class="ta-right"
                        title="Model round-trips (one turn may run several tool calls). A high count relative to the work usually means the agent was thrashing."
                      >
                        turns
                      </th>
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
                        <div v-if="sessionAgentsExpanded" class="task-usage-session-model">
                          {{ s.model }}
                        </div>
                      </td>
                      <td class="ta-left">
                        {{ fmtSessionTime(s.startedAt, sessionTimesExpanded) }}
                      </td>
                      <td class="ta-left">
                        {{
                          s.endedAt
                            ? fmtSessionTime(s.endedAt, sessionTimesExpanded)
                            : s.status === "active"
                              ? "running…"
                              : "—"
                        }}
                      </td>
                      <td class="ta-right">{{ fmtElapsed(s.elapsedMs) }}</td>
                      <td class="ta-right">{{ fmtTokens(s.totalTokens) }}</td>
                      <td class="ta-right" :title="cacheCellTitle(s)">
                        {{ cacheHitPct(s.inputTokens, s.cacheReadTokens, s.cacheCreationTokens) }}
                      </td>
                      <td class="ta-right">{{ s.turns ?? "—" }}</td>
                      <td class="ta-right">{{ fmtCost(s.costUsd, s.costSource) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          <div
            v-if="!showStats && (!taskUsage || taskUsage.totalSessions === 0)"
            class="agent-empty"
          >
            <p>No token or usage data yet.</p>
          </div>
        </div>
        <div v-else-if="ui.activeTab === 'debug'" class="drawer-body">
          <DebugPanel v-if="ui.active" :task="ui.active" v-model:view="ui.debugView" />
        </div>
        <template v-else-if="ui.activeTab === 'pm'">
          <!-- #0515: the chat itself is the shared <PmChatSurface>, which the
               story panel's PM tab renders too. The per-task bits stay here —
               the override bar (passed in the `header` slot), and the
               store/buffer this feeds. -->
          <PmChatSurface
            v-if="ui.active"
            ref="pmSurface"
            v-model:draft="pmDraft"
            :chat-id="pmSessionId(ui.active.id)"
            :lines="pmLines"
            :busy="pmBusy"
            :disabled="!pmAgentEnabled"
            placeholder="Ask PM to edit this task…"
            welcome-title="Chat about this task"
            welcome-body="Ask the PM to edit the task, suggest changes, or discuss progress."
            log-label="Conversation with the PM about this task"
            :canned="pmCannedMessages"
            :open-questions="pmOpenQuestionsForActive()"
            :shots="ui.pmScreenshots"
            @send="pmSend"
            @interrupt="pmInterrupt"
            @attach="onPmShotFiles"
            @remove-shot="ui.removePmScreenshot"
            @open-shot="openPmViewer"
          >
            <template #header>
              <div v-if="ui.active" class="agent-override-bar">
                <div class="agent-pick-grid">
                  <div class="agent-field" style="grid-column: 1 / -1">
                    <AgentModelControl
                      :cli-options="cliOptionsFor(pmOverrideDraft.cli)"
                      :model-options="pmModelOptions"
                      :memory-key="'task:' + ui.active.id + ':pm'"
                      v-model:cli="pmOverrideDraft.cli"
                      v-model:model="pmOverrideDraft.model"
                      :disabled="ui.saving"
                    />
                    <div
                      v-if="isLegacyGeminiCli(pmOverrideDraft.cli)"
                      class="agent-legacy-notice"
                      role="status"
                    >
                      <strong>Deprecated Gemini CLI</strong> — this saved PM override is preserved,
                      but new runs should use
                      <a :href="GEMINI_MIGRATION_URL" target="_blank" rel="noopener noreferrer"
                        >Antigravity CLI (agy)</a
                      >.
                    </div>
                  </div>
                  <div class="agent-field">
                    <div
                      v-if="pmOverrideDirty"
                      class="agent-override-actions"
                      style="padding-top: 20px"
                    >
                      <span class="agent-save-hint">saving…</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </PmChatSurface>
        </template>
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
    :override-dependencies="restartOverrideDependencies"
    @close="
      () => {
        restartTask = null;
        restartOverrideDependencies = false;
      }
    "
    @started="ui.activeTab = 'agent'"
  />

  <DirtyCheckoutDialog
    :task="dirtyTask"
    :files="dirtyFiles"
    :scope="dirtyScope"
    @commit="confirmCommitDirty"
    @cancel="cancelDirty"
  />

  <WorktreeHandoffConflictDialog
    :task="handoffConflictTask"
    :message="handoffConflictMessage"
    :dirty-files="handoffConflictFiles"
    @discard="discardHandoffConflict"
    @send-back="sendBackHandoffConflict"
    @cancel="cancelHandoffConflict"
  />

  <HotfixConfirmDialog
    :open="confirmHotfix"
    :task-id="hotfixTask?.id ?? ui.active?.id"
    :busy="ui.saving"
    @cancel="confirmHotfix = false"
    @start="startHotfix"
  />

  <ReviewConfirmDialog
    :open="confirmReview"
    :task-label="reviewTask ? `#${reviewTask.id} · ${reviewTask.title}` : ''"
    :busy="ui.saving"
    @update:open="(v) => (v ? undefined : closeReviewConfirm())"
    @run-checks="confirmReviewWith(true)"
    @skip-checks="confirmReviewWith(false)"
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

  <ScreenshotViewer
    v-model:open="pendingViewerOpen"
    :shots="pendingViewerShots"
    :start-index="pendingViewerStart"
  />
  <ScreenshotViewer
    v-model:open="pmViewerOpen"
    :shots="pmViewerShots"
    :start-index="pmViewerStart"
  />
  <ScreenshotViewer
    v-model:open="shotsViewerOpen"
    :shots="shotsViewerShots"
    :start-index="shotsViewerStart"
  />

  <StopWorkConfirmModal
    :open="confirmStopWork"
    :task-id="stopWorkTask?.id ?? ui.active?.id"
    :busy="ui.saving"
    @update:open="(v) => (confirmStopWork = v)"
    @confirm="confirmAbandonWork"
    @cancel="cancelAbandonWork"
  />

  <DeleteTaskDialog
    :open="deleteTaskTarget !== null"
    :task="deleteTaskTarget"
    :busy="ui.saving"
    @update:open="(v) => !v && cancelDelete()"
    @confirm="deleteTask"
  />

  <ArchiveTaskDialog
    :open="archiveTaskTarget !== null"
    :task="archiveTaskTarget"
    :busy="archiveBusy"
    @update:open="(v) => !v && cancelArchive()"
    @confirm="confirmArchive"
  />

  <AddShotModal
    :open="addShotOpen"
    :targets="previewTargets"
    :busy="addShotBusy"
    :error="addShotError"
    :warning="addShotWarning"
    @update:open="onAddShotOpen"
    @submit="submitAddShot"
  />

  <DeleteShotDialog
    :open="deleteShotTarget !== null"
    :shot="deleteShotTarget"
    :busy="deleteShotBusy"
    @update:open="(v) => !v && (deleteShotTarget = null)"
    @confirm="confirmDeleteShot"
  />
</template>

<style scoped>
/* The PM chat's own surface (bubbles, compose box, canned prompts, pending
 * screenshots) lives in `style.css`, not here: #0515 gave the story panel a PM
 * tab that must look and behave identically, and the shared classes can only
 * be shared from a global sheet — dialog content is body-teleported, so a
 * scoped rule here would never reach either panel. Nothing below styles the
 * PM tab. */

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
  color: var(--red);
  font-size: 11px;
  font-weight: 500;
  background: var(--red-tint);
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
  letter-spacing: 0.04em;
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
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.changes-empty {
  padding: 24px;
  text-align: center;
  color: var(--txt-faint);
  font-size: 13px;
}

.diff-output {
  margin: 0;
  padding: 12px;
  /* hardcode-ok: fixed dark code-pane palette — deliberately dark in every theme */
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

.field-optional {
  color: var(--txt-muted);
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}

.nt-body-textarea {
  width: 100%;
  min-height: 112px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-solid);
  color: var(--txt);
  font: 13px/1.5 var(--font-sans);
  resize: vertical;
}

.nt-body-textarea:focus {
  outline: none;
  border-color: var(--border-bright);
}
</style>
