<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfigStore } from "../stores/config";
import { useDocsStore } from "../stores/docs";
import { api, JSON_OPTS } from "../api";
import type {
  Agent,
  DetectedAgent,
  ModelSourcesResponse,
  ModelTestResponse,
  ModelTestResult,
} from "../types";
import Button from "../components/ui/button.vue";
import Card from "../components/ui/card.vue";
import Input from "../components/ui/input.vue";
import Switch from "../components/ui/switch.vue";
import AgentModelControl from "../components/AgentModelControl.vue";
import BuiltInAgentCard from "../components/BuiltInAgentCard.vue";
import VoiceDictate from "../components/VoiceDictate.vue";
import ModelPlaygroundPanel from "../components/ModelPlaygroundPanel.vue";
import { insertTextAtCursor } from "../utils/text-insertion";

const config = useConfigStore();
const router = useRouter();
const route = useRoute();
const docs = useDocsStore();

type AgentTab = "default" | "custom" | "team" | "detected" | "playground";

const AGENT_TAB_LABELS: Record<AgentTab, string> = {
  default: "Default Agents",
  custom: "Custom Agents",
  team: "Build Your Team",
  detected: "Detected Coding Agents",
  playground: "Model Playground",
};

const AGENT_TABS: AgentTab[] = ["default", "custom", "team", "detected", "playground"];

const activeTab = ref<AgentTab>("default");
// The playground fetches from external APIs on first view — lazy-mount it
// only once the user actually opens the tab, but keep it mounted afterward
// so switching tabs doesn't lose the in-progress chat.
const playgroundActivated = ref(false);
watch(activeTab, (tab) => {
  if (tab === "playground") playgroundActivated.value = true;
});

// Deep-linking: the active tab is reflected in the URL as ?tab=<id> so users
// can link straight to a section. Falls back to "default" on page load.
const tabFromQuery = (): AgentTab => {
  const q = route.query.tab;
  return typeof q === "string" && (AGENT_TABS as readonly string[]).includes(q)
    ? (q as AgentTab)
    : "default";
};

watch(
  () => route.query.tab,
  () => {
    const next = tabFromQuery();
    if (next !== activeTab.value) activeTab.value = next;
  },
  { immediate: true },
);

watch(activeTab, (tab) => {
  if (tabFromQuery() !== tab) {
    void router.replace({ query: { ...route.query, tab } });
  }
});

const RECOMMENDATIONS_DOC = "docs/agent-model-recommendations.md";

function openRecommendations(): void {
  void docs.loadDoc(RECOMMENDATIONS_DOC);
  void router.push({ name: "repo" });
}

const MODEL_PRICING_DOC = "docs/opencode-models.md";

