<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ApiError } from "../api";
import { useRepoStore } from "../stores/repo";
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

/**
 * Commit every uncommitted change in the repo root checkout, on whatever
 * branch it is on. Opened from the sidebar git-state popup; the server
 * refuses (and says why) rather than guessing, and a rejecting pre-commit hook's
 * output is shown verbatim so a format/lint failure is actionable.
 */
const props = defineProps<{ open: boolean; branch: string; files: string[] }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const repo = useRepoStore();
const message = ref("");
const busy = ref(false);
const error = ref("");
const hookOutput = ref("");
const textareaEl = ref<HTMLTextAreaElement | null>(null);

/** Shown as the placeholder; the server applies the same text when the box is blank. */
const DEFAULT_MESSAGE = "chore: commit uncommitted changes";
/** More than this and the list stops being scannable in a confirm dialog. */
const MAX_LISTED = 8;
const shownFiles = computed(() => props.files.slice(0, MAX_LISTED));
const hiddenCount = computed(() => Math.max(0, props.files.length - MAX_LISTED));
const canCommit = computed(() => !busy.value && props.files.length > 0);

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    error.value = "";
    hookOutput.value = "";
    await nextTick();
    textareaEl.value?.focus();
  },
);

async function commit(): Promise<void> {
  if (!canCommit.value) return;
  busy.value = true;
  error.value = "";
  hookOutput.value = "";
  try {
    const r = await repo.commitRepoRoot(message.value);
    repo.pushToast(
      `Committed ${r.files} file${r.files === 1 ? "" : "s"} to ${r.branch} (${r.sha})`,
      "success",
    );
    message.value = "";
    emit("update:open", false);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Commit failed";
    const body =
      err instanceof ApiError ? (err.body as { output?: unknown } | undefined) : undefined;
    hookOutput.value = typeof body?.output === "string" ? body.output : "";
  } finally {
    busy.value = false;
  }
}

/** Cmd/Ctrl+Enter commits, like every commit box. */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    void commit();
  }
}
</script>

<template>
  <Teleport to="body">
    <Dialog :open="open" @update:open="(v) => !busy && emit('update:open', v)">
      <DialogOverlay />
      <DialogContent class="commit-modal">
        <div class="commit-modal-head">
          <DialogTitle>Commit changes</DialogTitle>
          <DialogClose class="close-x" aria-label="Close" :disabled="busy">×</DialogClose>
        </div>
        <DialogDescription class="commit-modal-desc">
          <strong>{{ files.length }} changed file{{ files.length === 1 ? "" : "s" }}</strong> on
          <code class="mono">{{ branch }}</code> will be committed.
        </DialogDescription>
        <div class="commit-modal-body">
          <div class="dirty-list commit-modal-files">
            <div v-for="f in shownFiles" :key="f" class="dirty-file mono">{{ f }}</div>
            <div v-if="hiddenCount > 0" class="dirty-file">and {{ hiddenCount }} more</div>
          </div>
          <div class="field">
            <label for="commit-message">Commit message (optional)</label>
            <textarea
              id="commit-message"
              ref="textareaEl"
              v-model="message"
              class="ff-textarea commit-modal-input"
              rows="4"
              :placeholder="DEFAULT_MESSAGE"
              :disabled="busy"
              @keydown="onKeydown"
            />
          </div>
          <p v-if="error" class="ff-error" role="alert">{{ error }}</p>
          <pre v-if="hookOutput" class="commit-modal-output mono">{{ hookOutput }}</pre>
        </div>
        <div class="commit-modal-actions">
          <DialogClose as-child>
            <Button variant="outline" :disabled="busy">Cancel</Button>
          </DialogClose>
          <Button variant="accent" :disabled="!canCommit" @click="commit">
            {{ busy ? "Committing…" : "Commit" }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </Teleport>
</template>
