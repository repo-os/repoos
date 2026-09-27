<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
const startError = ref("");
/**
 * Uncommitted files in the worktree, fetched when the dialog opens (#0512).
 * "Start clean" discards them, so the confirmation names them rather than
 * describing the loss in the abstract. Unknown is shown as unknown — never as
 * "nothing there".
 */
const dirtyFiles = ref<string[] | null>(null);
const dirtyUnknown = ref(false);

/** More than this and the list stops being scannable in a confirm dialog. */
const MAX_LISTED = 8;

const task = computed(() => props.task);
const shownFiles = computed(() => (dirtyFiles.value ?? []).slice(0, MAX_LISTED));
const hiddenCount = computed(() => Math.max(0, (dirtyFiles.value?.length ?? 0) - MAX_LISTED));

watch(
  () => props.task?.id ?? null,
  async (id) => {
    dirtyFiles.value = null;
    dirtyUnknown.value = false;
    if (!id) return;
    try {
      const res = await fetch(`/api/tasks/${id}/worktree-dirty`);
      const body = (await res.json()) as { ok: boolean; files: string[] };
      if (body.ok) dirtyFiles.value = body.files;
      else dirtyUnknown.value = true;
    } catch {
      // Offline or the endpoint is gone: say we could not tell, don't guess.
      dirtyUnknown.value = true;
    }
  },
  { immediate: true },
);

async function choose(mode: "resume" | "fresh" | "clean"): Promise<void> {
  if (!props.task) return;
  startError.value = "";
  busy.value = true;
  try {
    await repo.startWork(props.task, mode);
    emit("started");
    emit("close");
  } catch (err) {
    repo.onError(err);
    startError.value = err instanceof Error ? err.message : "Could not start work";
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
        }}</span
        >.
      </p>
      <div v-if="dirtyFiles?.length" class="restart-lost">
        <p class="restart-body">
          <b>Start clean</b> would discard {{ dirtyFiles.length }} uncommitted file{{
            dirtyFiles.length === 1 ? "" : "s"
          }}:
        </p>
        <ul class="restart-lost-list">
          <li v-for="f in shownFiles" :key="f" class="mono">{{ f }}</li>
          <li v-if="hiddenCount > 0" class="dim">and {{ hiddenCount }} more</li>
        </ul>
      </div>
      <p v-else-if="dirtyUnknown" class="restart-body dim">
        The uncommitted files in that worktree could not be listed, so what
        <b>Start clean</b> discards is unknown — treat it as everything there.
      </p>
      <p class="restart-body dim">
        <b>Resume worktree</b> continues where the last run left off, keeping its changes.
        <b>Start clean</b> discards the worktree — and any commits on this branch that aren't merged
        into main — and begins from a fresh checkout.
      </p>
      <p v-if="startError" class="restart-error" role="alert">{{ startError }}</p>
      <div class="restart-actions">
        <Button variant="outline" size="sm" :disabled="busy" @click="cancel">Cancel</Button>
        <Button variant="destructive" size="sm" :disabled="busy" @click="choose('clean')">
          {{ busy ? "Working…" : "Start clean" }}
        </Button>
        <Button
          v-if="startError"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="choose('fresh')"
        >
          Start fresh in this worktree
        </Button>
        <Button variant="accent" size="sm" :disabled="busy" @click="choose('resume')">
          <span class="restart-play">▶</span>
          Resume worktree
        </Button>
      </div>
    </div>
  </div>
</template>
