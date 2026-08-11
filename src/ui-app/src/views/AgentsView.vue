<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { useConfigStore } from "../stores/config";
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

const config = useConfigStore();

const localAgents = ref<Agent[]>([]);
const newName = ref("");

function sync(): void {
  localAgents.value = config.agents.map((a) => ({ ...a }));
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

const dirty = computed(() => JSON.stringify(localAgents.value) !== JSON.stringify(config.agents));

const CLI_LABELS: Record<string, string> = {
  "claude code": "Claude Code",
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

const liveModelsByCli = ref<Record<string, string[]>>({});
const modelsLoaded = ref(false);
const modelsLoading = ref(false);
const modelsTesting = ref(false);
const modelTestResults = ref<ModelTestResult[]>([]);
const modelTestAt = ref("");

function labelForModel(m: string): string {
  if (m === "default") return "Default";
  if (m === "big pickle") return "Big Pickle";
  if (m === "deepseek v4") return "DeepSeek v4";
  return m;
}

function modelsFor(cli: string, saved?: string): { value: string; label: string; disabled: boolean }[] {
  const out: { value: string; label: string; disabled: boolean }[] = [];
  const seen = new Set<string>();
  const push = (m: string) => {
    if (seen.has(m)) return;
    seen.add(m);
    out.push({ value: m, label: labelForModel(m), disabled: isFailedModel(cli, m) });
  };
  push("default");
  for (const m of liveModelsByCli.value[cli] ?? []) push(m);
  // The old global suggestions are only an endpoint-failure fallback. Once
  // per-CLI metadata loads, never leak OpenCode labels into Codex/Claude/etc.
  if (!modelsLoaded.value) for (const m of config.agentsMeta.models) push(m);
  if (saved) push(saved);
  return out;
}

function resultFor(cli: string, model: string): ModelTestResult | undefined {
  return modelTestResults.value.find((r) => r.cli === cli && r.model === model);
}

function isFailedModel(cli: string, model: string): boolean {
  const result = resultFor(cli, model);
  return result?.status === "failed" || result?.status === "timed_out";
}

async function testModels(): Promise<void> {
  if (modelsTesting.value) return;
  modelsTesting.value = true;
  try {
    const requested: Record<string, string[]> = {};
    for (const agent of localAgents.value) {
      requested[agent.cli] = [...new Set([
        ...(requested[agent.cli] ?? []),
        ...modelsFor(agent.cli, agent.model).map((model) => model.value),
      ])];
    }
    const response = await api<ModelTestResponse>(
      "/api/models/test",
      JSON_OPTS("POST", { byCli: requested }),
    );
    modelTestResults.value = response.results;
    modelTestAt.value = response.at;
  } catch (err) {
    config.error = err instanceof Error ? err.message : "Model compatibility test failed.";
  } finally {
    modelsTesting.value = false;
  }
}

async function loadModels(refresh = false): Promise<void> {
  modelsLoading.value = true;
  try {
    const res = await api<ModelSourcesResponse>(
      `/api/models${refresh ? "?refresh=1" : ""}`,
    );
    liveModelsByCli.value = Object.fromEntries(
      Object.entries(res.byCli).map(([cli, source]) => [cli, source.models]),
    );
    modelsLoaded.value = true;
  } catch {
    liveModelsByCli.value = {};
    modelsLoaded.value = false;
  } finally {
    modelsLoading.value = false;
  }
}

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

async function save(): Promise<void> {
  const seen = new Set<string>();
  for (const a of localAgents.value) {
    const key = a.name.trim().toLowerCase();
    if (!key) {
      config.error = "Every agent needs a name.";
      return;
    }
    if (seen.has(key)) {
      config.error = `Duplicate agent name "${a.name}".`;
      return;
    }
    seen.add(key);
  }
  await config.saveAgents(localAgents.value.map((a) => ({ ...a, name: a.name.trim() })));
  sync();
}

// ---- Unsaved-changes guard ----
// Leaving the Agents page (or the app) with local edits pending must ask for
// confirmation instead of silently discarding them. `dirty` is the single
// source of truth; when it is false neither prompt fires.

function leaveGuard(): boolean {
  if (!dirty.value) return true;
  return window.confirm("You have unsaved agent changes. Leave the Agents page without saving?");
}

onBeforeRouteLeave(() => leaveGuard());

function handleBeforeUnload(e: BeforeUnloadEvent): void {
  if (!dirty.value) return;
  e.preventDefault();
  e.returnValue = "";
}

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
  window.addEventListener("beforeunload", handleBeforeUnload);
  void checkAgents();
  void loadModels();
});

