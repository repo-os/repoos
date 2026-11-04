<script setup lang="ts">
/**
 * Uncommitted changes panel (#1030).
 *
 * Opened from the full-width amber button under the sidebar's git-state row.
 * It reuses the shared right-panel shell (`DialogContent` → `.drawer-wrap
 * .drawer`, `ui.drawerWidth`, `drawer-resize`/`drawer-head`/`drawer-body`) so
 * it reads like the task drawer's Changes tab rather than a second drawer
 * system. The file list and the diff come from two existing sources:
 *
 *  - files: the store's `repo.status` snapshot (`dirty`), so untracked files
 *    are listed too — exactly what the sidebar chip counts;
 *  - patch: `GET /api/repo/working-diff` (`git diff HEAD`), rendered by the
 *    same `DiffFileViewer` the Changes tab uses.
 *
 * Committing goes through `repo.commitRepoRoot` — the one commit pipeline the
 * sidebar popover's CommitDialog already uses — and the server keeps its
 * guards (nothing to commit, conflicts, detached HEAD, pending close-out, hook
 * rejection), so every refusal is shown inline with its verbatim output.
 */
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { X } from "lucide-vue-next";
import { api, ApiError } from "../api";
import { parseDiffFiles } from "../lib/diff-files";
import { statusLetter, statusWord } from "../lib/git-status";
import { shotFixturePinnedWorkingDiff } from "../lib/shot-preview-fixtures";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import DiffFileViewer from "./DiffFileViewer.vue";

const open = defineModel<boolean>("open", { default: false });

/** Shown as the placeholder; the server applies the same text when blank. */
const DEFAULT_MESSAGE = "chore: commit uncommitted changes";
const DIFF_ID_PREFIX = "repo-dirty-diff-";

const repo = useRepoStore();
const ui = useUiStore();
const { gitStatus } = storeToRefs(repo);

const message = ref("");
const busy = ref(false);
const error = ref("");
const hookOutput = ref("");
const committedNote = ref("");

const patch = ref("");
const truncated = ref(false);
const diffLoading = ref(false);
const diffError = ref("");
/** Guards against a slow response from an older open overwriting a newer one. */
let diffSeq = 0;

const dirtyFiles = computed(() => gitStatus.value?.dirty ?? []);
const dirtyCount = computed(() => dirtyFiles.value.length);
const branch = computed(() => gitStatus.value?.branch ?? "");
const detached = computed(() => gitStatus.value?.detached === true);

const diffFiles = computed(() => parseDiffFiles(patch.value));
const diffNames = computed(() => new Set(diffFiles.value.map((f) => f.filename)));

const canCommit = computed(
  () => !busy.value && dirtyCount.value > 0 && !!branch.value && !detached.value,
);

async function loadDiff(): Promise<void> {
  const seq = ++diffSeq;
  diffLoading.value = true;
  diffError.value = "";
  // A `repo:dirtyMain` capture pins the patch alongside the status: handoff
  // commits the branch before capturing, so the real working tree is clean and
  // would empty this panel mid-shot (#1030).
  const pinned = shotFixturePinnedWorkingDiff();
  if (pinned) {
    patch.value = pinned.patch;
    truncated.value = pinned.truncated;
    diffLoading.value = false;
    return;
  }
  try {
    const data = await api<{ ok: boolean; patch?: string; truncated?: boolean }>(
      "/api/repo/working-diff",
    );
    if (seq !== diffSeq) return;
    patch.value = data.patch ?? "";
    truncated.value = Boolean(data.truncated);
  } catch (err) {
    if (seq !== diffSeq) return;
    diffError.value = err instanceof Error ? err.message : "Could not load the working-tree diff.";
  } finally {
    if (seq === diffSeq) diffLoading.value = false;
  }
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  error.value = "";
  hookOutput.value = "";
  committedNote.value = "";
  // The button only opens on a live snapshot, but a refresh here keeps the
  // panel and the sidebar chip honest if they were opened moments apart.
  void repo.refreshGitStatus();
  void loadDiff();
});

