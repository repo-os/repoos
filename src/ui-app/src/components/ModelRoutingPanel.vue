<script setup lang="ts">
/**
 * Agents → Model routing (#0792): provider, mode, roles, timeout, credential
 * presence, and a config probe (live test is optional and never auto-run).
 */
import { computed, onMounted, ref, watch } from "vue";
import { useConfigStore } from "../stores/config";
import { api, JSON_OPTS } from "../api";
import type { ModelRoutingStatusResponse } from "../types";
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
  { value: "openrouter", label: "OpenRouter (System One)" },
  { value: "clef-flash", label: "Clef-Flash (self-hosted)" },
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
const credentialEnv = computed(() => {
  const custom = cfgStr("model_routing.credentialEnv");
  if (custom) return custom;
  if (provider.value === "openrouter") return "REPOOS_OPENROUTER_API_KEY";
  if (provider.value === "clef-flash") return "REPOOS_CLEF_FLASH_API_KEY";
  return "TYPESAFE_API_KEY";
});

const status = ref<ModelRoutingStatusResponse | null>(null);
const statusLoading = ref(false);
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

async function setCredentialEnv(v: string): Promise<void> {
  await patch({ "model_routing.credentialEnv": v.trim() });
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

async function saveKey(): Promise<void> {
  if (keySaving.value) return;
  keySaving.value = true;
  keyError.value = "";
  try {
    await api("/api/model-routing/key", JSON_OPTS("POST", { key: keyDraft.value }));
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
  },
);

onMounted(() => {
  void refreshStatus();
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
      <a class="model-pricing-link" href="/repo?doc=user-docs/configuration.md#adaptive-model-routing-model_routing"
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
      </label>

      <label class="field">
        <span class="field-label">API key variable</span>
        <Input
          :model-value="cfgStr('model_routing.credentialEnv', credentialEnv)"
          class="mr-input"
          data-testid="routing-credential-env"
          @update:model-value="(v) => void setCredentialEnv(String(v))"
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

    <dl class="kv-rows mr-status" style="--kv-label-w: 10rem">
      <div>
        <dt>Credential</dt>
        <dd data-testid="routing-credential-status">
          <span
            class="mr-pill"
            :class="status?.credentialPresent ? 'mr-pill-ok' : 'mr-pill-warn'"
          >
            {{ statusLoading ? "Checking…" : status?.credentialPresent ? "Set" : "Not set" }}
          </span>
          <code class="mr-env-name">{{ credentialEnv }}</code>
        </dd>
      </div>
      <div>
        <dt>Provider ready</dt>
        <dd data-testid="routing-provider-ready">
          {{ status?.providerReady ? "Yes" : mode === "off" ? "—" : "Not yet" }}
        </dd>
      </div>
    </dl>

    <div v-if="status?.issues?.length && mode !== 'off'" class="ff-notice mr-issues" role="status">
      <ul>
        <li v-for="(issue, i) in status.issues" :key="i">{{ issue }}</li>
      </ul>
    </div>

    <div class="mr-key-row">
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
          :aria-label="`API key for ${credentialEnv}`"
          placeholder="Paste key — stored in .env only"
        />
        <Button variant="outline" size="sm" :disabled="keySaving" @click="saveKey">
          {{ keySaving ? "Saving…" : "Save key" }}
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
.mr-env-name {
  margin-left: 8px;
  font-size: 12px;
  color: var(--txt-dim);
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
</style>
