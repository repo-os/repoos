<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { labelForModel, useConfigStore } from "../stores/config";
import { useDocsStore } from "../stores/docs";
import { api, JSON_OPTS } from "../api";
import type { Agent, DetectedAgent, ModelSourcesResponse, ModelTestResponse, ModelTestResult } from "../types";
import Button from "../components/ui/button.vue";
import Card from "../components/ui/card.vue";
import Input from "../components/ui/input.vue";
import Switch from "../components/ui/switch.vue";
import Select from "../components/ui/select/root.vue";
import SelectContent from "../components/ui/select/content.vue";
import SelectItem from "../components/ui/select/item.vue";
import SelectTrigger from "../components/ui/select/trigger.vue";
import SelectValue from "../components/ui/select/value.vue";
import SelectViewport from "../components/ui/select/viewport.vue";
import SelectSearchGroup from "../components/SelectSearchGroup.vue";
import BuiltInAgentCard from "../components/BuiltInAgentCard.vue";

const config = useConfigStore();
const router = useRouter();
const docs = useDocsStore();

const RECOMMENDATIONS_DOC = "docs/agent-model-recommendations.md";

function openRecommendations(): void {
  void docs.loadDoc(RECOMMENDATIONS_DOC);
  void router.push({ name: "repo" });
}

const localAgents = ref<Agent[]>([]);
const newName = ref("");
let syncing = false;
let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
let saveInFlight = false;
let savePending = false;

function sync(): void {
  syncing = true;
  localAgents.value = config.agents.map((a) => ({ ...a }));
  syncing = false;
}

watch(
  () => config.loaded,
  (loaded) => {
    if (loaded) sync();
  },
  { immediate: true },
);

const defaultNames = computed(() => config.agentsMeta.defaults.map((a) => a.name));
const defaultAgents = computed(() =>
  localAgents.value.filter((a) => defaultNames.value.includes(a.name)),
);
const customAgents = computed(() =>
  localAgents.value.filter((a) => !defaultNames.value.includes(a.name)),
);

const CLI_LABELS: Record<string, string> = {
  "claude code": "Claude Code",
  "github copilot": "GitHub Copilot CLI",
  "qwen code": "qwen code",
  codex: "codex",
};

const clis = computed(() =>
  config.agentsMeta.clis.map((c) => ({ value: c, label: CLI_LABELS[c] ?? c })),
);

// ---- Live model list (opencode) ----
// Fetched on mount from /api/models; the dropdown shows the static fallback
// (config.agentsMeta.models) plus whatever the live probe returned. A Refresh
// button re-probes with --refresh. When the endpoint is unavailable the page
// degrades to the static list exactly as before.

const modelTests = ref<Record<string, ModelTestResult>>({});
const testing = ref<Record<string, boolean>>({});
// Model list + label logic live in the config store so this page and the
// per-task pickers in TaskDrawer offer identical options (0064).
const modelsFor = config.modelsFor;
const modelsLoading = computed(() => config.modelsLoading);

function testKey(a: Agent): string {
  return `${a.name}\u0000${a.cli}\u0000${a.model}`;
}

function resultFor(a: Agent): ModelTestResult | undefined {
  return modelTests.value[testKey(a)];
}

async function testAgent(a: Agent): Promise<void> {
  const key = testKey(a);
  if (testing.value[key]) return;
  testing.value = { ...testing.value, [key]: true };
  const cli = a.cli;
  const model = a.model;
  try {
    const response = await api<ModelTestResponse>(
      "/api/models/test",
      JSON_OPTS("POST", { cli, model }),
    );
    modelTests.value = { ...modelTests.value, [key]: response.result };
  } catch (err) {
    modelTests.value = {
      ...modelTests.value,
      [key]: {
        cli,
        model,
        status: "failed",
        durationMs: 0,
        error: err instanceof Error ? err.message : "Model compatibility test failed.",
      },
    };
  } finally {
    const next = { ...testing.value };
    delete next[key];
    testing.value = next;
  }
}

const loadModels = (refresh = false): Promise<void> => config.loadModels(refresh);

function addCustom(): void {
  const name = newName.value.trim();
  if (!name) return;
  if (localAgents.value.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
    config.error = `An agent named "${name}" already exists.`;
    return;
  }
  localAgents.value.push({
    name,
    cli: config.agentsMeta.clis[0] ?? "opencode",
    model: config.agentsMeta.models[1] ?? "big pickle",
    enabled: true,
    instructions: "",
  });
  newName.value = "";
  config.error = "";
}

