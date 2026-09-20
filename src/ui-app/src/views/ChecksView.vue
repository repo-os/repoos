<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../api";
import Button from "../components/ui/button.vue";
import Select from "../components/ui/select/root.vue";
import SelectContent from "../components/ui/select/content.vue";
import SelectItem from "../components/ui/select/item.vue";
import SelectTrigger from "../components/ui/select/trigger.vue";
import SelectValue from "../components/ui/select/value.vue";
import SelectViewport from "../components/ui/select/viewport.vue";
import type { CheckPlanStepView, CheckPlanView } from "../types";

const plan = ref<CheckPlanView | null>(null);
const loading = ref(true);
const error = ref("");
const profile = ref<string>("");
const changedRef = ref("");
const changedInput = ref("");
const openOutput = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  const params = new URLSearchParams();
  if (profile.value) params.set("profile", profile.value);
  if (changedRef.value) params.set("changed", changedRef.value);
  const qs = params.toString();
  try {
    const res = await api<{ ok: boolean; checkPlan: CheckPlanView }>(
      `/api/check-plan${qs ? `?${qs}` : ""}`,
    );
    plan.value = res.checkPlan;
    if (!profile.value) profile.value = res.checkPlan.profile;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not load the check plan.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function onProfile(value: string): void {
  profile.value = value;
  void load();
}

function applyChanged(): void {
  changedRef.value = changedInput.value.trim();
  void load();
}

function clearChanged(): void {
  changedRef.value = "";
  changedInput.value = "";
  void load();
}

const steps = computed(() => plan.value?.steps ?? []);
const selectedCount = computed(() => steps.value.filter((s) => s.selected).length);
const lastRun = computed(() => plan.value?.lastRun ?? null);

const SOURCE_LABEL: Record<CheckPlanView["source"], string> = {
  declared: "Declared in repoos.toml",
  legacy: "Legacy [check] keys — migrate with `repoos check --print-plan`",
  inferred: "Inferred from the repo layout — not committed",
  empty: "No plan configured",
};

function resultFor(name: string) {
  return lastRun.value?.results.find((r) => r.name === name) ?? null;
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function describe(s: CheckPlanStepView): string {
  const base = s.command ?? `kind: ${s.kind ?? "unknown"}`;
  return s.cwd ? `${base}  ·  cwd ${s.cwd}` : base;
}

const RESULT_ICON: Record<string, string> = {
  passed: "✔",
  failed: "✗",
  timeout: "✗",
  "missing-prereq": "✗",
  skipped: "⏭",
};
</script>

<template>
  <div class="ck-page">
    <header class="ck-head">
      <div>
        <h1 class="ck-title">Checks</h1>
        <p class="ck-sub">
          What <code>repoos check</code> runs for this repo, which profile selects what, and why a
          step is skipped. Nothing here runs a command — it reads the same plan the gate resolves.
        </p>
      </div>
      <div class="ck-actions">
        <a
          class="ck-help-link"
          href="https://docs.repoos.org/check"
          target="_blank"
          rel="noreferrer"
          >How checks work ↗</a
        >
        <a class="ck-help-link" href="/settings?tab=toml">Edit check plan</a>
        <Button variant="ghost" size="sm" :disabled="loading" @click="load">Refresh</Button>
      </div>
    </header>

    <div v-if="loading" class="ck-loading">Loading the check plan…</div>
    <p v-else-if="error" class="ck-err">{{ error }}</p>

    <template v-else-if="plan">
      <!-- Controls: which profile, and the changed-path fast mode. -->
      <section class="ck-controls">
        <label class="ck-control">
          <span class="ck-control-label">Profile</span>
          <Select :model-value="plan.profile" @update:model-value="onProfile">
            <SelectTrigger class="ck-select-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectViewport class="ck-select-viewport">
                <SelectItem v-for="p in plan.profiles" :key="p" :value="p">{{ p }}</SelectItem>
              </SelectViewport>
            </SelectContent>
          </Select>
        </label>

        <label class="ck-control ck-control-ref">
          <span class="ck-control-label">Changed-path fast mode</span>
          <div class="ck-ref-row">
            <input
              v-model="changedInput"
              class="ck-input"
              placeholder="git ref, e.g. main"
              spellcheck="false"
              @keyup.enter="applyChanged"
            />
            <Button variant="ghost" size="sm" @click="applyChanged">Compare</Button>
            <Button v-if="changedRef" variant="ghost" size="sm" @click="clearChanged">Clear</Button>
          </div>
        </label>
      </section>

      <!-- Plan-level facts: source, selection summary, warnings. -->
      <section class="ck-banner">
        <div class="ck-banner-facts">
          <a
            v-if="plan.source === 'declared'"
            class="ck-fact ck-fact-link"
            :data-source="plan.source"
            href="/settings?tab=toml"
            >{{ SOURCE_LABEL[plan.source] }}</a
          >
          <span v-else class="ck-fact" :data-source="plan.source">{{
            SOURCE_LABEL[plan.source]
          }}</span>
          <span class="ck-fact"
            >Profile <strong>{{ plan.profile }}</strong> · {{ selectedCount }} of
            {{ steps.length }} steps run</span
          >
          <span v-if="plan.changedRef" class="ck-fact ck-fact-changed">
            Changed vs <code>{{ plan.changedRef }}</code> ·
            {{ plan.changedPaths?.length ?? 0 }} path(s)
          </span>
        </div>
        <p v-for="w in plan.warnings" :key="w" class="ck-warn">⚠ {{ w }}</p>
        <p v-for="e in plan.errors" :key="e" class="ck-error-line">✗ {{ e }}</p>
      </section>

      <!-- Last run: the one fact a plan screen cannot show by resolving alone. -->
      <section v-if="lastRun" class="ck-lastrun" :data-passed="lastRun.passed">
        <div class="ck-lastrun-head">
          <span class="ck-lastrun-title">
            Last run {{ lastRun.passed ? "passed" : "failed" }}
          </span>
          <span class="ck-lastrun-meta">
            profile <strong>{{ lastRun.profile }}</strong> · {{ fmtDuration(lastRun.durationMs) }} ·
            {{ fmtTime(lastRun.finishedAt) }}
            <template v-if="lastRun.changedRef"> · changed vs {{ lastRun.changedRef }}</template>
          </span>
        </div>
      </section>
      <section v-else class="ck-lastrun ck-lastrun-empty">
        No recorded run yet — the last result appears here after <code>repoos check</code> runs.
      </section>

      <!-- The run sheet: steps in declaration order, because order matters. -->
      <ol class="ck-steps">
        <li
          v-for="(s, i) in steps"
          :key="s.name"
          class="ck-step"
          :data-selected="s.selected"
          :data-result="resultFor(s.name)?.status ?? 'none'"
        >
          <div class="ck-step-rail" aria-hidden="true">
            <span class="ck-step-num">{{ i + 1 }}</span>
          </div>

          <div class="ck-step-body">
            <div class="ck-step-top">
              <span class="ck-step-name">{{ s.name }}</span>
              <span v-if="!s.required" class="ck-badge ck-badge-advisory">advisory</span>
              <span v-if="s.crossCutting" class="ck-badge ck-badge-cross">runs on any change</span>
              <span v-for="p in s.profiles" :key="p" class="ck-badge ck-badge-profile">{{
                p
              }}</span>
            </div>

            <code class="ck-step-cmd">{{ describe(s) }}</code>

            <dl class="ck-step-meta">
              <div>
                <dt>Timeout</dt>
                <dd>{{ fmtDuration(s.timeoutMs) }}</dd>
              </div>
              <div v-if="s.requires.length">
                <dt>Requires</dt>
                <dd>
                  <code>{{ s.requires.join(", ") }}</code>
                </dd>
              </div>
              <div v-if="s.dependsOn.length">
                <dt>After</dt>
                <dd>
                  <code>{{ s.dependsOn.join(", ") }}</code>
                </dd>
              </div>
              <div v-if="s.whenChanged.length">
                <dt>When changed</dt>
                <dd>
                  <code>{{ s.whenChanged.join(", ") }}</code>
                </dd>
              </div>
              <div v-if="resultFor(s.name)">
                <dt>Last</dt>
                <dd :data-status="resultFor(s.name)!.status">
                  {{ RESULT_ICON[resultFor(s.name)!.status] ?? "•" }}
                  {{ resultFor(s.name)!.status }} · {{ fmtDuration(resultFor(s.name)!.durationMs) }}
                </dd>
              </div>
            </dl>

            <!-- Missing prerequisite: never a success, and always with the fix. -->
            <div v-if="s.missing.length" class="ck-missing" role="alert">
              <div v-for="m in s.missing" :key="m.tool" class="ck-missing-row">
                <strong>Missing prerequisite: {{ m.tool }}</strong>
                <span>{{ m.hint }}</span>
              </div>
            </div>

            <!-- Why this step will not run. -->
            <p v-if="s.skip" class="ck-skip">
              <span class="ck-skip-tag">Skipped ({{ s.skip.reason }})</span>{{ s.skip.detail }}
            </p>
            <p v-else class="ck-willrun">Will run for profile "{{ plan.profile }}".</p>

            <template v-if="resultFor(s.name)?.output">
              <button
                class="ck-output-toggle"
                type="button"
                @click="openOutput = openOutput === s.name ? null : s.name"
              >
                {{ openOutput === s.name ? "Hide" : "Show" }} last output
              </button>
              <pre v-if="openOutput === s.name" class="ck-output">{{
                resultFor(s.name)!.output
              }}</pre>
            </template>
          </div>
        </li>
      </ol>

      <p v-if="steps.length === 0" class="ck-err">
        This repo has no check plan. Declare <code>[[check.steps]]</code> in
        <code>repoos.toml</code> — run <code>repoos init</code> for a proposal, or
        <code>repoos check --print-plan</code> for a starting point.
      </p>
    </template>
  </div>
</template>

<style scoped>
.ck-page {
  max-width: 960px;
}
.ck-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 20px;
}
.ck-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.ck-help-link,
.ck-fact-link {
  color: var(--cyan);
  font-size: 12px;
  text-decoration: none;
}
.ck-help-link:hover,
.ck-fact-link:hover {
  text-decoration: underline;
}
.ck-fact-link {
  font-weight: inherit;
}
.ck-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
}
.ck-sub {
  color: var(--txt-dim);
  font-size: 13px;
  margin: 3px 0 0;
  max-width: 62ch;
  line-height: 1.5;
}
.ck-sub code {
  font-family: var(--mono);
  color: var(--txt);
}
.ck-loading,
.ck-err {
  color: var(--txt-dim);
  font-size: 13px;
  padding: 12px 0;
}
.ck-err {
  color: var(--red);
}
.ck-err code {
  font-family: var(--mono);
}

