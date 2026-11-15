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
import { api } from "../api";
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

// ── Allowlist group state (#1132) ───────────────────────────────────────────
//
// The group lives outside this repo. The server is the only thing that reads
// and merges it (group base + this project's overrides), so the panel asks for
// the merged view instead of recomputing it in the browser.

interface GroupMemberView {
  host: string;
  projectName?: string;
  root?: string;
  local: boolean;
  reachable: boolean;
}

interface GroupApplyView {
  host: string;
  projectName?: string;
  local: boolean;
  status: "applied" | "unreachable" | "refused";
  reason?: string;
  notLoggedIn?: string[];
}

interface GroupStateView {
  enabled: boolean;
  name: string | null;
  group: {
    name: string;
    version: number;
    updatedAt: string;
    allowlist: AgentModelAllowRow[];
  } | null;
  projectRows: AgentModelAllowRow[];
  effective: AgentModelAllowRow[];
  sources: Record<string, "group" | "project">;
  drift: Array<{ cli: string; detail: string }>;
  members: GroupMemberView[];
}

const group = ref<GroupStateView | null>(null);
const groupBusy = ref(false);
const groupError = ref("");
const lastResults = ref<GroupApplyView[]>([]);
/** False keeps a pause local without touching tailnet members. */
const propagateToMembers = ref(true);

/**
 * Refresh the group view. Tailnet discovery can take a few seconds, so it is
 * requested only when the pause dialog opens (the change is about to go out);
 * the normal view reads local state plus this machine's registry.
 */
async function refreshGroup(includeMembers = false): Promise<void> {
  try {
    group.value = await api<GroupStateView>(
      `/api/budget/allowlist-group?members=${includeMembers ? "1" : "0"}`,
    );
    groupError.value = "";
  } catch (error) {
    groupError.value = error instanceof Error ? error.message : String(error);
  }
}

/** Group name from the loaded config; empty for a project-only setup. */
const configuredGroupName = computed(() => {
  const value = config.data?.["budget.allowlistGroup"];
  return typeof value === "string" ? value.trim() : "";
});
const inGroup = computed(() => Boolean(configuredGroupName.value));
const groupName = computed(() => group.value?.name ?? configuredGroupName.value);
const remoteMembers = computed(() => (group.value?.members ?? []).filter((m) => !m.local));
const memberSummary = computed(() => {
  const members = group.value?.members ?? [];
  const projects = members.length;
  const hosts = new Set(members.map((m) => (m.local ? "this machine" : m.host))).size;
  return { projects, hosts };
});

function sourceFor(cli: string): "group" | "project" {
  return group.value?.sources?.[cli] ?? "project";
}

function groupPausedRow(row: AgentModelAllowRow): boolean {
  return Boolean(group.value?.group?.allowlist.find((r) => r.cli === row.cli)?.paused);
}

/** Rows as the server exposes them: merged group view when grouped. */
const rows = computed<AgentModelAllowRow[]>(() =>
  inGroup.value && group.value
    ? group.value.effective
    : agentModelAllowRows(config.data?.["budget.allowlist"]),
);

onMounted(() => {
  // A project-only setup has no group file to read; skip the request (and the
  // tailnet discovery behind it) until the project actually joins a group.
  if (configuredGroupName.value) void refreshGroup();
});

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
  if (inGroup.value && !group.value) {
    // Never materialize a merged group list into the project's committed rows:
    // if the group view is unavailable, ask for a reload instead of forking it.
    groupError.value =
      "Could not read the allowlist group — reload the page before editing, so group rows stay out of repoos.toml.";
    return false;
  }
  try {
    await config.setConfigValues({ "budget.allowlist": next });
    if (inGroup.value) await refreshGroup();
    return true;
  } catch {
    /* config.error already carries the server message; the form rolls back. */
    return false;
  }
}

/**
 * True when the group owns this CLI (so a pause belongs to the group). When the
 * group view has not loaded yet, still route to the group endpoint: it re-reads
 * the group locally and refuses loudly for a local-only CLI, which is safer
 * than writing the merged list into the project's committed rows.
 */
function isGroupEntry(cli: string): boolean {
  if (!inGroup.value) return false;
  if (!group.value) return true;
  return Boolean(group.value.group?.allowlist.some((row) => row.cli === cli));
}

/**
 * Pause/resume the group and propagate. The server answers one result per
 * member (applied / unreachable / refused) plus any allowed CLI the host is not
 * logged in to — credentials are never synced.
 */