function removeCustom(a: Agent): void {
  localAgents.value = localAgents.value.filter((x) => x !== a);
}

function setInstr(a: Agent, e: Event): void {
  a.instructions = (e.target as HTMLTextAreaElement).value;
}

function validatedAgents(): Agent[] | undefined {
  const seen = new Set<string>();
  for (const a of localAgents.value) {
    const key = a.name.trim().toLowerCase();
    if (!key) {
      config.error = "Every agent needs a name.";
      return undefined;
    }
    if (seen.has(key)) {
      config.error = `Duplicate agent name "${a.name}".`;
      return undefined;
    }
    seen.add(key);
  }
  return localAgents.value.map((a) => ({ ...a, name: a.name.trim() }));
}

async function autoSave(): Promise<void> {
  if (saveInFlight) {
    savePending = true;
    return;
  }
  const agents = validatedAgents();
  if (!agents) return;
  saveInFlight = true;
  savePending = false;
  try {
    await config.saveAgents(agents);
  } catch {
    // The store exposes the error inline; keep edits in place for the next retry.
  } finally {
    saveInFlight = false;
    if (savePending) scheduleAutoSave(0);
  }
}

function scheduleAutoSave(delay = 450): void {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => void autoSave(), delay);
}

watch(
  localAgents,
  () => {
    if (syncing || !config.loaded) return;
    config.msg = "";
    config.error = "";
    if (saveInFlight) savePending = true;
    scheduleAutoSave();
  },
  { deep: true, flush: "sync" },
);

// ---- Detected coding agents ----

const detected = ref<DetectedAgent[]>([]);
const detectLoading = ref(false);
const detectError = ref(false);
const detectHintCopied = ref<string>("");

type DetectStatus = "ok" | "desktop" | "missing";

interface DetectRow {
  agent: DetectedAgent;
  status: DetectStatus;
  statusLabel: string;
  color: string;
}

const detectRows = computed<DetectRow[]>(() =>
  detected.value.map((agent) => {
    if (!agent.installed) {
      return {
        agent,
        status: "missing",
        statusLabel: "not installed",
        color: "var(--red)",
      };
    }
    if (agent.headless === false) {
      return {
        agent,
        status: "desktop",
        statusLabel: "desktop only",
        color: "var(--amber)",
      };
    }
    return { agent, status: "ok", statusLabel: "ready", color: "var(--green)" };
  }),
);

async function checkAgents(): Promise<void> {
  detectLoading.value = true;
  detectError.value = false;
  detectHintCopied.value = "";
  try {
    const data = await api<{ agents: DetectedAgent[] }>("/api/agents/detect");
    detected.value = data.agents;
  } catch {
    detectError.value = true;
    detected.value = [];
  } finally {
    detectLoading.value = false;
  }
}

function copyHint(hint: string): void {
  void navigator.clipboard?.writeText(hint).catch(() => undefined);
  detectHintCopied.value = hint;
  setTimeout(() => {
    if (detectHintCopied.value === hint) detectHintCopied.value = "";
  }, 1500);
}

onMounted(() => {
  void checkAgents();
  void loadModels();
});

onUnmounted(() => {
  clearTimeout(autoSaveTimer);
});
</script>

