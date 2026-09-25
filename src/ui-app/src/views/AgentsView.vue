<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Star } from "lucide-vue-next";
import { useConfigStore } from "../stores/config";
import { useDocsStore } from "../stores/docs";
import { api, JSON_OPTS } from "../api";
import { copyToClipboard } from "../lib/clipboard";
import type {
  Agent,
  AgentUpdate,
  DetectedAgent,
  ModelSourcesResponse,
  ModelTestResponse,
  ModelTestResult,
} from "../types";
import Button from "../components/ui/button.vue";
import Input from "../components/ui/input.vue";
import Select from "../components/ui/select/root.vue";
import SelectContent from "../components/ui/select/content.vue";
import SelectItem from "../components/ui/select/item.vue";
import SelectTrigger from "../components/ui/select/trigger.vue";
import SelectValue from "../components/ui/select/value.vue";
import SelectViewport from "../components/ui/select/viewport.vue";
import AgentCard from "../components/AgentCard.vue";
import BuiltInAgentCard from "../components/BuiltInAgentCard.vue";
import { sortHeadlessAgents } from "../lib/headless-agent-order";
import ModelPlaygroundPanel from "../components/ModelPlaygroundPanel.vue";
import ModelProvidersPanel from "../components/ModelProvidersPanel.vue";
import { insertTextAtCursor } from "../utils/text-insertion";
import Dialog from "../components/ui/dialog/root.vue";
import DialogClose from "../components/ui/dialog/close.vue";
import DialogContent from "../components/ui/dialog/content.vue";
import DialogDescription from "../components/ui/dialog/description.vue";
import DialogOverlay from "../components/ui/dialog/overlay.vue";
import DialogTitle from "../components/ui/dialog/title.vue";
import { useAgentFavorites } from "../composables/useAgentFavorites";

const config = useConfigStore();
const router = useRouter();
const route = useRoute();
const docs = useDocsStore();

type AgentTab = "default" | "custom" | "team" | "detected" | "playground" | "providers";

const AGENT_TAB_LABELS: Record<AgentTab, string> = {
  default: "Default Agents",
  custom: "Custom Agents",
  team: "Build Your Team",
  detected: "Detected Coding Agents",
  playground: "Model Playground",
  providers: "Model providers",
};

const AGENT_TABS: AgentTab[] = ["default", "custom", "team", "detected", "playground", "providers"];

