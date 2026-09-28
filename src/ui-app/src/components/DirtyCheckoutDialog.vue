<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import type { DirtyScope } from "../stores/repo";
import Button from "./ui/button.vue";

const props = defineProps<{
  task: { id: string } | null;
  files: string[];
  /** Which checkout the files are in: `main` blocks the merge, the task
   *  worktree would be deleted with the close-out (#0512). */
  scope?: DirtyScope;
}>();
const emit = defineEmits<{
  (e: "commit"): void;
  (e: "cancel"): void;
}>();

/** `main` first in the union, so an omitted scope keeps the original wording. */
const isWorktree = computed(() => props.scope === "worktree");
const title = computed(() =>
  isWorktree.value ? "the task worktree has uncommitted changes" : "main has uncommitted changes",
);
const tail = "Commit them and continue, or cancel to stay in review.";

/** Escape closes the dialog, matching every other modal in the app. */
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.task) emit("cancel");
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <!-- Keep this confirmation above the drawer, its backdrop, and the pinned
       integration bar. A Teleport also prevents a parent stacking context from
       intercepting its button clicks. -->
  <Teleport to="body">
    <div
      v-if="task"
      class="dirty-overlay"
      data-overlay-layer="floating"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dirty-checkout-title"
      @click.self="emit('cancel')"
    >
      <div class="dirty-card">
        <h3 id="dirty-checkout-title" class="dirty-title">{{ title }}</h3>
        <p class="dirty-body">
          <b>{{ files.length }} file{{ files.length === 1 ? "" : "s" }}</b>
          <template v-if="!isWorktree">
            on <code class="mono">main</code> would block the merge for task #{{ task.id }}.
          </template>
          <template v-else>
            in the worktree for task #{{ task.id }} are not committed on the task branch, so the
            close-out merge would not carry them and removing the worktree would delete them.
          </template>
          {{ tail }}
        </p>
        <div class="dirty-list">
          <div v-for="f in files" :key="f" class="dirty-file mono">{{ f }}</div>
        </div>
        <div class="dirty-actions">
          <Button type="button" variant="outline" size="sm" @click.stop="emit('cancel')"
            >Cancel</Button
          >
          <Button type="button" variant="accent" size="sm" @click.stop="emit('commit')">
            Commit &amp; continue
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