.ck-controls {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.ck-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 200px;
}
.ck-control-ref {
  flex: 1;
}
.ck-control-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--txt-dim);
}
.ck-select-trigger {
  width: 200px;
}
.ck-select-viewport {
  width: 100%;
}
.ck-ref-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.ck-input {
  flex: 1;
  min-width: 160px;
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--panel-solid);
  color: var(--txt);
  font-family: var(--mono);
  font-size: 12px;
}
.ck-input:focus-visible {
  outline: none;
  border-color: var(--border-bright);
}

.ck-banner {
  border: 1px solid var(--border);
  background: var(--panel-gradient);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.ck-banner-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.ck-fact {
  font-size: 12.5px;
  color: var(--txt-dim);
}
.ck-fact strong {
  color: var(--txt);
}
.ck-fact-changed code {
  font-family: var(--mono);
  color: var(--txt);
}
.ck-fact[data-source="declared"] {
  color: var(--green);
}
.ck-fact[data-source="inferred"],
.ck-fact[data-source="legacy"] {
  color: var(--amber);
}
.ck-fact[data-source="empty"] {
  color: var(--red);
}
.ck-warn {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: var(--amber);
  line-height: 1.5;
}
.ck-error-line {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: var(--red);
}

.ck-lastrun {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 18px;
  background: var(--panel);
}
.ck-lastrun[data-passed="true"] {
  border-color: var(--green-border-tint);
  background: var(--green-tint);
}
.ck-lastrun[data-passed="false"] {
  border-color: var(--red-border-tint);
  background: var(--red-tint);
}
.ck-lastrun-empty {
  color: var(--txt-dim);
  font-size: 12.5px;
}
.ck-lastrun-empty code {
  font-family: var(--mono);
  color: var(--txt);
}
.ck-lastrun-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  align-items: baseline;
}
.ck-lastrun-title {
  font-weight: 700;
  font-size: 13.5px;
}
.ck-lastrun-meta {
  font-size: 12px;
  color: var(--txt-dim);
}
.ck-lastrun-meta strong {
  color: var(--txt);
}