const activeTab = ref<AgentTab>("default");
// The playground fetches from external APIs on first view — lazy-mount it
// only once the user actually opens the tab, but keep it mounted afterward
// so switching tabs doesn't lose the in-progress chat. Same for the model
// providers tab (provider rows + per-row live usage fetch on first open).
const playgroundActivated = ref(false);
const providersActivated = ref(false);
watch(activeTab, (tab) => {
  if (tab === "playground") playgroundActivated.value = true;
  if (tab === "providers") providersActivated.value = true;
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
const skillsModalAgent = ref<Agent | null>(null);
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
const sortedHeadlessAgents = computed(() =>
  sortHeadlessAgents(
    localAgents.value.filter((a) => isDefaultName(a.name) && !isTeamAgent(a.name)),
  ),
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
  antigravity: "Antigravity CLI (agy)",
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

function toggleSkill(a: Agent, skill: string, enabled: boolean): void {
  const selected = new Set(a.skills ?? []);
  if (enabled) selected.add(skill);
  else selected.delete(skill);
  a.skills = [...selected];
}

function openSkillsModal(agent: Agent): void {
  skillsModalAgent.value = agent;
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
/** Set of agent ids whose fresh probe is still in flight. */
const detectPending = ref<Set<string>>(new Set());
const detectLoading = ref(false);
const detectError = ref(false);
const detectCachedAt = ref<string | null>(null);
const detectHintCopied = ref<string>("");
const openCompatId = ref<string | null>(null);
/** Per-agent selected binary index (into allBinaries). Defaults to 0 (primary). */
const selectedBinaryIdx = ref<Record<string, number>>({});

function toggleCompat(id: string): void {
  openCompatId.value = openCompatId.value === id ? null : id;
}

function selectBinary(agentId: string, idx: number): void {
  selectedBinaryIdx.value = { ...selectedBinaryIdx.value, [agentId]: idx };
}

function effectiveBinary(agent: DetectedAgent): { path: string | null; version: string | null } {
  const idx = selectedBinaryIdx.value[agent.id] ?? 0;
  const bin = agent.allBinaries?.[idx];
  if (bin) return { path: bin.path, version: bin.version };
  return { path: agent.path, version: agent.version };
}

function cachedAtLabel(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `cached ${days}d ago`;
  if (hrs >= 1) return `cached ${hrs}h ago`;
  if (mins >= 1) return `cached ${mins}m ago`;
  return "cached just now";
}
const updateLoading = ref(false);
const updateError = ref(false);
const updates = ref<Record<string, AgentUpdate>>({});

const installedDrivableClis = computed(
  () =>
    new Set(detected.value.filter((a) => a.installed && a.drivable && a.cli).map((a) => a.cli!)),
);

function cliOptionsFor(currentCli: string, opts: { team?: boolean } = {}): string[] {
  return (config.agentsMeta.clis ?? []).filter((cli) => {
    if (cli !== "antigravity" || cli === currentCli) return true;
    // Team agents (Ross, CTO) work in the main checkout, where RepoOS refuses
    // to run Antigravity's permission bypass — so don't offer it for them.
    if (opts.team) return false;
    return installedDrivableClis.value.has(cli);
  });
}

const { isAgentFavorite, toggleAgentFavorite } = useAgentFavorites();

/**
 * The key favorites are stored/matched under: `agent.cli` (the `AGENT_CLIS`
 * string, e.g. "claude code") when drivable, else `agent.id`. Favoriting by
 * `agent.id` alone used to silently break the agent+model selector's
 * favorites filter for multi-word/hyphenated agents (`claude-code`,
 * `qwen-code`, `copilot`) whose `id` doesn't match the `AGENT_CLIS` string
 * that filter matches against — see `core/detect.ts`'s `cli` field doc.
 */
function favoriteKey(agent: DetectedAgent): string {
  return agent.cli ?? agent.id;
}

type DetectStatus = "ok" | "desktop" | "auth" | "missing";

interface DetectRow {
  agent: DetectedAgent;
  status: DetectStatus;
  statusLabel: string;
  color: string;
  /** Sort priority: lower = higher in list. Green=0, amber=1, red=2. */
  sortOrder: number;
}

const detectRows = computed<DetectRow[]>(() => {
  const rows = detected.value.map((agent) => {
    if (!agent.installed) {
      return {
        agent,
        status: "missing" as DetectStatus,
        statusLabel: "not installed",
        color: "var(--red)",
        sortOrder: 2,
      };
    }
    if (agent.headless === false) {
      return {
        agent,
        status: "desktop" as DetectStatus,
        statusLabel: "desktop only",
        color: "var(--amber)",
        sortOrder: 1,
      };
    }
    if (agent.auth === false) {
      return {
        agent,
        status: "auth" as DetectStatus,
        statusLabel: "sign-in required",
        color: "var(--amber)",
        sortOrder: 1,
      };
    }
    return {
      agent,
      status: "ok" as DetectStatus,
      statusLabel: "ready",
      color: "var(--green)",
      sortOrder: 0,
    };
  });
  // Sort: green (ready) first, then amber, then red — stable within each group.
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
});

let activeStream: EventSource | null = null;

async function checkAgents(): Promise<void> {
  detectError.value = false;
  detectHintCopied.value = "";

  // 1. Load cached results immediately so the page isn't blank.
  try {
    const cached = await api<{ agents: DetectedAgent[]; cachedAt: string | null }>(
      "/api/agents/detect",
    );
    if (cached.agents.length) {
      detected.value = cached.agents;
      detectCachedAt.value = cached.cachedAt;
    }
  } catch {
    // Cache miss is non-fatal; the stream will populate.
  }

  // 2. Open SSE stream for fresh probes.
  activeStream?.close();
  // Mark all known agents as pending.
  const knownIds = new Set(detected.value.map((a) => a.id));
  detectPending.value = new Set(knownIds.size ? knownIds : ["__loading__"]);
  detectLoading.value = true;

  const es = new EventSource("/api/agents/detect/stream");
  activeStream = es;

  es.addEventListener("agent", (e: MessageEvent) => {
    try {
      const agent = JSON.parse(e.data as string) as DetectedAgent;
      const idx = detected.value.findIndex((a) => a.id === agent.id);
      if (idx >= 0) {
        detected.value = detected.value.map((a, i) => (i === idx ? agent : a));
      } else {
        detected.value = [...detected.value, agent];
      }
      const next = new Set(detectPending.value);
      next.delete(agent.id);
      detectPending.value = next;
    } catch {
      /* ignore parse errors */
    }
  });

  es.addEventListener("done", (e: MessageEvent) => {
    try {
      const { cachedAt } = JSON.parse(e.data as string) as { cachedAt: string };
      detectCachedAt.value = cachedAt;
    } catch {
      /* ignore */
    }
    detectPending.value = new Set();
    detectLoading.value = false;
    es.close();
    activeStream = null;
  });

  es.onerror = () => {
    detectPending.value = new Set();
    detectLoading.value = false;
    if (!detected.value.length) detectError.value = true;
    es.close();
    activeStream = null;
  };
}

/**
 * The panel's single action. The first click checks for updates; after that
 * it re-probes PATH too (so a just-installed or upgraded CLI shows up) and
 * bypasses the 6h update cache.
 */
async function refreshDetected(): Promise<void> {
  const refresh = Object.keys(updates.value).length > 0;
  if (refresh) await checkAgents();
  await checkForUpdates(refresh);
}

async function checkForUpdates(refresh = false): Promise<void> {
  updateLoading.value = true;
  updateError.value = false;
  try {
    const data = await api<{ updates: Record<string, AgentUpdate> }>(
      "/api/agents/updates",
      JSON_OPTS("POST", { refresh }),
    );
    updates.value = data.updates;
    detected.value = detected.value.map((agent) => ({
      ...agent,
      update: data.updates[agent.id],
    }));
  } catch {
    updateError.value = true;
  } finally {
    updateLoading.value = false;
  }
}

function updateLabel(update: AgentUpdate | undefined): string {
  if (!update) return "Not checked";
  if (update.status === "up_to_date") return "Up to date";
  if (update.status === "update_available") {
    return `Update available: ${update.installedVersion} → ${update.latestVersion}`;
  }
  if (update.status === "unavailable") return "Could not check";
  return "Check manually";
}

function updateColor(update: AgentUpdate | undefined): string {
  if (update?.status === "update_available") return "var(--amber)";
  if (update?.status === "up_to_date") return "var(--green)";
  if (update?.status === "unavailable") return "var(--red)";
  return "var(--txt-dim)";
}

function compatibilityColor(agent: DetectedAgent): string {
  const status = agent.compatibility?.status;
  if (status === "verified") return "var(--green)";
  if (status === "unsupported") return "var(--red)";
  if (status === "upgrade_recommended" || status === "newer_than_verified") {
    return "var(--amber)";
  }
  return "var(--txt-dim)";
}

/** Copyable live-probe command for a harness that is not yet proven or beyond the certified line. */
function probeHint(agent: DetectedAgent): string {
  const id = agent.cli || agent.binary;
  return `repoos doctor --probe ${id} --yes`;
}

/**
 * True when a deliberate live probe is the actionable next step: the harness
 * has a RepoOS contract we track, but the installed release is not yet proven
 * (`not_probed`) or is beyond the certified baseline (`newer_than_verified`).
 * Without this, the shipped uncertified config would show no action at all.
 */
function probeAvailable(agent: DetectedAgent): boolean {
  const compatibility = agent.compatibility;
  if (!compatibility?.contract) return false;
  return compatibility.status === "not_probed" || compatibility.status === "newer_than_verified";
}

/** Pill tooltip: explanation plus the newest certified release (or none yet). */
function compatibilityTitle(agent: DetectedAgent): string {
  const compatibility = agent.compatibility;
  if (!compatibility) return "";
  const certified = compatibility.newestCertifiedVersion
    ? `Newest certified: ${compatibility.newestCertifiedVersion}.`
    : "No release is certified yet.";
  return `${compatibility.explanation} ${certified}`;
}

function compatibilityIcon(agent: DetectedAgent): string {
  const status = agent.compatibility?.status;
  if (status === "verified") return "✓";
  if (status === "unsupported") return "!";
  return "?";
}

function checkedLabel(update: AgentUpdate | undefined): string {
  return update?.checkedAt ? `checked ${new Date(update.checkedAt).toLocaleString()}` : "";
}

function copyHint(hint: string): void {
  void copyToClipboard(hint);
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
  activeStream?.close();
  activeStream = null;
});
</script>

<template>
  <div class="agents-page">
    <header class="page-header">
      <div>
        <div class="page-title agents-page-title">Agents</div>
        <div class="page-desc">
          The AI agents that work this repo
          <span v-if="config.saving"> · Saving…</span>
          <span v-else-if="config.error" class="save-msg err"> · {{ config.error }}</span>
          <span v-else-if="config.msg" class="save-msg ok"> · Saved</span>
        </div>
      </div>
      <div class="page-header-actions">
        <a
          class="page-help-link"
          href="https://docs.repoos.org/agents"
          target="_blank"
          rel="noreferrer"
          >Set up agents ↗</a
        >
        <button class="page-help-link" @click="openRecommendations">
          Model &amp; agent guide →
        </button>
        <a class="page-help-link" href="/settings?tab=toml">Advanced config</a>
      </div>
    </header>

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
        <div
          class="agent-tab-panel"
          v-show="activeTab === 'default'"
          style="padding: 0 18px 6px; margin-bottom: 16px"
        >
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
          <AgentCard
            v-for="a in sortedHeadlessAgents"
            :key="a.name"
            :agent="a"
            variant="default"
            :cli-options="cliOptionsFor(a.cli)"
            :memory-key="'headless:' + a.name"
            :skills-available="config.agentsMeta.skills.length > 0"
            :testing="!!testing[testKey(a)]"
            :test-result="resultFor(a)"
            :register-instr-ref="(el) => defaultInstrRefs.set(a.name, el)"
            @test="testAgent(a)"
            @open-skills="openSkillsModal(a)"
            @instr-input="setInstr(a, $event)"
            @instr-blur="updateAgentInstr(a)"
            @open-recommendations="openRecommendations"
            @transcribed="onDefaultInstrTranscribed(a.name, $event)"
          />
        </div>

        <div
          class="agent-tab-panel"
          v-show="activeTab === 'custom'"
          style="padding: 0 18px 6px; margin-bottom: 16px"
        >
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

          <AgentCard
            v-for="a in customAgents"
            :key="a.name"
            :agent="a"
            variant="custom"
            :cli-options="cliOptionsFor(a.cli)"
            :memory-key="'custom:' + a.name"
            :skills-available="config.agentsMeta.skills.length > 0"
            :testing="!!testing[testKey(a)]"
            :test-result="resultFor(a)"
            :register-instr-ref="(el) => customInstrRefs.set(a.name, el)"
            @test="testAgent(a)"
            @open-skills="openSkillsModal(a)"
            @remove="removeCustom(a)"
            @instr-input="setInstr(a, $event)"
            @instr-blur="updateAgentInstr(a)"
            @open-recommendations="openRecommendations"
            @transcribed="onCustomInstrTranscribed(a.name, $event)"
          />
        </div>

        <div
          class="agent-tab-panel"
          v-show="activeTab === 'team'"
          style="padding: 0 18px 6px; margin-bottom: 16px"
        >
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
            <span class="live-dot" style="background: var(--green)"></span>Build your team
          </div>
          <div class="agent-desc">
            The agents that talk back or extend RepoOS. Enable them to add new capabilities.
          </div>

          <AgentCard
            v-for="a in teamAgents"
            :key="'team-' + a.name"
            :agent="a"
            variant="team"
            :cli-options="cliOptionsFor(a.cli, { team: true })"
            :memory-key="'team:' + a.name"
            :skills-available="config.agentsMeta.skills.length > 0"
            :testing="!!testing[testKey(a)]"
            :test-result="resultFor(a)"
            :register-instr-ref="(el) => defaultInstrRefs.set(a.name, el)"
            @test="testAgent(a)"
            @open-skills="openSkillsModal(a)"
            @instr-input="setInstr(a, $event)"
            @instr-blur="updateAgentInstr(a)"
            @open-recommendations="openRecommendations"
            @transcribed="onDefaultInstrTranscribed(a.name, $event)"
          />

          <BuiltInAgentCard agent="debugger" interactive />
          <BuiltInAgentCard agent="tech-debt" />
          <BuiltInAgentCard agent="performance" />
          <BuiltInAgentCard agent="architect" />
          <BuiltInAgentCard agent="design" />
          <BuiltInAgentCard agent="docs-debt" />
        </div>

        <div
          class="agent-tab-panel"
          v-if="!detectError"
          v-show="activeTab === 'detected'"
          style="padding: 0 18px 6px; margin-bottom: 16px"
        >
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
            <span class="live-dot" style="background: var(--violet, var(--cyan))"></span>
            Detected coding agents
            <Button
              variant="outline"
              size="sm"
              class="detect-updates-btn"
              :disabled="updateLoading || detectLoading"
              @click="refreshDetected"
            >
              {{
                updateLoading || detectLoading
                  ? "Checking…"
                  : Object.keys(updates).length > 0
                    ? "Refresh update checks"
                    : "Check for updates"
              }}
            </Button>
          </div>
          <div class="agent-desc">
            What's on this machine's PATH — installed &amp; headless-ready, desktop-only, or
            missing. Update checks contact only the supported public source after you request them;
            results are cached for 6 hours.
          </div>
          <div v-if="updateError" class="detect-update-error">
            Update checks are temporarily unavailable.
          </div>
          <div v-if="detectCachedAt && detectLoading" class="detect-cache-label">
            {{ cachedAtLabel(detectCachedAt) }} · scanning now…
          </div>
          <div v-else-if="detectCachedAt && !detectLoading" class="detect-cache-label">
            {{ cachedAtLabel(detectCachedAt) }}
          </div>

          <div v-if="detectLoading && !detected.length" class="detect-loading">Probing PATH…</div>
          <div v-else-if="!detected.length" class="agent-empty">
            No known coding agents detected on PATH.
          </div>

          <template v-else>
            <div v-for="r in detectRows" :key="r.agent.id" class="detect-row-wrap">
              <div
                class="detect-row"
                :class="{ 'detect-row-pending': detectPending.has(r.agent.id) }"
              >
                <span
                  class="detect-badge"
                  :style="{ background: r.color, boxShadow: '0 0 8px ' + r.color }"
                ></span>
                <span class="agent-name detect-agent-name">{{ r.agent.name }}</span>
                <span class="detect-pill" :style="{ color: r.color }">{{ r.statusLabel }}</span>
                <span
                  class="agent-badge"
                  :class="r.agent.drivable ? 'detect-driver-yes' : 'detect-driver-no'"
                >
                  {{ r.agent.drivable ? "RepoOS driver" : "detected only" }}
                </span>
                <span v-if="r.agent.deprecated" class="agent-badge detect-deprecated"
                  >Deprecated</span
                >
                <span
                  v-if="effectiveBinary(r.agent).version"
                  class="detect-ver detect-ver-inline"
                  >{{ effectiveBinary(r.agent).version }}</span
                >
                <!-- Multi-binary dropdown: shown when more than one copy exists on PATH -->
                <Select
                  v-if="r.agent.allBinaries && r.agent.allBinaries.length > 1"
                  :model-value="String(selectedBinaryIdx[r.agent.id] ?? 0)"
                  @update:model-value="(v) => selectBinary(r.agent.id, Number(v))"
                >
                  <SelectTrigger
                    class="detect-binary-select"
                    :title="`${r.agent.allBinaries.length} copies found on PATH`"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectViewport class="detect-binary-viewport">
                      <SelectItem
                        v-for="(bin, idx) in r.agent.allBinaries"
                        :key="bin.path"
                        :value="String(idx)"
                        :text-value="`${bin.name} ${bin.version ?? '?'}`"
                        class="detect-binary-item"
                      >
                        <span class="detect-binary-item-name">{{ bin.name }}</span>
                        <span class="detect-binary-item-ver">{{ bin.version ?? "?" }}</span>
                        <span class="detect-binary-item-path">{{ bin.path }}</span>
                      </SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </Select>
                <span
                  v-if="detectPending.has(r.agent.id)"
                  class="detect-row-spinner"
                  title="Probing…"
                ></span>
                <button
                  v-if="r.agent.compatibility"
                  type="button"
                  class="detect-compat-icon"
                  :class="{ active: openCompatId === r.agent.id }"
                  :style="{ color: compatibilityColor(r.agent) }"
                  :aria-label="`Compatibility details for ${r.agent.name}`"
                  @click.stop="toggleCompat(r.agent.id)"
                >
                  {{ compatibilityIcon(r.agent) }}
                </button>
                <details v-if="r.agent.installed && r.agent.update" class="detect-update-detail">
                  <summary :style="{ color: updateColor(r.agent.update) }">
                    {{ updateLabel(r.agent.update) }}
                  </summary>
                  <span class="detect-update-meta">
                    <span v-if="r.agent.update.source">{{ r.agent.update.source }}</span>
                    <span v-if="checkedLabel(r.agent.update)">{{
                      checkedLabel(r.agent.update)
                    }}</span>
                    <span v-if="r.agent.update.error" class="detect-update-reason">{{
                      r.agent.update.error
                    }}</span>
                    <button
                      v-if="r.agent.update.updateCommand"
                      class="detect-copy"
                      @click="copyHint(r.agent.update.updateCommand)"
                    >
                      {{
                        detectHintCopied === r.agent.update.updateCommand
                          ? "copied"
                          : "copy update command"
                      }}
                    </button>
                  </span>
                </details>
                <span v-if="r.status === 'auth'" class="detect-hint-inline">
                  <code
                    class="detect-hint-code"
                    :title="r.agent.authHint || 'sign in with the CLI'"
                    >{{ r.agent.authHint || "sign in with the CLI" }}</code
                  >
                  <button
                    v-if="r.agent.authHint"
                    class="detect-copy"
                    @click="copyHint(r.agent.authHint!)"
                  >
                    {{ detectHintCopied === r.agent.authHint ? "copied" : "copy" }}
                  </button>
                </span>
                <span v-else-if="r.status === 'desktop'" class="detect-hint-inline">
                  <code class="detect-hint-code" :title="r.agent.installHint">{{
                    r.agent.installHint
                  }}</code>
                  <button class="detect-copy" @click="copyHint(r.agent.installHint)">
                    {{ detectHintCopied === r.agent.installHint ? "copied" : "copy" }}
                  </button>
                </span>
                <span v-else-if="r.status === 'missing'" class="detect-hint-inline">
                  <code class="detect-hint-code" :title="r.agent.installHint">{{
                    r.agent.installHint
                  }}</code>
                  <button class="detect-copy" @click="copyHint(r.agent.installHint)">
                    {{ detectHintCopied === r.agent.installHint ? "copied" : "copy" }}
                  </button>
                </span>
                <span v-if="r.agent.deprecated" class="detect-migration-inline">
                  {{ r.agent.installHint }}
                  <a
                    v-if="r.agent.migrationUrl"
                    :href="r.agent.migrationUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Official migration and auth docs
                  </a>
                  <span v-if="r.agent.migrationNote">{{ r.agent.migrationNote }}</span>
                </span>
                <button
                  type="button"
                  class="detect-star-btn"
                  :class="{ on: isAgentFavorite(favoriteKey(r.agent)) }"
                  :aria-pressed="isAgentFavorite(favoriteKey(r.agent))"
                  :aria-label="
                    isAgentFavorite(favoriteKey(r.agent))
                      ? `Remove ${r.agent.name} from favorites`
                      : `Add ${r.agent.name} to favorites`
                  "
                  :title="
                    isAgentFavorite(favoriteKey(r.agent))
                      ? 'Remove from favorites'
                      : 'Add to favorites'
                  "
                  @click="toggleAgentFavorite(favoriteKey(r.agent))"
                >
                  <Star
                    class="size-3.5"
                    :fill="isAgentFavorite(favoriteKey(r.agent)) ? 'currentColor' : 'none'"
                  />
                </button>
              </div>
              <div
                v-if="r.agent.compatibility && openCompatId === r.agent.id"
                class="detect-compat-card"
              >
                <div
                  class="detect-compat-card-label"
                  :style="{ color: compatibilityColor(r.agent) }"
                >
                  {{ r.agent.compatibility.label }}
                </div>
                <div class="detect-compat-card-explanation">{{ compatibilityTitle(r.agent) }}</div>
                <div v-if="probeAvailable(r.agent)" class="detect-compat-probe-row">
                  <code class="detect-hint-code">{{ probeHint(r.agent) }}</code>
                  <button class="detect-copy" @click="copyHint(probeHint(r.agent))">
                    {{ detectHintCopied === probeHint(r.agent) ? "copied" : "copy" }}
                  </button>
                </div>
                <div
                  v-else-if="r.agent.compatibility.status === 'upgrade_recommended'"
                  class="detect-compat-card-hint"
                >
                  upgrade recommended
                </div>
                <div
                  v-else-if="r.agent.compatibility.status === 'unsupported'"
                  class="detect-compat-card-hint"
                >
                  use a supported release
                </div>
              </div>
            </div>
          </template>
        </div>

        <ModelPlaygroundPanel
          v-if="playgroundActivated"
          v-show="activeTab === 'playground'"
          :active="activeTab === 'playground'"
        />
        <ModelProvidersPanel v-if="providersActivated" v-show="activeTab === 'providers'" />
      </div>
    </template>
    <Dialog
      :open="!!skillsModalAgent"
      @update:open="
        (open) => {
          if (!open) skillsModalAgent = null;
        }
      "
    >
      <DialogOverlay />
      <DialogContent class="am-modal">
        <div class="am-modal-head">
          <DialogTitle>Skills for {{ skillsModalAgent?.name }}</DialogTitle
          ><DialogClose class="close-x">×</DialogClose>
        </div>
        <DialogDescription class="am-modal-desc"
          >Choose preferred candidates for this agent. RepoOS still selects only task-relevant
          skills on each run.</DialogDescription
        >
        <div v-if="skillsModalAgent" class="agent-skill-modal-list">
          <label
            v-for="skill in config.agentsMeta.skills"
            :key="skill.path"
            class="agent-skill-option"
          >
            <input
              type="checkbox"
              :checked="(skillsModalAgent.skills ?? []).includes(skill.name)"
              @change="
                toggleSkill(
                  skillsModalAgent!,
                  skill.name,
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />
            <span
              ><strong>{{ skill.name }}</strong
              ><small v-if="skill.description">{{ skill.description }}</small></span
            >
          </label>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