onUnmounted(() => {
  window.removeEventListener("beforeunload", handleBeforeUnload);
});
</script>

<template>
  <div>
    <div class="page-title">Agents</div>
    <div class="page-desc">
      The AI agents that work this repo · opencode + big pickle by default
    </div>

    <div v-if="!config.loaded" class="spin"></div>

    <template v-else>
      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
          <span class="live-dot"></span>Default agents
          <Button
            variant="outline"
            size="sm"
            style="margin-left: auto"
            :disabled="modelsLoading || modelsTesting"
            title="Re-probe opencode's live model list (opencode models --refresh)"
            @click="loadModels(true)"
          >
            {{ modelsLoading ? "Refreshing…" : "Refresh models" }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="modelsLoading || modelsTesting"
            title="Sends one tiny real provider request per testable model combination"
            @click="testModels"
          >
            {{ modelsTesting ? "Testing models…" : modelTestResults.length ? "Test again" : "Test models" }}
          </Button>
        </div>
        <div class="agent-desc">
          Built-in roles. Toggle them on or off and pick their coding agent and model.
        </div>
        <div v-if="modelsTesting" class="model-test-summary">Testing each supported combination with a tiny provider request…</div>
        <div v-else-if="modelTestResults.length" class="model-test-summary">
          <span>Last tested {{ new Date(modelTestAt).toLocaleTimeString() }}</span>
          <span v-for="result in modelTestResults" :key="result.cli + ':' + result.model"
            :class="'model-test model-test-' + result.status" :title="result.error">
            {{ result.cli }} · {{ labelForModel(result.model) }}: {{ result.status.replace('_', ' ') }}
          </span>
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
                  <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                    <SelectItem v-for="m in modelsFor(a.cli, a.model)" :key="m.value" :value="m.value" :disabled="m.disabled">
                      {{ m.label }}{{ m.disabled ? " — failed test" : "" }}
                    </SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div v-if="resultFor(a.cli, a.model)" class="agent-field agent-test-result">
              <label>Compatibility</label>
              <span :class="'model-test model-test-' + resultFor(a.cli, a.model)!.status" :title="resultFor(a.cli, a.model)!.error">
                {{ resultFor(a.cli, a.model)!.status.replace('_', ' ') }}
              </span>
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
                  <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                    <SelectItem v-for="m in modelsFor(a.cli, a.model)" :key="m.value" :value="m.value" :disabled="m.disabled">
                      {{ m.label }}{{ m.disabled ? " — failed test" : "" }}
                    </SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
            </div>
            <div v-if="resultFor(a.cli, a.model)" class="agent-field agent-test-result">
              <label>Compatibility</label>
              <span :class="'model-test model-test-' + resultFor(a.cli, a.model)!.status" :title="resultFor(a.cli, a.model)!.error">
                {{ resultFor(a.cli, a.model)!.status.replace('_', ' ') }}
              </span>
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

      <div class="save-bar agents-savebar" :class="{ dirty }">
        <div v-if="dirty" class="save-callout">
          <span class="save-dot"></span>
          <div>
            <div class="save-title">Unsaved changes</div>
            <div class="save-sub">Save to apply your edits</div>
          </div>
        </div>
        <div v-if="config.msg" class="save-msg ok">{{ config.msg }}</div>
        <div v-if="config.error" class="save-msg err">{{ config.error }}</div>
        <div class="save-actions">
          <Button
            variant="default"
            class="agents-save-btn"
            :class="{ dirty }"
            @click="save"
            :disabled="config.saving || !config.loaded"
          >
            {{ config.saving ? "Saving…" : "Save agents" }}
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>
