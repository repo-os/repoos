<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { X, Play, Pause, Send, CheckCheck } from "lucide-vue-next";
import type { Task } from "../types";
import { COLUMNS, statusColor, useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import { useConfigStore } from "../stores/config";
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
const config = useConfigStore();
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
    requestAnimationFrame(() => {
      const id = newMode.value === "freeform" ? "nt-freeform" : "nt-title";
      document.getElementById(id)?.focus();
    });
  }
}

const taskTypes = ["feature", "bug", "chore", "spec", "refactor"];
const priorities = ["p0", "p1", "p2", "p3"];

// ---- freeform creation flow ----

/** Which new-task flow the drawer is showing (default from settings). */
const newMode = ref<"freeform" | "manual">("freeform");
/** The raw explanation being turned into a task. */
const freeformText = ref("");
/** Visible error from a failed PM-agent call (explanation stays intact). */
const freeformError = ref("");
/** A fallback draft persisted when the agent failed, opened on request. */
const draftSaved = ref<Task | null>(null);

/** True when an enabled `pm` agent exists on the Agents page. */
const pmAgentReady = computed(() => {
  if (!config.loaded) return true;
  return (config.agents ?? []).some((a) => a.name === "pm" && a.enabled);
});

watch(
  () => ui.isNew,
  (isNew) => {
    if (!isNew) return;
    newMode.value = config.form.defaultTaskMode === "manual" ? "manual" : "freeform";
    freeformText.value = "";
    freeformError.value = "";
    draftSaved.value = null;
  },
);

async function createFreeform(): Promise<void> {
  const text = freeformText.value.trim();
  if (!text) return;
  ui.saving = true;
  freeformError.value = "";
  draftSaved.value = null;
  try {
    const res = await repo.createFreeformTask(text);
    // Agent error: keep the explanation in the textarea, show the error, and
    // point at the draft that preserved the capture.
    if (res.fallback && res.fallbackReason === "agent-failed") {
      draftSaved.value = res.task;
      freeformError.value = res.reason ?? "The PM agent failed";
      return;
    }
    // Success, or the no-PM-agent fallback (raw explanation saved as draft):
    // open the resulting task in the drawer's edit view so it can be tweaked.
    ui.close();
    freeformText.value = "";
    await ui.openTask(res.task);
    router.push("/work");
  } catch (err) {
    freeformError.value = err instanceof Error ? err.message : String(err);
  } finally {
    ui.saving = false;
  }
}

function openDraft(): void {
  if (!draftSaved.value) return;
  ui.close();
  void ui.openTask(draftSaved.value);
  router.push("/work");
  draftSaved.value = null;
}

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
    ui.activeTab = "agent";
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

// ---- review → done close-out ----

const confirmDone = ref(false);
/** True while the merge+build+check+cleanup request is in flight. */
const doingDone = ref(false);
/** Human-readable progress label, driven by server `task.progress` events. */
const doneLabel = computed(() => {
  const step = ui.active ? repo.doneSteps[ui.active.id] : undefined;
  switch (step) {
    case "merge":
      return "Merging branch…";
    case "build":
      return "Building…";
    case "check":
      return "Running repoos check…";
    case "done":
      return "Closing out…";
    default:
      return "Merging branch…";
  }
});

