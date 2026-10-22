<script setup lang="ts">
/**
 * Agents → Model routing (#0792): provider, mode, roles, timeout, credential
 * presence, and a config probe (live test is optional and never auto-run).
 */
import { computed, onMounted, ref, watch } from "vue";
import { useConfigStore } from "../stores/config";
import { api, JSON_OPTS } from "../api";
import type {
  ModelRoutingDecisionsResponse,
  ModelRoutingLiveResultView,
  ModelRoutingStatusResponse,
  RoutingAnswerView,
  RoutingDecisionView,
} from "../types";
import Button from "./ui/button.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";
import Input from "./ui/input.vue";
import { relTime } from "../lib/time";
import { ROUTING_PROVIDER_CHOICES } from "../../../core/model-routing/config.js";
import { ROUTING_QUESTION_INSTRUCTIONS } from "../../../core/model-routing/policy.js";

const config = useConfigStore();

const ROUTING_MODES = [
  { value: "off", label: "Off — use configured agents (default)" },
  { value: "shadow", label: "Shadow — record recommendations only" },
  { value: "automatic", label: "Automatic — apply within budget limits" },
] as const;

// Jev and OpenRouter only (#0809). Clef-Flash is not offered: no option, no
// server address field, no server token field. Its adapter is retained.
const PROVIDERS = ROUTING_PROVIDER_CHOICES;

const ROLE_OPTIONS = [
  { id: "pm", label: "Product manager" },
  { id: "engineer", label: "Engineer" },
  { id: "reviewer", label: "Reviewer" },
] as const;

