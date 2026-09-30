<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import Button from "./ui/button.vue";

const props = defineProps<{
  task: { id: string } | null;
  message: string;
  dirtyFiles?: string[];
}>();
const emit = defineEmits<{
  (e: "discard"): void;
  (e: "send-back"): void;
  (e: "cancel"): void;
}>();

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
      <div class="dirty-card">
        <h3 id="handoff-conflict-title" class="dirty-title">Worktree changed after handoff</h3>
        <p class="dirty-body">
          Task #{{ task.id }}'s feature worktree no longer matches what was reviewed. Move to done
          cannot continue until you discard the post-handoff edits or send the task back to the
          engineer.
        </p>
        <p class="dirty-body mono dirty-detail">{{ message }}</p>
        <div v-if="dirtyFiles?.length" class="dirty-list">
          <div v-for="f in dirtyFiles" :key="f" class="dirty-file mono">{{ f }}</div>
        </div>
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
