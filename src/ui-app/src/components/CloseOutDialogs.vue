<script setup lang="ts">
import { computed, ref } from "vue";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import type { Task } from "../types";
import DirtyCheckoutDialog from "./DirtyCheckoutDialog.vue";
import WorktreeHandoffConflictDialog from "./WorktreeHandoffConflictDialog.vue";

const repo = useRepoStore();
const ui = useUiStore();

/**
 * The one presenter for the two close-out confirmation rejections — a dirty
 * checkout (0204/#0512) and a worktree changed after handoff (#0598/#0834).
 *
 * `completeTask` writes the store record BEFORE it throws the marker error,
 * and `repo.onError` deliberately swallows those two error types so the
 * failure is answered by a dialog instead of a toast. Every path into
 * Move to done — the card button, the drawer button, a board drag, the
 * stalled-pipeline retry in the integration bar, Keep review & merge — used
 * to carry its own dialog copy, which stacked when two owners fired for the
 * same record (a board drag with the card mounted, or the drawer open).
 * The record is the open-dialog signal; this component is its only renderer,
 * so exactly one overlay can exist per record. When both a conflict and a
 * dirty record are pending, the conflict — the escalated state of the same
 * decision — shows first, and the dirty dialog appears once it resolves.
 * Records are cleared on cancel/discard/send-back, on a successful retry
 * (`completeTask`), and by the store when the task leaves `review`.
 */
const conflictId = computed(() => Object.keys(repo.worktreeHandoffConflicts)[0] ?? null);
const dirtyId = computed(() =>
  conflictId.value
    ? null
    : (Object.keys(repo.dirtyCheckouts).find(
        (id) => (repo.dirtyCheckouts[id]?.files ?? []).length,
      ) ?? null),
);

/** The dialogs only render the id, but the retry actions call store methods
 *  that read `task.id`; when the task has already left the board (a refresh
 *  raced the close-out) a minimal stand-in keeps the actions working. */
function taskForId(id: string): Task {
  return repo.tasks.find((t) => t.id === id) ?? ({ id } as Task);
}

const dirtyTask = computed(() => (dirtyId.value ? taskForId(dirtyId.value) : null));
const conflictTask = computed(() => (conflictId.value ? taskForId(conflictId.value) : null));

const busy = ref(false);

async function withBusy(fn: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
  } finally {
    busy.value = false;
  }
}

/** Mirror the drawer's post-success behavior: the close-out pipeline now owns
 *  the outcome, so show its live progress instead of a stale drawer. */
function afterCloseOutStarted(id: string): void {
  if (ui.active?.id === id) {
    ui.close();
    ui.expandIntegrationBar();
  }
}

async function confirmCommitDirty(): Promise<void> {
  const t = dirtyTask.value;
  if (!t) return;
  await withBusy(async () => {
    try {
      await repo.completeTask(t, { commitDirty: true });
      afterCloseOutStarted(t.id);
    } catch (err) {
      // Still dirty after committing (e.g. a new file appeared), or the retry
      // now conflicts: the record was rewritten and the dialog stays for the
      // next choice. Anything else reports normally.
      if (err instanceof Error && err.name !== "DirtyCheckoutError") repo.onError(err);
    }
  });
}

async function discardHandoffConflict(): Promise<void> {
  const t = conflictTask.value;
  if (!t) return;
  await withBusy(async () => {
    try {
      await repo.discardWorktreeHandoffEdits(t);
      repo.pushToast("Post-handoff edits discarded — retry Move to done when ready.", "info");
    } catch (err) {
      repo.onError(err);
    }
  });
}

async function sendBackHandoffConflict(): Promise<void> {
  const t = conflictTask.value;
  if (!t) return;
  await withBusy(async () => {
    try {
      await repo.sendBackFromHandoffConflict(t);
    } catch (err) {
      repo.onError(err);
    }
  });
}

function cancelDirty(): void {
  if (dirtyId.value) repo.clearDirtyCheckout(dirtyId.value);
}

function cancelHandoffConflict(): void {
  if (conflictId.value) repo.clearWorktreeHandoffConflict(conflictId.value);
}
</script>

<template>
  <DirtyCheckoutDialog
    :task="dirtyTask"
    :files="dirtyTask ? repo.dirtyFilesFor(dirtyTask.id) : []"
    :scope="dirtyTask ? repo.dirtyScopeFor(dirtyTask.id) : 'main'"
    @commit="confirmCommitDirty"
    @cancel="cancelDirty"
  />
  <WorktreeHandoffConflictDialog
    :task="conflictTask"
    :message="conflictTask ? (repo.worktreeHandoffConflictFor(conflictTask.id)?.message ?? '') : ''"
    :files="conflictTask ? (repo.worktreeHandoffConflictFor(conflictTask.id)?.files ?? []) : []"
    :files-unavailable="
      !!conflictTask && !!repo.worktreeHandoffConflictFor(conflictTask.id)?.filesUnavailable
    "
    @discard="discardHandoffConflict"
    @send-back="sendBackHandoffConflict"
    @cancel="cancelHandoffConflict"
  />
</template>
