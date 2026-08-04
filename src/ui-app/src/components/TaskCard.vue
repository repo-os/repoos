<script setup lang="ts">
import type { Task } from "../types";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";

defineProps<{ task: Task }>();

const ui = useUiStore();
const repo = useRepoStore();
</script>

<template>
  <div
    class="task-card"
    :class="{ flash: repo.flashId === task.id }"
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
    </div>
  </div>
</template>
