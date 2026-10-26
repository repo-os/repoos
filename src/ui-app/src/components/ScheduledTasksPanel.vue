<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { X } from "lucide-vue-next";
import type { TaskSchedule } from "../../../core/schedule.js";
import {
  computeNextRun,
  formatNextRunPreview,
  isValidIanaTimezone,
  parseTimeOfDay,
  type ScheduleTimingInput,
} from "../../../core/schedule-time.js";
import { useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import Switch from "./ui/switch.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";
import DeleteConfirmDialog from "./DeleteConfirmDialog.vue";
import PageSkeleton from "./PageSkeleton.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogTitle from "./ui/dialog/title.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";

const repo = useRepoStore();
const ui = useUiStore();
const router = useRouter();

const loading = ref(true);
const error = ref("");
const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const deleteTarget = ref<TaskSchedule | null>(null);
const preview = ref("—");
const formError = ref("");

const form = ref({
  title: "",
  enabled: true,
  cadence: "weekly" as "once" | "daily" | "weekly",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  timeOfDay: "09:00",
  runAt: "",
  dayOfWeek: 1,
  taskTitle: "",
  taskType: "chore",
  taskArea: "docs",
  taskPriority: "p2",
  taskAssignedTo: "ai",
  taskStatus: "ready",
  autoStartAgent: false,
  body: "",
});

const schedules = computed(() => repo.schedules);

function timingInput(): ScheduleTimingInput {
  return {
    cadence: form.value.cadence,
    timezone: form.value.timezone.trim(),
    timeOfDay: form.value.timeOfDay,
    runAt: form.value.cadence === "once" ? form.value.runAt : undefined,
    dayOfWeek: form.value.cadence === "weekly" ? form.value.dayOfWeek : undefined,
  };
}

function timingValidationError(): string | null {
  const tz = form.value.timezone.trim();
  if (!tz) return "Timezone is required";
  if (!isValidIanaTimezone(tz)) {
    return "Timezone must be a valid IANA name (e.g. Asia/Singapore)";
  }
  if (!parseTimeOfDay(form.value.timeOfDay)) {
    return "Local time must be HH:MM (24-hour)";
  }
  if (
    form.value.cadence === "weekly" &&
    (form.value.dayOfWeek == null || form.value.dayOfWeek < 0 || form.value.dayOfWeek > 6)
  ) {
    return "Day of week is required for weekly schedules";
  }
  if (form.value.cadence === "once") {
    if (!form.value.runAt.trim()) return "Run at is required for one-time schedules";
    if (Number.isNaN(Date.parse(form.value.runAt))) {
      return "Run at must be a valid ISO timestamp";
    }
  }
  return null;
}

const timezoneError = computed(() => {
  const tz = form.value.timezone.trim();
  if (!tz) return "Timezone is required";
  if (!isValidIanaTimezone(tz)) {
    return "Timezone must be a valid IANA name (e.g. Asia/Singapore)";
  }
  return "";
});

const formIsValid = computed(() => {
  if (!form.value.title.trim()) return false;
  const taskTitle = (form.value.taskTitle || form.value.title).trim();
  if (!taskTitle) return false;
  return timingValidationError() === null;
});

function resetForm(): void {
  form.value = {
    title: "",
    enabled: true,
    cadence: "weekly",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    timeOfDay: "09:00",
    runAt: "",
    dayOfWeek: 1,
    taskTitle: "",
    taskType: "chore",
    taskArea: "docs",
    taskPriority: "p2",
    taskAssignedTo: "ai",
    taskStatus: "ready",
    autoStartAgent: false,
    body: "",
  };
  formError.value = "";
  preview.value = "—";
}

function openCreate(): void {
  editingId.value = null;
  resetForm();
  editorOpen.value = true;
  refreshPreview();
}

function openEdit(row: TaskSchedule): void {
  editingId.value = row.id;
  form.value = {
    title: row.title,
    enabled: row.enabled,
    cadence: row.cadence,
    timezone: row.timezone,
    timeOfDay: row.timeOfDay,
    runAt: row.runAt,
    dayOfWeek: row.dayOfWeek ?? 1,
    taskTitle: row.taskTitle,
    taskType: row.taskType,
    taskArea: row.taskArea,
    taskPriority: row.taskPriority,
    taskAssignedTo: row.taskAssignedTo,
    taskStatus: row.taskStatus,
    autoStartAgent: row.autoStartAgent,
    body: row.body,
  };
  formError.value = "";
  editorOpen.value = true;
  refreshPreview();
}

function refreshPreview(): void {
  const err = timingValidationError();
  if (err) {
    preview.value = err;
    return;
  }
  const next = computeNextRun(timingInput(), new Date(), false);
  if (!next) {
    preview.value = "No upcoming run with these settings";
    return;
  }
  preview.value = formatNextRunPreview(next, form.value.timezone.trim());
}

watch(
  () => [
    form.value.cadence,
    form.value.timezone,
    form.value.timeOfDay,
    form.value.runAt,
    form.value.dayOfWeek,
  ],
  () => {
    if (editorOpen.value) refreshPreview();
  },
);

function setEditorOpen(v: boolean): void {
  editorOpen.value = v;
}

function onOpenAutoFocus(e: Event): void {
  if (!editorOpen.value) return;
  e.preventDefault();
  requestAnimationFrame(() => document.getElementById("sched-title")?.focus());
}

function payload() {
  return {
    title: form.value.title,
    enabled: form.value.enabled,
    cadence: form.value.cadence,
    timezone: form.value.timezone,
    timeOfDay: form.value.timeOfDay,
    runAt: form.value.cadence === "once" ? form.value.runAt : undefined,
    dayOfWeek: form.value.cadence === "weekly" ? form.value.dayOfWeek : undefined,
    taskTitle: form.value.taskTitle || form.value.title,
    taskType: form.value.taskType,
    taskArea: form.value.taskArea,
    taskPriority: form.value.taskPriority,
    taskAssignedTo: form.value.taskAssignedTo,
    taskStatus: form.value.taskStatus,
    autoStartAgent: form.value.autoStartAgent,
    body: form.value.body,
  };
}

async function saveSchedule(): Promise<void> {
  if (!formIsValid.value) return;
  formError.value = "";
  try {
    if (editingId.value) {
      await repo.patchSchedule(editingId.value, payload());
    } else {
      await repo.createSchedule(payload());
    }
    editorOpen.value = false;
  } catch (err) {
    formError.value = err instanceof Error ? err.message : "Save failed";
  }
}

async function toggleEnabled(row: TaskSchedule, enabled: boolean): Promise<void> {
  try {
    await repo.patchSchedule(row.id, { enabled });
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Update failed";
  }
}

async function runNow(row: TaskSchedule): Promise<void> {
  try {
    await repo.runSchedule(row.id);
    repo.pushToast(`Schedule #${row.id} created a task`, "info");
  } catch (err) {
    repo.pushToast(err instanceof Error ? err.message : "Run failed", "error");
  }
}

function cadenceLabel(row: TaskSchedule): string {
  if (row.cadence === "once") return "One-time";
  if (row.cadence === "daily") return `Daily at ${row.timeOfDay}`;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const d = row.dayOfWeek != null ? days[row.dayOfWeek] : "?";
  return `Weekly ${d} ${row.timeOfDay}`;
}

function lastResultLabel(row: TaskSchedule): string {
  if (!row.lastResult) return "—";
  if (row.lastResult === "success") return "Success";
  if (row.lastResult === "failure") return `Failed: ${row.lastError || "error"}`;
  if (row.lastResult === "missed") return "Missed";
  return row.lastResult;
}

function openTask(id: string): void {
  void router.push({ path: "/work", query: { task: id } });
}

function consumeShotEditorOpen(): void {
  if (!ui.scheduleEditorShotOpen) return;
  ui.scheduleEditorShotOpen = false;
  openCreate();
}

watch(() => ui.scheduleEditorShotOpen, consumeShotEditorOpen);

onMounted(() => {
  void repo.refreshSchedules().finally(() => {
    loading.value = false;
  });
  consumeShotEditorOpen();
});
</script>

<template>
  <div class="scheduled-tasks-panel">
    <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
      <span class="live-dot" style="background: var(--cyan)"></span>
      Scheduled tasks
      <Button
        variant="outline"
        size="sm"
        style="margin-left: 12px"
        data-testid="new-schedule"
        @click="openCreate"
      >
        New schedule
      </Button>
    </div>
    <p class="agent-desc">
      Create recurring or one-time tasks from templates. Definitions are stored in
      <code>schedules/</code> and run inside this server.
    </p>
    <p v-if="error" class="ff-error">{{ error }}</p>
    <PageSkeleton v-if="loading && !schedules.length" kind="rows" />
    <p v-else-if="!schedules.length" class="agent-desc">
      No schedules yet. Add one to automate documentation audits, health checks, or other
      maintenance work.
    </p>
    <div v-else class="schedule-list">
      <article
        v-for="row in schedules"
        :key="row.id"
        class="schedule-card"
        :class="{ off: !row.enabled }"
        :data-testid="`schedule-card-${row.id}`"
      >
        <div class="schedule-card-head">
          <div>
            <strong>{{ row.title }}</strong>
            <span class="schedule-id">#{{ row.id }}</span>
          </div>
          <Switch
            :data-testid="`schedule-enabled-${row.id}`"
            :checked="row.enabled"
            @update:checked="(v) => toggleEnabled(row, v)"
          />
        </div>
        <dl class="kv-rows schedule-kv">
          <dt>Cadence</dt>
          <dd>{{ cadenceLabel(row) }} ({{ row.timezone }})</dd>
          <dt>Next run</dt>
          <dd>{{ row.nextRunPreview }}</dd>
          <dt>Last run</dt>
          <dd>{{ row.lastRunAt ? new Date(row.lastRunAt).toLocaleString() : "—" }}</dd>
          <dt>Last result</dt>
          <dd class="kv-wrap">{{ lastResultLabel(row) }}</dd>
          <dt>Latest task</dt>
          <dd>
            <button
              v-if="row.lastTaskId"
              type="button"
              class="linkish"
              @click="openTask(row.lastTaskId)"
            >
              #{{ row.lastTaskId }}
            </button>
            <span v-else>—</span>
          </dd>
        </dl>
        <div class="schedule-actions">
          <Button variant="outline" size="sm" @click="runNow(row)">Run now</Button>
          <Button variant="outline" size="sm" @click="openEdit(row)">Edit</Button>
          <Button variant="outline" size="sm" @click="deleteTarget = row">Delete</Button>
        </div>
      </article>
    </div>

    <Dialog :open="editorOpen" @update:open="setEditorOpen">
      <DialogOverlay />
      <DialogContent
        data-testid="schedule-editor-drawer"
        :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
        @open-auto-focus="onOpenAutoFocus"
      >
        <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>

        <div class="drawer-head">
          <div class="drawer-head-title">
            <DialogTitle>{{ editingId ? "Edit schedule" : "New schedule" }}</DialogTitle>
            <DialogDescription class="sr-only">
              {{
                editingId ? "Edit a scheduled task template" : "Create a scheduled task template"
              }}
            </DialogDescription>
          </div>
          <DialogClose class="close-x" data-testid="schedule-editor-close">
            <X class="size-[15px]" />
          </DialogClose>
        </div>

        <div class="drawer-body">
          <div class="field">
            <label for="sched-title">Schedule name</label>
            <Input id="sched-title" v-model="form.title" placeholder="Weekly doc audit" />
          </div>
          <div class="field">
            <label>Cadence</label>
            <Select v-model="form.cadence">
              <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectViewport>
                  <SelectItem value="once">One-time</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectViewport>
              </SelectContent>
            </Select>
          </div>
          <div class="field">
            <label for="sched-timezone">Timezone (IANA)</label>
            <Input
              id="sched-timezone"
              v-model="form.timezone"
              placeholder="Asia/Singapore"
              :aria-invalid="timezoneError ? 'true' : undefined"
            />
            <p v-if="timezoneError" class="ff-error">{{ timezoneError }}</p>
          </div>
          <div v-if="form.cadence !== 'once'" class="field">
            <label for="sched-time">Local time (HH:MM)</label>
            <Input id="sched-time" v-model="form.timeOfDay" placeholder="09:00" />
          </div>
          <div v-if="form.cadence === 'once'" class="field">
            <label for="sched-run-at">Run at (ISO)</label>
            <Input id="sched-run-at" v-model="form.runAt" placeholder="2026-10-20T09:00:00Z" />
          </div>
          <div v-if="form.cadence === 'weekly'" class="field">
            <label>Day of week</label>
            <Select v-model="form.dayOfWeek">
              <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectViewport>
                  <SelectItem :value="0">Sunday</SelectItem>
                  <SelectItem :value="1">Monday</SelectItem>
                  <SelectItem :value="2">Tuesday</SelectItem>
                  <SelectItem :value="3">Wednesday</SelectItem>
                  <SelectItem :value="4">Thursday</SelectItem>
                  <SelectItem :value="5">Friday</SelectItem>
                  <SelectItem :value="6">Saturday</SelectItem>
                </SelectViewport>
              </SelectContent>
            </Select>
          </div>
          <p class="ff-notice" data-testid="schedule-next-preview">
            Next run preview:
            <strong>{{ preview }}</strong>
          </p>
          <div class="field">
            <label for="sched-task-title">Task title</label>
            <Input
              id="sched-task-title"
              v-model="form.taskTitle"
              placeholder="Same as schedule name"
            />
          </div>
          <div class="field">
            <label for="sched-body">Task specification</label>
            <textarea
              id="sched-body"
              v-model="form.body"
              class="ff-textarea"
              rows="6"
              placeholder="## Problem&#10;…"
            />
          </div>
          <div class="field-row">
            <div class="field">
              <label for="sched-type">Type</label>
              <Input id="sched-type" v-model="form.taskType" />
            </div>
            <div class="field">
              <label for="sched-area">Area</label>
              <Input id="sched-area" v-model="form.taskArea" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="sched-priority">Priority</label>
              <Input id="sched-priority" v-model="form.taskPriority" />
            </div>
            <div class="field">
              <label for="sched-assignee">Assignee</label>
              <Input id="sched-assignee" v-model="form.taskAssignedTo" placeholder="ai or human" />
            </div>
          </div>
          <div class="field">
            <label for="sched-status">Initial status</label>
            <Input id="sched-status" v-model="form.taskStatus" />
          </div>
          <div class="field inline-toggle">
            <label>Start engineer automatically</label>
            <Switch v-model:checked="form.autoStartAgent" />
          </div>
          <p v-if="formError" class="ff-error">{{ formError }}</p>
          <div class="btn-row" style="margin-top: 20px">
            <Button variant="outline" @click="editorOpen = false">Cancel</Button>
            <Button :disabled="!formIsValid" data-testid="schedule-save" @click="saveSchedule">
              Save schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <DeleteConfirmDialog
      :open="!!deleteTarget"
      title="Delete schedule"
      confirm-label="Delete schedule"
      @update:open="
        (v) => {
          if (!v) deleteTarget = null;
        }
      "
      @confirm="
        async () => {
          if (!deleteTarget) return;
          await repo.deleteSchedule(deleteTarget.id);
          deleteTarget = null;
        }
      "
    >
      {{ deleteTarget ? `Delete “${deleteTarget.title}” permanently?` : "" }}
    </DeleteConfirmDialog>
  </div>
</template>

<style scoped>
.schedule-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}
.schedule-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--surface-1, var(--bg-elev));
}
.schedule-card.off {
  opacity: 0.72;
}
.schedule-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.schedule-id {
  margin-left: 8px;
  color: var(--txt-dim);
  font-size: 12px;
}
.schedule-kv {
  --kv-label-w: 7.5rem;
  margin-bottom: 12px;
}
.schedule-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.linkish {
  background: none;
  border: none;
  color: var(--cyan);
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.inline-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
