<script setup lang="ts">
import { computed, ref } from "vue";
import type { Task } from "../types";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";
import RestartTaskDialog from "./RestartTaskDialog.vue";
import ActivityIndicator from "./ActivityIndicator.vue";
import DoneErrorCard from "./DoneErrorCard.vue";

const props = withDefaults(defineProps<{ task: Task; dragEnabled?: boolean }>(), {
  dragEnabled: true,
});

const ui = useUiStore();
const repo = useRepoStore();

const busy = ref(false);
const dragging = ref(false);

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

/** The three review substates: reviewing / coding / waiting for human. */
const hint = computed<CardHint | null>(() => {
  const t = props.task;
  if (t.status === "review") {
    if (repo.reviewFor(t.id)?.running) {
      return { label: "Reviewing…", title: "automatic review in progress", cls: "tc-reviewing" };
    }
    if (repo.isRunning(t.id)) {
      return { label: "coding", title: "agent is making code changes — click to watch the session", cls: "tc-coding" };
    }
    return { label: "waiting for human", title: "review passed — approve and merge to finish", cls: "tc-human" };
  }
  if (t.status === "active") {
    if (repo.isRunning(t.id)) {
      return { label: "coding", title: "agent is making code changes — click to watch the session", cls: "tc-coding" };
    }
    if (t.needsInput) {
      return { label: "needs input", title: "agent is waiting on you — open the task to reply", cls: "tc-needs-input" };
    }
    return { label: "paused", title: "agent stopped — click Restart work to resume", cls: "tc-stalled" };
  }
  return null;
});

/** `task.status` alone can't tell paused from running once pausing no longer
 *  demotes to `ready` — the running-agent set (repo.isRunning) is the signal. */
const action = computed<CardAction | null>(() => {
  const t = props.task;
  if (t.status === "active") return repo.isRunning(t.id) ? ACTIVE_PAUSE : ACTIVE_RESTART;
  return ACTIONS[t.status] ?? null;
});

/** True when the action would relaunch the agent (fresh start or resume from pause). */
const isLaunchAction = computed(
  () => props.task.status === "ready" || (props.task.status === "active" && !repo.isRunning(props.task.id)),
);

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
    repo.onError(err);
  } finally {
    busy.value = false;
  }
}

/** Open the drawer on the Agent tab to watch the live session. */
async function openAgent(): Promise<void> {
  await ui.openTask(props.task);
  ui.activeTab = "agent";
}
</script>

<template>
  <div
    class="task-card"
    :class="{
      flash: repo.flashId === task.id,
      'transition-success': repo.transitionState?.id === task.id,
      coding: repo.isRunning(task.id),
      reviewing: task.status === 'review' && repo.reviewFor(task.id)?.running,
      'waiting-for-human': task.status === 'review' && !repo.reviewFor(task.id)?.running && !repo.isRunning(task.id),
      'needs-input': task.needsInput,
      dragging,
      'has-action': !!action,
    }"
    :draggable="dragEnabled"
    @click="ui.openTask(task)"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
  >
    <div class="tc-top">
      <span class="tc-id">#{{ task.id }}</span>
      <span v-if="task.needsInput" class="tc-waiting" title="waiting for you — open the task to reply">
        needs input
      </span>
      <span v-if="task.status === 'review' && task.needsMerge" class="tc-merge" title="branch drifted from main — move to done to sync and merge">
        needs merge
      </span>
      <span class="chip">{{ task.type }}</span>
      <span class="tc-prio" :class="task.priority">{{ task.priority }}</span>
    </div>
    <div class="tc-title">{{ task.title }}</div>
    <div class="tc-tags">
      <span class="chip">{{ task.area }}</span>
      <span v-if="task.assignee !== 'ai'" class="chip">
        {{ task.assignee === "human" ? "◇ " + (task.assignedTo || "human") : "· open" }}
      </span>
    </div>
    <div class="tc-foot">
      <span
        v-if="hint"
        class="tc-hint"
        :class="hint.cls"
        :title="hint.title"
        @click.stop="hint.cls === 'tc-coding' ? openAgent() : undefined"
      >
        <ActivityIndicator v-if="hint.cls === 'tc-coding'" />
        <ActivityIndicator v-else-if="hint.cls === 'tc-reviewing'" variant="reviewing" label="Reviewing…" />
        {{ hint.label }}
      </span>
      <span
        v-if="isLaunchAction && task.git?.dirty"
        class="tc-dirty"
        :title="
          task.git.worktreePath
            ? 'worktree has uncommitted changes — restarting asks to resume or start clean'
            : 'branch has unmerged work — restarting asks to resume or start clean'
        "
      >dirty</span>
      <div v-if="action" class="tc-actions">
        <button
          class="tc-btn"
          :class="action.variant"
          :disabled="busy || (task.status === 'review' && repo.reviewFor(task.id)?.running)"
          :title="task.status === 'review' && repo.reviewFor(task.id)?.running ? 'Waiting for automatic review to finish.' : action.title"
          @click.stop="runAction"
        >
          <svg viewBox="0 0 24 24" fill="none">
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
    </div>
    <!-- A failed move-to-done stays with the card that triggered it, directly
         below the button, instead of detaching into a global toast. -->
    <DoneErrorCard
      v-if="task.status === 'review' && repo.doneErrorFor(task.id)"
      class="tc-done-error"
      :message="repo.doneErrorFor(task.id)!.message"
      :step="repo.doneErrorFor(task.id)!.step"
      :conflicts="repo.doneErrorFor(task.id)!.conflicts"
      @click.stop
    />
  </div>

  <RestartTaskDialog :task="restartTask" @close="restartTask = null" />
</template>
