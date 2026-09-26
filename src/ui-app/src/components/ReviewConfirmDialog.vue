<script setup lang="ts">
/**
 * #0507: the confirm modal every human route into `review` goes through.
 *
 * Moving a task to `review` is not a status write — it asks RepoOS to run the
 * handoff finalization (scoped `repoos check`, then the commit/vacuity gate,
 * then `review`). The task stays `active` with a "running checks…" state until
 * that succeeds, so the person clicking needs to know they are starting a
 * check, not flipping a flag. "Skip checks" is the explicit escape hatch, and
 * it says plainly that Move-to-done runs the full gate before merging anyway —
 * skipping here is not skipping verification, it is skipping it *earlier*.
 *
 * Agents never see this: `repoos mv <own id> review` and the handoff signal
 * both record a handoff request that always runs the check.
 */
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

defineProps<{
  open: boolean;
  /** Task label for the heading, e.g. "#0507 · Unify every route into review". */
  taskLabel?: string;
  busy?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  /** The default: run the full finalization, check included. */
  "run-checks": [];
  /** Human override: commit gate only, recorded in the activity log. */
  "skip-checks": [];
}>();
</script>

<template>
  <Teleport to="body">
    <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
      <DialogOverlay />
      <DialogContent class="review-confirm-modal">
        <div class="cc-modal-head">
          <DialogTitle>Move to review?</DialogTitle>
          <DialogClose class="close-x" aria-label="Close" :disabled="busy">
            <span aria-hidden="true">×</span>
          </DialogClose>
        </div>
        <DialogDescription class="cc-modal-desc">
          <span v-if="taskLabel" class="review-confirm-task">{{ taskLabel }}</span>
          RepoOS commits the work, runs the checks, and only then moves the task. Until
          that finishes the task stays <strong>active</strong> and the card shows
          <em>running checks</em>.
        </DialogDescription>
        <div class="cc-modal-body">
          <p>
            If a check fails, the task stays <strong>active</strong> with the failure shown,
            and nothing is lost — fix it and ask again.
          </p>
          <p>
            <strong>Skip checks</strong> runs the commit guard only. It is recorded as
            &ldquo;review without checks&rdquo; in the activity log, and
            <strong>Move to done</strong> still runs the full check before merging — this
            only skips the early pass, not the gate.
          </p>
        </div>
        <div class="cc-modal-actions review-confirm-actions">
          <DialogClose as-child>
            <Button variant="outline" :disabled="busy">Cancel</Button>
          </DialogClose>
          <Button
            variant="outline"
            :disabled="busy"
            title="Commit and move to review without running repoos check"
            @click="emit('skip-checks')"
          >
            Skip checks
          </Button>
          <Button variant="accent" :disabled="busy" @click="emit('run-checks')">
            {{ busy ? "Running…" : "Run checks" }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </Teleport>
</template>

<style scoped>
/* Only the bits that are specific to this modal. The shell, head, body and
   action-row all come from the shared `cc-modal` / `btn-row` styles in
   style.css, per the drawer/panel-form convention. */
.review-confirm-task {
  display: block;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  color: var(--txt-dim);
  margin-bottom: 6px;
}
</style>
