<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { X } from "lucide-vue-next";
import type { Task } from "../types";
import { COLUMNS, statusColor, useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";

const repo = useRepoStore();
const ui = useUiStore();
const router = useRouter();

const allStatuses = computed(() => [
  { id: "draft", label: "Draft", color: statusColor("draft") },
  ...COLUMNS,
]);

const open = computed(() => ui.active !== null || ui.isNew);
function setOpen(v: boolean): void {
  if (!v) ui.close();
}

function onOpenAutoFocus(e: Event): void {
  if (ui.isNew) {
    e.preventDefault();
    requestAnimationFrame(() => document.getElementById("nt-title")?.focus());
  }
}

const taskTypes = ["feature", "bug", "chore", "spec", "refactor"];
const priorities = ["p0", "p1", "p2", "p3"];

async function createTask(): Promise<void> {
  if (!ui.nt.title) return;
  ui.saving = true;
  try {
    await repo.createTask({ ...ui.nt });
    ui.close();
    ui.nt.title = "";
    ui.nt.area = "web";
    ui.nt.priority = "p2";
    ui.nt.type = "feature";
    ui.nt.assignedTo = "";
    router.push("/work");
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

async function setStatus(status: string): Promise<void> {
  if (!ui.active || ui.active.status === status) return;
  ui.saving = true;
  try {
    await repo.setStatus(ui.active, status);
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

const confirmDelete = ref(false);

async function deleteTask(): Promise<void> {
  if (!ui.active) return;
  ui.saving = true;
  try {
    await repo.deleteTask(ui.active.id);
    ui.close();
  } catch (err) {
    repo.onError(err);
    confirmDelete.value = false;
  } finally {
    ui.saving = false;
  }
}

interface TaskDraft {
  title: string;
  type: string;
  priority: string;
  area: string;
  assignedTo: string;
  branch: string;
  body: string;
}

const DRAFT_FIELDS = ["title", "type", "priority", "area", "assignedTo", "branch", "body"] as const;

function emptyDraft(): TaskDraft {
  return { title: "", type: "feature", priority: "p2", area: "", assignedTo: "", branch: "", body: "" };
}

/** Editable field values while the drawer is open. */
const draft = reactive<TaskDraft>(emptyDraft());
/** Snapshot of the fields at the last sync; the baseline Save diffs against. */
const original = reactive<TaskDraft>(emptyDraft());

function baseline(): void {
  for (const k of DRAFT_FIELDS) original[k] = draft[k];
}

function initDraft(t: Task): void {
  draft.title = t.title;
  draft.type = t.type;
  draft.priority = t.priority;
  draft.area = t.area;
  draft.assignedTo = t.assignedTo;
  draft.branch = t.branch;
  draft.body = t.body;
  baseline();
}

function changedFields(): (keyof TaskDraft)[] {
  return DRAFT_FIELDS.filter((k) => draft[k] !== original[k]);
}

const dirty = computed(() => changedFields().length > 0);

let draftFromId = "";
watch(
  () => ui.active,
  (t) => {
    if (!t) {
      draftFromId = "";
      return;
    }
    if (t.id !== draftFromId) {
      // Different task (or drawer just reopened): load a fresh draft.
      initDraft(t);
      draftFromId = t.id;
      return;
    }
    // Same task got updated (SSE task.updated). Resync only when the user has
    // no unsaved edits, so concurrent changes never clobber the draft.
    if (!dirty.value) initDraft(t);
  },
);

async function saveDraft(): Promise<void> {
  if (!ui.active || !dirty.value) return;
  const patch: Record<string, string> = {};
  for (const k of changedFields()) patch[k] = draft[k];
  ui.saving = true;
  try {
    await repo.patchTask(ui.active.id, patch);
    baseline();
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

function cancelDraft(): void {
  if (ui.active) initDraft(ui.active);
}
</script>

<template>
  <Dialog :open="open" @update:open="setOpen">
    <DialogOverlay />
    <DialogContent
      :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
      @open-auto-focus="onOpenAutoFocus"
    >
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>

      <!-- NEW TASK -->
      <template v-if="ui.isNew">
        <div class="drawer-head">
          <DialogTitle>New task</DialogTitle>
          <DialogDescription class="sr-only">Create a new task</DialogDescription>
          <DialogClose class="close-x">
            <X class="size-[15px]" />
          </DialogClose>
        </div>
        <div class="drawer-body">
          <div class="field">
            <label for="nt-title">Title</label>
            <Input
              id="nt-title"
              v-model="ui.nt.title"
              placeholder="Add company dashboard"
              @keyup.enter="createTask"
            />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Type</label>
              <Select v-model="ui.nt.type">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport
                    class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                  >
                    <SelectItem v-for="t in taskTypes" :key="t" :value="t">{{ t }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div class="field">
              <label>Priority</label>
              <Select v-model="ui.nt.priority">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport
                    class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                  >
                    <SelectItem v-for="p in priorities" :key="p" :value="p">{{ p }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Area</label>
              <Input v-model="ui.nt.area" placeholder="web" />
            </div>
            <div class="field">
              <label>Assign to</label>
              <Select
                :model-value="ui.nt.assignedTo === '' ? 'unassigned' : ui.nt.assignedTo"
                @update:model-value="
                  (v) => (ui.nt.assignedTo = v === 'unassigned' ? '' : (v ?? ''))
                "
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport
                    class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                  >
                    <SelectItem value="unassigned">unassigned</SelectItem>
                    <SelectItem value="ai">AI agent</SelectItem>
                    <SelectItem value="human">human</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="btn-row" style="margin-top: 20px">
            <Button variant="outline" @click="ui.close()">Cancel</Button>
            <Button variant="default" @click="createTask" :disabled="ui.saving || !ui.nt.title">
              Create
            </Button>
          </div>
        </div>
      </template>

      <!-- TASK DETAIL -->
      <template v-else-if="ui.active">
        <div class="drawer-head">
          <div style="flex: 1">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 7px">
              <span class="tc-id mono">{{ ui.active.path }}</span>
              <span class="cdot" :style="{ background: statusColor(ui.active.status) }"></span>
              <span
                :style="{ color: statusColor(ui.active.status), fontSize: '11px', fontWeight: 600 }"
              >
                {{ ui.active.status }}
              </span>
              <span class="tc-prio" :class="ui.active.priority" style="margin-left: auto">
                {{ ui.active.priority }}
              </span>
            </div>
            <DialogTitle>{{ ui.active.title }}</DialogTitle>
            <DialogDescription class="sr-only">{{
              ui.active.body || "Task details"
            }}</DialogDescription>
          </div>
          <DialogClose class="close-x">
            <X class="size-[15px]" />
          </DialogClose>
        </div>
        <div class="drawer-body">
          <div class="save-bar">
            <span v-if="dirty" class="save-hint">unsaved changes</span>
            <div class="save-actions">
              <Button variant="outline" size="sm" :disabled="ui.saving || !dirty" @click="cancelDraft">
                Cancel
              </Button>
              <Button variant="default" size="sm" :disabled="ui.saving || !dirty" @click="saveDraft">
                Save
              </Button>
            </div>
          </div>
          <div class="field">
            <label for="et-title">Title</label>
            <Input id="et-title" v-model="draft.title" placeholder="Task title" />
          </div>
          <div class="md-h" style="margin-top: 14px">move to</div>
          <Select :model-value="ui.active.status" @update:model-value="(v) => setStatus(v ?? '')">
            <SelectTrigger :disabled="ui.saving">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                <SelectItem v-for="col in allStatuses" :key="col.id" :value="col.id">
                  <span class="cdot" :style="{ background: col.color }"></span>{{ col.label }}
                </SelectItem>
              </SelectViewport>
            </SelectContent>
          </Select>
          <div class="field-row" style="margin-top: 16px">
            <div class="field">
              <label>Type</label>
              <Select v-model="draft.type">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport
                    class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                  >
                    <SelectItem v-for="t in taskTypes" :key="t" :value="t">{{ t }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div class="field">
              <label>Priority</label>
              <Select v-model="draft.priority">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport
                    class="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                  >
                    <SelectItem v-for="p in priorities" :key="p" :value="p">{{ p }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="et-area">Area</label>
              <Input id="et-area" v-model="draft.area" placeholder="web" />
            </div>
            <div class="field">
              <label for="et-assignee">Assigned to</label>
              <Input id="et-assignee" v-model="draft.assignedTo" list="assignee-options" placeholder="unassigned" />
              <datalist id="assignee-options">
                <option value="ai"></option>
                <option value="human"></option>
              </datalist>
            </div>
          </div>
          <div class="field">
            <label for="et-branch">Branch</label>
            <Input id="et-branch" v-model="draft.branch" placeholder="feat/…" />
          </div>
          <div class="md-h" style="margin-top: 18px">spec</div>
          <textarea class="md-edit" v-model="draft.body" rows="10" placeholder="Markdown body"></textarea>
          <div class="md-h" style="margin-top: 4px">meta</div>
          <div class="meta-grid">
            <div class="meta-cell">
              <div class="k">id</div>
              <div class="v mono" style="font-size: 11px">{{ ui.active.id }}</div>
            </div>
            <div class="meta-cell">
              <div class="k">created_by</div>
              <div class="v">{{ ui.active.createdBy || "—" }}</div>
            </div>
            <div class="meta-cell">
              <div class="k">created</div>
              <div class="v mono" style="font-size: 11px">
                {{ repo.fmtDate(ui.active.created_at) }}
              </div>
            </div>
            <div class="meta-cell">
              <div class="k">updated</div>
              <div class="v mono" style="font-size: 11px">
                {{ repo.fmtDate(ui.active.updated_at) }}
              </div>
            </div>
            <div class="meta-cell">
              <div class="k">branch in git</div>
              <div class="v mono" style="color: var(--cyan); font-size: 11px">
                {{ ui.active.git?.branchExists ? "exists" : "no local branch" }}
              </div>
            </div>
            <div class="meta-cell">
              <div class="k">last commit</div>
              <div class="v mono" style="font-size: 11px">
                {{ ui.active.git?.lastCommit ?? "—" }}
              </div>
            </div>
          </div>
          <div class="delete-zone">
            <template v-if="!confirmDelete">
              <Button
                variant="destructive"
                size="sm"
                :disabled="ui.saving"
                @click="confirmDelete = true"
              >
                Delete task
              </Button>
            </template>
            <template v-else>
              <p class="delete-prompt">
                Delete task #{{ ui.active.id }}? The file will be removed. Committed changes are
                recoverable from git; uncommitted or never-committed work is lost.
              </p>
              <div class="delete-actions">
                <Button variant="outline" size="sm" :disabled="ui.saving" @click="confirmDelete = false">
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" :disabled="ui.saving" @click="deleteTask">
                  Delete
                </Button>
              </div>
            </template>
          </div>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>
