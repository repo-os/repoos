<script setup lang="ts">
/**
 * Budget Controls → Agent+Models Allowlists for Agent Drivers (#0764).
 *
 * A human-approved allowlist of coding-agent + model pairs an *agent driver*
 * (a CLI/API caller operating RepoOS) may set as an engineer/reviewer override.
 * A human using this page is never restricted. Empty/unset means nothing is
 * restricted — say so in the copy below.
 *
 * Each agent's model list is collapsed by default (the allowlist can get long)
 * and shows its model count while collapsed. #0856 replaced the always-visible
 * inline picker (which read like a status display) with a "+ Add to allowlist"
 * modal: the shared coding agent + model selector (`AgentModelControl`) starts
 * empty and only commits on an explicit Add, so the default pair can't be
 * re-added by reflex.
 *
 * #0850: a whole agent or one model can be paused without being removed. A
 * paused row stays visible with its chip, reason and resume date; selection
 * skips it and expires `pausedUntil` automatically (the clock below re-renders
 * once a deadline passes, with no restart).
 */
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useConfigStore, labelForModel } from "../stores/config";
import {
  agentModelAllowRows,
  isPairPaused,
  pairPauseInfo,
  pauseAllowlistEntry,
  resumeAllowlistEntry,
} from "../../../core/budget-allowlist.js";
import type { AgentModelAllowRow } from "../../../core/types.js";
import type { SelectSearchOption } from "./SelectSearchGroup.vue";
import AgentModelControl from "./AgentModelControl.vue";
import { useRepoStore } from "../stores/repo";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

const config = useConfigStore();
const repo = useRepoStore();

/** Rows as the server exposes them under the schema key. */
const rows = computed<AgentModelAllowRow[]>(() =>
  agentModelAllowRows(config.data?.["budget.allowlist"]),
);

const cliOptions = computed(() => config.agentsMeta.clis ?? []);

/** Collapsed by default; the count is visible while collapsed. */
const expanded = reactive<Record<string, boolean>>({});

function isExpanded(cli: string): boolean {
  return expanded[cli] === true;
}

function toggleRow(cli: string): void {
  expanded[cli] = !isExpanded(cli);
}

function countLabel(n: number): string {
  return `${n} model${n === 1 ? "" : "s"}`;
}

function modelLabel(model: string, cli: string): string {
  return labelForModel(model, cli);
}

/**
 * A ticking clock so an expired `pausedUntil` resumes in the UI without a
 * restart or a config rewrite. Selection already evaluates at call time; this
 * only keeps the rendered chips honest.
 */
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 30_000);
});

/**
 * The row (and model chip) just added through the modal (#0856), highlighted
 * briefly so the new entry is easy to spot, then cleared.
 */
const addedCli = ref<string | null>(null);
const addedModel = ref<string | null>(null);
let addedTimer: ReturnType<typeof setTimeout> | undefined;

function flashAdded(cli: string, model: string): void {
  addedCli.value = cli;
  addedModel.value = model;
  if (addedTimer) clearTimeout(addedTimer);
  addedTimer = setTimeout(() => {
    addedCli.value = null;
    addedModel.value = null;
  }, 2000);
}

onUnmounted(() => {
  if (clock) clearInterval(clock);
  if (addedTimer) clearTimeout(addedTimer);
});

function untilIsFuture(until: string | undefined): boolean {
  if (!until) return true;
  const at = Date.parse(until);
  return !Number.isFinite(at) || at > now.value;
}

function rowPaused(row: AgentModelAllowRow): boolean {
  return row.paused === true && untilIsFuture(row.pausedUntil);
}

function modelPaused(row: AgentModelAllowRow, model: string): boolean {
  if (rowPaused(row)) return true;
  return isPairPaused(rows.value, row.cli, model, now.value);
}

function pauseDetail(row: AgentModelAllowRow, model?: string): string {
  const info = pairPauseInfo(rows.value, row.cli, model ?? "default", now.value);
  const parts: string[] = [];
  if (info.reason) parts.push(info.reason);
  if (info.until && untilIsFuture(info.until)) {
    parts.push(`until ${new Date(info.until).toLocaleString()}`);
  }
  return parts.join(" · ");
}