async function moveToDone(): Promise<void> {
  if (!ui.active) return;
  ui.saving = true;
  doingDone.value = true;
  try {
    await repo.completeTask(ui.active);
    confirmDone.value = false;
  } catch (err) {
    repo.onError(err);
    confirmDone.value = false;
  } finally {
    doingDone.value = false;
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

// ---- agent session tab ----

/** The rendered transcript for the open task. */
const outputLines = computed<{ s: string; d: string }[]>(() =>
  ui.active ? repo.outputs[ui.active.id] ?? [] : [],
);
/** A follow-up message typed in the Agent tab. */
const draftMsg = ref("");
/** Stick-to-bottom: only when the user hasn't scrolled up the log. */
const stick = ref(true);
const logEl = ref<HTMLElement | null>(null);
/** True when a turn is in flight (input disabled). */
const agentBusy = computed(
  () => !!ui.active && ui.active.status === "active" && repo.isRunning(ui.active.id),
);

watch(outputLines, () => {
  if (stick.value) {
    nextTick(() => {
      const el = logEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
});

function onLogScroll(e: Event): void {
  const el = e.target as HTMLElement;
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

/** Hydrate the transcript whenever the Agent tab opens or the task changes. */
watch(
  () => [ui.active?.id, ui.activeTab],
  () => {
    if (ui.active && ui.activeTab === "agent") void repo.loadOutput(ui.active.id);
  },
);

async function sendTurn(): Promise<void> {
  if (!ui.active) return;
  const text = draftMsg.value.trim();
  if (!text || agentBusy.value) return;
  ui.saving = true;
  try {
    await repo.sendMessage(ui.active.id, text);
    draftMsg.value = "";
  } catch (err) {
    repo.onError(err);
  } finally {
    ui.saving = false;
  }
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
        <div class="drawer-tabs">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: newMode === 'freeform' }"
            @click="newMode = 'freeform'"
          >
            Freeform
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: newMode === 'manual' }"
            @click="newMode = 'manual'"
          >
            Manual form
          </button>
        </div>
        <div class="drawer-body">
          <template v-if="newMode === 'freeform'">
            <div class="field">
              <label for="nt-freeform">Describe the task</label>
              <textarea
                id="nt-freeform"
                v-model="freeformText"
                class="ff-textarea"
                rows="10"
                placeholder="Type the task however it comes out — like explaining it to a person. The PM agent writes the structured task file."
              ></textarea>
            </div>
            <div v-if="!pmAgentReady" class="ff-notice">
              No PM agent is configured.
              <router-link :to="{ name: 'agents' }" @click="ui.close()">
                Set one up on the Agents page
              </router-link>
              — until then your explanation is saved as a draft task.
            </div>
            <div v-if="draftSaved" class="ff-error">
              The PM agent failed:
              <span class="mono">{{ freeformError }}</span>
              — your explanation was saved as draft
              <span class="mono">#{{ draftSaved.id }}</span> so it isn't lost.
              <Button variant="outline" size="sm" @click="openDraft">Open draft</Button>
            </div>
            <div v-else-if="freeformError" class="ff-error">{{ freeformError }}</div>
            <div class="btn-row" style="margin-top: 20px">
              <Button variant="outline" @click="ui.close()">Cancel</Button>
              <Button
                variant="default"
                @click="createFreeform"
                :disabled="ui.saving || !freeformText.trim()"
              >
                {{ ui.saving ? "Asking the PM agent…" : "Create task" }}
              </Button>
            </div>
          </template>
          <template v-else>
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
          </template>
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
        <div class="drawer-tabs">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: ui.activeTab === 'details' }"
            @click="ui.activeTab = 'details'"
          >
            Details
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: ui.activeTab === 'agent' }"
            @click="ui.activeTab = 'agent'"
          >
            Agent
          </button>
        </div>
        <div v-if="ui.activeTab === 'details'" class="drawer-body">
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
          <div v-if="ui.active.status === 'review'" class="field" style="margin-top: 16px">
            <template v-if="!confirmDone">
              <Button
                variant="default"
                class="w-full"
                :disabled="ui.saving"
                @click="confirmDone = true"
              >
                <CheckCheck class="size-3.5" />
                Move to done
              </Button>
            </template>
            <template v-else>
              <p class="delete-prompt">
                Move task #{{ ui.active.id }} to done? This merges
                <span class="mono">{{ effectiveBranch }}</span> into main, runs
                <span class="mono">repoos check</span>, then deletes the branch and closes the
                worktree.
              </p>
              <div class="delete-actions">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="ui.saving"
                  @click="confirmDone = false"
                >
                  Cancel
                </Button>
                <Button variant="default" size="sm" :disabled="ui.saving" @click="moveToDone">
                  {{ doingDone ? doneLabel : "Move to done" }}
                </Button>
              </div>
            </template>
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
        <div v-else class="drawer-body">
          <div class="agent-log" ref="logEl" @scroll="onLogScroll">
            <template v-if="outputLines.length === 0">
              <div class="agent-empty">
                No agent session yet.
                <br />
                Start work to launch the coding agent; its output streams here.
              </div>
            </template>
            <div
              v-for="(line, i) in outputLines"
              :key="i"
              class="agent-line"
              :class="line.s"
            >
              <span class="agent-pfx" :class="line.s">{{
                line.s === "err" ? "✕" : line.s === "sys" ? "·" : "›"
              }}</span>
              <span class="agent-d">{{ line.d }}</span>
            </div>
          </div>
          <div class="agent-input-row">
            <textarea
              v-model="draftMsg"
              class="agent-input"
              rows="2"
              placeholder="Send a follow-up to the task's agent session…"
              :disabled="agentBusy || ui.saving"
              @keydown.enter.exact.prevent="sendTurn"
            ></textarea>
            <Button
              variant="accent"
              size="sm"
              :disabled="agentBusy || ui.saving || !draftMsg.trim()"
              @click="sendTurn"
            >
              <Send class="size-3.5" />
              Send
            </Button>
          </div>
          <div v-if="agentBusy" class="agent-hint">
            <span class="tc-run"></span> agent is working — wait for this turn to finish
          </div>
          <div v-else-if="ui.active && ui.active.status !== 'active'" class="agent-hint">
            Task is {{ ui.active.status }} — start work to run an agent turn.
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
