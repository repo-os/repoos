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
 * and shows its model count while collapsed. Adding and editing uses the shared
 * coding agent + model selector (`AgentModelControl`) rather than a second
 * picker.
 */
import { computed, reactive, ref, watch } from "vue";
import { useConfigStore, labelForModel } from "../stores/config";
import { agentModelAllowRows } from "../../../core/budget-allowlist.js";
import type { AgentModelAllowRow } from "../../../core/types.js";
import AgentModelControl from "./AgentModelControl.vue";

const config = useConfigStore();

/** Rows as the server exposes them under the schema key. */
const rows = computed<AgentModelAllowRow[]>(() =>
  agentModelAllowRows(config.data?.["budget.allowlist"]),
);

const cliOptions = computed(() => config.agentsMeta.clis ?? []);

const draftCli = ref("");
const draftModel = ref("");

// Seed a sensible initial draft once the CLI vocabulary is known.
watch(
  cliOptions,
  (clis) => {
    if (!draftCli.value && clis.length) {
      draftCli.value = clis[0]!;
      draftModel.value = config.agentsMeta.models[1] ?? config.agentsMeta.models[0] ?? "default";
    }
  },
  { immediate: true },
);

const draftModelOptions = computed(() => config.modelsFor(draftCli.value, draftModel.value));

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

async function save(next: AgentModelAllowRow[]): Promise<void> {
  try {
    await config.setConfigValues({ "budget.allowlist": next });
  } catch {
    /* config.error already carries the server message; the form rolls back. */
  }
}

async function addPair(): Promise<void> {
  const cli = draftCli.value;
  const model = draftModel.value;
  if (!cli || !model) return;
  const existing = rows.value.find((r) => r.cli === cli);
  const next = existing
    ? rows.value.map((r) =>
        r.cli === cli ? { ...r, models: [...new Set([...r.models, model])] } : r,
      )
    : [...rows.value, { cli, models: [model] }];
  expanded[cli] = true;
  await save(next);
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
      as they do today.
    </p>

    <div class="budget-add">
      <span class="budget-add-label">Add an allowed agent + model:</span>
      <AgentModelControl
        :cli-options="cliOptions"
        :model-options="draftModelOptions"
        :cli="draftCli"
        :model="draftModel"
        memory-key="budget-allowlist"
        @update:cli="(v) => (draftCli = v)"
        @update:model="(v) => (draftModel = v)"
      />
      <button
        type="button"
        class="btn budget-add-btn"
        :disabled="!draftCli || !draftModel || config.saving"
        data-testid="budget-add-pair"
        @click="addPair"
      >
        Add to allowlist
      </button>
    </div>

    <div v-if="!rows.length" class="agent-empty" data-testid="budget-empty">
      No agents on the allowlist yet — agent drivers are unrestricted. Add one above to steer them
      to specific agent + model pairs.
    </div>

    <ul v-else class="budget-list" data-testid="budget-list">
      <li v-for="row in rows" :key="row.cli" class="budget-row">
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
        </button>
        <div v-if="isExpanded(row.cli)" class="budget-models">
          <span v-for="m in row.models" :key="m" class="budget-model">
            {{ modelLabel(m, row.cli) }}
            <button
              type="button"
              class="budget-model-remove"
              :aria-label="`Remove ${modelLabel(m, row.cli)} from ${row.cli}`"
              @click="removeModel(row.cli, m)"
            >
              ×
            </button>
          </span>
          <button
            type="button"
            class="budget-agent-remove"
            :aria-label="`Remove ${row.cli} from the allowlist`"
            @click="removeAgent(row.cli)"
          >
            Remove agent
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.budget-add {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 10px 2px 4px;
}
.budget-add-label {
  font-size: 12.5px;
  color: var(--txt-dim);
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
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-solid);
}
.budget-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
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
  gap: 4px;
  padding: 3px 6px 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 12px;
  color: var(--txt);
  background: var(--panel);
}
.budget-model-remove,
.budget-agent-remove {
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
.budget-agent-remove {
  font-size: 11.5px;
  text-decoration: underline;
}
.budget-model-remove:focus-visible,
.budget-agent-remove:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 1px;
  border-radius: 4px;
}
</style>