async function save(next: AgentModelAllowRow[]): Promise<boolean> {
  try {
    await config.setConfigValues({ "budget.allowlist": next });
    return true;
  } catch {
    /* config.error already carries the server message; the form rolls back. */
    return false;
  }
}

// ── Add to allowlist modal (#0856) ──────────────────────────────────────────
//
// The inline picker that used to sit above the list looked like a status
// display, so it was easy to re-add the default pair over and over. Adding now
// starts from a deliberately empty draft and only commits on an explicit Add.

const addDialog = reactive({ open: false, error: "" });
const addDraft = reactive({ cli: "", model: "" });

/** Models for the chosen agent, with pairs already allowed marked un-pickable. */
const addModelOptions = computed<SelectSearchOption[]>(() => {
  const cli = addDraft.cli;
  if (!cli) return [];
  const allowed = new Set(rows.value.find((r) => r.cli === cli)?.models ?? []);
  return config.modelsFor(cli, addDraft.model || undefined).map((m) => ({
    ...m,
    disabled: m.disabled || allowed.has(m.value),
    hint: allowed.has(m.value) ? "already allowed" : undefined,
  }));
});

const addReady = computed(() => Boolean(addDraft.cli && addDraft.model) && !config.saving);

function isPairAllowed(cli: string, model: string): boolean {
  return rows.value.some((r) => r.cli === cli && r.models.includes(model));
}

function openAddDialog(): void {
  addDraft.cli = "";
  addDraft.model = "";
  addDialog.error = "";
  addDialog.open = true;
}

async function confirmAdd(): Promise<void> {
  const cli = addDraft.cli;
  const model = addDraft.model;
  if (!cli || !model) return;
  if (isPairAllowed(cli, model)) {
    addDialog.error = `${cli} + ${modelLabel(model, cli)} is already on the allowlist.`;
    return;
  }
  const existing = rows.value.find((r) => r.cli === cli);
  const next = existing
    ? rows.value.map((r) =>
        r.cli === cli ? { ...r, models: [...new Set([...r.models, model])] } : r,
      )
    : [...rows.value, { cli, models: [model] }];
  expanded[cli] = true;
  const ok = await save(next);
  if (!ok) {
    addDialog.error = config.error || "Could not add that pair. Try again.";
    return;
  }
  addDialog.open = false;
  flashAdded(cli, model);
  repo.pushToast(`Added ${cli} + ${modelLabel(model, cli)} to the allowlist`, "success");
}

async function removeModel(cli: string, model: string): Promise<void> {
  const next = rows.value
    .map((r) => (r.cli === cli ? { ...r, models: r.models.filter((m) => m !== model) } : r))
    // A row needs at least one model — dropping the last model drops the agent.
    .filter((r) => r.models.length > 0);
  await save(next);
}

async function removeAgent(cli: string): Promise<void> {
  await save(rows.value.filter((r) => r.cli !== cli));
}

// ── Pause / resume (#0850) ──────────────────────────────────────────────────

const pauseDialog = reactive({
  open: false,
  cli: "",
  model: "",
  until: "",
  reason: "",
  error: "",
});

const dialogTitle = computed(() =>
  pauseDialog.model
    ? `Pause ${modelLabel(pauseDialog.model, pauseDialog.cli)}`
    : `Pause ${pauseDialog.cli}`,
);

function openPauseDialog(cli: string, model?: string): void {
  pauseDialog.open = true;
  pauseDialog.cli = cli;
  pauseDialog.model = model ?? "";
  pauseDialog.until = "";
  pauseDialog.reason = "";
  pauseDialog.error = "";
}

async function confirmPause(): Promise<void> {
  const result = pauseAllowlistEntry(rows.value, {
    cli: pauseDialog.cli,
    model: pauseDialog.model || undefined,
    until: pauseDialog.until || undefined,
    reason: pauseDialog.reason || undefined,
  });
  if ("error" in result) {
    pauseDialog.error = result.error;
    return;
  }
  await save(result.rows);
  if (!config.error) pauseDialog.open = false;
}

