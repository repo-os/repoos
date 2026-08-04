<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { COLUMNS, statusColor, useRepoStore } from "../stores/repo";
import { useUiStore } from "../stores/ui";

const repo = useRepoStore();
const ui = useUiStore();
const router = useRouter();

const allStatuses = computed(() => [
  { id: "draft", label: "Draft", color: statusColor("draft") },
  ...COLUMNS,
]);

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
  <div v-if="ui.active || ui.isNew">
    <div class="overlay" @click="ui.close()"></div>
    <div class="drawer-wrap" :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }">
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
      <div class="drawer">
        <!-- NEW TASK -->
        <template v-if="ui.isNew">
          <div class="drawer-head">
            <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em">New task</div>
            <button class="close-x" @click="ui.close()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <div class="drawer-body">
            <div class="field">
              <label>Title</label>
              <input
                v-model="ui.nt.title"
                placeholder="Add company dashboard"
                @keyup.enter="createTask"
                autofocus
              />
            </div>
            <div class="field-row">
              <div class="field">
                <label>Type</label>
                <select v-model="ui.nt.type">
                  <option>feature</option>
                  <option>bug</option>
                  <option>chore</option>
                  <option>spec</option>
                  <option>refactor</option>
                </select>
              </div>
              <div class="field">
                <label>Priority</label>
                <select v-model="ui.nt.priority">
                  <option>p0</option>
                  <option>p1</option>
                  <option selected>p2</option>
                  <option>p3</option>
                </select>
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label>Area</label>
                <input v-model="ui.nt.area" placeholder="web" />
              </div>
              <div class="field">
                <label>Assign to</label>
                <select v-model="ui.nt.assignedTo">
                  <option value="">unassigned</option>
                  <option value="ai">AI agent</option>
                  <option value="human">human</option>
                </select>
              </div>
            </div>
            <div class="btn-row" style="margin-top: 20px">
              <button class="btn" @click="ui.close()">Cancel</button>
              <button class="btn primary" @click="createTask" :disabled="ui.saving || !ui.nt.title">
                Create
              </button>
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
                <span :style="{ color: statusColor(ui.active.status), fontSize: '11px', fontWeight: 600 }">
                  {{ ui.active.status }}
                </span>
                <span class="tc-prio" :class="ui.active.priority" style="margin-left: auto">
                  {{ ui.active.priority }}
                </span>
              </div>
              <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em">{{ ui.active.title }}</div>
            </div>
            <button class="close-x" @click="ui.close()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <div class="drawer-body">
            <div class="md-h">move to</div>
            <div class="status-row">
              <button
                v-for="col in allStatuses"
                :key="col.id"
                class="status-btn"
                :class="{ on: ui.active.status === col.id }"
                @click="setStatus(col.id)"
                :disabled="ui.saving"
              >
                <span class="cdot" :style="{ background: col.color }"></span>{{ col.label }}
              </button>
            </div>
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
                <div class="v" :style="{ color: ui.active.assignee === 'ai' ? 'var(--violet)' : 'var(--txt)' }">
                  {{ ui.active.assignee === "ai" ? "◆ AI agent" : ui.active.assignedTo || "unassigned" }}
                </div>
              </div>
              <div class="meta-cell">
                <div class="k">branch</div>
                <div class="v mono" style="color: var(--cyan); font-size: 11px">{{ ui.active.branch || "—" }}</div>
              </div>
              <div class="meta-cell">
                <div class="k">created</div>
                <div class="v mono" style="font-size: 11px">{{ repo.fmtDate(ui.active.created_at) }}</div>
              </div>
              <div class="meta-cell">
                <div class="k">updated</div>
                <div class="v mono" style="font-size: 11px">{{ repo.fmtDate(ui.active.updated_at) }}</div>
              </div>
            </div>
            <div class="md-h" style="margin-top: 18px">spec</div>
            <div class="md-body">{{ ui.active.body || "(no body)" }}</div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
