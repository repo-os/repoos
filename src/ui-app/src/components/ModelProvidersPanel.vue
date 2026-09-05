<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { api, JSON_OPTS } from "../api";
import type {
  ModelProviderRow,
  ModelProvidersResponse,
  ModelProvidersKeyResponse,
  ModelProviderUsage,
  OpenCodeGoUsage,
  OpenRouterUsage,
} from "../types";
import Button from "./ui/button.vue";
import Card from "./ui/card.vue";

const rows = ref<ModelProviderRow[]>([]);
const loading = ref(false);
const loadError = ref("");

interface RowState {
  usage: ModelProviderUsage | null;
  loading: boolean;
  error: string;
}

const states = reactive<Record<string, RowState>>({});

// Inline key forms — one draft per live row, plus open/saving/error flags.
const drafts = reactive<Record<string, string>>({});
const saving = reactive<Record<string, boolean>>({});
const formOpen = reactive<Record<string, boolean>>({});
const keyErrors = reactive<Record<string, string>>({});

function rowState(id: string): RowState {
  if (!states[id]) states[id] = { usage: null, loading: false, error: "" };
  return states[id];
}

async function loadProviders(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    const res = await api<ModelProvidersResponse>("/api/model-providers");
    rows.value = res.providers;
    for (const row of res.providers) {
      if (row.kind === "live" && row.hasKey && !states[row.id]?.usage) {
        void loadUsage(row.id);
      }
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : "Could not load the provider list.";
  } finally {
    loading.value = false;
  }
}

async function loadUsage(id: string): Promise<void> {
  const state = rowState(id);
  if (state.loading) return;
  state.loading = true;
  state.error = "";
  try {
    state.usage = await api<ModelProviderUsage>(`/api/model-providers/${id}/usage`);
  } catch (err) {
    state.error = err instanceof Error ? err.message : "Could not load usage.";
  } finally {
    state.loading = false;
  }
}

async function saveKey(row: ModelProviderRow): Promise<void> {
  if (saving[row.id]) return;
  saving[row.id] = true;
  keyErrors[row.id] = "";
  try {
    const res = await api<ModelProvidersKeyResponse>(
      `/api/model-providers/${row.id}/key`,
      JSON_OPTS("POST", { key: drafts[row.id] ?? "" }),
    );
    row.hasKey = res.hasKey;
    drafts[row.id] = "";
    formOpen[row.id] = false;
    if (res.hasKey) void loadUsage(row.id);
    else rowState(row.id).usage = null;
  } catch (err) {
    keyErrors[row.id] = err instanceof Error ? err.message : "Could not save the key.";
  } finally {
    saving[row.id] = false;
  }
}

function clearKey(row: ModelProviderRow): void {
  drafts[row.id] = "";
  void saveKey(row);
}

