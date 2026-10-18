<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { TaskSchedule } from "../../../core/schedule.js";
import { api, JSON_OPTS } from "../api";
import { useRepoStore } from "../stores/repo";
import Button from "./ui/button.vue";
import Switch from "./ui/switch.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";
import DeleteConfirmDialog from "./DeleteConfirmDialog.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogTitle from "./ui/dialog/title.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";

const repo = useRepoStore();
const router = useRouter();

const loading = ref(false);
const error = ref("");
const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const deleteTarget = ref<TaskSchedule | null>(null);
const preview = ref("—");
const previewLoading = ref(false);
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
  void refreshPreview();
}

async function refreshPreview(): Promise<void> {
  previewLoading.value = true;
  try {
    const data = await api<{ preview: string }>("/api/schedules/preview", JSON_OPTS("POST", payload()));
    preview.value = data.preview || "—";
  } catch {
    preview.value = "Could not preview";
  } finally {
    previewLoading.value = false;
  }
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
    if (editorOpen.value) void refreshPreview();
  },
);

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

onMounted(() => {
  void repo.refreshSchedules();
});
</script>

<template>
  <div class="scheduled-tasks-panel">
    <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
      <span class="live-dot" style="background: var(--cyan)"></span>
      Scheduled tasks
      <Button variant="outline" size="sm" style="margin-left: 12px" @click="openCreate">
        New schedule
      </Button>
    </div>
    <p class="agent-desc">
      Create recurring or one-time tasks from templates. Definitions are stored in
      <code>schedules/</code> and run inside this server.
    </p>
    <p v-if="error" class="ff-error">{{ error }}</p>
    <p v-if="loading" class="agent-desc">Loading schedules…</p>
    <p v-else-if="!schedules.length" class="agent-desc">
      No schedules yet. Add one to automate documentation audits, health checks, or other
      maintenance work.
    </p>
    <div v-else class="schedule-list">
      <article v-for="row in schedules" :key="row.id" class="schedule-card" :class="{ off: !row.enabled }">
        <div class="schedule-card-head">
          <div>
            <strong>{{ row.title }}</strong>
            <span class="schedule-id">#{{ row.id }}</span>
          </div>
          <Switch :checked="row.enabled" @update:checked="(v) => toggleEnabled(row, v)" />
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
            <button v-if="row.lastTaskId" type="button" class="linkish" @click="openTask(row.lastTaskId)">
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

    <Dialog :open="editorOpen" @update:open="(v) => (editorOpen = v)">
      <DialogOverlay />
      <DialogContent class="schedule-editor">
        <DialogTitle>{{ editingId ? "Edit schedule" : "New schedule" }}</DialogTitle>
        <div class="field">
          <label>Schedule name</label>
          <input v-model="form.title" class="ff-textarea" type="text" />
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
          <label>Timezone (IANA)</label>
          <input v-model="form.timezone" class="ff-textarea" type="text" />
        </div>
        <div v-if="form.cadence !== 'once'" class="field">
          <label>Local time (HH:MM)</label>
          <input v-model="form.timeOfDay" class="ff-textarea" type="text" />
        </div>
        <div v-if="form.cadence === 'once'" class="field">
          <label>Run at (ISO)</label>
          <input v-model="form.runAt" class="ff-textarea" type="text" placeholder="2026-10-20T09:00:00Z" />
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
        <p class="ff-notice">
          Next run preview:
          <strong>{{ previewLoading ? "…" : preview }}</strong>
        </p>
        <div class="field">
          <label>Task title</label>
          <input v-model="form.taskTitle" class="ff-textarea" type="text" />
        </div>
        <div class="field">
          <label>Task specification</label>
          <textarea v-model="form.body" class="ff-textarea" rows="6" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Type</label>
            <input v-model="form.taskType" class="ff-textarea" type="text" />
          </div>
          <div class="field">
            <label>Area</label>
            <input v-model="form.taskArea" class="ff-textarea" type="text" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Priority</label>
            <input v-model="form.taskPriority" class="ff-textarea" type="text" />
          </div>
          <div class="field">
            <label>Assignee</label>
            <input v-model="form.taskAssignedTo" class="ff-textarea" type="text" placeholder="ai or human" />
          </div>
        </div>
        <div class="field">
          <label>Initial status</label>
          <input v-model="form.taskStatus" class="ff-textarea" type="text" />
        </div>
        <div class="field inline-toggle">
          <label>Start engineer automatically</label>
          <Switch v-model:checked="form.autoStartAgent" />
        </div>
        <p v-if="formError" class="ff-error">{{ formError }}</p>
        <div class="btn-row" style="margin-top: 12px">
          <Button variant="outline" @click="editorOpen = false">Cancel</Button>
          <Button @click="saveSchedule">Save schedule</Button>
        </div>
      </DialogContent>
    </Dialog>

    <DeleteConfirmDialog
      :open="!!deleteTarget"
      title="Delete schedule"
      confirm-label="Delete schedule"
      @update:open="(v) => { if (!v) deleteTarget = null; }"
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
.schedule-editor {
  max-width: 520px;
}
</style>
