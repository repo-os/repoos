<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import type { Task } from "../types";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";
import RestartTaskDialog from "./RestartTaskDialog.vue";
import DirtyMainDialog from "./DirtyMainDialog.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import DoneErrorCard from "./DoneErrorCard.vue";

const props = withDefaults(defineProps<{ task: Task; dragEnabled?: boolean }>(), {
  dragEnabled: true,
});

const ui = useUiStore();
const repo = useRepoStore();

const busy = ref(false);
const dragging = ref(false);

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

/** Mirrors the task watchdog's default staleness window (task-watchdog.ts) — a
 *  reasonable heuristic even though the server-configured value can differ. */
const STUCK_SILENCE_MS = 5 * 60 * 1000;

function silentMs(at: string | undefined): number | null {
  if (!at || Number.isNaN(Date.parse(at))) return null;
  return now.value - Date.parse(at);
}

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

function formatActivity(at: string | undefined): string | null {
  const ms = silentMs(at);
  return ms === null ? null : `${formatDuration(ms)} ago`;
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
}

function onDragEnd(): void {
  dragging.value = false;
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
  const lastActivity = repo.agentActivityAt[taskId] ?? repo.runningSince[taskId];
  const ms = silentMs(lastActivity);
  if (ms !== null && ms >= STUCK_SILENCE_MS) {
    return {
      label: `stuck · silent ${formatDuration(ms)}`,
      title: "agent process is still running but hasn't produced output in a while — it may be hung. Click to inspect, or restart work.",
      cls: "tc-stuck",
    };
  }
  const activity = formatActivity(lastActivity);
  return {
    label: activity ? `coding · active ${activity}` : "coding",
    title: "agent is making code changes — click to watch the session",
    cls: "tc-coding",
  };
}

/** Mirrors handoff.ts's MAX_CHECK_RETRY_ATTEMPTS. */
const MAX_CHECK_RETRY_ATTEMPTS = 2;

/** A running agent on a review-status task is otherwise indistinguishable
 *  from ordinary coding — but when `repoos check` fails right after a
 *  handoff, the server silently resumes the same engineer to fix it
 *  (handoff.ts's scheduleCheckFailureRetry) without ever leaving `review`.
 *  Label that case distinctly so it doesn't look like the task regressed. */
function checkRetryHint(taskId: string, retryCount: number): CardHint {
  const lastActivity = repo.agentActivityAt[taskId] ?? repo.runningSince[taskId];
  const ms = silentMs(lastActivity);
  if (ms !== null && ms >= STUCK_SILENCE_MS) {
    return {
      label: `stuck · silent ${formatDuration(ms)}`,
      title: "agent is fixing a post-handoff check failure but hasn't produced output in a while — it may be hung. Click to inspect, or restart work.",
      cls: "tc-stuck",
    };
  }
  const activity = formatActivity(lastActivity);
  return {
    label: activity ? `fixing check failure · active ${activity}` : `fixing check failure (retry ${retryCount}/${MAX_CHECK_RETRY_ATTEMPTS})`,
    title: "`repoos check` failed right after handoff — the engineer is automatically fixing it and will re-submit for review",
    cls: "tc-coding",
  };
}

/** Mirrors handoff.ts's MAX_MERGE_CONFLICT_RETRY_ATTEMPTS (#0271 follow-up). */
const MAX_MERGE_CONFLICT_RETRY_ATTEMPTS = 2;

/** Same purpose as checkRetryHint, one step earlier: the close-out's
 *  `validating` phase hit a real merge conflict with main, and the engineer
 *  was automatically resumed to merge main into its own branch and resolve
 *  it (handoff.ts's scheduleMergeConflictRetry). */
function mergeConflictRetryHint(taskId: string, retryCount: number): CardHint {
  const lastActivity = repo.agentActivityAt[taskId] ?? repo.runningSince[taskId];
  const ms = silentMs(lastActivity);
  if (ms !== null && ms >= STUCK_SILENCE_MS) {
    return {
      label: `stuck · silent ${formatDuration(ms)}`,
      title: "agent is resolving a merge conflict from close-out but hasn't produced output in a while — it may be hung. Click to inspect, or restart work.",
      cls: "tc-stuck",
    };
  }
  const activity = formatActivity(lastActivity);
  return {
    label: activity ? `fixing merge conflict · active ${activity}` : `fixing merge conflict (retry ${retryCount}/${MAX_MERGE_CONFLICT_RETRY_ATTEMPTS})`,
    title: "close-out hit a real merge conflict with main — the engineer is automatically resolving it in its own branch and close-out will retry once it's done",
    cls: "tc-coding",
  };
}

/** The three review substates: reviewing / coding / waiting for human. */
const hint = computed<CardHint | null>(() => {
  const t = props.task;
  if (t.status === "review") {
    if (inPipeline.value) {
      return {
        label: pipelineStage.value ? `moving to done · ${pipelineStage.value}` : "queued for close-out",
        title: "Move to done already started — merging, building, and checking. See the pipeline bar for live progress.",
        cls: "tc-moving",
      };
    }
    if (repo.reviewFor(t.id)?.running) {
      return { label: "Reviewing…", title: "automatic review in progress", cls: "tc-reviewing" };
    }
    if (repo.isRunning(t.id)) {
      if (t.mergeConflictRetryCount) return mergeConflictRetryHint(t.id, t.mergeConflictRetryCount);
      return t.checkRetryCount ? checkRetryHint(t.id, t.checkRetryCount) : codingOrStuckHint(t.id);
    }
    return { label: "waiting for human", title: "review passed — approve and merge to finish", cls: "tc-human" };
  }
  if (t.status === "active") {
    if (repo.isRunning(t.id)) return codingOrStuckHint(t.id);
    if (t.needsInput) {
      return { label: "needs input", title: "agent is waiting on you — open the task to reply", cls: "tc-needs-input" };
    }
    return { label: "paused", title: "agent stopped — click Restart work to resume", cls: "tc-stalled" };
  }
  return null;
});

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
  if (t.status === "active") return repo.isRunning(t.id) ? ACTIVE_PAUSE : ACTIVE_RESTART;
  return ACTIONS[t.status] ?? null;
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
  () => props.task.status === "ready" || (props.task.status === "active" && !repo.isRunning(props.task.id)),
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

