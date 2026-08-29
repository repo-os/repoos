<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "./ui/button.vue";

const props = defineProps<{ open: boolean; taskId: string | undefined; busy: boolean }>();
const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "start", target: "branch" | "main"): void;
}>();

const cancelButton = ref<InstanceType<typeof Button> | null>(null);

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape" && props.open) emit("cancel");
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

watch(
  () => props.open,
  (open) => {
    if (open) void nextTick(() => cancelButton.value?.$el?.focus());
  },
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="hotfix-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hotfix-confirm-title"
      @click.self="emit('cancel')"
    >
      <div class="hotfix-card">
        <h3 id="hotfix-confirm-title" class="hotfix-title">Start hotfix?</h3>
        <p class="hotfix-body">
          Run this task as a <strong>hotfix</strong> in the main checkout (no worktree). The agent
          works in the repo root on a <code>hotfix/{{ taskId }}-…</code> branch. Previews and
          diff-based review are skipped.
        </p>
        <div class="hotfix-actions">
          <Button
            ref="cancelButton"
            type="button"
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="emit('cancel')"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            :disabled="busy"
            @click="emit('start', 'branch')"
          >
            Hotfix on branch
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            :disabled="busy"
            @click="emit('start', 'main')"
          >
            Hotfix on main
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