<template>
  <div>
    <div class="page-title">Agents</div>
    <div class="page-desc">
      The AI agents that work this repo · opencode + big pickle by default
      <span v-if="config.saving"> · Saving…</span>
      <span v-else-if="config.error" class="save-msg err"> · {{ config.error }}</span>
      <span v-else-if="config.msg" class="save-msg ok"> · Saved</span>
    </div>

    <div v-if="!config.loaded" class="spin"></div>

    <template v-else>
      <Card style="padding: 0 18px 12px; margin-bottom: 16px">
        <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
          <span class="live-dot" style="background: var(--green)"></span>Choosing an agent
        </div>
        <div class="agent-desc rec-desc">
          <p>
            <strong>opencode</strong> is the most mature driver (structured output, model discovery, session resume).
            Nearly all completed RepoOS tasks used it with <strong>big pickle</strong>, though evidence is provisional
            — no other CLI has been tested on a real task.
          </p>
          <p>
            Use live model discovery ("Refresh models") to find what's available on your machine.
            Compatibility testing (the "Test" button) proves a CLI/model responds, not that it performs well on real tasks.
          </p>
          <p>
            <button class="rec-link" @click="openRecommendations">
              View the full agent &amp; model selection guide →
            </button>
            <span class="rec-freshness">Last verified 2026-08-12 · refreshed manually until #0093</span>
          </p>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
          <span class="live-dot"></span>Default agents
          <a
            class="model-pricing-link"
            href="/repo?doc=docs/opencode-models.md"
            target="_blank"
            rel="noopener noreferrer"
            title="Open model pricing & use cases in the Repo Context docs"
          >Model pricing &amp; use cases</a>
          <Button
            variant="outline"
            size="sm"
            style="margin-left: auto"
            :disabled="modelsLoading"
            title="Re-probe opencode's live model list (opencode models --refresh)"
            @click="loadModels(true)"
          >
            {{ modelsLoading ? "Refreshing…" : "Refresh models" }}
          </Button>
        </div>
        <div class="agent-desc">
          Built-in roles. Toggle them on or off and pick their coding agent and model.
        </div>
        <div v-for="a in defaultAgents" :key="a.name" class="agent-card" :class="{ off: !a.enabled }">
          <div class="agent-head">
            <div class="agent-title">
              <span class="agent-dot"></span>
              <span class="agent-name">{{ a.name }}</span>
              <span class="agent-badge">default</span>
            </div>
            <Switch :checked="a.enabled" @update:checked="(v) => (a.enabled = v)" />
          </div>
          <div class="agent-body">
            <div class="agent-field">
              <label>Coding agent</label>
              <Select :model-value="a.cli" @update:model-value="(v) => (a.cli = v ?? a.cli)">
                <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                    <SelectItem v-for="c in clis" :key="c.value" :value="c.value">{{ c.label }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div class="agent-field">
              <label>Model</label>
              <Select :model-value="a.model" @update:model-value="(v) => (a.model = v ?? a.model)">
                <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectSearchGroup :options="modelsFor(a.cli, a.model)" #default="{ options }">
                    <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                      <SelectItem v-for="m in options" :key="m.value" :value="m.value" :disabled="m.disabled">
                        {{ m.label }}{{ m.disabled ? " — failed test" : "" }}
                      </SelectItem>
                    </SelectViewport>
                  </SelectSearchGroup>
                </SelectContent>
              </Select>
            </div>
            <div class="agent-field agent-test-result">
              <label>Compatibility</label>
              <div class="agent-test-actions">
                <Button variant="outline" size="sm" :disabled="!!testing[testKey(a)]" @click="testAgent(a)">
                  <span v-if="testing[testKey(a)]" class="model-test-spinner"></span>
                  {{ testing[testKey(a)] ? "Testing…" : resultFor(a) ? "Test again" : "Test" }}
                </Button>
                <span v-if="resultFor(a)" :class="'model-test model-test-' + resultFor(a)!.status" :title="resultFor(a)!.error">
                  {{ resultFor(a)!.status.replace('_', ' ') }}
                </span>
              </div>
            </div>
            <div class="agent-field agent-instr-field">
              <label>Instructions</label>
              <textarea
                :value="a.instructions ?? ''"
                class="agent-instr"
                rows="2"
                placeholder="Optional — how this agent should behave"
                @input="setInstr(a, $event)"
              ></textarea>
            </div>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
          <span class="live-dot" style="background: var(--violet, var(--cyan))"></span>Custom agents
        </div>
        <div class="agent-desc">
          Your own roles — data analyst, refactor agent, anything you need.
        </div>

        <div class="agent-add">
          <Input
            v-model="newName"
            placeholder="e.g. data analyst"
            class="w-[220px]"
            @keyup.enter="addCustom"
          />
          <Button variant="outline" size="sm" :disabled="!newName.trim()" @click="addCustom">
            Add agent
          </Button>
        </div>

        <div v-if="!customAgents.length" class="agent-empty">
          No custom agents yet — add one above.
        </div>

        <div v-for="a in customAgents" :key="a.name" class="agent-card" :class="{ off: !a.enabled }">
          <div class="agent-head">
            <div class="agent-title">
              <span class="agent-dot"></span>
              <Input :model-value="a.name" class="w-[180px] h-[30px]" @update:model-value="(v) => (a.name = String(v ?? ''))" />
            </div>
            <div style="display: flex; align-items: center; gap: 10px">
              <Button variant="ghost" size="sm" class="agent-remove" @click="removeCustom(a)">
                Remove
              </Button>
              <Switch :checked="a.enabled" @update:checked="(v) => (a.enabled = v)" />
            </div>
          </div>
          <div class="agent-body">
            <div class="agent-field">
              <label>Coding agent</label>
              <Select :model-value="a.cli" @update:model-value="(v) => (a.cli = v ?? a.cli)">
                <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                    <SelectItem v-for="c in clis" :key="c.value" :value="c.value">{{ c.label }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div class="agent-field">
              <label>Model</label>
              <Select :model-value="a.model" @update:model-value="(v) => (a.model = v ?? a.model)">
                <SelectTrigger class="h-[34px] w-full rounded-[9px] px-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectSearchGroup :options="modelsFor(a.cli, a.model)" #default="{ options }">
                    <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                      <SelectItem v-for="m in options" :key="m.value" :value="m.value" :disabled="m.disabled">
                        {{ m.label }}{{ m.disabled ? " — failed test" : "" }}
                      </SelectItem>
                    </SelectViewport>
                  </SelectSearchGroup>
                </SelectContent>
              </Select>
            </div>
            <div class="agent-field agent-test-result">
              <label>Compatibility</label>
              <div class="agent-test-actions">
                <Button variant="outline" size="sm" :disabled="!!testing[testKey(a)]" @click="testAgent(a)">
                  <span v-if="testing[testKey(a)]" class="model-test-spinner"></span>
                  {{ testing[testKey(a)] ? "Testing…" : resultFor(a) ? "Test again" : "Test" }}
                </Button>
                <span v-if="resultFor(a)" :class="'model-test model-test-' + resultFor(a)!.status" :title="resultFor(a)!.error">
                  {{ resultFor(a)!.status.replace('_', ' ') }}
                </span>
              </div>
            </div>
            <div class="agent-field agent-instr-field">
              <label>Instructions</label>
              <textarea
                :value="a.instructions ?? ''"
                class="agent-instr"
                rows="2"
                placeholder="Optional — how this agent should behave"
                @input="setInstr(a, $event)"
              ></textarea>
            </div>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
          <span class="live-dot" style="background: var(--green)"></span>Build your team
        </div>
        <div class="agent-desc">
          Pre-built optional agents that extend RepoOS. Enable them to add new capabilities.
        </div>

        <BuiltInAgentCard agent="tech-debt" />
      </Card>

      <Card v-if="!detectError" style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
          <span class="live-dot" style="background: var(--violet, var(--cyan))"></span>
          Detected coding agents
        </div>
        <div class="agent-desc">
          What's on this machine's PATH — installed &amp; headless-ready, desktop-only, or missing. Click a hint to copy it.
        </div>

        <div v-if="detectLoading && !detected.length" class="detect-loading">
          Probing PATH…
        </div>
        <div v-else-if="!detected.length" class="agent-empty">
          No known coding agents detected on PATH.
        </div>

        <template v-else>
          <div v-for="r in detectRows" :key="r.agent.id" class="detect-row">
            <div class="detect-row-left">
              <span class="detect-badge" :style="{ background: r.color, boxShadow: '0 0 8px ' + r.color }"></span>
              <span class="agent-name">{{ r.agent.name }}</span>
              <span class="detect-pill" :style="{ color: r.color }">{{ r.statusLabel }}</span>
              <span class="agent-badge" :class="r.agent.drivable ? 'detect-driver-yes' : 'detect-driver-no'">
                {{ r.agent.drivable ? "RepoOS driver" : "detected only" }}
              </span>
            </div>
            <div class="detect-row-right">
              <template v-if="r.agent.installed">
                <span class="detect-bin">{{ r.agent.binary }}</span>
                <span v-if="r.agent.path" class="detect-path" :title="r.agent.path">{{ r.agent.path }}</span>
                <span v-if="r.agent.version" class="detect-ver">{{ r.agent.version }}</span>
                <span v-if="!r.agent.headless" class="detect-hint">
                  Desktop app shadows PATH — install headless CLI:
                  <code>{{ r.agent.installHint }}</code>
                  <button class="detect-copy" @click="copyHint(r.agent.installHint)">
                    {{ detectHintCopied === r.agent.installHint ? "copied" : "copy" }}
                  </button>
                </span>
              </template>
              <template v-else>
                <span class="detect-bin">{{ r.agent.binary }}</span>
                <span class="detect-hint">
                  <code>{{ r.agent.installHint }}</code>
                  <button class="detect-copy" @click="copyHint(r.agent.installHint)">
                    {{ detectHintCopied === r.agent.installHint ? "copied" : "copy" }}
                  </button>
                </span>
              </template>
            </div>
          </div>

          <div class="detect-foot">
            <Button variant="outline" size="sm" :disabled="detectLoading" @click="checkAgents">
              {{ detectLoading ? "Checking…" : "Check again" }}
            </Button>
          </div>
        </template>
      </Card>

    </template>
  </div>
</template>
