<script setup lang="ts">
import { computed, ref } from "vue";
import type { Task } from "../types";
import { useRepoStore } from "../stores/repo";
import Button from "./ui/button.vue";

const props = defineProps<{ task: Task | null }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "started"): void;
}>();

const repo = useRepoStore();
const busy = ref(false);

const task = computed(() => props.task);

async function choose(mode: "resume" | "clean"): Promise<void> {
  if (!props.task) return;
  busy.value = true;
  try {
    await repo.startWork(props.task, mode);
    emit("started");
    emit("close");
  } catch (err) {
    repo.onError(err);
    emit("close");
  } finally {
    busy.value = false;
  }
}

function cancel(): void {
  if (!busy.value) emit("close");
}
</script>

<template>
  <div v-if="task" class="restart-overlay" @click.self="cancel">
    <div class="restart-card" role="dialog" aria-modal="true">
      <h3 class="restart-title">Restart task #{{ task.id }}?</h3>
      <p class="restart-body">
        This task's worktree has uncommitted changes from the last run
        <span v-if="task.git?.worktreePath" class="restart-path mono">{{
          task.git.worktreePath
        }}</span>.
      </p>
      <p class="restart-body dim">
        <b>Resume worktree</b> continues where the last run left off, keeping its
        changes. <b>Start clean</b> discards the worktree — and any commits on
        this branch that aren't merged into main — and begins from a fresh
        checkout.
      </p>
      <div class="restart-actions">
        <Button variant="outline" size="sm" :disabled="busy" @click="cancel">Cancel</Button>
        <Button
          variant="destructive"
          size="sm"
          :disabled="busy"
          @click="choose('clean')"
        >
          {{ busy ? "Working…" : "Start clean" }}
        </Button>
        <Button
          variant="accent"
          size="sm"
          :disabled="busy"
          @click="choose('resume')"
        >
          <span class="restart-play">▶</span>
          Resume worktree
        </Button>
      </div>
    </div>
  </div>
</template>