async function resumeAgent(cli: string): Promise<void> {
  const result = resumeAllowlistEntry(rows.value, { cli });
  if ("error" in result) return;
  await save(result.rows);
}

async function resumeModel(cli: string, model: string): Promise<void> {
  const result = resumeAllowlistEntry(rows.value, { cli, model });
  if ("error" in result) return;
  await save(result.rows);
}
</script>

<template>
  <div class="agent-tab-panel budget-controls" style="padding: 0 18px 6px; margin-bottom: 16px">
    <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
      <span class="live-dot"></span>Agent+Models Allowlists for Agent Drivers
    </div>
    <p class="agent-desc">
      The coding agents and models an AI agent driver may pick when it sets an engineer or reviewer
      override (<code>repoos override</code>). A human using this page is never restricted — you
      keep the full list. Leave this empty and nothing is restricted: agent drivers behave exactly
      as they do today. Pause an agent or model to stop every selection from using it without
      removing the row; it resumes automatically after an optional date, or immediately with Resume.
    </p>

    <div class="budget-add">
      <Button variant="accent" size="sm" data-testid="budget-add-open" @click="openAddDialog">
        + Add to allowlist
      </Button>
    </div>

    <div v-if="!rows.length" class="agent-empty" data-testid="budget-empty">
      No agents on the allowlist yet — agent drivers are unrestricted. Add one to steer them to
      specific agent + model pairs.
    </div>

    <ul v-else class="budget-list" data-testid="budget-list">
      <li
        v-for="row in rows"
        :key="row.cli"
        class="budget-row"
        :class="{ 'budget-row-paused': rowPaused(row), 'budget-row-added': addedCli === row.cli }"
        :data-testid="`budget-row-li-${row.cli}`"
      >
        <button
          type="button"
          class="budget-row-head"
          :aria-expanded="isExpanded(row.cli)"
          :data-testid="`budget-row-${row.cli}`"
          @click="toggleRow(row.cli)"
        >
          <span class="budget-row-caret" :class="{ open: isExpanded(row.cli) }">▸</span>
          <span class="budget-agent">{{ row.cli }}</span>
          <span class="budget-count">· {{ countLabel(row.models.length) }}</span>
          <span v-if="rowPaused(row)" class="budget-paused-chip" data-testid="budget-paused-chip">
            Paused<span v-if="pauseDetail(row)" class="budget-paused-detail"
              >· {{ pauseDetail(row) }}</span
            >
          </span>
        </button>
        <button
          v-if="rowPaused(row)"
          type="button"
          class="budget-agent-resume"
          :aria-label="`Resume ${row.cli}`"
          data-testid="budget-resume-agent"
          @click="resumeAgent(row.cli)"
        >
          Resume agent
        </button>
        <button
          v-else
          type="button"
          class="budget-agent-pause"
          :aria-label="`Pause ${row.cli}`"
          data-testid="budget-pause-agent"
          @click="openPauseDialog(row.cli)"
        >
          Pause agent
        </button>
        <button
          type="button"
          class="budget-agent-remove"
          :aria-label="`Remove ${row.cli} from the allowlist`"
          data-testid="budget-remove-agent"
          @click="removeAgent(row.cli)"
        >
          Remove agent
        </button>
        <div v-if="isExpanded(row.cli)" class="budget-models">
          <div
            v-for="m in row.models"
            :key="m"
            class="budget-model"
            :class="{
              'budget-model-paused': modelPaused(row, m),
              'budget-model-added': addedCli === row.cli && addedModel === m,
            }"
          >
            <span>{{ modelLabel(m, row.cli) }}</span>
            <span
              v-if="modelPaused(row, m)"
              class="budget-paused-chip budget-paused-chip-small"
              data-testid="budget-model-paused-chip"
            >
              Paused<span v-if="!rowPaused(row) && pauseDetail(row, m)" class="budget-paused-detail"
                >· {{ pauseDetail(row, m) }}</span
              >
            </span>
            <button
              v-if="modelPaused(row, m) && !rowPaused(row)"
              type="button"
              class="budget-model-action"
              :aria-label="`Resume ${modelLabel(m, row.cli)}`"
              data-testid="budget-resume-model"
              @click="resumeModel(row.cli, m)"
            >
              Resume
            </button>
            <button
              v-else-if="!rowPaused(row)"
              type="button"
              class="budget-model-action"
              :aria-label="`Pause ${modelLabel(m, row.cli)}`"
              data-testid="budget-pause-model"
              @click="openPauseDialog(row.cli, m)"
            >
              Pause
            </button>
            <button
              type="button"
              class="budget-model-remove"
              :aria-label="`Remove ${modelLabel(m, row.cli)} from ${row.cli}`"
              @click="removeModel(row.cli, m)"
            >
              ×
            </button>
          </div>
        </div>
      </li>
    </ul>

    <Teleport to="body">
      <Dialog :open="pauseDialog.open" @update:open="(v) => (pauseDialog.open = v)">
        <DialogOverlay />
        <DialogContent class="cc-modal budget-pause-dialog" data-testid="budget-pause-dialog">
          <div class="cc-modal-head">
            <DialogTitle>{{ dialogTitle }}</DialogTitle>
            <DialogClose class="close-x" aria-label="Close">×</DialogClose>
          </div>
          <DialogDescription class="cc-modal-desc">
            Paused entries stay on the allowlist but are never selected. Leave the date blank to
            pause until you resume it manually.
          </DialogDescription>
          <div class="budget-pause-fields">
            <label class="field">
              <span class="budget-field-label">Resume at (optional)</span>
              <Input
                v-model="pauseDialog.until"
                type="datetime-local"
                data-testid="budget-pause-until"
              />
            </label>
            <label class="field">
              <span class="budget-field-label">Reason (optional)</span>
              <Input
                v-model="pauseDialog.reason"
                type="text"
                placeholder="e.g. Cursor credits exhausted until Friday"
                data-testid="budget-pause-reason"
              />
            </label>
            <p v-if="pauseDialog.error" class="ff-error">{{ pauseDialog.error }}</p>
          </div>
          <div class="cc-modal-actions">
            <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
            <Button
              variant="accent"
              :disabled="config.saving"
              data-testid="budget-pause-confirm"
              @click="confirmPause"
            >
              Pause
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Teleport>

    <Teleport to="body">
      <Dialog :open="addDialog.open" @update:open="(v) => (addDialog.open = v)">
        <DialogOverlay />
        <DialogContent class="cc-modal budget-add-dialog" data-testid="budget-add-dialog">
          <div class="cc-modal-head">
            <DialogTitle>Add to allowlist</DialogTitle>
            <DialogClose class="close-x" aria-label="Close">×</DialogClose>
          </div>
          <DialogDescription class="cc-modal-desc">
            Pick a coding agent and one of its models. The pair joins the allowlist an agent driver
            may choose when it sets an engineer or reviewer override.
          </DialogDescription>
          <form class="budget-add-form" @submit.prevent="confirmAdd">
            <div class="budget-add-picker">
              <span class="budget-field-label">Coding agent + model</span>
              <AgentModelControl
                :cli-options="cliOptions"
                :model-options="addModelOptions"
                :cli="addDraft.cli"
                :model="addDraft.model"
                memory-key="budget-allowlist-add"
                placeholder="Select agent + model…"
                @update:cli="(v) => (addDraft.cli = v)"
                @update:model="(v) => (addDraft.model = v)"
              />
            </div>
            <p v-if="addDialog.error" class="ff-error" data-testid="budget-add-error">
              {{ addDialog.error }}
            </p>
            <div class="cc-modal-actions">
              <DialogClose as-child>
                <Button variant="outline" type="button">Cancel</Button>
              </DialogClose>
              <Button
                variant="accent"
                type="submit"
                :disabled="!addReady"
                data-testid="budget-add-confirm"
              >
                Add
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Teleport>
  </div>
