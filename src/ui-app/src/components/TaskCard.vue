<script setup lang="ts">
import { computed, ref } from "vue";
import type { Task } from "../types";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";
import RestartTaskDialog from "./RestartTaskDialog.vue";

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
  active: {
    label: "Pause work",
    title: "Stop the agent and return the task to ready",
    icon: "M10 4H6v16h4zM18 4h-4v16h4z",
    variant: "pause",
  },
  review: {
    label: "Move to done",
    title: "Merge the branch, run repoos check, and mark the task done",
    icon: "M4 12l5 5L20 6",
    variant: "done",
  },
};

const action = computed<CardAction | null>(() => ACTIONS[props.task.status] ?? null);

async function runAction(): Promise<void> {
  if (busy.value || !action.value) return;
  // A dirty worktree means restarting would either resume prior work or
  // discard it — surface that choice instead of starting silently.
  if (props.task.status === "ready" && props.task.git?.dirty) {
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
        await repo.pauseWork(props.task);
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
      running: repo.isRunning(task.id),
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
      <span v-if="task.git && task.git.branchExists" class="tc-git" title="branch exists locally">●</span>
      <span
        v-if="task.status === 'ready' && task.git?.dirty"
        class="tc-dirty"
        :title="
          task.git.worktreePath
            ? 'worktree has uncommitted changes — restarting asks to resume or start clean'
            : 'branch has unmerged work — restarting asks to resume or start clean'
        "
      >dirty</span>
      <span
        v-if="(task.status === 'active' || task.status === 'review') && repo.isRunning(task.id)"
        class="tc-run"
        title="agent running — click to watch the session"
        @click.stop="openAgent"
      >running</span>
      <div v-if="action" class="tc-actions">
        <button
          class="tc-btn"
          :class="action.variant"
          :disabled="busy"
          :title="action.title"
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
  </div>

  <RestartTaskDialog :task="restartTask" @close="restartTask = null" />
</template>
