<script setup lang="ts">
import { ref } from "vue";
import type { Task } from "../types";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";

const props = defineProps<{ task: Task }>();

const ui = useUiStore();
const repo = useRepoStore();

const busy = ref(false);

async function startWork(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await repo.startWork(props.task);
  } catch (err) {
    repo.onError(err);
  } finally {
    busy.value = false;
  }
}

async function pauseWork(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await repo.pauseWork(props.task);
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
      'has-action': task.status === 'ready' || task.status === 'active',
    }"
    @click="ui.openTask(task)"
  >
    <div class="tc-top">
      <span class="tc-id">#{{ task.id }}</span>
      <span class="chip">{{ task.type }}</span>
      <span class="tc-prio" :class="task.priority">{{ task.priority }}</span>
    </div>
    <div class="tc-title">{{ task.title }}</div>
    <div class="tc-tags">
      <span class="chip">{{ task.area }}</span>
      <span class="chip" :class="{ ai: task.assignee === 'ai' }">
        {{ task.assignee === "ai" ? "◆ AI" : task.assignee === "human" ? "◇ " + (task.assignedTo || "human") : "· open" }}
      </span>
    </div>
    <div class="tc-foot">
      <span class="tc-branch" v-if="task.branch">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M6 3v12a3 3 0 003 3h6M6 3a2 2 0 100 4 2 2 0 000-4zM18 18a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="2" />
        </svg>
        {{ task.branch.split("/").pop() }}
      </span>
      <span class="tc-git" v-if="task.git && task.git.branchExists" title="branch exists locally">●</span>
      <span
        v-if="(task.status === 'active' || task.status === 'review') && repo.isRunning(task.id)"
        class="tc-run"
        title="agent running — click to watch the session"
        @click.stop="openAgent"
      >running</span>
      <div class="tc-actions">
        <button
          v-if="task.status === 'ready'"
          class="tc-btn start"
          :disabled="busy"
          title="Launch the engineer agent on this task"
          @click.stop="startWork"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M8 5v14l11-7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
          </svg>
          Start work
        </button>
        <button
          v-else-if="task.status === 'active'"
          class="tc-btn pause"
          :disabled="busy"
          title="Stop the agent and return the task to ready"
          @click.stop="pauseWork"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M10 4H6v16h4zM18 4h-4v16h4z" stroke="currentColor" stroke-width="2" />
          </svg>
          Pause work
        </button>
      </div>
    </div>
  </div>
</template>