/** Scroll the panel to a file's diff section (only files with a patch). */
function showFile(path: string): void {
  if (!diffNames.value.has(path)) return;
  document
    .getElementById(`${DIFF_ID_PREFIX}${path}`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function commit(): Promise<void> {
  if (!canCommit.value) return;
  busy.value = true;
  error.value = "";
  hookOutput.value = "";
  committedNote.value = "";
  try {
    const r = await repo.commitRepoRoot(message.value);
    message.value = "";
    // Commit succeeded: nothing is uncommitted any more. Clear locally so the
    // panel empties now, then let the store's refreshed snapshot update the
    // sidebar chip (the commit route also pushes `repo.status`).
    patch.value = "";
    truncated.value = false;
    committedNote.value = `Committed ${r.files} file${r.files === 1 ? "" : "s"} to ${r.branch} (${r.sha}).`;
    repo.pushToast(
      `Committed ${r.files} file${r.files === 1 ? "" : "s"} to ${r.branch} (${r.sha})`,
      "success",
    );
    await repo.refreshGitStatus();
    if (dirtyCount.value > 0) void loadDiff();
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
  <Dialog v-model:open="open">
    <DialogOverlay />
    <DialogContent
      data-testid="repo-dirty-panel"
      :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
    >
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
      <div class="drawer-head">
        <div class="drawer-head-title">
          <DialogTitle>Uncommitted changes</DialogTitle>
          <DialogDescription class="repo-dirty-sub">
            <template v-if="dirtyCount > 0">
              {{ dirtyCount }} file{{ dirtyCount === 1 ? "" : "s" }} on
              <code class="mono">{{ detached ? "detached HEAD" : branch }}</code> will be committed.
            </template>
            <template v-else>Working tree is clean.</template>
          </DialogDescription>
        </div>
        <DialogClose class="close-x" aria-label="Close uncommitted changes">
          <X :size="15" />
        </DialogClose>
      </div>

      <div class="drawer-body repo-dirty-body">
        <p v-if="committedNote && dirtyCount === 0" class="repo-dirty-success" role="status">
          {{ committedNote }}
        </p>

        <template v-if="dirtyCount > 0">
          <section class="repo-dirty-sec">
            <h3>Changed files</h3>
            <ul class="repo-dirty-files">
              <li v-for="f in dirtyFiles" :key="f.path">
                <button
                  v-if="diffNames.has(f.path)"
                  type="button"
                  class="repo-dirty-file repo-dirty-file-btn"
                  :title="`${statusWord(f.status)}: ${f.path}`"
                  @click="showFile(f.path)"
                >
                  <span class="side-git-chip" aria-hidden="true">{{ statusLetter(f.status) }}</span>
                  <span class="repo-dirty-file-path">{{ f.path }}</span>
                  <span class="repo-dirty-file-word">{{ statusWord(f.status) }}</span>
                </button>
                <div v-else class="repo-dirty-file repo-dirty-file-static">
                  <span class="side-git-chip" aria-hidden="true">{{ statusLetter(f.status) }}</span>
                  <span class="repo-dirty-file-path">{{ f.path }}</span>
                  <span class="repo-dirty-file-word">no diff yet</span>
                </div>
              </li>
            </ul>
          </section>

          <section class="repo-dirty-sec">
            <h3>Working-tree diff</h3>
            <p v-if="diffLoading" class="repo-dirty-note">Loading the working-tree diff…</p>
            <p v-else-if="diffError" class="ff-error" role="alert">{{ diffError }}</p>
            <DiffFileViewer
              v-else-if="patch"
              :patch="patch"
              :truncated="truncated"
              :id-prefix="DIFF_ID_PREFIX"
              :show-file-list="false"
            />
            <p v-else class="repo-dirty-note">
              No textual diff to show. Untracked files are committed with the others.
            </p>
          </section>
        </template>

        <p v-else-if="!committedNote" class="repo-dirty-note">
          Nothing is uncommitted in this checkout.
        </p>
      </div>

      <footer class="repo-dirty-foot">
        <div class="field">
          <label for="repo-dirty-message">
            Commit message <span class="repo-dirty-optional">(optional)</span>
          </label>
          <textarea
            id="repo-dirty-message"
            v-model="message"
            class="ff-textarea repo-dirty-input"
            rows="3"
            :placeholder="DEFAULT_MESSAGE"
            :disabled="busy || dirtyCount === 0"
            @keydown="onKeydown"
          />
        </div>
        <p v-if="detached" class="repo-dirty-note">
          HEAD is detached. Check out a branch before committing.
        </p>
        <p v-if="error" class="ff-error" role="alert">{{ error }}</p>
        <pre v-if="hookOutput" class="repo-dirty-output mono">{{ hookOutput }}</pre>
        <div class="repo-dirty-actions">
          <span class="repo-dirty-hint">
            Commits every change
            <template v-if="dirtyCount > 0 && !detached">
              on <code class="mono">{{ branch }}</code></template
            >
          </span>
          <Button class="repo-dirty-commit" variant="accent" :disabled="!canCommit" @click="commit">
            {{ busy ? "Committing…" : "Commit changes" }}
          </Button>
        </div>
      </footer>
    </DialogContent>
  </Dialog>
</template>