</template>

<style scoped>
.budget-add {
  margin: 10px 2px 4px;
}
.budget-add-form {
  display: flex;
  flex-direction: column;
}
.budget-add-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 24px 0;
}
/* Shared label treatment for the add and pause dialog fields (#0876). */
.budget-field-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--txt-secondary);
}
.budget-add-dialog .ff-error {
  margin: 12px 24px 0;
}
.budget-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.budget-row {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-solid);
}
.budget-row-paused {
  border-color: var(--amber-border-tint);
}
/* Briefly outline the row (and chip) just added through the modal (#0856). */
.budget-row-added {
  border-color: var(--cyan);
  box-shadow: 0 0 0 1px var(--cyan);
}
.budget-model-added {
  border-color: var(--cyan);
  box-shadow: 0 0 0 1px var(--cyan);
}
.budget-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  /* Leave room for the Pause/Resume and Remove agent buttons pinned in the corner. */
  padding-right: 188px;
  background: none;
  border: none;
  color: var(--txt);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.budget-row-head:hover {
  background: var(--panel);
}
.budget-row-head:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: -2px;
  border-radius: 8px;
}
.budget-row-caret {
  display: inline-block;
  color: var(--txt-faint);
  transition: transform 0.12s ease;
}
.budget-row-caret.open {
  transform: rotate(90deg);
}
.budget-agent {
  font-weight: 600;
}
.budget-count {
  color: var(--txt-dim);
  font-size: 12px;
}
.budget-paused-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--amber-border-tint);
  background: var(--amber-tint);
  color: var(--txt);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.budget-paused-chip-small {
  padding: 1px 6px;
  font-size: 10.5px;
}
.budget-paused-detail {
  max-width: 44ch;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 400;
  color: var(--txt-dim);
}
.budget-models {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 2px 12px 10px 34px;
}
.budget-model {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 12px;
  color: var(--txt);
  background: var(--panel);
}
.budget-model-paused {
  border-color: var(--amber-border-tint);
  background: var(--amber-tint);
}
.budget-model-action {
  background: none;
  border: none;
  padding: 0;
  color: var(--cyan);
  cursor: pointer;
  font-size: 11px;
  text-decoration: underline;
}
.budget-model-remove,
.budget-agent-remove,
.budget-agent-pause,
.budget-agent-resume {
  background: none;
  border: none;
  color: var(--txt-faint);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}
