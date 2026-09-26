<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, onBeforeUnmount } from "vue";
import type { Task } from "../types";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { recordOrigin, takeOrigin } from "../lib/flip";
import { parseReviewVerdict } from "../lib/reviewVerdict";
import {
  autoRepairHint,
  formatActivity,
  formatDuration,
  silentMs,
  STUCK_SILENCE_MS,
} from "../lib/retryHints";
import {
  needsInputBannerText,
  needsInputStatusLabel,
  needsInputSurfaces,
} from "../lib/needs-input-ui";
import RestartTaskDialog from "./RestartTaskDialog.vue";
import DirtyMainDialog from "./DirtyMainDialog.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import DoneErrorCard from "./DoneErrorCard.vue";
import CopyableNumber from "./CopyableNumber.vue";
import AgentModelModal from "./AgentModelModal.vue";

const props = withDefaults(
  defineProps<{ task: Task; dragEnabled?: boolean; highlighted?: boolean }>(),
  {
    dragEnabled: true,
    highlighted: false,
  },
);

const ui = useUiStore();
const repo = useRepoStore();
const config = useConfigStore();

/**
 * Effective per-task agent/model assignments shown by the card's robot toggle.
 * The compact board snapshot carries the lightweight overrides so this need
 * not fetch or open the task drawer first.
 */
type AssignmentRole = "pm" | "engineer" | "reviewer";
interface AgentAssignment {
  key: AssignmentRole;
  label: "PM" | "EN" | "RV";
  cli: string;
  model: string;
  baseCli: string;
  baseModel: string;
}

const agentAssignments = computed(() => {
  const enabled = (config.agents ?? []).filter((a) => a.enabled);
  const t = props.task;
  const resolve = (
    key: AssignmentRole,
    label: AgentAssignment["label"],
    agentOverride: string | null | undefined,
    cliOverride: string | null | undefined,
    modelOverride: string | null | undefined,
  ): AgentAssignment => {
    const name = (agentOverride || key).toLowerCase();
    const base = enabled.find((a) => a.name.toLowerCase() === name) ?? null;
    const baseCli = base?.cli ?? "default";
    const baseModel = base?.model ?? "default";
    const cli = cliOverride || baseCli;
    // `default` is a sentinel rather than a real pin. When a CLI override
    // changes the harness, the resolver intentionally uses that harness's
    // default model; otherwise retain the configured role model.
    const model =
      modelOverride && modelOverride !== "default"
        ? modelOverride
        : cli !== baseCli
          ? "default"
          : baseModel;
    return { key, label, cli, model, baseCli, baseModel };
  };
  return [
    resolve("pm", "PM", t.pmAgentOverride, t.pmCliOverride, t.pmModelOverride),
    resolve("engineer", "EN", t.agentOverride, t.cliOverride, t.modelOverride),
    resolve("reviewer", "RV", t.reviewAgentOverride, t.reviewCliOverride, t.reviewModelOverride),
  ];
});

/** The compact assignment table only opens or closes from the robot button. */
const agentPanelOpen = ref(false);
function toggleAgentPanel(): void {
  agentPanelOpen.value = !agentPanelOpen.value;
}

const assignmentModalOpen = ref(false);
const assignmentModalRole = ref<AssignmentRole | null>(null);
const assignmentModalCli = ref("");
const assignmentModalModel = ref("");
const modalAssignment = computed(
  () => agentAssignments.value.find((a) => a.key === assignmentModalRole.value) ?? null,
);
const assignmentCliOptions = computed(() => {
  const current = assignmentModalCli.value;
  const options = config.agentsMeta.clis ?? [];
  return current && !options.includes(current) ? [current, ...options] : options;
});
const assignmentModelOptions = computed(() =>
  config.modelsFor(assignmentModalCli.value, assignmentModalModel.value || undefined),
);

function openAssignmentModal(assignment: AgentAssignment): void {
  assignmentModalRole.value = assignment.key;
  assignmentModalCli.value = assignment.cli;
  assignmentModalModel.value = assignment.model;
  assignmentModalOpen.value = true;
}

function onAssignmentCli(cli: string): void {
  assignmentModalCli.value = cli;
}

