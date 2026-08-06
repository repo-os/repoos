<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { X, Play, Pause } from "lucide-vue-next";
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

async function startWork(): Promise<void> {
  if (!ui.active) return;
  ui.saving = true;
  try {
    await repo.startWork(ui.active);
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

async function pauseWork(): Promise<void> {
  if (!ui.active) return;
  ui.saving = true;
  try {
    await repo.pauseWork(ui.active);
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
  body: string;
}

const DRAFT_FIELDS = ["title", "type", "priority", "area", "assignedTo", "body"] as const;

function emptyDraft(): TaskDraft {
  return { title: "", type: "feature", priority: "p2", area: "", assignedTo: "", body: "" };
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
  draft.body = t.body;
  baseline();
}

function changedFields(): (keyof TaskDraft)[] {
  return DRAFT_FIELDS.filter((k) => draft[k] !== original[k]);
}

const dirty = computed(() => changedFields().length > 0);

/** Title and branch are frozen once a task leaves the planning stages. */
const locked = computed(() => {
  const s = ui.active?.status;
  return s === "active" || s === "review" || s === "done";
});

const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Branch is never typed: it derives from the title unless one is already set. */
const derivedBranch = computed(() => `feat/${slugify(draft.title)}`);
const effectiveBranch = computed(() => ui.active?.branch || derivedBranch.value);

/** Spec body is a readable card that expands into a large textarea on click. */
const specEditing = ref(false);
const specTextarea = ref<HTMLTextAreaElement | null>(null);

/** Grow the spec textarea to fit its content so editing never feels cramped. */
function autoGrowSpec(): void {
  const el = specTextarea.value;
  if (!el) return;
  // scrollHeight excludes the border (box-sizing: border-box); add it back so
  // the box exactly fits its content and never shows an internal scrollbar.
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
}

watch(specEditing, (editing) => {
  if (editing) nextTick(autoGrowSpec);
});

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
      specEditing.value = false;
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
  // Auto-derive the branch from the title for planning-stage tasks — but only
  // when the branch is unset or was itself derived. Never clobber an explicit
  // branch such as "feat/0026-delete-tasks".
  if (!locked.value) {
    const prevDerived = `feat/${slugify(original.title)}`;
    const hadDerived = ui.active.branch === "" || ui.active.branch === prevDerived;
    if (patch.title !== undefined && hadDerived && derivedBranch.value !== ui.active.branch) {
      patch.branch = derivedBranch.value;
    }
  }
  ui.saving = true;
  try {
    await repo.patchTask(ui.active.id, patch);
    baseline();
    specEditing.value = false;
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
}

function cancelDraft(): void {
  if (ui.active) initDraft(ui.active);
  specEditing.value = false;
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
          <template v-if="!locked">
            <div class="field">
              <label for="et-title">Title</label>
              <Input id="et-title" v-model="draft.title" placeholder="Task title" />
            </div>
          </template>
          <template v-else>
            <div class="field">
              <label>Title</label>
              <div class="ro-value">{{ ui.active.title }}</div>
            </div>
          </template>
          <div class="field">
            <label>Branch</label>
            <div class="ro-value mono" style="color: var(--cyan)">
              {{ effectiveBranch || "—" }}
              <span v-if="!locked && !ui.active.branch" class="branch-note">auto-derived from title</span>
            </div>
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
          <div v-if="ui.active.status === 'ready' || ui.active.status === 'active'" class="field" style="margin-top: 16px">
            <Button
              v-if="ui.active.status === 'ready'"
              variant="accent"
              class="w-full"
              :disabled="ui.saving"
              @click="startWork"
            >
              <Play class="size-3.5" />
              Start work
            </Button>
            <Button
              v-else
              variant="outline"
              class="w-full"
              :disabled="ui.saving"
              @click="pauseWork"
            >
              <Pause class="size-3.5" />
              Pause work
            </Button>
            <span v-if="ui.active.status === 'active' && repo.isRunning(ui.active.id)" class="drawer-run">
              <span class="tc-run"></span> agent running
            </span>
          </div>
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
          <div class="md-h" style="margin-top: 18px">spec</div>
          <button v-if="!specEditing" class="md-card" type="button" @click="specEditing = true">
            <div class="md-card-body">{{ draft.body || "No spec yet — click to add." }}</div>
          </button>
          <template v-else>
            <textarea
              ref="specTextarea"
              class="md-edit"
              v-model="draft.body"
              rows="12"
              placeholder="Markdown body"
              @input="autoGrowSpec"
            ></textarea>
            <div class="spec-hint">Click Save to apply the spec.</div>
          </template>
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
        <div v-if="dirty" class="save-bar">
          <div class="save-callout">
            <span class="save-dot"></span>
            <div>
              <div class="save-title">Unsaved changes</div>
              <div class="save-sub">Save to apply your edits</div>
            </div>
          </div>
          <div class="save-actions">
            <Button variant="outline" size="sm" :disabled="ui.saving" @click="cancelDraft">
              Cancel
            </Button>
            <Button variant="default" size="sm" :disabled="ui.saving" @click="saveDraft">
              Save
            </Button>
          </div>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>
