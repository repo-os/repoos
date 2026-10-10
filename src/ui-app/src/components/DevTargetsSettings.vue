<script setup lang="ts">
/**
 * The Advanced-tab card that edits the project's `[[dev.targets]]` list (#0749).
 *
 * Add, edit, reorder (up/down) and remove rows, all through the config API —
 * never a hand-edit of repoos.toml. Validation is the loader's own
 * `parseDevTargets` (see `lib/dev-targets`), so an inline error here is the
 * exact message the server would return. Server-recorded errors for
 * hand-written rows the parser had to drop (or a save rejected server-side) are
 * shown above the list rather than silently losing a target.
 */
import { computed, ref } from "vue";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-vue-next";
import { useConfigStore } from "../stores/config";
import Button from "./ui/button.vue";
import Card from "./ui/card.vue";
import DevTargetDialog from "./DevTargetDialog.vue";
import {
  devTargetsErrors,
  draftFromTarget,
  emptyDevTargetDraft,
  targetFromDraft,
  type DevTargetDraft,
  type DevTargetPayload,
} from "../lib/dev-targets";

const config = useConfigStore();

/** The declared targets, as the browser config serializes them. */
const targets = computed<DevTargetPayload[]>(() =>
  Array.isArray(config.data?.devTargets) ? (config.data!.devTargets as DevTargetPayload[]) : [],
);

/** Rows the server reported it could not load (a hand-edited typo, say). */
const serverErrors = computed<string[]>(() =>
  Array.isArray(config.data?.devTargetErrors) ? (config.data!.devTargetErrors as string[]) : [],
);

const drafts = computed<DevTargetDraft[]>(() => targets.value.map(draftFromTarget));

const dialogOpen = ref(false);
/** The row being edited, or null when adding. */
const editing = ref<DevTargetDraft | null>(null);
/** A local save error (validation or a rejected API call). */
const saveError = ref("");

/** Names other than the one being edited, for the duplicate check. */
const takenNames = computed(() => drafts.value.map((d) => d.name).filter((n) => n.trim()));

function openAdd(): void {
  editing.value = null;
  saveError.value = "";
  dialogOpen.value = true;
}

function openEdit(row: DevTargetDraft): void {
  editing.value = { ...row };
  saveError.value = "";
  dialogOpen.value = true;
}

/** Write the whole list back through the config API. */
async function persist(next: DevTargetDraft[]): Promise<void> {
  saveError.value = "";
  const errors = devTargetsErrors(next);
  if (errors.length) {
    saveError.value = errors[0]!;
    return;
  }
  try {
    await config.save({ devTargets: next.map(targetFromDraft) });
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err);
  }
}

function onDialogSubmit(draft: DevTargetDraft): void {
  const next = drafts.value.slice();
  const self = editing.value;
  if (self) {
    const i = next.findIndex((d) => d.name === self.name);
    if (i === -1) next.push(draft);
    else next[i] = draft;
  } else {
    next.push(draft);
  }
  dialogOpen.value = false;
  void persist(next);
}

function remove(index: number): void {
  const next = drafts.value.slice();
  next.splice(index, 1);
  void persist(next);
}

function move(index: number, delta: -1 | 1): void {
  const j = index + delta;
  const next = drafts.value.slice();
  if (j < 0 || j >= next.length) return;
  const [row] = next.splice(index, 1);
  next.splice(j, 0, row!);
  void persist(next);
}

/** The label shown for a row: the human label when set, else the name. */
function rowTitle(t: DevTargetPayload): string {
  return t.label?.trim() || t.name;
}

/** The second line: what the target actually runs (URL / output / nothing). */
function rowDetail(t: DevTargetPayload): string {
  if (t.kind === "server") return t.url ?? "";
  if (t.kind === "artifact") return t.artifactPath ?? "";
  return ""; // a process has neither — the command line below carries it
}
</script>

