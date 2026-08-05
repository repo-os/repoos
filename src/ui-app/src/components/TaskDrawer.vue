<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { X } from "lucide-vue-next";
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
          <div class="md-h">move to</div>
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
          <div class="meta-grid" style="margin-top: 16px">
            <div class="meta-cell">
              <div class="k">type</div>
              <div class="v">{{ ui.active.type }}</div>
            </div>
            <div class="meta-cell">
              <div class="k">area</div>
              <div class="v">{{ ui.active.area }}</div>
            </div>
            <div class="meta-cell">
              <div class="k">assigned_to</div>
              <div
                class="v"
                :style="{ color: ui.active.assignee === 'ai' ? 'var(--violet)' : 'var(--txt)' }"
              >
                {{
                  ui.active.assignee === "ai" ? "◆ AI agent" : ui.active.assignedTo || "unassigned"
                }}
              </div>
            </div>
            <div class="meta-cell">
              <div class="k">branch</div>
              <div class="v mono" style="color: var(--cyan); font-size: 11px">
                {{ ui.active.branch || "—" }}
              </div>
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
          </div>
          <div class="md-h" style="margin-top: 18px">spec</div>
          <div class="md-body">{{ ui.active.body || "(no body)" }}</div>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>