async function runGroupMutation(
  action: "pause" | "resume",
  cli: string,
  model?: string,
  until?: string,
  reason?: string,
): Promise<boolean> {
  groupBusy.value = true;
  groupError.value = "";
  try {
    const res = await api<{ results?: GroupApplyView[] }>("/api/budget/allowlist-group/pause", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        cli,
        ...(model ? { model } : {}),
        ...(action === "pause" && until ? { until } : {}),
        ...(reason ? { reason } : {}),
        propagate: propagateToMembers.value,
      }),
    });
    lastResults.value = res.results ?? [];
    await refreshGroup();
    await config.load();
    const failed = lastResults.value.filter((result) => result.status !== "applied").length;
    const target = model ? `${cli} + ${modelLabel(model, cli)}` : cli;
    repo.pushToast(
      failed
        ? `${action === "pause" ? "Paused" : "Resumed"} ${target}; ${failed} member(s) need attention`
        : `${action === "pause" ? "Paused" : "Resumed"} ${target} for every group member`,
      failed ? "info" : "success",
    );
    return true;
  } catch (error) {
    groupError.value = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    groupBusy.value = false;
  }
}

// ── Join / leave a group ────────────────────────────────────────────────────

const groupDialog = reactive({ open: false, name: "", error: "" });

function openGroupDialog(): void {
  groupDialog.name = groupName.value;
  groupDialog.error = "";
  groupDialog.open = true;
}

async function saveGroupName(): Promise<void> {
  groupDialog.error = "";
  try {
    await config.setConfigValues({ "budget.allowlistGroup": groupDialog.name.trim() });
    await config.load();
    if (groupDialog.name.trim()) await refreshGroup();
    else group.value = null;
    groupDialog.open = false;
    repo.pushToast(
      groupDialog.name.trim()
        ? `Joined allowlist group "${groupDialog.name.trim()}"`
        : "Left the allowlist group — this project is project-only again",
      "success",
    );
  } catch (error) {
    groupDialog.error = error instanceof Error ? error.message : String(error);
  }
}

async function resyncFromGroup(): Promise<void> {
  groupBusy.value = true;
  groupError.value = "";
  try {
    await api("/api/budget/allowlist-group/resync", { method: "POST" });
    await config.load();
    await refreshGroup();
    repo.pushToast("Re-synced this project to its allowlist group", "success");
  } catch (error) {
    groupError.value = error instanceof Error ? error.message : String(error);
  } finally {
    groupBusy.value = false;
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

async function mutateGroupEntry(
  action: "add" | "remove",
  cli: string,
  model?: string,
): Promise<boolean> {
  groupBusy.value = true;
  groupError.value = "";
  try {
    await api("/api/budget/allowlist-group/pause", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, cli, ...(model ? { model } : {}) }),
    });
    await config.load();
    await refreshGroup();
    return true;
  } catch (error) {
    groupError.value = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    groupBusy.value = false;
  }
}

