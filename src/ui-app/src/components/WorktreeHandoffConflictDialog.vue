<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import Button from "./ui/button.vue";

/** One file changed since handoff, with its +/- line counts. */
interface HandoffChangedFile {
  path: string;
  added: number;
  removed: number;
  /** Task markdown under the work dir — grouped after the source changes. */
  taskFile?: boolean;
}

const props = defineProps<{
  task: { id: string } | null;
  message: string;
  files?: HandoffChangedFile[];
  /** True when the server could not compute the diff (see `message`). */
  filesUnavailable?: boolean;
}>();
const emit = defineEmits<{
  (e: "discard"): void;
  (e: "send-back"): void;
  (e: "cancel"): void;
}>();

// Changed files first, then task bookkeeping, so what would be discarded is
// easy to scan and the `work/*.md` churn is easy to spot.
const changedFiles = computed(() => (props.files ?? []).filter((f) => !f.taskFile));
const taskFiles = computed(() => (props.files ?? []).filter((f) => f.taskFile));
const hasFiles = computed(() => changedFiles.value.length > 0 || taskFiles.value.length > 0);

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.task) emit("cancel");
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="task"
      class="dirty-overlay"
      data-overlay-layer="floating"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-conflict-title"
      @click.self="emit('cancel')"
    >
      <div class="dirty-card dirty-card--conflict">
        <h3 id="handoff-conflict-title" class="dirty-title">Worktree changed after handoff</h3>
        <p class="dirty-body">
          Task #{{ task.id }}'s feature worktree no longer matches what was reviewed. Move to done
          cannot continue until you discard the post-handoff edits or send the task back to the
          engineer.
        </p>
        <p class="dirty-body mono dirty-detail">{{ message }}</p>
        <div
          v-if="hasFiles"
          class="dirty-list"
          tabindex="0"
          role="group"
          aria-label="Files changed since handoff"
        >
          <div v-for="f in changedFiles" :key="f.path" class="dirty-file">
            <span class="dirty-file-path mono">{{ f.path }}</span>
            <span class="dirty-file-counts mono">
              <span class="dirty-file-add">+{{ f.added }}</span>
              <span class="dirty-file-del">-{{ f.removed }}</span>
            </span>
          </div>
          <template v-if="taskFiles.length">
            <div class="dirty-file-group">task files</div>
            <div v-for="f in taskFiles" :key="f.path" class="dirty-file">
              <span class="dirty-file-path mono">{{ f.path }}</span>
              <span class="dirty-file-counts mono">
                <span class="dirty-file-add">+{{ f.added }}</span>
                <span class="dirty-file-del">-{{ f.removed }}</span>
              </span>
            </div>
          </template>
        </div>
        <p v-else-if="filesUnavailable" class="dirty-body dirty-unavailable">
          The file list is unavailable.
        </p>
        <div class="dirty-actions">
          <Button type="button" variant="outline" size="sm" @click.stop="emit('cancel')">
            Cancel
          </Button>
          <Button type="button" variant="outline" size="sm" @click.stop="emit('send-back')">
            Send back to engineer
          </Button>
          <Button type="button" variant="accent" size="sm" @click.stop="emit('discard')">
            Discard post-handoff edits
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