async function onAssignmentModel(model: string): Promise<void> {
  assignmentModalModel.value = model;
  const assignment = modalAssignment.value;
  if (!assignment) return;
  const cliOverride =
    assignmentModalCli.value === assignment.baseCli ? null : assignmentModalCli.value;
  const modelOverride =
    assignmentModalCli.value === assignment.baseCli &&
    assignmentModalModel.value === assignment.baseModel
      ? null
      : assignmentModalCli.value !== assignment.baseCli && assignmentModalModel.value === "default"
        ? null
        : assignmentModalModel.value;
  const patch =
    assignment.key === "pm"
      ? { pmCliOverride: cliOverride, pmModelOverride: modelOverride }
      : assignment.key === "engineer"
        ? { cliOverride, modelOverride }
        : { reviewCliOverride: cliOverride, reviewModelOverride: modelOverride };
  try {
    await repo.patchTask(props.task.id, patch);
  } catch (err) {
    repo.onError(err);
  }
}

const busy = ref(false);
const dragging = ref(false);

/** Root card element — needed to read/seed FLIP rects for the glide (#0292). */
const rootEl = ref<HTMLElement | null>(null);

/** Resolve the "reduce motion" system preference; true means animations off. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Whether the card should glide on this mount: the opt-in setting is on, the
 *  system allows motion, and this card is actually mid-transition. */
function shouldGlide(): boolean {
  return (
    ui.glideAnimations && !prefersReducedMotion() && repo.transitionState?.id === props.task.id
  );
}

const GLIDE_DURATION_MS = 480;
const GLIDE_EASING = "cubic-bezier(.22,1,.36,1)";

/**
 * Optional glide (#0292): when this card mounted into its new column because
 * its status changed, seed a transform that puts it at its old position
 * (recorded before the source-card unmounted) and play it back to identity.
 * Deliberately decoupled from the existing shimmer — it only fires for a card
 * that genuinely moved, and only while the glide setting is on.
 */
onMounted(() => {
  if (!shouldGlide()) return;
  const origin = takeOrigin(props.task.id);
  const el = rootEl.value;
  if (!origin || !el) return;
  const dest = el.getBoundingClientRect();
  const dx = origin.left - dest.left;
  const dy = origin.top - dest.top;
  el.style.transformOrigin = "center";
  el.style.transform = `translate(${dx}px, ${dy}px)`;
  el.style.transition = "none";
  // Force a reflow so the seeded (inverted) transform is the "first" paint,
  // then play the transform to identity over the glide duration.
  void el.offsetWidth;
  el.style.transition = `transform ${GLIDE_DURATION_MS}ms ${GLIDE_EASING}`;
  el.style.transform = "translate(0, 0)";
  window.setTimeout(() => {
    el.style.transition = "";
    el.style.transform = "";
  }, GLIDE_DURATION_MS);
});

/** A card leaving its column (status changed) records its old position so the
 *  destination card can glide from it. Only when a transition for this very
 *  task is in flight and the glide is enabled. */
onBeforeUnmount(() => {
  if (!shouldGlide()) return;
  const el = rootEl.value;
  if (!el) return;
  recordOrigin(props.task.id, el.getBoundingClientRect());
});

/**
 * A running agent process can go silent (hung network call, dead stream)
 * without ever exiting, so `repo.isRunning()` alone can't tell "coding right
 * now" apart from "stuck." `now` ticks so the staleness check below stays
 * live without needing any store event to fire.
 */
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 15_000);
});
onUnmounted(() => {
  clearInterval(nowTimer);
});

/** The task's most recent agent activity timestamp, if known. */
function lastActivityFor(taskId: string): string | undefined {
  return repo.agentActivityAt[taskId] ?? repo.runningSince[taskId];
}

/** Diff stats for this task. */
const diffStats = computed(() => {
  return repo.diffStatsFor(props.task.id);
});

/** Load diff stats when card is rendered. */
onMounted(() => {
  void repo.loadDiffStats(props.task.id);
});

function onDragStart(e: DragEvent): void {
  if (!props.dragEnabled) return;
  const dt = e.dataTransfer;
  if (!dt) return;
  dt.effectAllowed = "move";
  dt.setData("text/plain", props.task.id);
  dragging.value = true;
  // dataTransfer's actual payload is unreadable by other columns until drop,
  // so share the dragged task via the store instead — that's what lets a
  // column show a valid/invalid cue while the drag is still in progress.
  repo.setDraggingTask(props.task);
}

function onDragEnd(): void {
  dragging.value = false;
  repo.setDraggingTask(null);
  window.dispatchEvent(new CustomEvent("repoos:board-dragend"));
}

/** Task whose dirty-worktree restart choice is awaiting an answer. */
const restartTask = ref<Task | null>(null);

