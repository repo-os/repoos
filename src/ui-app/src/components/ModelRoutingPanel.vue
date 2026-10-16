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
  ModelRoutingStatusResponse,
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

const config = useConfigStore();

const ROUTING_MODES = [
  { value: "off", label: "Off — use configured agents (default)" },
  { value: "shadow", label: "Shadow — record recommendations only" },
  { value: "automatic", label: "Automatic — apply within budget limits" },
] as const;

const PROVIDERS = [
  { value: "jev", label: "TypeSafe Jev (direct)" },
  { value: "openrouter", label: "OpenRouter (Jev and Clef models)" },
  { value: "clef-flash", label: "Clef-Flash (your own server)" },
] as const;

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
const showClefUrl = computed(() => provider.value === "clef-flash");
const usesOpenRouterKey = computed(() => provider.value === "openrouter");
const showsKeyForm = computed(() => provider.value === "jev" || provider.value === "clef-flash");

const status = ref<ModelRoutingStatusResponse | null>(null);
const statusLoading = ref(false);
const decisions = ref<RoutingDecisionView[]>([]);
const decisionsLoading = ref(false);
const probeMessage = ref("");
const probing = ref(false);
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

function shortTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString();
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

async function setBaseUrl(v: string): Promise<void> {
  await patch({ "model_routing.baseUrl": v.trim() });
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

async function setHumanStepCheck(enabled: boolean): Promise<void> {
  await patch({ "model_routing.humanStepCheck": enabled });
}

async function runProbe(live: boolean): Promise<void> {
  if (probing.value) return;
  probing.value = true;
  probeMessage.value = "";
  try {
    const res = await api<ModelRoutingStatusResponse & { live?: { ok: boolean; message: string } }>(
      "/api/model-routing/probe",
      JSON_OPTS("POST", { live }),
    );
    status.value = res;
    if (res.live) {
      probeMessage.value = res.live.message;
    } else if (res.ok) {
      probeMessage.value = live
        ? "Configuration looks ready."
        : "Configuration and credential check passed (no live call).";
    } else {
      probeMessage.value = res.issues[0] ?? "Routing is not ready yet.";
    }
  } catch (err) {
    probeMessage.value = err instanceof Error ? err.message : "Probe failed.";
  } finally {
    probing.value = false;
  }
}

const keySaveLabel = computed(() => {
  if (provider.value === "clef-flash") return "Save token";
  return "Save key";
});

const keyPlaceholder = computed(() => {
  if (provider.value === "clef-flash") {
    return "Optional bearer token — stored in .env only";
  }
  return "Paste API key — stored in .env only";
});

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
      An optional decision model (Jev, OpenRouter, or self-hosted Clef-Flash) can recommend which
      coding agent and model to use for PM, engineer, and reviewer runs. It is
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

      <label v-if="showClefUrl" class="field">
        <span class="field-label">Clef-Flash server URL</span>
        <Input
          :model-value="cfgStr('model_routing.baseUrl')"
          class="mr-input"
          placeholder="http://localhost:30000"
          data-testid="routing-base-url"
          @update:model-value="(v) => void setBaseUrl(String(v))"
        />
        <span class="mr-field-hint">Self-hosted SGLang — not a Cloudflare API key.</span>
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
      <label class="mr-role-chip" style="margin-top: 6px">
        <input
          type="checkbox"
          :checked="humanStepCheck"
          data-testid="routing-human-step-check"
          @change="(e) => void setHumanStepCheck((e.target as HTMLInputElement).checked)"
        />
        Ask the decision model whether the task needs a human-only step
      </label>
      <p class="agent-desc" style="margin: 6px 0 0">
        Off by default. Uses the provider above. It only blocks a start when Mode is Automatic; in
        Shadow it records the verdict without blocking, and if the provider is unavailable or fails,
        the existing keyword check runs instead.
      </p>
    </div>

    <p v-if="usesOpenRouterKey && mode !== 'off'" class="mr-openrouter-note" role="note">
      OpenRouter routing uses the same API key as the
      <router-link to="/agents?tab=model-providers">Model providers</router-link> tab. System One is
      only the request format — you do not need a second key here.
    </p>

    <dl class="kv-rows mr-status" style="--kv-label-w: 10rem">
      <div>
        <dt>
          {{
            usesOpenRouterKey
              ? "OpenRouter key"
              : provider === "clef-flash"
                ? "Server token"
                : "Jev key"
          }}
        </dt>
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
        {{
          status?.credentialPresent
            ? provider === "clef-flash"
              ? "Replace token"
              : "Replace API key"
            : provider === "clef-flash"
              ? "Add optional token"
              : "Paste API key"
        }}
      </button>
      <div v-else class="mr-key-form">
        <input
          v-model="keyDraft"
          type="password"
          autocomplete="off"
          :aria-label="
            provider === 'clef-flash' ? 'Clef-Flash bearer token' : 'TypeSafe Jev API key'
          "
          :placeholder="keyPlaceholder"
        />
        <Button variant="outline" size="sm" :disabled="keySaving" @click="saveKey">
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
        :disabled="probing || config.saving"
        @click="runProbe(false)"
      >
        {{ probing ? "Checking…" : "Test configuration" }}
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="routing-probe-live"
        :disabled="probing || config.saving || mode === 'off'"
        @click="runProbe(true)"
      >
        Test live connection
      </button>
    </div>
    <p v-if="probeMessage" class="mr-probe-msg" data-testid="routing-probe-message">
      {{ probeMessage }}
    </p>

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
            <time class="mr-dec-time">{{ shortTime(d.at) }}</time>
          </div>
          <div class="mr-decision-body">
            <span class="mr-dec-k">Chosen</span>
            <span class="mr-dec-v">{{ candLabel(d.actual) }}</span>
            <template v-if="d.mode === 'shadow' && d.recommendation">
              <span class="mr-dec-k">Recommended</span>
              <span class="mr-dec-v">{{ candLabel(d.recommendation) }}</span>
            </template>
            <template v-if="d.fallbackReason">
              <span class="mr-dec-k">Fallback</span>
              <span class="mr-dec-v">{{ d.fallbackReason }}</span>
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
.mr-field-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--txt-dim);
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
  background: color-mix(in srgb, var(--amber) 16%, transparent);
  color: var(--amber);
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
</style>
