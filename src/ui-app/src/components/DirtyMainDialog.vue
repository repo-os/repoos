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
    @click.self="emit('cancel')"
  >
    <div class="dirty-card">
      <h3 class="dirty-title">main has uncommitted changes</h3>
      <p class="dirty-body">
        <b>{{ files.length }} file{{ files.length === 1 ? "" : "s" }}</b>
        on <code class="mono">main</code> would block the merge for task
        #{{ task.id }}. Commit them and continue, or cancel to stay in review.
      </p>
      <div class="dirty-list">
        <div v-for="f in files" :key="f" class="dirty-file mono">{{ f }}</div>
      </div>
      <div class="dirty-actions">
        <Button variant="outline" size="sm" @click="emit('cancel')">Cancel</Button>
        <Button variant="accent" size="sm" @click="emit('commit')">
          Commit &amp; continue
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dirty-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

.dirty-card {
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #111);
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  padding: 24px;
  max-width: 520px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dirty-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.dirty-body {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary, #555);
}

.dirty-list {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 16px;
  padding: 8px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 4px;
  font-size: 12px;
}

.dirty-file {
  padding: 2px 0;
}

.dirty-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