function cfgStr(key: string, fallback = ""): string {
  const v = config.data?.[key];
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function cfgRoles(): string[] {
  const v = config.data?.["model_routing.roles"];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return ["engineer", "reviewer", "pm"];
}

const mode = computed(() => cfgStr("model_routing.mode", "off"));
const provider = computed(() => cfgStr("model_routing.provider", "jev"));
const usesOpenRouterKey = computed(() => provider.value === "openrouter");
// Only Jev takes a key on this page; OpenRouter reuses the Model providers key.
const showsKeyForm = computed(() => provider.value === "jev");

const status = ref<ModelRoutingStatusResponse | null>(null);
const statusLoading = ref(false);
const decisions = ref<RoutingDecisionView[]>([]);
const decisionsLoading = ref(false);
const probeMessage = ref("");
/** Which probe is running: the config check, the live call, or none. */
const probeRunning = ref<"config" | "live" | null>(null);
/** The structured result of the last live call, rendered as a card. */
const liveResult = ref<ModelRoutingLiveResultView | null>(null);
/** The live card's details are collapsed to the summary by default (#0818). */
const liveExpanded = ref(false);
/** Decision ids whose details area is expanded (collapsed by default). */
const expanded = ref<Set<string>>(new Set());
const keyDraft = ref("");
const keySaving = ref(false);
const keyError = ref("");
const keyFormOpen = ref(false);

async function refreshStatus(): Promise<void> {
  statusLoading.value = true;
  try {
    status.value = await api<ModelRoutingStatusResponse>("/api/model-routing/status");
  } catch {
    status.value = null;
  } finally {
    statusLoading.value = false;
  }
}

async function refreshDecisions(): Promise<void> {
  decisionsLoading.value = true;
  try {
    const res = await api<ModelRoutingDecisionsResponse>("/api/model-routing/decisions?limit=10");
    decisions.value = res.decisions ?? [];
  } catch {
    decisions.value = [];
  } finally {
    decisionsLoading.value = false;
  }
}

function candLabel(c: RoutingDecisionView["actual"]): string {
  if (!c) return "—";
  return c.reasoning ? `${c.cli} · ${c.model} · ${c.reasoning}` : `${c.cli} · ${c.model}`;
}

function decisionStatus(d: RoutingDecisionView): string {
  if (d.kind === "pinned") return "Pinned";
  if (d.mode === "shadow") return "Shadow";
  if (d.applied) return "Applied";
  if (d.kind === "fallback") return "Fallback";
  if (d.kind === "blocked") return "Blocked";
  return "Recorded";
}

/** Human-readable relative age, e.g. "14 seconds ago" (#0818). */
function relativeTime(iso: string): string {
  return relTime(iso);
}

/** The exact local timestamp, shown in the styled tooltip on hover/focus. */
function fullTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

async function patch(partial: Record<string, unknown>): Promise<void> {
  await config.setConfigValues(partial);
  await refreshStatus();
}

async function setMode(v: string): Promise<void> {
  await patch({ "model_routing.mode": v });
}

async function setProvider(v: string): Promise<void> {
  await patch({ "model_routing.provider": v });
}

async function setModel(v: string): Promise<void> {
  await patch({ "model_routing.model": v.trim() });
}

async function setTimeoutMs(v: number): Promise<void> {
  await patch({ "model_routing.timeoutMs": v });
}

async function toggleRole(role: string, enabled: boolean): Promise<void> {
  const set = new Set(cfgRoles());
  if (enabled) set.add(role);
  else set.delete(role);
  if (set.size === 0) return;
  await patch({ "model_routing.roles": [...set] });
}

const humanStepCheck = computed(() => config.data?.["model_routing.humanStepCheck"] === true);
const humanStepSticky = computed(() => config.data?.["model_routing.humanStepSticky"] !== false);

async function setHumanStepCheck(enabled: boolean): Promise<void> {
  await patch({ "model_routing.humanStepCheck": enabled });
}

async function setHumanStepSticky(enabled: boolean): Promise<void> {
  await patch({ "model_routing.humanStepSticky": enabled });
}

async function runProbe(live: boolean): Promise<void> {
  if (probeRunning.value) return;
  probeRunning.value = live ? "live" : "config";
  if (live) {
    liveResult.value = null;
    liveExpanded.value = false;
  } else probeMessage.value = "";
  try {
    const res = await api<ModelRoutingStatusResponse>(
      "/api/model-routing/probe",
      JSON_OPTS("POST", { live }),
    );
    status.value = res;
    if (live) {
      liveResult.value = res.live ?? null;
    } else if (res.ok) {
      probeMessage.value = "Configuration and credential check passed (no live call).";
    } else {
      probeMessage.value = res.issues[0] ?? "Routing is not ready yet.";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Probe failed.";
    if (live) {
      liveResult.value = { ok: false, message, durationMs: 0 };
    } else {
      probeMessage.value = message;
    }
  } finally {
    probeRunning.value = null;
  }
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return `${s < 10 ? s.toFixed(2) : s.toFixed(1)} s`;
}

function usd(v: number): string {
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

/** A dollar cost when the provider reports one, else its token usage, else "". */
function usageText(
  u:
    | { inputTokens: number | null; outputTokens: number | null; costUsd?: number | null }
    | null
    | undefined,
): string {
  if (!u) return "";
  const parts: string[] = [];
  if (u.inputTokens != null) parts.push(`${u.inputTokens} in`);
  if (u.outputTokens != null) parts.push(`${u.outputTokens} out`);
  if (u.costUsd != null) {
    return parts.length ? `${usd(u.costUsd)} · ${parts.join(" · ")}` : usd(u.costUsd);
  }
  return parts.length ? `${parts.join(" · ")} tokens` : "";
}

/** "Cost" when the provider reports dollars; the token usage otherwise. */
function usageLabel(u: { costUsd?: number | null } | null | undefined): string {
  return u?.costUsd != null ? "Cost" : "Tokens";
}

/** The live probe's chosen candidate and its probability, for the summary (#0818). */
function liveChosen(
  live: ModelRoutingLiveResultView,
): { label: string; probability: number | null } | null {
  for (const a of live.answers ?? []) {
    if (!a.chosen) continue;
    const opt = a.options?.find((o) => o.label === a.chosen);
    return { label: a.chosen, probability: opt?.probability ?? a.probability ?? null };
  }
  return null;
}

/** The chosen candidate of the current live result, if the provider named one. */
const liveChosenCandidate = computed(() =>
  liveResult.value ? liveChosen(liveResult.value) : null,
);

/** A stable candidate key, matching the server's `candidateKey`. */
function candidateKeyOf(
  c: { cli: string; model: string; reasoning: string | null } | null,
): string | null {
  if (!c) return null;
  return `${c.cli}\u0000${c.model}\u0000${c.reasoning ?? ""}`;
}

function sameCandidate(
  a: { cli: string; model: string; reasoning: string | null } | null,
  b: { cli: string; model: string; reasoning: string | null } | null,
): boolean {
  const ka = candidateKeyOf(a);
  const kb = candidateKeyOf(b);
  return ka !== null && ka === kb;
}

/** Render a stored candidate key as "cli · model (· reasoning)". */
function parseCandidateKey(key: string): string {
  const [cli, model, reasoning] = key.split("\u0000");
  return reasoning ? `${cli} · ${model} · ${reasoning}` : `${cli} · ${model}`;
}

/** Plain words for a fallback reason — never styled as an error. */
function fallbackText(reason: string): string {
  switch (reason) {
    case "insufficient-evidence":
      return "The model was not confident enough, so the role default was used.";
    case "provider-failure":
      return "The decision model could not be reached, so the role default was used.";
    case "malformed-response":
      return "The decision model's answer could not be used, so the role default was used.";
    default:
      return `The role default was used (${reason}).`;
  }
}

/** The top probability, threshold, and confidence behind a fallback, when known. */
function fallbackDetail(d: RoutingDecisionView): string {
  const e = d.evidence;
  if (!e || d.fallbackReason !== "insufficient-evidence") return "";
  const bits = [`Top probability ${pct(e.topProbability)}`, `needs at least ${pct(e.threshold)}`];
  if (e.confidence != null) bits.push(`model confidence ${pct(e.confidence)}`);
  return `${bits.join(" · ")}.`;
}

interface DecisionAnswerDetail {
  id: string;
  question: string;
  chosenKey: string | null;
  options: Array<{ key: string; label: string; probability: number }>;
  probability: number | null;
}

/** The recorded question/answer pairs, for the expandable details area. */
function decisionAnswers(d: RoutingDecisionView): DecisionAnswerDetail[] {
  const answers = d.answers;
  if (!answers) return [];
  return Object.entries(answers).map(([id, a]) => {
    const base = {
      id,
      question: ROUTING_QUESTION_INSTRUCTIONS[id] ?? id,
      probability: a.type === "noul" ? a.probability : null,
    };
    if (a.type === "noul") {
      return { ...base, chosenKey: null, options: [] };
    }
    const options = Object.entries(a.probabilities)
      .map(([key, probability]) => ({ key, label: parseCandidateKey(key), probability }))
      .sort((x, y) => y.probability - x.probability);
    return {
      ...base,
      chosenKey: a.type === "choice" ? a.choice : null,
      options,
    };
  });
}

function hasDetails(d: RoutingDecisionView): boolean {
  return Boolean(d.brief) || Boolean(d.answers && Object.keys(d.answers).length);
}

function isExpanded(id: string): boolean {
  return expanded.value.has(id);
}

function toggleDetails(id: string): void {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

const keySaveLabel = computed(() => "Save key");

// A real placeholder so the empty masked field never looks broken (#0809).
const keyPlaceholder = computed(() => "Paste API key — stored in .env only");

function credentialStatusText(): string {
  if (statusLoading.value) return "Checking…";
  const label = status.value?.credentialLabel;
  if (label === "saved") return "Saved";
  if (label === "not_needed") return "Not needed";
  if (label === "not_set") return "Not set";
  return usesOpenRouterKey.value ? "Not set" : "—";
}

function providerReadyText(): string {
  if (mode.value === "off") return "—";
  if (status.value?.providerReady) return "Ready";
  return "Not ready";
}

async function saveKey(): Promise<void> {
  const id = status.value?.keyProviderId;
  if (!id || keySaving.value) return;
  keySaving.value = true;
  keyError.value = "";
  try {
    await api(`/api/model-providers/${id}/key`, JSON_OPTS("POST", { key: keyDraft.value }));
    keyDraft.value = "";
    keyFormOpen.value = false;
    await refreshStatus();
  } catch (err) {
    keyError.value = err instanceof Error ? err.message : "Could not save the key.";
  } finally {
    keySaving.value = false;
  }
}

watch(
  () => config.data,
  () => {
    void refreshStatus();
    void refreshDecisions();
  },
);

onMounted(() => {
  void refreshStatus();
  void refreshDecisions();
});
</script>

<template>
  <div
    class="agent-tab-panel model-routing-panel"
    style="padding: 0 18px 6px; margin-bottom: 16px"
    data-testid="model-routing-panel"
  >
    <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
      <span class="live-dot"></span>Model routing
    </div>
    <p class="agent-desc">
      An optional decision model (TypeSafe Jev or OpenRouter) can recommend which coding agent and
      model to use for PM, engineer, and reviewer runs. It is
      <strong>off by default</strong>. Shadow mode records what it would have chosen without
      changing the agent actually used. Automatic mode applies recommendations only within your
      budget allowlist — enable it after shadow looks good.
      <a
        class="model-pricing-link"
        href="/repo?doc=user-docs/configuration.md#adaptive-model-routing-model_routing"
        >Read the configuration guide</a
      >.
    </p>

    <div class="mr-grid">
      <label class="field">
        <span class="field-label">Mode</span>
        <Select :model-value="mode" @update:model-value="(v) => void setMode(String(v))">
          <SelectTrigger class="mr-select" data-testid="routing-mode">
            <SelectValue placeholder="Off" />
          </SelectTrigger>
          <SelectContent>
            <SelectViewport>
              <SelectItem v-for="m in ROUTING_MODES" :key="m.value" :value="m.value">
                {{ m.label }}
              </SelectItem>
            </SelectViewport>
          </SelectContent>
        </Select>
      </label>

      <label class="field">
        <span class="field-label">Decision provider</span>
        <Select :model-value="provider" @update:model-value="(v) => void setProvider(String(v))">
          <SelectTrigger class="mr-select" data-testid="routing-provider">
            <SelectValue placeholder="TypeSafe Jev" />
          </SelectTrigger>
          <SelectContent>
            <SelectViewport>
              <SelectItem v-for="p in PROVIDERS" :key="p.value" :value="p.value">
                {{ p.label }}
              </SelectItem>
            </SelectViewport>
          </SelectContent>
        </Select>
      </label>

      <label class="field">
        <span class="field-label">Model id</span>
        <Input
          :model-value="cfgStr('model_routing.model', 'jev-latest')"
          class="mr-input"
          data-testid="routing-model"
          @update:model-value="(v) => void setModel(String(v))"
        />
      </label>

      <label class="field">
        <span class="field-label">Decision timeout (ms)</span>
        <Input
          type="number"
          min="500"
          max="60000"
          :model-value="String(config.data?.['model_routing.timeoutMs'] ?? 8000)"
          class="mr-input mr-input-narrow"
          data-testid="routing-timeout"
          @update:model-value="(v) => void setTimeoutMs(Number(v) || 8000)"
        />
      </label>
    </div>

    <div class="mr-roles">
      <span class="field-label">Roles the router consults</span>
      <div class="mr-role-chips">
        <label v-for="r in ROLE_OPTIONS" :key="r.id" class="mr-role-chip">
          <input
            type="checkbox"
            :checked="cfgRoles().includes(r.id)"
            :data-testid="`routing-role-${r.id}`"
            @change="(e) => void toggleRole(r.id, (e.target as HTMLInputElement).checked)"
          />
          {{ r.label }}
        </label>
      </div>
    </div>

    <div class="mr-roles">
      <span class="field-label">Before a task starts</span>
      <label class="mr-role-chip" style="margin-top: 6px" data-test-id="routing-human-step-row">
        <input
          type="checkbox"
          :checked="humanStepCheck"
          data-testid="routing-human-step-check"
          @change="(e) => void setHumanStepCheck((e.target as HTMLInputElement).checked)"
        />
        Check for mixed AI and human steps, and suggest splitting the task
      </label>
      <p class="agent-desc" style="margin: 6px 0 0">
        Off by default. When the keyword scan matches, the model decides whether verification truly
        needs a human — the keyword alone never sets the flag. It only blocks a start when Mode is
        Automatic; in Shadow it records the verdict without blocking, and if the provider is
        unavailable or fails, the keyword check runs instead.
      </p>
      <label
        class="mr-role-chip"
        style="margin-top: 6px"
        data-test-id="routing-human-step-sticky-row"
      >
        <input
          type="checkbox"
          :checked="humanStepSticky"
          data-testid="routing-human-step-sticky"
          @change="(e) => void setHumanStepSticky((e.target as HTMLInputElement).checked)"
        />
        Remember cleared needs-human-step flags
      </label>
      <p class="agent-desc" style="margin: 6px 0 0">
        On by default. When you clear a needs-human-step flag, RepoOS records a fingerprint of the
        acceptance criteria so later edits do not re-flag until the criteria materially change.
      </p>
    </div>

    <p v-if="usesOpenRouterKey && mode !== 'off'" class="mr-openrouter-note" role="note">
      OpenRouter routing uses the same API key as the
      <router-link to="/agents?tab=model-providers" data-testid="routing-openrouter-link"
        >Model providers</router-link
      >
      tab — <strong>save the key there, not here</strong>. System One is only the request format, so
      there is no separate key field on this page.
    </p>

    <dl class="kv-rows mr-status" style="--kv-label-w: 10rem">
      <div>
        <dt>{{ usesOpenRouterKey ? "OpenRouter key" : "Jev key" }}</dt>
        <dd data-testid="routing-credential-status">
          <span
            class="mr-pill"
            :class="
              status?.credentialLabel === 'saved'
                ? 'mr-pill-ok'
                : status?.credentialLabel === 'not_needed'
                  ? 'mr-pill-muted'
                  : 'mr-pill-warn'
            "
          >
            {{ credentialStatusText() }}
          </span>
        </dd>
      </div>
      <div>
        <dt>Provider ready</dt>
        <dd data-testid="routing-provider-ready">
          {{ providerReadyText() }}
        </dd>
      </div>
    </dl>

    <div v-if="status?.issues?.length && mode !== 'off'" class="ff-notice mr-issues" role="status">
      <ul>
        <li v-for="(issue, i) in status.issues" :key="i">{{ issue }}</li>
      </ul>
    </div>

    <div v-if="showsKeyForm" class="mr-key-row">
      <button
        v-if="!keyFormOpen"
        type="button"
        class="btn btn-sm"
        data-testid="routing-key-toggle"
        @click="keyFormOpen = true"
      >
        {{ status?.credentialPresent ? "Replace API key" : "Paste API key" }}
      </button>
      <div v-else class="mr-key-form">
        <input
          v-model="keyDraft"
          type="password"
          autocomplete="off"
          aria-label="TypeSafe Jev API key"
          :placeholder="keyPlaceholder"
          data-testid="routing-key-input"
        />
        <Button
          variant="outline"
          size="sm"
          :disabled="keySaving"
          data-testid="routing-key-save"
          @click="saveKey"
        >
          {{ keySaving ? "Saving…" : keySaveLabel }}
        </Button>
        <Button variant="ghost" size="sm" @click="keyFormOpen = false">Cancel</Button>
        <div v-if="keyError" class="ff-error">{{ keyError }}</div>
      </div>
    </div>

    <div class="mr-fallback">
      <div class="field-label">Fallback policy</div>
      <p class="agent-desc">
        Pins always win. Candidates are filtered against the budget allowlist and harness
        availability before any provider call. On timeout, auth failure, or low-confidence answers,
        RepoOS uses the configured role default — it never widens permissions or picks a forbidden
        pair.
      </p>
    </div>

    <div class="btn-row mr-probe-row">
      <button
        type="button"
        class="btn"
        data-testid="routing-probe-config"
        :disabled="probeRunning !== null || config.saving"
        @click="runProbe(false)"
      >
        {{ probeRunning === "config" ? "Checking…" : "Test configuration" }}
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="routing-probe-live"
        :disabled="probeRunning !== null || config.saving || mode === 'off'"
        @click="runProbe(true)"
      >
        {{ probeRunning === "live" ? "Testing…" : "Test live connection" }}
      </button>
    </div>

    <div
      v-if="probeRunning === 'live'"
      class="mr-live-waiting"
      data-testid="routing-live-waiting"
      role="status"
      aria-live="polite"
    >
      <span class="mr-spinner" aria-hidden="true"></span>
      <span>Asking the decision model…</span>
    </div>

    <p
      v-if="probeMessage && probeRunning !== 'live'"
      class="mr-probe-msg"
      data-testid="routing-probe-message"
    >
      {{ probeMessage }}
    </p>

    <div
      v-if="liveResult"
      class="mr-live-card"
      :class="liveResult.ok ? 'mr-live-card-ok' : 'mr-live-card-fail'"
      data-testid="routing-live-card"
      role="status"
    >
      <div class="mr-live-head">
        <span
          class="mr-dec-pill"
          :class="liveResult.ok ? 'mr-dec-selected' : 'mr-live-fail-pill'"
          data-testid="routing-live-status"
        >
          {{ liveResult.ok ? "Success" : "Failed" }}
        </span>
        <span class="mr-live-title">
          {{ liveResult.ok ? "Live decision call" : "Live decision call failed" }}
        </span>
        <button
          type="button"
          class="mr-dec-toggle-btn mr-live-toggle"
          :aria-expanded="liveExpanded"
          data-testid="routing-live-toggle"
          @click="liveExpanded = !liveExpanded"
        >
          {{ liveExpanded ? "Hide details" : "Show details" }}
        </button>
      </div>
      <p class="mr-live-reason" data-testid="routing-live-reason">
        {{ liveResult.message }}
      </p>
      <p
        v-if="!liveResult.ok && liveResult.hint"
        class="mr-live-hint"
        data-testid="routing-live-hint"
      >
        {{ liveResult.hint }}
      </p>

      <dl class="kv-rows mr-live-facts" style="--kv-label-w: 9rem">
        <div v-if="liveResult.model">
          <dt>Model</dt>
          <dd data-testid="routing-live-model">{{ liveResult.model }}</dd>
        </div>
        <div v-if="usageText(liveResult.usage)">
          <dt>{{ usageLabel(liveResult.usage) }}</dt>
          <dd data-testid="routing-live-usage">{{ usageText(liveResult.usage) }}</dd>
        </div>
        <div v-if="liveChosenCandidate">
          <dt>Chosen</dt>
          <dd data-testid="routing-live-chosen">
            {{ liveChosenCandidate.label }}
            <span v-if="liveChosenCandidate.probability != null" class="mr-dec-conf">
              {{ pct(liveChosenCandidate.probability) }}
            </span>
          </dd>
        </div>
      </dl>

      <div v-if="liveExpanded" class="mr-live-details" data-testid="routing-live-details">
        <dl class="kv-rows mr-live-facts" style="--kv-label-w: 9rem">
          <div>
            <dt>Response time</dt>
            <dd data-testid="routing-live-time">{{ formatDuration(liveResult.durationMs) }}</dd>
          </div>
        </dl>

        <div v-if="liveResult.prompt" class="mr-live-block">
          <div class="mr-live-k">Question sent</div>
          <p class="mr-live-prompt" data-testid="routing-live-prompt">{{ liveResult.prompt }}</p>
        </div>

        <div v-if="liveResult.answers?.length" class="mr-live-block">
          <div class="mr-live-k">Answer received</div>
          <div
            v-for="a in liveResult.answers"
            :key="a.id"
            class="mr-live-answer"
            data-testid="routing-live-answer"
          >
            <div class="mr-live-q">{{ a.question }}</div>
            <ul v-if="a.options?.length" class="mr-live-opts">
              <li
                v-for="o in a.options"
                :key="o.key"
                :class="{ 'mr-live-opt-chosen': a.chosen === o.label }"
              >
                <span class="mr-live-opt-label">{{ o.label }}</span>
                <span class="mr-live-opt-pct">{{ pct(o.probability) }}</span>
              </li>
            </ul>
            <div v-else-if="a.probability != null" class="mr-live-noul">
              {{ pct(a.probability) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mr-decisions">
      <div class="field-label">Recent decisions</div>
      <p v-if="decisionsLoading" class="agent-desc">Loading…</p>
      <p v-else-if="!decisions.length" class="agent-desc">
        Nothing recorded yet. Decisions appear here once a run is routed in shadow or automatic
        mode.
      </p>
      <ul v-else class="mr-decision-list" data-testid="routing-decisions">
        <li v-for="d in decisions" :key="d.id" class="mr-decision">
          <div class="mr-decision-head">
            <span class="mr-decision-role">{{ d.role }}</span>
            <span class="mr-dec-pill" :class="`mr-dec-${d.kind}`">{{ decisionStatus(d) }}</span>
            <span v-if="d.taskId" class="mr-dec-task">#{{ d.taskId }}</span>
            <time
              class="mr-dec-time"
              :datetime="d.at"
              tabindex="0"
              :data-tip="fullTime(d.at)"
              :aria-label="`Recorded ${relativeTime(d.at)} — ${fullTime(d.at)}`"
              >{{ relativeTime(d.at) }}</time
            >
          </div>
          <div class="mr-decision-body">
            <span class="mr-dec-k">Chosen</span>
            <span class="mr-dec-v">
              {{ candLabel(d.actual) }}
              <span
                v-if="
                  d.kind === 'selected' &&
                  d.selectionProbability != null &&
                  sameCandidate(d.actual, d.selection)
                "
                class="mr-dec-conf"
                data-testid="routing-decision-confidence"
              >
                {{ pct(d.selectionProbability) }}
              </span>
            </span>

            <template
              v-if="
                d.recommendation &&
                (d.mode === 'shadow' || !sameCandidate(d.recommendation, d.actual))
              "
            >
              <span class="mr-dec-k">Recommended</span>
              <span class="mr-dec-v">
                {{ candLabel(d.recommendation) }}
                <span
                  v-if="
                    d.kind === 'selected' &&
                    d.selectionProbability != null &&
                    !sameCandidate(d.actual, d.selection)
                  "
                  class="mr-dec-conf"
                >
                  {{ pct(d.selectionProbability) }}
                </span>
              </span>
            </template>

            <span class="mr-dec-k">Response time</span>
            <span class="mr-dec-v" data-testid="routing-decision-time">
              {{ formatDuration(d.durationMs) }}
            </span>

            <template v-if="usageText(d.providerUsage)">
              <span class="mr-dec-k">{{ usageLabel(d.providerUsage) }}</span>
              <span class="mr-dec-v" data-testid="routing-decision-usage">
                {{ usageText(d.providerUsage) }}
              </span>
            </template>

            <template v-if="d.fallbackReason">
              <span class="mr-dec-k">Fallback</span>
              <span class="mr-dec-v mr-dec-fallback-note" data-testid="routing-decision-fallback">
                {{ fallbackText(d.fallbackReason) }}
                <span v-if="fallbackDetail(d)" class="mr-dec-fallback-detail">
                  {{ fallbackDetail(d) }}
                </span>
              </span>
            </template>

            <template v-if="d.kind === 'blocked'">
              <span class="mr-dec-k">Blocked</span>
              <span class="mr-dec-v">{{ d.message || d.blockReason }}</span>
            </template>

            <template v-if="d.handback">
              <span class="mr-dec-k">Handback</span>
              <span class="mr-dec-v">{{ d.handback.action }} — {{ d.handback.reason }}</span>
            </template>
          </div>

          <div v-if="hasDetails(d)" class="mr-dec-details-toggle">
            <button
              type="button"
              class="mr-dec-toggle-btn"
              :aria-expanded="isExpanded(d.id)"
              data-testid="routing-decision-details-toggle"
              @click="toggleDetails(d.id)"
            >
              {{ isExpanded(d.id) ? "Hide details" : "Show details" }}
            </button>
          </div>
          <div
            v-if="isExpanded(d.id)"
            class="mr-dec-details"
            data-testid="routing-decision-details"
          >
            <div v-if="d.brief" class="mr-dec-detail-block">
              <div class="mr-dec-detail-k">Question sent</div>
              <pre class="mr-dec-pre">{{ d.brief }}</pre>
            </div>
            <div v-if="decisionAnswers(d).length" class="mr-dec-detail-block">
              <div class="mr-dec-detail-k">Answer received</div>
              <div v-for="a in decisionAnswers(d)" :key="a.id" class="mr-dec-answer">
                <div class="mr-dec-q">{{ a.question }}</div>
                <ul v-if="a.options.length" class="mr-dec-opts">
                  <li
                    v-for="o in a.options"
                    :key="o.key"
                    :class="{ 'mr-dec-opt-chosen': o.key === a.chosenKey }"
                  >
                    <span class="mr-dec-opt-label">{{ o.label }}</span>
                    <span class="mr-dec-pct">{{ pct(o.probability) }}</span>
                  </li>
                </ul>
                <div v-else-if="a.probability != null" class="mr-dec-noul">
                  {{ pct(a.probability) }}
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.mr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px 16px;
  margin: 12px 0;
}
.mr-select {
  width: 100%;
}
.mr-input {
  width: 100%;
}
.mr-input-narrow {
  max-width: 140px;
}
.mr-roles {
  margin: 8px 0 14px;
}
.mr-role-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-top: 6px;
}
.mr-role-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.mr-status {
  margin: 12px 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-solid);
}
.mr-openrouter-note {
  font-size: 13px;
  color: var(--txt-dim);
  margin: 8px 0 0;
}
.mr-openrouter-note a {
  color: var(--accent);
}
.mr-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.mr-pill-ok {
  background: color-mix(in srgb, var(--green) 18%, transparent);
  color: var(--green);
}
.mr-pill-warn {
  background: color-mix(in srgb, var(--amber) 20%, transparent);
  color: var(--amber);
}
.mr-pill-muted {
  background: color-mix(in srgb, var(--txt-dim) 14%, transparent);
  color: var(--txt-dim);
}
.mr-issues ul {
  margin: 0;
  padding-left: 1.1rem;
}
.mr-key-row {
  margin: 10px 0;
}
.mr-key-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.mr-key-form input {
  flex: 1 1 200px;
  min-width: 180px;
}
.mr-fallback {
  margin: 16px 0 8px;
}
.mr-probe-row {
  margin-top: 8px;
}
.mr-probe-msg {
  font-size: 13px;
  color: var(--txt-dim);
  margin: 8px 0 0;
}
.mr-decisions {
  margin: 20px 0 4px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}
.mr-decision-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mr-decision {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--panel-solid);
}
.mr-decision-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.mr-decision-role {
  font-weight: 600;
  text-transform: capitalize;
}
.mr-dec-task {
  color: var(--txt-dim);
}
.mr-dec-time {
  margin-left: auto;
  color: var(--txt-dim);
  font-size: 11px;
}
.mr-dec-time:focus-visible {
  outline: 2px solid var(--border-bright);
  outline-offset: 2px;
  border-radius: 4px;
}
.mr-dec-pill {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background: color-mix(in srgb, var(--txt-dim) 16%, transparent);
  color: var(--txt-dim);
}
.mr-dec-selected {
  background: color-mix(in srgb, var(--green) 18%, transparent);
  color: var(--green);
}
.mr-dec-blocked {
  background: color-mix(in srgb, var(--amber) 20%, transparent);
  color: var(--amber);
}
.mr-dec-fallback {
  background: color-mix(in srgb, var(--txt-dim) 16%, transparent);
  color: var(--txt-dim);
}
.mr-decision-body {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 10px;
  margin-top: 6px;
  font-size: 12px;
}
.mr-dec-k {
  color: var(--txt-dim);
}
.mr-dec-v {
  overflow-wrap: anywhere;
}
.mr-dec-conf {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-foreground) 14%, transparent);
  color: var(--accent-foreground);
  font-size: 11px;
  font-weight: 600;
}
.mr-dec-fallback-note {
  color: var(--txt-dim);
}
.mr-dec-fallback-detail {
  color: var(--txt-faint);
}
.mr-dec-details-toggle {
  margin-top: 6px;
}
.mr-dec-toggle-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--accent-foreground);
  font-size: 12px;
  cursor: pointer;
}
.mr-dec-toggle-btn:hover {
  text-decoration: underline;
}
.mr-dec-details {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mr-dec-detail-k {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--txt-dim);
  margin-bottom: 4px;
}
.mr-dec-pre {
  margin: 0;
  padding: 8px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 240px;
  overflow: auto;
}
.mr-dec-q {
  font-size: 12px;
  font-weight: 600;
  color: var(--txt);
  margin-bottom: 3px;
}
.mr-dec-opts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mr-dec-opts li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--txt-dim);
  padding: 2px 6px;
  border-radius: 4px;
}
.mr-dec-opt-chosen {
  background: color-mix(in srgb, var(--green) 14%, transparent);
  color: var(--txt);
}
.mr-dec-pct {
  color: var(--txt-dim);
  font-variant-numeric: tabular-nums;
}
.mr-dec-noul {
  font-size: 12px;
  color: var(--txt-dim);
}
/* ── Live connection test ────────────────────────────────────────────── */
.mr-live-waiting {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--txt-dim);
}
.mr-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--accent-foreground) 30%, transparent);
  border-top-color: var(--accent-foreground);
  animation: mr-spin 0.7s linear infinite;
}
@keyframes mr-spin {
  to {
    transform: rotate(360deg);
  }
}
.mr-live-card {
  margin: 10px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-left-width: 3px;
  border-radius: 8px;
  background: var(--panel-solid);
}
.mr-live-card-ok {
  border-color: var(--green-border-tint);
  border-left-color: var(--green);
}
.mr-live-card-fail {
  border-color: var(--red-border-tint);
  border-left-color: var(--red);
}
.mr-live-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mr-live-fail-pill {
  background: color-mix(in srgb, var(--red) 18%, transparent);
  color: var(--red);
}
.mr-live-title {
  font-size: 13px;
  font-weight: 600;
}
.mr-live-toggle {
  margin-left: auto;
}
.mr-live-details {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}
.mr-live-reason {
  margin: 6px 0 0;
  font-size: 13px;
}
.mr-live-card-fail .mr-live-reason {
  color: var(--red);
}
.mr-live-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--txt-dim);
}
.mr-live-facts {
  margin: 10px 0 0;
}
.mr-live-block {
  margin-top: 12px;
}
.mr-live-k {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--txt-dim);
  margin-bottom: 4px;
}
.mr-live-prompt {
  margin: 0;
  font-size: 12px;
  color: var(--txt);
  overflow-wrap: anywhere;
}
.mr-live-answer + .mr-live-answer {
  margin-top: 8px;
}
.mr-live-q {
  font-size: 12px;
  color: var(--txt);
  margin-bottom: 3px;
}
.mr-live-opts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mr-live-opts li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--txt-dim);
  padding: 2px 6px;
  border-radius: 4px;
}
.mr-live-opt-chosen {
  background: color-mix(in srgb, var(--green) 14%, transparent);
  color: var(--txt);
}
.mr-live-opt-label {
  overflow-wrap: anywhere;
}
.mr-live-opt-pct {
  font-variant-numeric: tabular-nums;
}
.mr-live-noul {
  font-size: 12px;
  color: var(--txt-dim);
}
@media (prefers-reduced-motion: reduce) {
  .mr-spinner {
    animation: none;
  }
}
</style>