function openModelPricing(): void {
  void docs.loadDoc(MODEL_PRICING_DOC);
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

// Default-vs-custom matching is case-insensitive: agent names are stored
// verbatim (e.g. a user or an older agent may have written `CTO`), so a
// capitalized default like `CTO` must still land in the "Default agents"
// section instead of masquerading as a custom role (0174/0196).
const defaultNames = computed(() => config.agentsMeta.defaults.map((a) => a.name.toLowerCase()));
const isDefaultName = (name: string): boolean => defaultNames.value.includes(name.toLowerCase());
// The talk/team agents (Ross, CTO, …) get their own cards under "Build your
// team", distinct from the headless task-engine defaults (engineer, reviewer,
// pm) shown in the "Default agents" section. Grouped by lowercase name.
const TEAM_AGENT_NAMES = ["ross", "cto"];
const isTeamAgent = (name: string): boolean => TEAM_AGENT_NAMES.includes(name.toLowerCase());
const headlessAgents = computed(() =>
  localAgents.value.filter((a) => isDefaultName(a.name) && !isTeamAgent(a.name)),
);
const teamAgents = computed(() =>
  localAgents.value.filter((a) => isDefaultName(a.name) && isTeamAgent(a.name)),
);
const customAgents = computed(() => localAgents.value.filter((a) => !isDefaultName(a.name)));

const CLI_LABELS: Record<string, string> = {
  "claude code": "Claude Code",
  "github copilot": "GitHub Copilot CLI",
  "qwen code": "qwen code",
  codex: "codex",
};

const defaultInstrRefs = new Map<string, HTMLTextAreaElement | null>();
const customInstrRefs = new Map<string, HTMLTextAreaElement | null>();

function onDefaultInstrTranscribed(agentName: string, text: string): void {
  const textarea = defaultInstrRefs.get(agentName);
  if (textarea) {
    insertTextAtCursor(textarea, text);
  }
}

function onCustomInstrTranscribed(agentName: string, text: string): void {
  const textarea = customInstrRefs.get(agentName);
  if (textarea) {
    insertTextAtCursor(textarea, text);
  }
}

const clis = computed(() =>
  config.agentsMeta.clis.map((c) => ({ value: c, label: CLI_LABELS[c] ?? c })),
);

const cliOptions = computed(() => config.agentsMeta.clis ?? []);

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

function updateAgentInstr(a: Agent): void {
  const focused = document.activeElement;
  if (focused instanceof HTMLTextAreaElement && focused.value !== a.instructions) {
    a.instructions = focused.value;
  }
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
  <div class="agents-page">
    <div class="page-title agents-page-title">Agents</div>
    <div class="page-desc">
      The AI agents that work this repo ·
      <button class="model-pricing-link" @click="openRecommendations">
        View the full agent &amp; model selection guide →
      </button>
      <span v-if="config.saving"> · Saving…</span>
      <span v-else-if="config.error" class="save-msg err"> · {{ config.error }}</span>
      <span v-else-if="config.msg" class="save-msg ok"> · Saved</span>
    </div>

    <div v-if="!config.loaded" class="spin"></div>

    <template v-else>
      <div class="agent-tabs">
        <button
          v-for="t in AGENT_TABS"
          :key="t"
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === t }"
          @click="activeTab = t"
        >
          {{ AGENT_TAB_LABELS[t] }}
        </button>
      </div>

      <div class="agents-tab-content">
        <Card v-show="activeTab === 'default'" style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
            <span class="live-dot"></span>Default agents
            <!-- <a
            class="model-pricing-link"
            href="/repo?doc=docs/opencode-models.md"
            target="_blank"
            rel="noopener noreferrer"
            title="Open model pricing & use cases in the Repo Context docs"
          >Model pricing &amp; use cases</a> -->
            <button class="model-pricing-link" @click="openModelPricing">
              Model pricing &amp; use cases →
            </button>
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
            Headless task-engine roles that run the roadmap. Toggle them on or off and pick their
            coding agent and model.
          </div>
          <div
            v-for="a in headlessAgents"
            :key="a.name"
            class="agent-card"
            :class="{ off: !a.enabled }"
          >
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
                <label>Coding agent + Model</label>
                <AgentModelControl
                  :cli-options="cliOptions"
                  :model-options="config.modelsFor(a.cli, a.model)"
                  v-model:cli="a.cli"
                  v-model:model="a.model"
                />
              </div>
              <div class="agent-field agent-test-result">
                <label>Compatibility</label>
                <div class="agent-test-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="!!testing[testKey(a)]"
                    @click="testAgent(a)"
                  >
                    <span v-if="testing[testKey(a)]" class="model-test-spinner"></span>
                    {{ testing[testKey(a)] ? "Testing…" : resultFor(a) ? "Test again" : "Test" }}
                  </Button>
                  <span
                    v-if="resultFor(a)"
                    :class="'model-test model-test-' + resultFor(a)!.status"
                    :title="resultFor(a)!.error"
                  >
                    {{ resultFor(a)!.status.replace("_", " ") }}
                  </span>
                </div>
              </div>
              <div class="agent-field agent-instr-field">
                <div class="instr-header">
                  <label>Instructions</label>
                  <VoiceDictate @transcribed="onDefaultInstrTranscribed(a.name, $event)" />
                </div>
                <textarea
                  :ref="(el: any) => defaultInstrRefs.set(a.name, el)"
                  :value="a.instructions ?? ''"
                  class="agent-instr"
                  rows="2"
                  placeholder="Optional — how this agent should behave"
                  @input="setInstr(a, $event)"
                  @blur="updateAgentInstr(a)"
                ></textarea>
              </div>
            </div>
          </div>
        </Card>

        <Card v-show="activeTab === 'custom'" style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
            <span class="live-dot" style="background: var(--violet, var(--cyan))"></span>Custom
            agents
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

          <div
            v-for="a in customAgents"
            :key="a.name"
            class="agent-card"
            :class="{ off: !a.enabled }"
          >
            <div class="agent-head">
              <div class="agent-title">
                <span class="agent-dot"></span>
                <Input
                  :model-value="a.name"
                  class="w-[180px] h-[30px]"
                  @update:model-value="(v) => (a.name = String(v ?? ''))"
                />
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
                <label>Coding agent + Model</label>
                <AgentModelControl
                  :cli-options="cliOptions"
                  :model-options="config.modelsFor(a.cli, a.model)"
                  v-model:cli="a.cli"
                  v-model:model="a.model"
                />
              </div>
              <div class="agent-field agent-test-result">
                <label>Compatibility</label>
                <div class="agent-test-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="!!testing[testKey(a)]"
                    @click="testAgent(a)"
                  >
                    <span v-if="testing[testKey(a)]" class="model-test-spinner"></span>
                    {{ testing[testKey(a)] ? "Testing…" : resultFor(a) ? "Test again" : "Test" }}
                  </Button>
                  <span
                    v-if="resultFor(a)"
                    :class="'model-test model-test-' + resultFor(a)!.status"
                    :title="resultFor(a)!.error"
                  >
                    {{ resultFor(a)!.status.replace("_", " ") }}
                  </span>
                </div>
              </div>
              <div class="agent-field agent-instr-field">
                <div class="instr-header">
                  <label>Instructions</label>
                  <VoiceDictate @transcribed="onCustomInstrTranscribed(a.name, $event)" />
                </div>
                <textarea
                  :ref="(el: any) => customInstrRefs.set(a.name, el)"
                  :value="a.instructions ?? ''"
                  class="agent-instr"
                  rows="2"
                  placeholder="Optional — how this agent should behave"
                  @input="setInstr(a, $event)"
                  @blur="updateAgentInstr(a)"
                ></textarea>
              </div>
            </div>
          </div>
        </Card>

        <Card v-show="activeTab === 'team'" style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
            <span class="live-dot" style="background: var(--green)"></span>Build your team
          </div>
          <div class="agent-desc">
            The agents that talk back or extend RepoOS. Enable them to add new capabilities.
          </div>

          <div
            v-for="a in teamAgents"
            :key="'team-' + a.name"
            class="agent-card"
            :class="{ off: !a.enabled }"
          >
            <div class="agent-head">
              <div class="agent-title">
                <span class="agent-dot"></span>
                <span class="agent-name">{{ a.name }}</span>
                <span class="agent-badge">team</span>
              </div>
              <Switch :checked="a.enabled" @update:checked="(v) => (a.enabled = v)" />
            </div>
            <div class="agent-body">
              <div class="agent-field">
                <label>Coding agent + Model</label>
                <AgentModelControl
                  :cli-options="cliOptions"
                  :model-options="config.modelsFor(a.cli, a.model)"
                  v-model:cli="a.cli"
                  v-model:model="a.model"
                />
              </div>
              <div class="agent-field agent-test-result">
                <label>Compatibility</label>
                <div class="agent-test-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="!!testing[testKey(a)]"
                    @click="testAgent(a)"
                  >
                    <span v-if="testing[testKey(a)]" class="model-test-spinner"></span>
                    {{ testing[testKey(a)] ? "Testing…" : resultFor(a) ? "Test again" : "Test" }}
                  </Button>
                  <span
                    v-if="resultFor(a)"
                    :class="'model-test model-test-' + resultFor(a)!.status"
                    :title="resultFor(a)!.error"
                  >
                    {{ resultFor(a)!.status.replace("_", " ") }}
                  </span>
                </div>
              </div>
              <div class="agent-field agent-instr-field">
                <div class="instr-header">
                  <label>Instructions</label>
                  <VoiceDictate @transcribed="onDefaultInstrTranscribed(a.name, $event)" />
                </div>
                <textarea
                  :ref="(el: any) => defaultInstrRefs.set(a.name, el)"
                  :value="a.instructions ?? ''"
                  class="agent-instr"
                  rows="2"
                  placeholder="Optional — how this agent should behave"
                  @input="setInstr(a, $event)"
                  @blur="updateAgentInstr(a)"
                ></textarea>
              </div>
            </div>
          </div>

          <BuiltInAgentCard agent="debugger" interactive />
          <BuiltInAgentCard agent="tech-debt" />
          <BuiltInAgentCard agent="performance" />
          <BuiltInAgentCard agent="architect" />
          <BuiltInAgentCard agent="design" />
        </Card>

        <Card
          v-if="!detectError"
          v-show="activeTab === 'detected'"
          style="padding: 0 18px 6px; margin-bottom: 16px"
        >
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
            <span class="live-dot" style="background: var(--violet, var(--cyan))"></span>
            Detected coding agents
          </div>
          <div class="agent-desc">
            What's on this machine's PATH — installed &amp; headless-ready, desktop-only, or
            missing. Click a hint to copy it.
          </div>

          <div v-if="detectLoading && !detected.length" class="detect-loading">Probing PATH…</div>
          <div v-else-if="!detected.length" class="agent-empty">
            No known coding agents detected on PATH.
          </div>

          <template v-else>
            <div v-for="r in detectRows" :key="r.agent.id" class="detect-row">
              <div class="detect-row-left">
                <span
                  class="detect-badge"
                  :style="{ background: r.color, boxShadow: '0 0 8px ' + r.color }"
                ></span>
                <span class="agent-name">{{ r.agent.name }}</span>
                <span class="detect-pill" :style="{ color: r.color }">{{ r.statusLabel }}</span>
                <span
                  class="agent-badge"
                  :class="r.agent.drivable ? 'detect-driver-yes' : 'detect-driver-no'"
                >
                  {{ r.agent.drivable ? "RepoOS driver" : "detected only" }}
                </span>
              </div>
              <div class="detect-row-right">
                <template v-if="r.agent.installed">
                  <span class="detect-bin">{{ r.agent.binary }}</span>
                  <span v-if="r.agent.path" class="detect-path" :title="r.agent.path">{{
                    r.agent.path
                  }}</span>
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

        <ModelPlaygroundPanel v-if="playgroundActivated" v-show="activeTab === 'playground'" />
      </div>
    </template>
  </div>
</template>