const dirtyFiles = computed(() =>
  dirtyTask.value ? repo.dirtyMainFor(dirtyTask.value.id) : [],
);

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
</script>

<template>
  <article
    class="task-card group flex shrink-0 cursor-pointer flex-col overflow-hidden rounded-[13px] border border-border bg-[var(--panel)] text-foreground transition duration-150 hover:-translate-y-0.5 hover:border-[var(--border-bright)]"
    :class="{
      flash: repo.flashId === task.id,
      'transition-success': repo.transitionState?.id === task.id,
      coding: repo.isRunning(task.id),
      reviewing: task.status === 'review' && !inPipeline && repo.reviewFor(task.id)?.running,
      'moving-to-done': task.status === 'review' && inPipeline,
      'waiting-for-human': task.status === 'review' && !inPipeline && !repo.reviewFor(task.id)?.running && !repo.isRunning(task.id),
      'needs-input': task.needsInput,
      'done-needs-ack': ackPending,
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
        <span class="font-mono text-[10px] text-[var(--txt-faint)]">#{{ task.id }}</span>
        <span class="rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]">{{ task.type }}</span>
        <span v-if="task.needsInput" class="tc-waiting" title="waiting for you — open the task to reply">needs input</span>
        <span v-if="task.status === 'review' && task.needsMerge" class="tc-merge" title="branch drifted from main — move to done to sync and merge">needs merge</span>
        <span v-if="task.hotfix" class="tc-hotfix" :title="`Hotfix — runs in main checkout${task.hotfixTarget === 'main' ? ' directly on main' : ' on branch ' + task.branch}`">hotfix</span>
        <span class="ml-auto rounded-[5px] px-[6px] py-[2px] font-mono text-[9px] font-bold" :class="task.priority">{{ task.priority }}</span>
      </div>

      <h3 class="mt-[11px] line-clamp-2 text-[13px] font-semibold leading-[1.4]">{{ task.title }}</h3>

      <div class="mt-[11px] flex flex-wrap gap-[6px]">
        <span class="rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]">{{ task.area }}</span>
        <span v-if="task.assignee !== 'ai'" class="rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]">
          {{ task.assignee === "human" ? "◇ " + (task.assignedTo || "human") : "· open" }}
        </span>
        <span v-if="diffStats && diffStats.filesChanged > 0" class="diff-stats-chip rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]" :title="`${diffStats.filesChanged} files, +${diffStats.additions} −${diffStats.deletions}`">
          {{ diffStats.filesChanged }}f {{ diffStats.additions }}+
        </span>
        <span v-else-if="diffStats && diffStats.filesChanged === 0 && task.branch" class="diff-stats-empty rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]" title="No code changes">0 changes</span>
      </div>

      <div v-if="hint || (isLaunchAction && task.git?.dirty)" class="mt-[13px]">
        <span v-if="hint" class="tc-hint" :class="hint.cls" :title="hint.title" @click.stop="hint.cls === 'tc-coding' || hint.cls === 'tc-stuck' ? openAgent() : undefined">
          <ActivityIndicator v-if="hint.cls === 'tc-coding'" />
          <ActivityIndicator v-else-if="hint.cls === 'tc-reviewing'" variant="reviewing" label="Reviewing…" />
          <ActivityIndicator v-else-if="hint.cls === 'tc-moving'" label="Moving to done…" />
          {{ hint.label }}
        </span>
        <span
          v-if="isLaunchAction && task.git?.dirty"
          class="tc-dirty"
          :title="task.git.worktreePath ? 'worktree has uncommitted changes — restarting asks to resume or start clean' : 'branch has unmerged work — restarting asks to resume or start clean'"
        >dirty</span>
      </div>
    </div>

    <div v-if="action" class="tc-foot tc-actions !ml-0 w-full">
        <button
          class="flex w-full items-center justify-center gap-2 border-t px-4 py-[11px] font-mono text-xs font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-bright)]"
          :class="actionFooterClass"
          :disabled="busy || inPipeline || (task.status === 'review' && (repo.reviewFor(task.id)?.running || repo.isRunning(task.id)))"
          :title="inPipeline ? action.title : task.status === 'review' && repo.reviewFor(task.id)?.running ? 'Waiting for automatic review to finish.' : task.status === 'review' && repo.isRunning(task.id) ? 'The engineer is still coding; Move to done becomes available when the turn ends.' : action.title"
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
    <!-- A failed move-to-done stays with the card that triggered it, directly
         below the button, instead of detaching into a global toast. -->
    <DoneErrorCard
      v-if="task.status === 'review' && repo.doneErrorFor(task.id)"
      class="tc-done-error"
      :message="repo.doneErrorFor(task.id)!.message"
      :step="repo.doneErrorFor(task.id)!.step"
      :conflicts="repo.doneErrorFor(task.id)!.conflicts"
      :detail="repo.doneErrorFor(task.id)!.detail"
      :hint="repo.doneErrorFor(task.id)!.hint"
      :task-id="task.id"
      :task-title="task.title"
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
</template>
