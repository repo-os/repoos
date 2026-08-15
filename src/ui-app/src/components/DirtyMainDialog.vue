<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import Button from "./ui/button.vue";

const props = defineProps<{
  task: { id: string } | null;
  files: string[];
}>();
const emit = defineEmits<{
  (e: "commit"): void;
  (e: "cancel"): void;
}>();

/** Escape closes the dialog, matching every other modal in the app. */
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.task) emit("cancel");
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div
    v-if="task"
    class="dirty-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="dirty-main-title"
    @click.self="emit('cancel')"
  >
    <div class="dirty-card">
      <h3 id="dirty-main-title" class="dirty-title">main has uncommitted changes</h3>
      <p class="dirty-body">
        <b>{{ files.length }} file{{ files.length === 1 ? "" : "s" }}</b>
        on <code class="mono">main</code> would block the merge for task
        #{{ task.id }}. Commit them and continue, or cancel to stay in review.
      </p>
      <div class="dirty-list">
        <div v-for="f in files" :key="f" class="dirty-file mono">{{ f }}</div>
      </div>
      <div class="dirty-actions">
        <Button type="button" variant="outline" size="sm" @click="emit('cancel')">Cancel</Button>
        <Button type="button" variant="accent" size="sm" @click="emit('commit')">
          Commit &amp; continue
        </Button>
      </div>
    </div>
  </div>
</template>