interface CardAction {
  label: string;
  title: string;
  icon: string;
  variant: "start" | "pause" | "done" | "move";
}

const ACTIONS: Partial<Record<Task["status"], CardAction>> = {
  draft: {
    label: "Move to inbox",
    title: "Move this proposal into the work queue",
    icon: "M5 12h14m-6-6 6 6-6 6",
    variant: "move",
  },
  inbox: {
    label: "Move to ready",
    title: "Queue this task as ready to start",
    icon: "M5 12h14m-6-6 6 6-6 6",
    variant: "move",
  },
  ready: {
    label: "Start work",
    title: "Launch the engineer agent on this task",
    icon: "M8 5v14l11-7z",
    variant: "start",
  },
  review: {
    label: "Move to done",
    title: "Merge the branch, run repoos check, and mark the task done",
    icon: "M4 12l5 5L20 6",
    variant: "done",
  },
};

/** `active` bifurcates on repo.isRunning rather than status — see `action` below. */
const ACTIVE_PAUSE: CardAction = {
  label: "Pause work",
  title: "Stop the agent; the task stays active so you can resume it",
  icon: "M10 4H6v16h4zM18 4h-4v16h4z",
  variant: "pause",
};
const ACTIVE_RESTART: CardAction = {
  label: "Restart work",
  title: "Relaunch the agent on this task from where it left off",
  icon: "M8 5v14l11-7z",
  variant: "start",
};

interface CardHint {
  label: string;
  title: string;
  cls: string;
}

/** True once Move to done has been clicked and the close-out job for this
 *  task is enqueued or running in the integration pipeline (0207). The
 *  `/done` request itself resolves as soon as the job is queued — status
 *  stays `review` for the whole pipeline run — so this is the only signal
 *  that MTD was already triggered and shouldn't be offered again. */
const inPipeline = computed(() => {
  const snap = repo.integration;
  if (!snap) return false;
  const t = props.task;
  return snap.active?.taskId === t.id || snap.queue.includes(t.id);
});

/** The active pipeline stage (sync/merge/build/check/done) for this task, or
 *  null when it's still queued behind another close-out. */
const pipelineStage = computed(() => {
  const snap = repo.integration;
  return snap?.active?.taskId === props.task.id ? snap.active.stage : null;
});

/** A live agent process that has gone silent past STUCK_SILENCE_MS, or the
 *  normal "coding" hint when it's still producing output. */
function codingOrStuckHint(taskId: string): CardHint {
  const lastActivity = lastActivityFor(taskId);
  const ms = silentMs(now.value, lastActivity);
  if (ms !== null && ms >= STUCK_SILENCE_MS) {
    return {
      label: `stuck · silent ${formatDuration(ms)}`,
      title:
        "agent process is still running but hasn't produced output in a while — it may be hung. Click to inspect, or restart work.",
      cls: "tc-stuck",
    };
  }
  const activity = formatActivity(now.value, lastActivity);
  return {
    label: activity ? `coding · active ${activity}` : "coding",
    title: "agent is making code changes — click to watch the session",
    cls: "tc-coding",
  };
}

/** An accepted start/send is waiting for a free maxConcurrentAgents slot —
 *  it will spawn on its own once a running agent exits. */
const QUEUED_HINT: CardHint = {
  label: "queued",
  title:
    "waiting for a free agent slot (maxConcurrentAgents) — will start automatically once one frees up",
  cls: "tc-queued",
};

/** A PM run is live on this task (0381): the freeform flesh-out for a draft,
 *  or a PM chat turn. The same server-side registry backs both, so one hint
 *  serves them; only the title differs for drafts. */
const PM_WORKING_HINT: CardHint = {
  label: "PM is working",
  title: "the PM agent is working on this task — open it to see the PM tab",
  cls: "tc-pm-working",
};

function needsInputHint(task: Task): CardHint {
  const hasQuestions = (task.questions?.length ?? 0) > 0;
  return {
    label: needsInputStatusLabel(task.needsInputReason, hasQuestions),
    title: needsInputBannerText(task.needsInputReason, hasQuestions),
    cls: "tc-needs-input",
  };
}

/** The last automatic review's actual outcome for this task, when one
 *  exists — null while no report has landed yet, or its state is
 *  unparseable. Distinct from `reviewFor(id)?.running`: that's whether a
 *  review is happening right now, this is what the last one concluded. */
const reviewVerdict = computed(() =>
  parseReviewVerdict(repo.reviewFor(props.task.id)?.report?.markdown),
);