async function confirmAdd(): Promise<void> {
  const cli = addDraft.cli;
  const model = addDraft.model;
  if (!cli || !model) return;
  if (isPairAllowed(cli, model)) {
    addDialog.error = `${cli} + ${modelLabel(model, cli)} is already on the allowlist.`;
    return;
  }
  // A grouped project shares one allowlist: adding belongs to the group, so
  // every member gets it instead of this checkout silently forking.
  if (inGroup.value) {
    const ok = await mutateGroupEntry("add", cli, model);
    if (!ok) {
      addDialog.error = groupError.value || "Could not add that pair. Try again.";
      return;
    }
    addDialog.open = false;
    flashAdded(cli, model);
    repo.pushToast(`Added ${cli} + ${modelLabel(model, cli)} to the allowlist group`, "success");
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
  if (isGroupEntry(cli)) {
    await mutateGroupEntry("remove", cli, model);
    return;
  }
  const next = rows.value
    .map((r) => (r.cli === cli ? { ...r, models: r.models.filter((m) => m !== model) } : r))
    // A row needs at least one model — dropping the last model drops the agent.
    .filter((r) => r.models.length > 0);
  await save(next);
}

async function removeAgent(cli: string): Promise<void> {
  if (isGroupEntry(cli)) {
    await mutateGroupEntry("remove", cli);
    return;
  }
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
  // The confirmation lists the projects and hosts that will be updated, which
  // needs the tailnet member list — fetched now, not on every page load.
  if (inGroup.value) void refreshGroup(true);
}

async function confirmPause(): Promise<void> {
  if (isGroupEntry(pauseDialog.cli)) {
    pauseDialog.error = "";
    const ok = await runGroupMutation(
      "pause",
      pauseDialog.cli,
      pauseDialog.model || undefined,
      pauseDialog.until || undefined,
      pauseDialog.reason || undefined,
    );
    if (ok) pauseDialog.open = false;
    else pauseDialog.error = groupError.value;
    return;
  }
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
  if (isGroupEntry(cli)) {
    await runGroupMutation("resume", cli);
    return;
  }
  const result = resumeAllowlistEntry(rows.value, { cli });
  if ("error" in result) return;
  await save(result.rows);
}

async function resumeModel(cli: string, model: string): Promise<void> {
  if (isGroupEntry(cli)) {
    await runGroupMutation("resume", cli, model);
    return;
  }
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

    <div class="budget-group" data-testid="budget-group">
      <template v-if="inGroup">
        <div class="budget-group-head">
          <span class="budget-group-label">Group</span>
          <span class="budget-group-name" data-testid="budget-group-name">{{ groupName }}</span>
          <span v-if="group?.group" class="budget-group-meta" data-testid="budget-group-updated">
            updated {{ new Date(group.group.updatedAt).toLocaleString() }}
          </span>
          <span v-else class="budget-group-meta">created on the first pause</span>
          <button
            type="button"
            class="budget-group-action"
            data-testid="budget-group-change"
            @click="openGroupDialog"
          >
            Change
          </button>
        </div>
        <p class="budget-group-desc">
          This project shares its allowlist and pause state with
          {{ memberSummary.projects }} member project{{
            memberSummary.projects === 1 ? "" : "s"
          }}
          across {{ memberSummary.hosts }} host{{ memberSummary.hosts === 1 ? "" : "s" }}. Each
          machine keeps its own logins — only CLIs, models and pauses are shared.
        </p>
      </template>
      <template v-else>
        <p class="budget-group-desc">
          Working alone? Join a machine-local allowlist group to share one allowlist and pause state
          with your other projects — on this machine and across the tailnet. Project-only behaviour
          is unchanged.
        </p>
        <Button
          variant="outline"
          size="sm"
          data-testid="budget-join-group"
          @click="openGroupDialog"
        >
          Join an allowlist group…
        </Button>
      </template>
    </div>

    <p v-if="groupError" class="ff-error budget-group-error" data-testid="budget-group-error">
      {{ groupError }}
    </p>

    <div v-if="group?.drift?.length" class="budget-drift" data-testid="budget-drift">
      <div class="budget-drift-head">
        <strong>Drift from group “{{ groupName }}”</strong>
        <span class="budget-group-meta">this project's own rows differ</span>
      </div>
      <ul class="budget-drift-list">
        <li v-for="entry in group.drift" :key="entry.cli">{{ entry.detail }}</li>
      </ul>
      <Button variant="outline" size="sm" :disabled="groupBusy" @click="resyncFromGroup">
        Re-sync from group
      </Button>
    </div>

    <div v-if="lastResults.length" class="budget-results" data-testid="budget-results">
      <div class="budget-results-head">Last group change</div>
      <ul class="budget-results-list">
        <li v-for="result in lastResults" :key="`${result.host}-${result.projectName}`">
          <span class="budget-result-where">
            {{
              result.local
                ? `${result.projectName ?? "this project"} (this machine)`
                : `${result.projectName ?? "RepoOS"} on ${result.host}`
            }}
          </span>
          <span class="budget-result-status" :class="`is-${result.status}`">
            {{ result.status }}
          </span>
          <span v-if="result.reason" class="budget-result-reason">{{ result.reason }}</span>
          <span v-if="result.notLoggedIn?.length" class="budget-result-reason">
            not logged in on that host: {{ result.notLoggedIn.join(", ") }} — logins are never
            synced
          </span>
        </li>
      </ul>
    </div>

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
          <span
            v-if="inGroup"
            class="budget-source"
            :class="`budget-source-${sourceFor(row.cli)}`"
            :data-testid="`budget-source-${row.cli}`"
            >{{ sourceFor(row.cli) }}</span
          >
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
            <div v-if="inGroup && isGroupEntry(pauseDialog.cli)" class="budget-pause-scope">
              <p class="budget-pause-scope-text">
                This pause belongs to group <strong>{{ groupName }}</strong> and will be applied to
                every member:
              </p>
              <ul class="budget-members" data-testid="budget-pause-members">
                <li
                  v-for="member in group?.members ?? []"
                  :key="`${member.host}-${member.root ?? ''}`"
                >
                  {{
                    member.local
                      ? `${member.projectName ?? "this project"} (this machine)`
                      : `${member.projectName ?? "RepoOS"} on ${member.host}`
                  }}
                </li>
                <li v-if="!remoteMembers.length" class="budget-member-note">
                  No other machines are discoverable right now — the group file is still updated
                  here and they pick it up when next reachable.
                </li>
              </ul>
              <label class="budget-check">
                <input
                  v-model="propagateToMembers"
                  type="checkbox"
                  data-testid="budget-propagate"
                />
                <span>Send to the other machines now</span>
              </label>
            </div>
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
      <Dialog :open="groupDialog.open" @update:open="(v) => (groupDialog.open = v)">
        <DialogOverlay />
        <DialogContent class="cc-modal budget-group-dialog" data-testid="budget-group-dialog">
          <div class="cc-modal-head">
            <DialogTitle>{{
              inGroup ? "Change allowlist group" : "Join an allowlist group"
            }}</DialogTitle>
            <DialogClose class="close-x" aria-label="Close">×</DialogClose>
          </div>
          <DialogDescription class="cc-modal-desc">
            A group's allowlist and pause state live in
            <code>~/.config/repoos/allowlist-groups/&lt;name&gt;.toml</code> on each machine — never
            in this repo. Projects that declare the same group name share it. Leave the name empty
            to go back to this project's own allowlist.
          </DialogDescription>
          <form class="budget-add-form" @submit.prevent="saveGroupName">
            <div class="budget-add-picker">
              <label class="field">
                <span class="budget-field-label">Group name</span>
                <Input
                  v-model="groupDialog.name"
                  type="text"
                  placeholder="e.g. personal or acme"
                  data-testid="budget-group-name-input"
                />
              </label>
            </div>
            <p v-if="groupDialog.error" class="ff-error">{{ groupDialog.error }}</p>
            <div class="cc-modal-actions">
              <DialogClose as-child>
                <Button variant="outline" type="button">Cancel</Button>
              </DialogClose>
              <Button
                variant="accent"
                type="submit"
                :disabled="config.saving"
                data-testid="budget-group-save"
              >
                {{ inGroup ? "Save" : "Join group" }}
              </Button>
            </div>
          </form>
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
/* ── Allowlist group card (#1132) ───────────────────────────────────────── */
.budget-group {
  margin: 12px 2px 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
}
.budget-group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.budget-group-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--txt-faint);
}
.budget-group-name {
  font-weight: 700;
  color: var(--txt);
}
.budget-group-meta {
  font-size: 11.5px;
  color: var(--txt-dim);
}
.budget-group-action {
  margin-left: auto;
  background: none;
  border: none;
  padding: 2px 4px;
  font-size: 12px;
  color: var(--cyan);
  text-decoration: underline;
  cursor: pointer;
}
.budget-group-action:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 1px;
  border-radius: 4px;
}
.budget-group-desc {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--txt-dim);
  line-height: 1.5;
}
.budget-group-error {
  margin: 6px 2px;
}
.budget-source {
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--txt-dim);
}
.budget-source-group {
  border-color: var(--cyan);
  color: var(--cyan);
}
.budget-source-project {
  border-color: var(--amber-border-tint);
  background: var(--amber-tint);
  color: var(--txt);
}
.budget-drift {
  margin: 8px 2px;
  padding: 10px 12px;
  border: 1px solid var(--amber-border-tint);
  border-radius: 8px;
  background: var(--amber-tint);
}
.budget-drift-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.budget-drift-list {
  margin: 6px 0 8px;
  padding-left: 18px;
  font-size: 12.5px;
  color: var(--txt);
}
.budget-results {
  margin: 8px 2px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-solid);
}
.budget-results-head {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--txt-faint);
}
.budget-results-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
}
.budget-result-where {
  font-weight: 600;
  margin-right: 8px;
}
.budget-result-status {
  text-transform: uppercase;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
}
.budget-result-status.is-applied {
  color: var(--green);
}
.budget-result-status.is-unreachable {
  color: var(--amber);
}
.budget-result-status.is-refused {
  color: var(--red);
}
.budget-result-reason {
  display: block;
  color: var(--txt-dim);
  font-size: 11.5px;
}
.budget-pause-scope {
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.budget-pause-scope-text {
  margin: 0 0 6px;
  font-size: 12.5px;
  color: var(--txt-dim);
}
.budget-members {
  margin: 0 0 8px;
  padding-left: 18px;
  font-size: 12.5px;
}
.budget-member-note {
  color: var(--txt-dim);
  font-size: 12px;
}
.budget-check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--txt);
}
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