.budget-model-remove:hover,
.budget-agent-remove:hover {
  color: var(--red);
}
.budget-agent-pause,
.budget-agent-resume {
  position: absolute;
  top: 7px;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 11.5px;
  text-decoration: underline;
  color: var(--cyan);
}
.budget-agent-pause,
.budget-agent-resume {
  right: 96px;
}
/* Remove agent sits in the row's upper-right corner so the header row reads as
   one clean line (#0768); it stays a real button, keyboard reachable. */
.budget-agent-remove {
  position: absolute;
  top: 7px;
  right: 8px;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 11.5px;
  text-decoration: underline;
}
.budget-model-remove:focus-visible,
.budget-agent-remove:focus-visible,
.budget-agent-pause:focus-visible,
.budget-agent-resume:focus-visible,
.budget-model-action:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 1px;
  border-radius: 4px;
}
/* Match the add-allowlist dialog's content box: 24px gutter so fields line up
   with the title/description above and never sit flush against the modal edge,
   16px below the description, and an even gap between field blocks (#0876). */
.budget-pause-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 24px 0;
}
/* `.field` carries a global 13px bottom margin; inside a flex column that would
   stack on top of `gap` and make the two field blocks uneven. */
.budget-pause-fields .field {
  margin-bottom: 0;
}
.budget-pause-fields .budget-field-label {
  margin-bottom: 8px;
}
/* The flex gap spaces the error like the fields; the parent gutter keeps it
   off the modal edges, so it needs no margin of its own. */
.budget-pause-fields .ff-error {
  margin: 0;
}
</style>