/** The three review substates: reviewing / coding / waiting for human. */
const hint = computed<CardHint | null>(() => {
  const t = props.task;
  const pmWorking = repo.pmWorkingFor(t.id);
  // The freeform-create PM agent is fleshing this draft out right now
  // (0335) — a draft otherwise looks identical to an idle one. Guarded on
  // `draft` so the indicator disappears the moment the promotion lands,
  // even in the sub-second window before the server's pmFinished event.
  if (t.status === "draft" && pmWorking) {
    return {
      label: "PM is working",
      title: "the PM agent is fleshing out this draft — it moves to inbox when done",
      cls: "tc-pm-working",
    };
  }
  if (t.status === "review") {
    if (inPipeline.value) {
      return {
        label: pipelineStage.value
          ? `moving to done · ${pipelineStage.value}`
          : "queued for close-out",
        title:
          "Move to done already started — merging, building, and checking. See the pipeline bar for live progress.",
        cls: "tc-moving",
      };
    }
    if (repo.reviewFor(t.id)?.running) {
      return { label: "Reviewing…", title: "automatic review in progress", cls: "tc-reviewing" };
    }
    if (repo.isQueued(t.id)) return QUEUED_HINT;
    if (repo.isRunning(t.id)) {
      return (
        autoRepairHint({
          task: t,
          running: true,
          lastActivity: lastActivityFor(t.id),
          now: now.value,
        }) ?? codingOrStuckHint(t.id)
      );
    }
    // A failed Move to done shows its own error banner below (DoneErrorCard)
    // — "review passed · ready to finish" right above it reads as
    // contradictory once that attempt already failed.
    if (repo.doneErrorFor(t.id)) return null;
    if (needsInputSurfaces(t)) return needsInputHint(t);
    // 0381: a PM chat run on a review task outranks the idle verdicts —
    // the PM is touching the task right now.
    if (pmWorking) return PM_WORKING_HINT;
    const lastReport = repo.reviewFor(t.id)?.report;
    if (lastReport?.state === "incomplete") {
      return {
        label: "review incomplete",
        title: "the reviewer stopped without a verdict — open the task and use Review again",
        cls: "tc-review-warn",
      };
    }
    // "Nothing is currently running" isn't the same claim as "the review
    // passed" — a task can sit here idle after a "needs some work" or "back
    // to the drawing board" verdict too (e.g. auto-bounce hit its round
    // cap). Only a green "good to go" verdict gets the ready-to-finish label.
    const v = reviewVerdict.value;
    if (v?.tone === "red") {
      return {
        label: "review: back to the drawing board",
        title: "the reviewer rejected this — open the task to see why",
        cls: "tc-review-bad",
      };
    }
    if (v?.tone === "amber") {
      return {
        label: "review: needs some work",
        title: "the reviewer found issues — open the task to see the report",
        cls: "tc-review-warn",
      };
    }
    if (v?.tone === "green") {
      return {
        label: "review passed · ready to finish",
        title: "review passed — approve and move to done to finish",
        cls: "tc-human",
      };
    }
    return null;
  }
  if (t.status === "active") {
    if (repo.isQueued(t.id)) return QUEUED_HINT;
    if (repo.isRunning(t.id)) {
      return (
        autoRepairHint({
          task: t,
          running: true,
          lastActivity: lastActivityFor(t.id),
          now: now.value,
        }) ?? codingOrStuckHint(t.id)
      );
    }
    if (t.needsInput) return needsInputHint(t);
    // 0381: the engineer is idle (paused) but the PM is chatting about this
    // task right now — that is the live thing happening.
    if (pmWorking) return PM_WORKING_HINT;
    // #0507: the handoff finalization is in flight — the task is still
    // `active` on purpose, so say what is actually happening rather than
    // falling through to "paused", which would read as a stopped agent.
    if (repo.handoffInFlight(t.id)) {
      return {
        label: "running checks",
        title: "RepoOS is committing and running the checks before moving this to review",
        cls: "tc-reviewing",
      };
    }
    if (repo.handoffErrorFor(t.id)) {
      return {
        label: "checks failed",
        title: repo.handoffErrorFor(t.id) ?? "handoff finalization failed",
        cls: "tc-needs-input",
      };
    }
    if (t.pendingHandoff) {
      return {
        label: "requested review",
        title: "agent requested review — RepoOS will finalize it when the turn ends",
        cls: "tc-human",
      };
    }
    return {
      label: "paused",
      title: "agent stopped — click Restart work to resume",
      cls: "tc-stalled",
    };
  }
  // 0381: a PM chat run can touch a task in ANY status — ready, inbox,
  // even done. Without this the card would look idle while the PM works.
  if (pmWorking) return PM_WORKING_HINT;
  return null;
});