<template>
  <Card class="dev-targets-card">
    <div class="setting-group">
      <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
        <span class="live-dot"></span>Dev targets
      </div>
      <div class="setting-desc" style="padding: 4px 0 12px">
        The things you run yourself while developing — a local HMR server, a debug build, a native
        app process — as opposed to task previews, which RepoOS manages for a task's worktree. Only
        commands declared here can be started.
      </div>

      <div v-if="serverErrors.length" class="ff-error" role="alert">
        <span
          >Some targets in <code>repoos.toml</code> could not be loaded and are not listed
          below.</span
        >
        <span class="dev-targets-server-errors">{{ serverErrors.join(" · ") }}</span>
      </div>
      <div v-if="saveError" class="ff-error" role="alert">{{ saveError }}</div>

      <p v-if="!targets.length" class="dev-targets-empty">
        No dev targets yet. Add one to start it from the Dev page without opening a terminal.
      </p>

      <ul v-else class="dev-targets-list">
        <li v-for="(t, i) in targets" :key="t.name" class="dev-targets-row">
          <div class="dev-targets-row-main">
            <div class="dev-targets-row-head">
              <span class="dev-targets-name">{{ rowTitle(t) }}</span>
              <span class="dev-targets-kind" :class="`dev-targets-kind--${t.kind}`">{{
                t.kind
              }}</span>
            </div>
            <div v-if="rowDetail(t)" class="dev-targets-row-detail mono">{{ rowDetail(t) }}</div>
            <div class="dev-targets-cmd mono">{{ t.command }}</div>
          </div>
          <div class="dev-targets-row-actions">
            <button
              type="button"
              class="dev-targets-icon-btn"
              :disabled="i === 0 || config.saving"
              :aria-label="`Move ${rowTitle(t)} up`"
              @click="move(i, -1)"
            >
              <ChevronUp aria-hidden="true" />
            </button>
            <button
              type="button"
              class="dev-targets-icon-btn"
              :disabled="i === targets.length - 1 || config.saving"
              :aria-label="`Move ${rowTitle(t)} down`"
              @click="move(i, 1)"
            >
              <ChevronDown aria-hidden="true" />
            </button>
            <button
              type="button"
              class="dev-targets-icon-btn"
              :disabled="config.saving"
              :aria-label="`Edit ${rowTitle(t)}`"
              @click="openEdit(draftFromTarget(t))"
            >
              <Pencil aria-hidden="true" />
            </button>
            <button
              type="button"
              class="dev-targets-icon-btn dev-targets-icon-btn--danger"
              :disabled="config.saving"
              :aria-label="`Remove ${rowTitle(t)}`"
              @click="remove(i)"
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        </li>
      </ul>

      <div class="btn-row" style="justify-content: flex-start; margin-top: 12px">
        <Button
          variant="outline"
          type="button"
          data-test-id="dev-targets-add"
          :disabled="config.saving"
          @click="openAdd"
        >
          <Plus aria-hidden="true" /> Add target
        </Button>
      </div>
    </div>
  </Card>

  <DevTargetDialog
    v-model:open="dialogOpen"
    :target="editing"
    :taken-names="takenNames"
    :busy="config.saving"
    @submit="onDialogSubmit"
  />
</template>

<style scoped>
/* Match the sibling Advanced-tab cards (SettingsView): inset content, same gap below. */
.dev-targets-card {
  padding: 0 18px 6px;
  margin-bottom: 16px;
}
.dev-targets-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dev-targets-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--panel-solid);
}
.dev-targets-row-main {
  min-width: 0;
  flex: 1;
}
.dev-targets-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dev-targets-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--txt);
}
.dev-targets-kind {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--border-bright);
  color: var(--txt-dim);
}
.dev-targets-kind--server {
  border-color: color-mix(in srgb, var(--cyan) 45%, transparent);
  color: var(--cyan);
}
.dev-targets-kind--artifact {
  border-color: color-mix(in srgb, var(--amber) 45%, transparent);
  color: var(--amber);
}
.dev-targets-row-detail,
.dev-targets-cmd {
  font-size: 11.5px;
  color: var(--txt-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dev-targets-cmd {
  color: var(--txt-faint);
}
.dev-targets-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}
.dev-targets-icon-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--txt-dim);
  cursor: pointer;
}
.dev-targets-icon-btn:hover:not(:disabled) {
  border-color: var(--border-bright);
  color: var(--txt);
}
.dev-targets-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dev-targets-icon-btn--danger:hover:not(:disabled) {
  border-color: var(--red-border-tint);
  color: var(--red);
}
.dev-targets-icon-btn svg {
  width: 14px;
  height: 14px;
}
.dev-targets-empty {
  margin: 0;
  font-size: 12px;
  color: var(--txt-faint);
}
.dev-targets-server-errors {
  display: block;
  margin-top: 4px;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
}
</style>
