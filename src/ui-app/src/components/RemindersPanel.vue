<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Bell, X } from "lucide-vue-next";
import type { Reminder } from "../../../core/reminders.js";
import { useRemindersStore } from "../stores/reminders";
import { useUiStore } from "../stores/ui";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import DeleteConfirmDialog from "./DeleteConfirmDialog.vue";

const store = useRemindersStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const open = ref(false);
const editing = ref<Reminder | null>(null);
const snoozing = ref(false);
const deleting = ref<Reminder | null>(null);
const busy = ref(false);
const error = ref("");
const formError = ref("");
const text = ref("");
const link = ref("none");
const date = ref("");
const time = ref("");
const preset = ref("hour");
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const title = computed(() =>
  snoozing.value ? "Snooze reminder" : editing.value ? "Edit reminder" : "New reminder",
);

function setLocalDate(value: Date): void {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString();
  date.value = local.slice(0, 10);
  time.value = local.slice(11, 16);
}
function show(row: Reminder | null = null, snooze = false): void {
  editing.value = row;
  snoozing.value = snooze;
  text.value = row?.text ?? "";
  link.value = row?.link || "none";
  preset.value = "hour";
  setLocalDate(row && !snooze ? new Date(row.fireAt) : new Date(Date.now() + 3_600_000));
  formError.value = "";
  open.value = true;
}
function localFireTime(): string {
  const value = new Date(`${date.value}T${time.value}`);
  if (!date.value || !time.value || !Number.isFinite(value.getTime()))
    throw new Error("Choose a valid date and time");
  return value.toISOString();
}
function snoozeTime(): string {
  const now = new Date();
  if (preset.value === "hour") return new Date(now.getTime() + 3_600_000).toISOString();
  if (preset.value === "day") return new Date(now.getTime() + 86_400_000).toISOString();
  if (preset.value === "tomorrow") {
    now.setDate(now.getDate() + 1);
    now.setHours(9, 0, 0, 0);
    return now.toISOString();
  }
  return localFireTime();
}
async function save(): Promise<void> {
  busy.value = true;
  formError.value = "";
  try {
    if (snoozing.value && editing.value) await store.snooze(editing.value.id, snoozeTime());
    else {
      const input = {
        text: text.value,
        fireAt: localFireTime(),
        link: link.value === "none" ? "" : link.value,
      };
      if (editing.value) await store.edit(editing.value.id, input);
      else await store.add(input);
    }
    open.value = false;
  } catch (e) {
    formError.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
async function markDone(row: Reminder): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.done(row.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
async function remove(): Promise<void> {
  if (!deleting.value) return;
  busy.value = true;
  error.value = "";
  try {
    await store.remove(deleting.value.id);
    deleting.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
function followLink(value: string): void {
  const tab = value.startsWith("provider:")
    ? "providers"
    : value.startsWith("model:")
      ? "budget-controls"
      : "detected";
  void router.push({ path: "/agents", query: { tab } });
}
function linkLabel(value: string): string {
  return store.links.find((item) => item.value === value)?.label ?? value;
}
onMounted(() => {
  void store.refresh();
});
</script>

<template>
  <section class="reminders-panel" data-testid="reminders-panel">
    <div class="reminders-heading">
      <div>
        <div class="sec-label"><Bell :size="14" /> Reminders</div>
        <p class="agent-desc">
          Keep track of when an agent or provider is available again. Nothing resumes automatically.
        </p>
      </div>
      <Button variant="outline" size="sm" data-testid="new-reminder" @click="show()"
        >New reminder</Button
      >
    </div>
    <p v-if="error || store.error" class="ff-error" role="alert">{{ error || store.error }}</p>
    <p v-if="store.loading && !store.reminders.length" class="agent-desc">Loading reminders…</p>
    <p v-else-if="!store.reminders.length" class="ff-notice">
      No reminders yet. Add a date to check back on an agent, credit reset, or provider outage.
    </p>
    <div v-else class="reminder-list">
      <article
        v-for="row in store.sorted"
        :key="row.id"
        class="reminder-row"
        :class="{
          'is-due': store.state(row) === 'due' || store.state(row) === 'overdue',
          'is-done': !!row.doneAt,
          'is-target': route.query.reminder === row.id,
        }"
        :data-testid="`reminder-${row.id}`"
      >
        <div class="reminder-timing">
          <span class="reminder-state">{{ store.state(row) }}</span>
          <strong>{{ store.countdown(row) }}</strong>
          <time :datetime="row.fireAt">{{ new Date(row.fireAt).toLocaleString() }}</time>
        </div>
        <div class="reminder-note">
          <h3>{{ row.text }}</h3>
          <button v-if="row.link" type="button" class="linkish" @click="followLink(row.link)">
            {{ linkLabel(row.link) }}
          </button>
          <div class="btn-row">
            <Button v-if="!row.doneAt" size="sm" :disabled="busy" @click="markDone(row)"
              >Done</Button
            >
            <Button
              v-if="!row.doneAt"
              variant="outline"
              size="sm"
              :disabled="busy"
              @click="show(row, true)"
              >Snooze</Button
            >
            <Button variant="outline" size="sm" :disabled="busy" @click="show(row)">Edit</Button>
            <Button variant="outline" size="sm" :disabled="busy" @click="deleting = row"
              >Delete</Button
            >
          </div>
        </div>
      </article>
    </div>

    <Dialog :open="open" @update:open="(value) => (open = value)">
      <DialogOverlay />
      <DialogContent
        data-testid="reminder-editor-drawer"
        :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }"
      >
        <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
        <div class="drawer-head">
          <div class="drawer-head-title">
            <DialogTitle>{{ title }}</DialogTitle>
            <DialogDescription class="sr-only"
              >Choose when to check back. Reminders never start agents or change
              settings.</DialogDescription
            >
          </div>
          <DialogClose
            class="close-x"
            aria-label="Close reminder"
            data-testid="reminder-editor-close"
            ><X :size="15"
          /></DialogClose>
        </div>
        <form class="drawer-body" @submit.prevent="save">
          <template v-if="!snoozing">
            <div class="field">
              <label for="reminder-text">Remind me to</label
              ><Input
                id="reminder-text"
                v-model="text"
                placeholder="Check Cursor credit"
                maxlength="4000"
                required
              />
            </div>
            <div class="field">
              <label id="reminder-link-label">Agent, model or provider (optional)</label>
              <Select v-model="link">
                <SelectTrigger
                  aria-labelledby="reminder-link-label"
                  class="h-[34px] w-full rounded-[9px] px-[11px]"
                  ><SelectValue
                /></SelectTrigger>
                <SelectContent position="popper"
                  ><SelectViewport>
                    <SelectItem value="none">No link</SelectItem>
                    <SelectItem v-for="item in store.links" :key="item.value" :value="item.value">{{
                      item.label
                    }}</SelectItem>
                    <SelectItem
                      v-if="link !== 'none' && !store.links.some((item) => item.value === link)"
                      :value="link"
                      >{{ link }} (no longer configured)</SelectItem
                    >
                  </SelectViewport></SelectContent
                >
              </Select>
            </div>
          </template>
          <template v-else>
            <p class="ff-notice">{{ editing?.text }}</p>
            <div class="field">
              <label id="snooze-label">Remind me again</label>
              <Select v-model="preset">
                <SelectTrigger
                  aria-labelledby="snooze-label"
                  class="h-[34px] w-full rounded-[9px] px-[11px]"
                  ><SelectValue
                /></SelectTrigger>
                <SelectContent position="popper"
                  ><SelectViewport>
                    <SelectItem value="hour">In 1 hour</SelectItem
                    ><SelectItem value="tomorrow">Tomorrow at 09:00</SelectItem
                    ><SelectItem value="day">In 1 day</SelectItem
                    ><SelectItem value="custom">Custom date and time</SelectItem>
                  </SelectViewport></SelectContent
                >
              </Select>
            </div>
          </template>
          <template v-if="!snoozing || preset === 'custom'">
            <div class="field">
              <label for="reminder-date">Date</label
              ><Input id="reminder-date" v-model="date" type="date" required />
            </div>
            <div class="field">
              <label for="reminder-time">Time</label
              ><Input id="reminder-time" v-model="time" type="time" required />
            </div>
          </template>
          <p class="ff-notice">Times are in {{ timezone }} (your browser’s timezone).</p>
          <p v-if="formError" class="ff-error" role="alert">{{ formError }}</p>
          <div class="btn-row">
            <Button type="submit" :disabled="busy">{{
              busy ? "Saving…" : snoozing ? "Snooze reminder" : "Save reminder"
            }}</Button
            ><DialogClose as-child
              ><Button variant="outline" type="button">Cancel</Button></DialogClose
            >
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <DeleteConfirmDialog
      :open="!!deleting"
      title="Delete reminder?"
      confirm-label="Delete reminder"
      :busy="busy"
      @update:open="
        (value) => {
          if (!value) deleting = null;
        }
      "
      @confirm="remove"
      >This removes “{{ deleting?.text }}” and its notice.</DeleteConfirmDialog
    >
  </section>
</template>

<style scoped>
.reminders-panel {
  padding: 16px 18px;
}
.reminders-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.reminders-heading .sec-label {
  display: flex;
  gap: 8px;
  align-items: center;
}
.reminder-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}
.reminder-row {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-solid);
  overflow: hidden;
}
.reminder-timing {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-right: 1px solid var(--border);
  background: var(--bg-2);
}
.reminder-timing strong {
  font-variant-numeric: tabular-nums;
  font-size: 18px;
  color: var(--txt);
}
.reminder-timing time {
  font-size: 12px;
  color: var(--txt-dim);
}
.reminder-state {
  font-size: 12px;
  text-transform: capitalize;
  color: var(--txt-dim);
}
.is-due .reminder-state {
  color: var(--amber);
}
.is-due {
  border-left: 3px solid var(--amber);
}
.is-target {
  outline: 2px solid var(--cyan);
}
.reminder-note {
  padding: 16px;
  min-width: 0;
}
.reminder-note h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--txt);
}
.reminder-note .btn-row {
  margin-top: 12px;
  flex-wrap: wrap;
}
@media (max-width: 640px) {
  .reminder-row {
    grid-template-columns: 1fr;
  }
  .reminder-timing {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  .reminders-heading {
    flex-direction: column;
  }
}
</style>