/** The auto-repair hint in flight for the error card below, or null when no
 *  covered retry is running — so the card's Fix button stays the explicit
 *  "only path" when the automatic retries have given up (#0385). */
const doneErrorRetryHint = computed(() =>
  autoRepairHint({
    task: props.task,
    running: repo.isRunning(props.task.id),
    lastActivity: lastActivityFor(props.task.id),
    now: now.value,
  }),
);

const IN_PIPELINE: CardAction = {
  label: "Moving to done…",
  title: "Already queued for close-out — no further action needed",
  icon: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2",
  variant: "done",
};

/** `task.status` alone can't tell paused from running once pausing no longer
 *  demotes to `ready` — the running-agent set (repo.isRunning) is the signal. */
const action = computed<CardAction | null>(() => {
  const t = props.task;
  if (t.status === "review" && inPipeline.value) return IN_PIPELINE;
  // A failed Move to done leaves its error banner + Fix button on the card
  // (below) — showing "Move to done" here too just invites clicking straight
  // back into the same failure. The task drawer keeps its own Move to done
  // button, so retrying is still one click away, just not from the card.
  if (t.status === "review" && repo.doneErrorFor(t.id)) return null;
  if (t.status === "active") return repo.isRunning(t.id) ? ACTIVE_PAUSE : ACTIVE_RESTART;
  return ACTIONS[t.status] ?? null;
});

/** True when the task is genuinely waiting on the human: automatic review
 *  finished clean, the engineer is not coding/fixing, and no close-out job is
 *  queued. This is the "review passed clean" trigger (0270) that highlights
 *  the Move to done button and raises the card cue. It mirrors the
 *  `waiting-for-human` card state — every condition must hold, so the button
 *  is never highlighted while the review runs, the engineer works, or a
 *  close-out is in flight — and now also not when the last verdict was
 *  actually "needs some work" or "back to the drawing board": a task can
 *  sit idle in review after a bad verdict too (e.g. auto-bounce hit its
 *  round cap), and the ready-to-merge glow shouldn't claim otherwise. */
const reviewReady = computed(() => {
  const report = repo.reviewFor(props.task.id)?.report;
  return (
    props.task.status === "review" &&
    !inPipeline.value &&
    !repo.reviewFor(props.task.id)?.running &&
    !repo.isRunning(props.task.id) &&
    report?.state !== "incomplete" &&
    reviewVerdict.value?.tone === "green"
  );
});

/** Full-width footer colors retain the board's action/status language. */
const actionFooterClass = computed(() => {
  switch (action.value?.variant) {
    case "start":
      return "border-[var(--cyan-dim)] bg-[var(--cyan-dim)] text-[var(--cyan)] hover:brightness-125";
    case "pause":
      return "border-[var(--amber-tint)] bg-[var(--amber-tint)] text-[var(--amber)] hover:brightness-110";
    case "done":
      return "border-[var(--green-border-tint)] bg-[var(--green-tint)] text-[var(--green)] hover:brightness-110";
    default:
      return "border-border bg-[var(--panel)] text-[var(--txt-dim)] hover:border-[var(--border-bright)] hover:text-foreground";
  }
});

/** True when the action would relaunch the agent (fresh start or resume from pause). */
const isLaunchAction = computed(
  () =>
    props.task.status === "ready" ||
    (props.task.status === "active" && !repo.isRunning(props.task.id)),
);

/** True when this fresh-done card still needs the human to acknowledge it (0278). */
const ackPending = computed(() => repo.needsAck(props.task));

/** Footer styling for the Acknowledge button — the same done-green language as
 *  the Move-to-done action footer, so it reads as a success-acknowledgement. */
const ackFooterClass =
  "border-[var(--green-border-tint)] bg-[var(--green-tint)] text-[var(--green)] hover:brightness-110";

function acknowledge(): void {
  repo.acknowledge(props.task.id);
}

/** True when this card was created by an AI flow whose creation completed and
 *  the human hasn't acknowledged it yet (0320). */
const createAckPending = computed(() => repo.needsCreateAck(props.task.id));

