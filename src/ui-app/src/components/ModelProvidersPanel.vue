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
  DeepInfraUsage,
  CopilotUsage,
} from "../types";
import Button from "./ui/button.vue";

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
// GitHub Copilot also stores an optional billing scope (org/enterprise slug).
const drafts = reactive<Record<string, string>>({});
const scopeDrafts = reactive<Record<string, string>>({});
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
      if (row.scope && scopeDrafts[row.id] === undefined) scopeDrafts[row.id] = row.scope;
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
    const payload: Record<string, string> = { key: drafts[row.id] ?? "" };
    if (row.id === "github-copilot") payload.scope = scopeDrafts[row.id] ?? "";
    const res = await api<ModelProvidersKeyResponse>(
      `/api/model-providers/${row.id}/key`,
      JSON_OPTS("POST", payload),
    );
    row.hasKey = res.hasKey;
    if (res.scope !== undefined) {
      row.scope = res.scope;
      scopeDrafts[row.id] = res.scope;
    }
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

function fmtQty(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** DeepInfra "2026.10" → "Oct 2026". */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function deepInfraPeriod(period: string): string {
  const m = /^(\d{4})\.(\d{2})$/.exec(period);
  if (!m) return period;
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${m[1]}` : period;
}

function copilotScopeLabel(scope: { kind: string; slug: string | null }): string {
  if (scope.kind === "org") return `org ${scope.slug}`;
  if (scope.kind === "enterprise") return `enterprise ${scope.slug}`;
  return "personal plan";
}

function copilotTotalNet(u: CopilotUsage): number | null {
  if (!u.rows.length) return null;
  return u.rows.reduce((sum, r) => sum + (r.netAmount ?? 0), 0);
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

function isLive(row: ModelProviderRow): boolean {
  return row.kind === "live";
}

const openrouterUsage = (u: ModelProviderUsage | null): OpenRouterUsage | null =>
  u?.kind === "openrouter" ? u : null;
const goUsage = (u: ModelProviderUsage | null): OpenCodeGoUsage | null =>
  u?.kind === "opencode-go" ? u : null;
const deepinfraUsage = (u: ModelProviderUsage | null): DeepInfraUsage | null =>
  u?.kind === "deepinfra" ? u : null;
const copilotUsage = (u: ModelProviderUsage | null): CopilotUsage | null =>
  u?.kind === "github-copilot" ? u : null;

onMounted(() => {
  void loadProviders();
});
</script>

<template>
  <div class="mp-panel agent-tab-panel">
    <div class="sec-label" style="padding-top: 16px; margin-bottom: 4px">
      <span class="live-dot"></span>Model providers
    </div>
    <div class="agent-desc">
      Spend and usage per model provider, without leaving RepoOS. Four providers report live numbers
      behind an API key; the other rows link to dashboards until live data is connected here.
    </div>

    <div v-if="loadError" class="mp-error">{{ loadError }}</div>
    <div v-else-if="loading && !rows.length" class="agent-empty">Loading providers…</div>

    <div v-for="row in rows" :key="row.id" class="mp-row">
      <div class="mp-row-head">
        <div class="mp-row-title">
          <span class="agent-name">{{ row.label }}</span>
          <span class="mp-pill" :class="row.kind === 'live' ? 'pill-live' : 'pill-link'">
            {{ row.kind === "live" ? "live" : "no live data" }}
          </span>
        </div>
        <a class="mp-dash-link" :href="row.dashboardUrl" target="_blank" rel="noopener noreferrer">
          Open dashboard ↗
        </a>
      </div>
      <div class="mp-note">{{ row.note }}</div>

      <!-- Live rows: inline key form when no key is saved (or when replacing) -->
      <template v-if="isLive(row)">
        <div v-if="!row.hasKey || formOpen[row.id]" class="mp-key-form">
          <input
            v-model="drafts[row.id]"
            type="password"
            autocomplete="off"
            :placeholder="`Paste your ${row.label} API key`"
            :aria-label="`${row.label} API key`"
            @keyup.enter="saveKey(row)"
          />
          <input
            v-if="row.id === 'github-copilot'"
            v-model="scopeDrafts[row.id]"
            type="text"
            autocomplete="off"
            placeholder="org:my-org or enterprise:my-ent — empty for a personal plan"
            aria-label="Copilot billing scope"
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
            <template v-if="row.id === 'github-copilot'">
              A <strong>classic</strong> personal access token — GitHub's billing endpoints reject
              fine-grained ones. For a centrally billed plan, also set the scope above with a token
              from an org owner or enterprise billing manager.
            </template>
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

          <!-- DeepInfra: balance (sign-corrected), limit and monthly spend -->
          <div v-else-if="deepinfraUsage(rowState(row.id).usage)" class="mp-data">
            <template v-if="deepinfraUsage(rowState(row.id).usage)!.checklist">
              <div
                v-if="deepinfraUsage(rowState(row.id).usage)!.checklist!.suspended"
                class="mp-part-error"
              >
                {{
                  deepinfraUsage(rowState(row.id).usage)!.checklist!.suspendReason
                    ? `Account suspended (${deepinfraUsage(rowState(row.id).usage)!.checklist!.suspendReason}).`
                    : "Account suspended."
                }}
              </div>
              <div class="mp-stat mp-stat-hero">
                <span class="mp-stat-label">Available credit</span>
                <span class="mp-stat-value">{{
                  fmtUsd(deepinfraUsage(rowState(row.id).usage)!.checklist!.availableUsd)
                }}</span>
                <span
                  v-if="deepinfraUsage(rowState(row.id).usage)!.checklist!.owedUsd != null"
                  class="mp-stat-sub"
                >
                  plus {{ fmtUsd(deepinfraUsage(rowState(row.id).usage)!.checklist!.owedUsd) }} owed
                </span>
              </div>
              <div class="mp-stat-row">
                <div class="mp-stat">
                  <span class="mp-stat-label">Since last invoice</span>
                  <span class="mp-stat-value sm">{{
                    fmtUsd(deepinfraUsage(rowState(row.id).usage)!.checklist!.recentUsd)
                  }}</span>
                </div>
                <div
                  v-if="deepinfraUsage(rowState(row.id).usage)!.checklist!.limitUsd != null"
                  class="mp-stat"
                >
                  <span class="mp-stat-label">Spending limit</span>
                  <span class="mp-stat-value sm">{{
                    fmtUsd(deepinfraUsage(rowState(row.id).usage)!.checklist!.limitUsd)
                  }}</span>
                </div>
              </div>
              <div
                v-if="deepinfraUsage(rowState(row.id).usage)!.checklist!.scopedCredits.length"
                class="mp-stat-row"
              >
                <div
                  v-for="c in deepinfraUsage(rowState(row.id).usage)!.checklist!.scopedCredits"
                  :key="c.name"
                  class="mp-stat"
                >
                  <span class="mp-stat-label">{{ c.name }}</span>
                  <span class="mp-stat-value sm">{{ fmtUsd(c.remainingUsd) }} left</span>
                  <span v-if="c.expired" class="mp-stat-sub">expired</span>
                </div>
              </div>
            </template>
            <div
              v-if="deepinfraUsage(rowState(row.id).usage)!.checklistError"
              class="mp-part-error"
            >
              Balance unavailable: {{ deepinfraUsage(rowState(row.id).usage)!.checklistError }}
            </div>
            <div v-if="deepinfraUsage(rowState(row.id).usage)!.usage?.length" class="mp-stat-row">
              <div
                v-for="m in deepinfraUsage(rowState(row.id).usage)!.usage"
                :key="m.period"
                class="mp-stat"
              >
                <span class="mp-stat-label">{{ deepInfraPeriod(m.period) }}</span>
                <span class="mp-stat-value sm">{{ fmtUsd(m.totalUsd) }}</span>
              </div>
            </div>
            <div
              v-else-if="!deepinfraUsage(rowState(row.id).usage)!.usageError"
              class="mp-part-error"
            >
              No usage reported for this period.
            </div>
            <div v-if="deepinfraUsage(rowState(row.id).usage)!.usageError" class="mp-part-error">
              Usage unavailable: {{ deepinfraUsage(rowState(row.id).usage)!.usageError }}
            </div>
          </div>

          <!-- GitHub Copilot: billed AI-credit usage for the period -->
          <div v-else-if="copilotUsage(rowState(row.id).usage)" class="mp-data">
            <template v-if="!copilotUsage(rowState(row.id).usage)!.unrecognized">
              <div class="mp-stat mp-stat-hero">
                <span class="mp-stat-label">
                  Billed {{ copilotUsage(rowState(row.id).usage)!.periodLabel }} ·
                  {{ copilotScopeLabel(copilotUsage(rowState(row.id).usage)!.scope) }}
                </span>
                <span class="mp-stat-value">{{
                  fmtUsd(copilotTotalNet(copilotUsage(rowState(row.id).usage)!))
                }}</span>
                <span class="mp-stat-sub">amount billed — not remaining quota</span>
              </div>
              <div v-if="copilotUsage(rowState(row.id).usage)!.rows.length" class="mp-stat-row">
                <div
                  v-for="r in copilotUsage(rowState(row.id).usage)!.rows"
                  :key="`${r.sku}:${r.model ?? ''}`"
                  class="mp-stat"
                >
                  <span class="mp-stat-label">{{ r.model ? `${r.sku} · ${r.model}` : r.sku }}</span>
                  <span class="mp-stat-value sm">
                    {{ fmtQty(r.billedQuantity) }} {{ r.unitType ?? "units" }} billed
                  </span>
                  <span v-if="(r.includedQuantity ?? 0) > 0" class="mp-stat-sub">
                    + {{ fmtQty(r.includedQuantity) }} included
                  </span>
                </div>
              </div>
              <div v-else class="mp-part-error">
                No Copilot usage billed to this account for
                {{ copilotUsage(rowState(row.id).usage)!.periodLabel }}.
              </div>
            </template>
            <div v-else class="mp-part-error">
              Live usage responded, but in a format this build doesn't recognize — check the
              <a :href="row.dashboardUrl" target="_blank" rel="noopener noreferrer"
                >billing settings</a
              >.
            </div>
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
  </div>
</template>

<style scoped>
/* Matches the tab panels in AgentsView (padding: 0 18px 6px; margin-bottom: 16px). */
.mp-panel {
  padding: 0 18px 14px;
  margin-bottom: 16px;
}
/* Card treatment matches .agent-card / .detect-row (#0384 follow-up):
   own border + radius + surface fill, separated by margin between rows. */
.mp-row {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-solid);
}
.mp-row + .mp-row {
  margin-top: 12px;
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