function fmtUsd(v: number | null): string {
  if (v == null) return "—";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtResets(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isLive(id: string): boolean {
  return id === "openrouter" || id === "opencode-go";
}

const openrouterUsage = (u: ModelProviderUsage | null): OpenRouterUsage | null =>
  u?.kind === "openrouter" ? u : null;
const goUsage = (u: ModelProviderUsage | null): OpenCodeGoUsage | null =>
  u?.kind === "opencode-go" ? u : null;

onMounted(() => {
  void loadProviders();
});
</script>

<template>
  <Card class="mp-panel">
    <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
      <span class="live-dot"></span>Model providers
    </div>
    <div class="agent-desc">
      Spend and usage per model provider, without leaving RepoOS. Two providers report live numbers
      behind an API key; the rest link straight to their dashboard.
    </div>

    <div v-if="loadError" class="mp-error">{{ loadError }}</div>
    <div v-else-if="loading && !rows.length" class="agent-empty">Loading providers…</div>

    <div v-for="(row, i) in rows" :key="row.id" class="mp-row" :class="{ first: i === 0 }">
      <div class="mp-row-head">
        <div class="mp-row-title">
          <span class="agent-name">{{ row.label }}</span>
          <span class="mp-pill" :class="row.kind === 'live' ? 'pill-live' : 'pill-link'">
            {{ row.kind === "live" ? "live" : "dashboard only" }}
          </span>
        </div>
        <a class="mp-dash-link" :href="row.dashboardUrl" target="_blank" rel="noopener noreferrer">
          Open dashboard ↗
        </a>
      </div>
      <div class="mp-note">{{ row.note }}</div>

      <!-- Live rows: inline key form when no key is saved (or when replacing) -->
      <template v-if="isLive(row.id)">
        <div v-if="!row.hasKey || formOpen[row.id]" class="mp-key-form">
          <input
            v-model="drafts[row.id]"
            type="password"
            autocomplete="off"
            :placeholder="`Paste your ${row.label} API key`"
            :aria-label="`${row.label} API key`"
            @keyup.enter="saveKey(row)"
          />
          <Button variant="outline" size="sm" :disabled="saving[row.id]" @click="saveKey(row)">
            {{ saving[row.id] ? "Saving…" : "Save key" }}
          </Button>
          <Button
            v-if="row.hasKey"
            variant="ghost"
            size="sm"
            :disabled="saving[row.id]"
            @click="formOpen[row.id] = false"
          >
            Cancel
          </Button>
          <div class="mp-key-hint">
            Stored in <code>.env</code> on this machine (gitignored) — never committed, never
            logged.
          </div>
          <div v-if="keyErrors[row.id]" class="mp-error">{{ keyErrors[row.id] }}</div>
        </div>

        <template v-else>
          <div v-if="rowState(row.id).loading" class="mp-loading">Checking…</div>
          <div v-else-if="rowState(row.id).error" class="mp-error">
            {{ rowState(row.id).error }}
            <button class="mp-retry" @click="loadUsage(row.id)">Retry</button>
          </div>

          <!-- OpenRouter live figures -->
          <div v-else-if="openrouterUsage(rowState(row.id).usage)" class="mp-data">
            <template v-if="openrouterUsage(rowState(row.id).usage)!.credits">
              <div class="mp-stat mp-stat-hero">
                <span class="mp-stat-label">Remaining credits</span>
                <span class="mp-stat-value">{{
                  fmtUsd(openrouterUsage(rowState(row.id).usage)!.credits!.remaining)
                }}</span>
                <span
                  v-if="openrouterUsage(rowState(row.id).usage)!.credits!.totalCredits != null"
                  class="mp-stat-sub"
                >
                  of
                  {{ fmtUsd(openrouterUsage(rowState(row.id).usage)!.credits!.totalCredits) }}
                  purchased
                </span>
              </div>
            </template>
            <div v-if="openrouterUsage(rowState(row.id).usage)!.creditsError" class="mp-part-error">
              Balance unavailable: {{ openrouterUsage(rowState(row.id).usage)!.creditsError }}
            </div>
            <template v-if="openrouterUsage(rowState(row.id).usage)!.key">
              <div class="mp-stat-row">
                <div class="mp-stat">
                  <span class="mp-stat-label">Today</span>
                  <span class="mp-stat-value sm">{{
                    fmtUsd(openrouterUsage(rowState(row.id).usage)!.key!.usageDaily)
                  }}</span>
                </div>
                <div class="mp-stat">
                  <span class="mp-stat-label">This week</span>
                  <span class="mp-stat-value sm">{{
                    fmtUsd(openrouterUsage(rowState(row.id).usage)!.key!.usageWeekly)
                  }}</span>
                </div>
                <div class="mp-stat">
                  <span class="mp-stat-label">This month</span>
                  <span class="mp-stat-value sm">{{
                    fmtUsd(openrouterUsage(rowState(row.id).usage)!.key!.usageMonthly)
                  }}</span>
                </div>
                <div
                  v-if="openrouterUsage(rowState(row.id).usage)!.key!.rateLimit?.requests != null"
                  class="mp-stat"
                >
                  <span class="mp-stat-label">Rate limit</span>
                  <span class="mp-stat-value sm"
                    >{{ openrouterUsage(rowState(row.id).usage)!.key!.rateLimit!.requests }} req /
                    {{ openrouterUsage(rowState(row.id).usage)!.key!.rateLimit!.interval }}</span
                  >
                </div>
              </div>
            </template>
            <div v-if="openrouterUsage(rowState(row.id).usage)!.keyError" class="mp-part-error">
              Key usage unavailable: {{ openrouterUsage(rowState(row.id).usage)!.keyError }}
            </div>
          </div>

          <!-- opencode Go rolling windows -->
          <div v-else-if="goUsage(rowState(row.id).usage)" class="mp-data">
            <template v-if="goUsage(rowState(row.id).usage)!.windows.length">
              <div
                v-for="w in goUsage(rowState(row.id).usage)!.windows"
                :key="w.id"
                class="mp-window"
              >
                <div class="mp-window-head">
                  <span class="mp-stat-label">{{ w.label }}</span>
                  <span class="mp-window-pct">
                    {{ w.usedPct != null ? `${Math.round(w.usedPct)}% used` : "—" }}
                    <template v-if="w.usedUsd != null && w.limitUsd != null">
                      · {{ fmtUsd(w.usedUsd) }} of {{ fmtUsd(w.limitUsd) }}
                    </template>
                  </span>
                </div>
                <div
                  v-if="w.usedPct != null"
                  class="mp-bar"
                  role="progressbar"
                  :aria-valuenow="Math.round(w.usedPct)"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-label="`${w.label} usage`"
                >
                  <div
                    class="mp-bar-fill"
                    :style="{ width: `${Math.min(100, Math.max(0, w.usedPct))}%` }"
                  ></div>
                </div>
                <div v-if="fmtResets(w.resetsAt)" class="mp-window-reset">
                  resets {{ fmtResets(w.resetsAt) }}
                </div>
              </div>
            </template>
            <div v-else-if="goUsage(rowState(row.id).usage)!.unrecognized" class="mp-part-error">
              Live usage responded, but in a format this build doesn't recognize — check the
              <a :href="row.dashboardUrl" target="_blank" rel="noopener noreferrer">console</a>.
            </div>
            <div v-else class="mp-part-error">No usage reported yet.</div>
          </div>

          <div v-if="row.hasKey && !formOpen[row.id]" class="mp-actions">
            <Button
              variant="outline"
              size="sm"
              :disabled="rowState(row.id).loading"
              @click="loadUsage(row.id)"
            >
              {{ rowState(row.id).loading ? "Refreshing…" : "Refresh" }}
            </Button>
            <Button variant="ghost" size="sm" @click="formOpen[row.id] = true">Replace key</Button>
            <Button variant="ghost" size="sm" :disabled="saving[row.id]" @click="clearKey(row)">
              Clear
            </Button>
          </div>
        </template>
      </template>
    </div>
  </Card>
</template>

<style scoped>
/* Matches the tab Cards in AgentsView (padding: 0 18px 6px; margin-bottom: 16px). */
.mp-panel {
  padding: 0 18px 14px;
  margin-bottom: 16px;
}
.mp-row {
  padding: 14px 0 12px;
  border-top: 1px solid var(--border);
}
.mp-row.first {
  border-top: 0;
  padding-top: 6px;
}
.mp-row-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mp-row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.mp-pill {
  font:
    600 9px "JetBrains Mono",
    monospace;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--txt-dim);
  flex: none;
}
.mp-pill.pill-live {
  color: var(--green);
  border-color: color-mix(in srgb, var(--green) 35%, transparent);
}
.mp-dash-link {
  margin-left: auto;
  flex: none;
  font:
    500 10.5px "JetBrains Mono",
    monospace;
  color: var(--cyan);
  text-decoration: none;
}
.mp-dash-link:hover {
  text-decoration: underline;
}
.mp-note {
  font-size: 11px;
  color: var(--txt-dim);
  line-height: 1.5;
  margin-top: 2px;
}
.mp-key-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.mp-key-form input {
  flex: 1 1 220px;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel);
  color: var(--txt);
  font: 12px var(--font-sans);
  outline: 0;
  transition: 0.15s;
}
.mp-key-form input:focus {
  border-color: var(--border-bright);
}
.mp-key-hint {
  flex-basis: 100%;
  font-size: 10.5px;
  color: var(--txt-faint);
}
.mp-key-hint code,
.mp-error code {
  font:
    10px "JetBrains Mono",
    monospace;
}
.mp-data {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.mp-stat-hero {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--panel);
}
.mp-stat-hero .mp-stat-value {
  font-size: 20px;
}
.mp-stat-sub {
  font-size: 10.5px;
  color: var(--txt-faint);
}
.mp-stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.mp-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 11px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--panel);
  min-width: 90px;
}
.mp-stat-value {
  font:
    600 13px "JetBrains Mono",
    monospace;
  color: var(--txt);
}
.mp-stat-value.sm {
  font-size: 12.5px;
}
.mp-stat-label {
  font:
    500 9.5px "JetBrains Mono",
    monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--txt-faint);
}
.mp-window {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--panel);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mp-window-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.mp-window-pct {
  font:
    500 10.5px "JetBrains Mono",
    monospace;
  color: var(--txt-dim);
}
.mp-bar {
  height: 5px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}
.mp-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--cyan);
  transition: width 0.3s ease;
}
.mp-window-reset {
  font-size: 10px;
  color: var(--txt-faint);
}
.mp-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.mp-loading {
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--txt-dim);
}
.mp-error {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--red);
}
.mp-error .mp-retry {
  margin-left: 6px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--panel);
  color: var(--txt-dim);
  font: 500 10.5px var(--font-sans);
  cursor: pointer;
  padding: 2px 8px;
}
.mp-error .mp-retry:hover {
  color: var(--txt);
  border-color: var(--border-bright);
}
.mp-part-error {
  font-size: 11px;
  color: var(--amber);
}
.mp-part-error a {
  color: inherit;
}
@media (prefers-reduced-motion: reduce) {
  .mp-bar-fill {
    transition: none;
  }
}
</style>