/** Footer styling for the AI-created Acknowledge button — violet, the app's
 *  AI/agent color, deliberately distinct from done-green (0278's ack), amber
 *  (needs-input/warnings), and cyan (start-work) so the states can't be confused. */
const createAckFooterClass =
  "border-[var(--violet-border-tint)] bg-[var(--violet-dim)] text-[var(--violet)] hover:brightness-110";

function acknowledgeCreate(): void {
  repo.acknowledgeCreate(props.task.id);
}

async function runAction(): Promise<void> {
  if (busy.value || !action.value) return;
  if (props.task.status === "review" && repo.reviewFor(props.task.id)?.running) return;
  // A dirty worktree means restarting would either resume prior work or
  // discard it — surface that choice instead of starting silently.
  if (isLaunchAction.value && props.task.git?.dirty) {
    restartTask.value = props.task;
    return;
  }
  busy.value = true;
  try {
    switch (props.task.status) {
      case "draft":
        await repo.setStatus(props.task, "inbox");
        break;
      case "inbox":
        await repo.setStatus(props.task, "ready");
        break;
      case "ready":
        await repo.startWork(props.task);
        break;
      case "active":
        if (repo.isRunning(props.task.id)) await repo.pauseWork(props.task);
        else await repo.startWork(props.task);
        break;
      case "review":
        await repo.completeTask(props.task);
        break;
    }
  } catch (err) {
    // A dirty-main guard (0204) pauses here: the confirmation modal is shown
    // (files live in the store) and `busy` is reset so the card is usable.
    if (err instanceof Error && err.name === "DirtyMainError") {
      dirtyTask.value = props.task;
      return;
    }
    repo.onError(err);
  } finally {
    busy.value = false;
  }
}

/** Dirty-main confirmation (0204): the task whose close-out needs the user to
 *  decide whether to commit `main`'s dirty files before merging. */
const dirtyTask = ref<Task | null>(null);

const dirtyFiles = computed(() => (dirtyTask.value ? repo.dirtyMainFor(dirtyTask.value.id) : []));

async function confirmCommitDirty(): Promise<void> {
  const t = dirtyTask.value;
  const files = dirtyFiles.value;
  dirtyTask.value = null;
  if (!t) return;
  busy.value = true;
  try {
    await repo.completeTask(t, { commitDirty: true });
  } catch (err) {
    if (err instanceof Error && err.name === "DirtyMainError") {
      dirtyTask.value = t;
      return;
    }
    repo.onError(err);
  } finally {
    busy.value = false;
  }
}

function cancelDirty(): void {
  if (dirtyTask.value) repo.clearDirtyMain(dirtyTask.value.id);
  dirtyTask.value = null;
}

/** Open the drawer on the Agent tab to watch the live session. */
async function openAgent(): Promise<void> {
  await ui.openTask(props.task);
  ui.activeTab = "agent";
}

/** Open the drawer on the PM tab — where a live PM run's chat lives (0381). */
async function openPm(): Promise<void> {
  await ui.openTask(props.task);
  ui.activeTab = "pm";
}

/** Open the task panel and focus the error surface (0272): the card stays
 *  compact, so clicking the error on the card surfaces the full detail in the
 *  drawer instead of expanding inline. */
async function openPanelFromError(): Promise<void> {
  await ui.openTask(props.task);
  ui.activeTab = "details";
}

/** Open the task's own debugger (its Debug tab, Debugger view) after a task
 *  error's Fix is sent. */
async function openDebuggerFromError(): Promise<void> {
  await ui.openTask(props.task);
  ui.activeTab = "debug";
  ui.debugView = "debugger";
}
</script>

