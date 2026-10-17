<script setup lang="ts">
/**
 * Editor for an active task's requirements (#0817).
 *
 * Requirements are the task body the engineer works from — Problem, Desired UX,
 * Acceptance criteria, Notes for AI — but the engineer reads its own worktree
 * copy, so a board edit is invisible until it merges main. This dialog makes
 * the edit explicit and, after saving, shows exactly which sections changed
 * (added / edited / removed items) so the human can see what the engineer was
 * told. The server records the activity entry and messages the engineer; the
 * dialog's job is the editing surface and the changed-section highlight.
 *
 * Shared dialog components + `sm-modal` form classes (AGENTS.md): content is
 * body-teleported, so its CSS lives in `style.css`.
 */
import { nextTick, ref, watch } from "vue";
import type { RequirementsChange } from "../../../core/task-body-diff.js";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import Button from "./ui/button.vue";
import VoiceDictate from "./VoiceDictate.vue";
import { insertTextAtCursor } from "../utils/text-insertion";

const props = defineProps<{
  open: boolean;
  /** The task's current full body, used to seed the editor. */
  body: string;
  busy?: boolean;
  error?: string;
  /** Set after a successful save: the sections that changed. */
  result?: RequirementsChange | null;
}>();

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "save", body: string): void;
  (e: "done"): void;
}>();

const text = ref(props.body);
const editEl = ref<HTMLTextAreaElement | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    text.value = props.body;
    void nextTick(() => editEl.value?.focus());
  },
);

function onTranscribed(chunk: string): void {
  if (editEl.value) insertTextAtCursor(editEl.value, chunk);
}

/** The `+`/`-` markers a section's added/removed items get. */
function markerFor(kind: "added" | "removed" | "edited"): string {
  if (kind === "added") return "added";
  if (kind === "removed") return "removed";
  return "edited";
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogOverlay />
    <DialogContent class="sm-modal">
      <div class="sm-modal-head">
        <div class="sm-modal-head-text">
          <DialogTitle>Update requirements</DialogTitle>
          <DialogDescription class="sm-modal-desc">
            Edit the task body the engineer works from. Saving records the change and messages the
            engineer; their worktree copy is untouched until they merge main.
          </DialogDescription>
        </div>
        <DialogClose class="close-x" aria-label="Close">
          <span aria-hidden="true">×</span>
        </DialogClose>
      </div>

      <div class="sm-modal-body">
        <!-- Result: what actually changed, with each section called out. -->
        <div v-if="result" class="reqs-result" data-test-id="requirements-result">
          <p class="reqs-result-lead">
            Saved. The engineer was told these sections changed
            <span class="reqs-result-count"
              >({{ result.sections.length }}
              {{ result.sections.length === 1 ? "section" : "sections" }})</span
            >:
          </p>
          <div
            v-for="section in result.sections"
            :key="section.heading"
            class="reqs-diff-section"
            :data-kind="section.kind"
          >
            <div class="reqs-diff-head">
              <span class="reqs-diff-heading">{{ section.heading }}</span>
              <span class="reqs-diff-badge" :data-kind="section.kind">{{
                markerFor(section.kind)
              }}</span>
            </div>
            <ul v-if="section.added.length || section.removed.length" class="reqs-diff-items">
              <li
                v-for="(item, i) in section.added"
                :key="`a-${i}`"
                class="reqs-diff-item"
                data-marker="+"
              >
                {{ item }}
              </li>
              <li
                v-for="(item, i) in section.removed"
                :key="`r-${i}`"
                class="reqs-diff-item"
                data-marker="-"
              >
                {{ item }}
              </li>
            </ul>
          </div>
        </div>

        <!-- Edit: the full body, exactly as it will be written. -->
        <div v-else class="sm-modal-editor">
          <div class="sm-modal-editor-head">
            <span class="sm-modal-label">Requirements markdown</span>
            <VoiceDictate @transcribed="onTranscribed" />
          </div>
          <textarea
            ref="editEl"
            v-model="text"
            class="sm-modal-textarea"
            rows="14"
            aria-label="Task requirements markdown"
            placeholder="## Problem&#10;&#10;…"
          ></textarea>
        </div>

        <p v-if="error" class="ff-error reqs-error" role="alert">{{ error }}</p>
      </div>

      <div class="sm-modal-actions">
        <template v-if="result">
          <Button variant="default" data-test-id="requirements-done" @click="emit('done')">
            Done
          </Button>
        </template>
        <template v-else>
          <DialogClose as-child>
            <Button variant="outline" :disabled="busy">Cancel</Button>
          </DialogClose>
          <Button
            variant="default"
            data-test-id="requirements-save"
            :disabled="busy"
            @click="emit('save', text)"
          >
            {{ busy ? "Saving…" : "Save changes" }}
          </Button>
        </template>
      </div>
    </DialogContent>
  </Dialog>
</template>