.ck-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ck-step {
  display: flex;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--panel-gradient);
  padding: 14px 16px 14px 12px;
}
.ck-step[data-selected="false"] {
  opacity: 0.62;
}
.ck-step-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ck-step-num {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid var(--border-bright);
  color: var(--txt-dim);
  font-size: 11.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}
.ck-step-body {
  flex: 1;
  min-width: 0;
}
.ck-step-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}
.ck-step-name {
  font-weight: 700;
  font-size: 14px;
}
.ck-badge {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--txt-dim);
}
.ck-badge-advisory {
  color: var(--amber);
  border-color: var(--amber-border-tint);
}
.ck-badge-cross {
  color: var(--cyan);
  border-color: var(--border-bright);
}
.ck-step-cmd {
  display: block;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--txt);
  background: var(--panel-solid);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 7px 10px;
  overflow-x: auto;
  white-space: pre;
}
.ck-step-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 9px 0 0;
  font-size: 12px;
}
.ck-step-meta > div {
  display: flex;
  gap: 6px;
}
.ck-step-meta dt {
  color: var(--txt-dim);
}
.ck-step-meta dd {
  margin: 0;
  color: var(--txt);
}
.ck-step-meta code {
  font-family: var(--mono);
}
.ck-step-meta dd[data-status="passed"] {
  color: var(--green);
}
.ck-step-meta dd[data-status="failed"],
.ck-step-meta dd[data-status="timeout"],
.ck-step-meta dd[data-status="missing-prereq"] {
  color: var(--red);
}

.ck-missing {
  margin-top: 10px;
  border: 1px solid var(--red-border-tint);
  background: var(--red-tint);
  border-radius: 10px;
  padding: 9px 11px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ck-missing-row {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  line-height: 1.45;
}
.ck-missing-row strong {
  color: var(--red);
}
.ck-missing-row span {
  color: var(--txt-dim);
}

.ck-skip,
.ck-willrun {
  margin: 9px 0 0;
  font-size: 12px;
  line-height: 1.5;
}
.ck-willrun {
  color: var(--green);
}
.ck-skip {
  color: var(--txt-dim);
}
.ck-skip-tag {
  color: var(--amber);
  margin-right: 6px;
}

.ck-output-toggle {
  margin-top: 8px;
  background: none;
  border: none;
  padding: 0;
  color: var(--cyan);
  font-size: 12px;
  cursor: pointer;
}
.ck-output {
  margin: 8px 0 0;
  max-height: 320px;
  overflow: auto;
  background: var(--panel-solid);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