<template>
  <article
    ref="rootEl"
    :data-task-id="task.id"
    class="task-card group flex shrink-0 cursor-pointer flex-col overflow-hidden rounded-[13px] border border-border bg-[var(--panel)] text-foreground transition duration-150 hover:-translate-y-0.5 hover:border-[var(--border-bright)]"
    :class="{
      flash: repo.flashId === task.id,
      'kb-highlight': highlighted,
      'transition-success': repo.transitionState?.id === task.id,
      coding: repo.isRunning(task.id),
      'pm-working': repo.pmWorkingFor(task.id),
      reviewing: task.status === 'review' && !inPipeline && repo.reviewFor(task.id)?.running,
      'moving-to-done': task.status === 'review' && inPipeline,
      'waiting-for-human':
        task.status === 'review' &&
        !inPipeline &&
        !repo.reviewFor(task.id)?.running &&
        !repo.isRunning(task.id),
      'review-ready': reviewReady,
      'needs-input': needsInputSurfaces(task),
      'done-needs-ack': ackPending,
      'ai-created-ack': createAckPending,
      dragging,
      'has-action': !!action,
    }"
    :draggable="dragEnabled"
    @click="ui.openTask(task)"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
  >
    <div class="flex flex-1 flex-col p-[13px]">
      <div class="flex items-center gap-[7px]">
        <CopyableNumber
          :label="`#${task.id}`"
          :path="`/work?task=${encodeURIComponent(task.id)}`"
          :aria-label="`Copy link to task ${task.id}`"
        />
        <span
          class="rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]"
          >{{ task.type }}</span
        >
        <span
          v-if="task.status === 'review' && task.needsMerge"
          class="tc-merge"
          title="branch drifted from main — move to done to sync and merge"
          >needs merge</span
        >
        <span
          v-if="task.hotfix"
          class="tc-hotfix"
          :title="`Hotfix — runs in main checkout${task.hotfixTarget === 'main' ? ' directly on main' : ' on branch ' + task.branch}`"
          >hotfix</span
        >
        <span
          class="ml-auto rounded-[5px] px-[6px] py-[2px] font-mono text-[9px] font-bold"
          :class="task.priority"
          >{{ task.priority }}</span
        >
      </div>

      <h3 class="mt-[11px] line-clamp-2 text-[13px] font-semibold leading-[1.4]">
        {{ task.title }}
      </h3>

      <div class="mt-[11px] flex flex-wrap items-center gap-[6px]">
        <span
          class="rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]"
          >{{ task.area }}</span
        >
        <span
          v-if="task.assignee !== 'ai'"
          class="rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]"
        >
          {{ task.assignee === "human" ? "◇ " + (task.assignedTo || "human") : "· open" }}
        </span>
        <span
          v-if="diffStats && diffStats.filesChanged > 0"
          class="diff-stats-chip rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]"
          :title="`${diffStats.filesChanged} files, +${diffStats.additions} −${diffStats.deletions}`"
        >
          {{ diffStats.filesChanged }}f {{ diffStats.additions }}+
        </span>
        <span
          v-else-if="diffStats && diffStats.filesChanged === 0 && task.branch"
          class="diff-stats-empty rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]"
          title="No code changes"
          >0 changes</span
        >
        <button
          type="button"
          class="tc-agent-btn ml-auto"
          :class="{ open: agentPanelOpen }"
          :aria-expanded="agentPanelOpen"
          aria-label="Show or hide agent assignments for this task"
          title="Show agent assignments"
          @click.stop="toggleAgentPanel"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <rect
              x="4.5"
              y="8"
              width="15"
              height="11"
              rx="3"
              stroke="currentColor"
              stroke-width="1.8"
            />
            <path d="M12 8V5.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="12" cy="4.3" r="1.4" fill="currentColor" />
            <circle cx="9.6" cy="12.6" r="1.2" fill="currentColor" />
            <circle cx="14.4" cy="12.6" r="1.2" fill="currentColor" />
            <path
              d="M9.2 15.7h5.6"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div v-if="hint" class="mt-[13px]">
        <span
          class="tc-hint"
          :class="hint.cls"
          :title="hint.title"
          @click.stop="
            hint.cls === 'tc-coding' || hint.cls === 'tc-stuck'
              ? openAgent()
              : hint.cls === 'tc-pm-working'
                ? openPm()
                : undefined
          "
        >
          <ActivityIndicator v-if="hint.cls === 'tc-coding'" />
          <ActivityIndicator v-else-if="hint.cls === 'tc-pm-working'" />
          <ActivityIndicator
            v-else-if="hint.cls === 'tc-reviewing'"
            variant="reviewing"
            label="Reviewing…"
          />
          <span
            v-else-if="hint.cls === 'tc-needs-input'"
            class="tc-needs-input-icon"
            aria-hidden="true"
            >!</span
          >
          <ActivityIndicator v-else-if="hint.cls === 'tc-moving'" label="Moving to done…" />
          {{ hint.label }}
        </span>
      </div>
    </div>

    <!-- A full-width, unframed assignment table. The robot opens it; each
         row opens the same agent/model picker used everywhere else. -->
    <transition name="tc-agent-panel">
      <div v-if="agentPanelOpen" class="tc-agent-panel" @click.stop>
        <button
          v-for="a in agentAssignments"
          :key="a.key"
          type="button"
          class="tc-agent-row"
          :title="`${a.label}: ${a.cli} · ${a.model}`"
          @click.stop="openAssignmentModal(a)"
        >
          <span class="tc-agent-role">{{ a.label }}</span>
          <span class="tc-agent-cli">{{ a.cli }}</span>
          <span class="tc-agent-model">{{ a.model }}</span>
        </button>
      </div>
    </transition>

    <div v-if="action" class="tc-foot tc-actions !ml-0 w-full">
      <button
        class="flex w-full items-center justify-center gap-2 border-t px-4 py-[11px] font-mono text-xs font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-bright)]"
        :class="[actionFooterClass, reviewReady ? 'review-ready' : '']"
        :disabled="
          busy ||
          inPipeline ||
          (task.status === 'review' &&
            (repo.reviewFor(task.id)?.running || repo.isRunning(task.id)))
        "
        :title="
          inPipeline
            ? action.title
            : task.status === 'review' && repo.reviewFor(task.id)?.running
              ? 'Waiting for automatic review to finish.'
              : task.status === 'review' && repo.isRunning(task.id)
                ? 'The engineer is still coding; Move to done becomes available when the turn ends.'
                : action.title
        "
        @click.stop="runAction"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" class="size-4">
          <path
            :d="action.icon"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        {{ busy ? "Working…" : action.label }}
      </button>
    </div>
    <!-- Fresh-done acknowledgement (0278): a steady Acknowledge footer that
         clears the persistent highlight. Done cards have no move action, so
         this footer only appears for unacked fresh-done tasks. -->
    <div v-else-if="ackPending" class="tc-foot tc-actions !ml-0 w-full">
      <button
        class="flex w-full items-center justify-center gap-2 border-t px-4 py-[11px] font-mono text-xs font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-bright)]"
        :class="ackFooterClass"
        title="Acknowledge this task is done — clears the highlight"
        @click.stop="acknowledge"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" class="size-4">
          <path
            d="M4 12l5 5L20 6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Acknowledge
      </button>
    </div>
    <!-- AI-created acknowledgement (0320): a persistent violet footer on a card
         the PM agent just finished creating, clearing on click. Unlike the
         done-ack footer above, this renders IN ADDITION to the action footer —
         the card lands in inbox/ready, which already has a move/start action —
         so it starts its own v-if chain rather than joining that one. -->
    <div v-if="createAckPending" class="tc-foot tc-actions !ml-0 w-full">
      <button
        class="ai-created-ack flex w-full items-center justify-center gap-2 border-t px-4 py-[11px] font-mono text-xs font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-bright)]"
        :class="createAckFooterClass"
        title="Acknowledge this AI-created task — clears the highlight"
        @click.stop="acknowledgeCreate"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" class="size-4">
          <path
            d="M4 12l5 5L20 6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Acknowledge
      </button>
    </div>
    <!-- A failed move-to-done stays with the card that triggered it, directly
         below the button, instead of detaching into a global toast. -->
    <DoneErrorCard
      v-if="task.status === 'review' && repo.doneErrorFor(task.id)"
      class="tc-done-error"
      :message="repo.doneErrorFor(task.id)!.message"
      :step="repo.doneErrorFor(task.id)!.step"
      :conflicts="repo.doneErrorFor(task.id)!.conflicts"
      :detail="repo.doneErrorFor(task.id)!.detail"
      :log-path="repo.doneErrorFor(task.id)!.logPath"
      :hint="repo.doneErrorFor(task.id)!.hint"
      :failed-at="repo.doneErrorFor(task.id)!.failedAt"
      :retry-hint="doneErrorRetryHint"
      :task-id="task.id"
      :task-title="task.title"
      @open-panel="openPanelFromError"
      @open-debugger="openDebuggerFromError"
      @click.stop
    />
  </article>

  <RestartTaskDialog :task="restartTask" @close="restartTask = null" />
  <DirtyMainDialog
    :task="dirtyTask"
    :files="dirtyFiles"
    @commit="confirmCommitDirty"
    @cancel="cancelDirty"
  />
  <AgentModelModal
    :open="assignmentModalOpen"
    :cli-options="assignmentCliOptions"
    :model-options="assignmentModelOptions"
    :cli="assignmentModalCli"
    :model="assignmentModalModel"
    :memory-key="`task:${task.id}:${assignmentModalRole ?? 'agent'}`"
    @update:open="(value) => (assignmentModalOpen = value)"
    @update:cli="onAssignmentCli"
    @update:model="onAssignmentModel"
  />
</template>
