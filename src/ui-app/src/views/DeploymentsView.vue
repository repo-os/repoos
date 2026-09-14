<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Button from "../components/ui/button.vue";
import { api, JSON_OPTS } from "../api";

interface DeploymentRow {
  name: string;
  branch: string;
  provider: string | null;
  url: string | null;
  dashboardUrl: string | null;
  subdir: string | null;
  lastPushAt: string | null;
  lastPushSha: string | null;
}

interface DeploymentBranch {
  branch: string;
  ahead: number | null;
  behind: number | null;
  hasOrigin: boolean;
  localExists: boolean;
  ffFrom: string | null;
}

interface DeploymentsStatus {
  enabled: boolean;
  rows: DeploymentRow[];
  branches: DeploymentBranch[];
  root: string | null;
  dirty: boolean;
  currentBranch: string | null;
}

const status = ref<DeploymentsStatus | null>(null);
const loading = ref(true);
const error = ref("");
const message = ref("");
/** Branch with a confirm dialog open, and the branch being pushed right now. */
const confirmBranch = ref<string | null>(null);
const deploying = ref<string | null>(null);
const deployError = ref("");
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | null = null;

const confirmOpen = computed(() => confirmBranch.value !== null);
const confirmTarget = computed(
  () => status.value?.branches.find((b) => b.branch === confirmBranch.value) ?? null,
);
const confirmServices = computed(
  () => status.value?.rows.filter((r) => r.branch === confirmBranch.value).map((r) => r.name) ?? [],
);
/** A stale remote view can break the push — say so in the modal up front. */
const confirmBehind = computed(() =>
  (confirmTarget.value?.behind ?? 0) > 0
    ? `origin/${confirmBranch.value} has ${confirmTarget.value?.behind} commit(s) this checkout hasn't fetched — the push will be refused if the histories diverged.`
    : "",
);
const confirmCmds = computed(() => {
  const b = confirmBranch.value;
  if (!b) return [];
  return confirmTarget.value?.ffFrom
    ? [`git fetch . ${confirmTarget.value.ffFrom}:${b}`, `git push origin ${b}`]
    : [`git push origin ${b}`];
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    status.value = await api<DeploymentsStatus>("/api/deployments");
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function openConfirm(branch: string): void {
  deployError.value = "";
  confirmBranch.value = branch;
}

function closeConfirm(): void {
  if (deploying.value !== null) return;
  confirmBranch.value = null;
}

function onConfirmKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && confirmOpen.value) closeConfirm();
}

async function deploy(): Promise<void> {
  const branch = confirmBranch.value;
  if (!branch || deploying.value) return;
  deploying.value = branch;
  deployError.value = "";
  try {
    const result = await api<{ ok: boolean; output: string }>(
      "/api/deployments/deploy",
      JSON_OPTS("POST", { branch }),
    );
    message.value = result.output;
    confirmBranch.value = null;
    await load();
  } catch (err) {
    deployError.value = err instanceof Error ? err.message : String(err);
  } finally {
    deploying.value = null;
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = now.value - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

onMounted(() => {
  void load();
  tick = setInterval(() => (now.value = Date.now()), 60_000);
  window.addEventListener("keydown", onConfirmKeydown);
});
onBeforeUnmount(() => {
  if (tick) clearInterval(tick);
  window.removeEventListener("keydown", onConfirmKeydown);
});
</script>

<template>
  <div class="dep-page">
    <header class="dep-head">
      <div>
        <h1 class="dep-title">Deployments</h1>
        <p class="dep-sub">
          Where this repo's services are live, and how far each branch is from being there.
        </p>
      </div>
      <Button variant="ghost" size="sm" :disabled="loading" @click="load">Refresh</Button>
    </header>

    <div v-if="loading" class="spin"></div>
    <p v-else-if="error && !status" class="dep-err">{{ error }}</p>

    <template v-else-if="status">
      <div v-if="!status.enabled" class="dep-panel dep-empty">
        Deployments aren't configured for this repository. Add a
        <code>[[deployments]]</code> block to <code>repoos.toml</code> — one per service and branch
        — to turn this page on.
      </div>

      <template v-else>
        <!-- Shared branch state, stated once per branch: pushing a branch
             deploys every service on it, so the action lives here, not on rows. -->
        <section class="dep-strip" aria-label="Branch deploy state">
          <article v-for="b in status.branches" :key="b.branch" class="dep-branch">
            <div class="dep-branch-top">
              <span class="dep-branch-name">{{ b.branch }}</span>
              <span
                v-if="b.ffFrom"
                class="dep-ff"
                :title="`Deploys fast-forward ${b.branch} to ${b.ffFrom} before pushing`"
              >
                ff from {{ b.ffFrom }}
              </span>
            </div>
            <div class="dep-branch-state">
              <template v-if="b.hasOrigin">
                <span
                  class="dep-ab"
                  :class="{ hot: (b.ahead ?? 0) > 0 }"
                  :data-kind="b.ahead === null ? 'unknown' : 'ahead'"
                >
                  ↑ {{ b.ahead ?? "—" }}
                </span>
                <span
                  class="dep-ab"
                  :class="{ hot: (b.behind ?? 0) > 0 }"
                  data-kind="behind"
                  :data-behind="(b.behind ?? 0) > 0"
                >
                  ↓ {{ b.behind ?? "—" }}
                </span>
                <span class="dep-vs">vs origin/{{ b.branch }}</span>
              </template>
              <span v-else class="dep-vs"
                >no <code>origin/{{ b.branch }}</code> yet</span
              >
            </div>
            <Button
              variant="accent"
              size="sm"
              :disabled="!b.localExists || !!status.dirty || deploying !== null"
              :title="status.dirty ? 'Commit or stash the checkout\'s changes first' : undefined"
              @click="openConfirm(b.branch)"
            >
              {{ deploying === b.branch ? "Deploying…" : `Deploy ${b.branch}` }}
            </Button>
          </article>
        </section>

        <p v-if="status.dirty" class="dep-dirty" role="status">
          The checkout has uncommitted changes — deploys are refused until it's committed or stashed
          (same guard as a release).
        </p>

        <!-- One card per configured (service, branch) row. -->
        <section class="dep-grid">
          <article v-for="row in status.rows" :key="row.name" class="dep-panel dep-row">
            <div class="dep-row-head">
              <span class="dep-name">{{ row.name }}</span>
              <span class="dep-pill">{{ row.branch }}</span>
            </div>
            <a
              v-if="row.url"
              class="dep-url"
              :href="row.url"
              target="_blank"
              rel="noreferrer"
              :title="`Open ${row.url}`"
              >{{ row.url.replace(/^https:\/\//, "") }}&nbsp;↗</a
            >
            <span v-else class="dep-nourl">no URL configured</span>
            <div class="dep-fresh" :title="row.lastPushAt ?? undefined">
              <template v-if="row.lastPushAt">
                last push {{ relativeTime(row.lastPushAt) }}
                <template v-if="row.lastPushSha">
                  · <code>{{ row.lastPushSha }}</code></template
                >
              </template>
              <template v-else>
                no commits yet<span v-if="row.subdir">
                  under <code>{{ row.subdir }}/</code></span
                >
                on <code>{{ row.branch }}</code>
              </template>
            </div>
            <div class="dep-row-foot">
              <span v-if="row.provider" class="dep-provider">{{ row.provider }}</span>
              <a
                v-if="row.dashboardUrl"
                class="dep-dash"
                :href="row.dashboardUrl"
                target="_blank"
                rel="noreferrer"
                >Dashboard ↗</a
              >
            </div>
          </article>
        </section>

        <p class="dep-note">
          “Last push” is the newest commit on the branch touching this service's directory — the
          push that tells the provider to build. It is not confirmed build success: a broken build
          still shows a fresh time while the site serves an older version.
        </p>

        <section v-if="message" class="dep-outcome dep-outcome--ok" aria-live="polite">
          {{ message }}
        </section>
        <section
          v-if="deployError && !confirmOpen"
          class="dep-outcome dep-outcome--fail"
          role="alert"
        >
          {{ deployError }}
        </section>
      </template>
    </template>

    <Teleport to="body">
      <div
        v-if="confirmOpen"
        class="dep-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dep-confirm-title"
        @click.self="closeConfirm"
      >
        <div class="dep-card">
          <div class="dep-modal-head">
            <h3 id="dep-confirm-title" class="dep-modal-title">Deploy {{ confirmBranch }}</h3>
            <button
              type="button"
              class="close-x"
              aria-label="Close"
              :disabled="deploying !== null"
              @click="closeConfirm"
            >
              ×
            </button>
          </div>
          <div class="dep-modal-body">
            <p class="dep-modal-desc">
              <template v-if="confirmTarget?.ffFrom">
                Fast-forwards <code>{{ confirmBranch }}</code> to
                <code>{{ confirmTarget.ffFrom }}</code
                >, then pushes to origin — your provider builds and deploys from the push.
              </template>
              <template v-else>
                Runs <code>git push origin {{ confirmBranch }}</code> — your provider builds and
                deploys from the push.
              </template>
              This is a real push to the shared remote. Non-fast-forward cases are refused; nothing
              is ever force-pushed.
            </p>

            <dl class="dep-facts">
              <div>
                <dt>Deploys</dt>
                <dd>{{ confirmServices.join(", ") || "—" }}</dd>
              </div>
              <div v-if="confirmTarget?.hasOrigin">
                <dt>Unpushed</dt>
                <dd>{{ confirmTarget.ahead ?? "—" }} commit(s) on {{ confirmBranch }}</dd>
              </div>
            </dl>

            <ul class="dep-cmds">
              <li v-for="c in confirmCmds" :key="c">
                <code>{{ c }}</code>
              </li>
            </ul>

            <p v-if="confirmBehind" class="dep-modal-warn">{{ confirmBehind }}</p>

            <div v-if="deployError" class="dep-modal-error" role="alert">
              <strong>{{ deployError }}</strong>
            </div>
          </div>
          <div class="dep-modal-actions">
            <Button variant="accent" :disabled="deploying !== null" @click="deploy">
              {{ deploying ? "Deploying…" : `Deploy ${confirmBranch}` }}
            </Button>
            <Button variant="ghost" :disabled="deploying !== null" @click="closeConfirm"
              >Cancel</Button
            >
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dep-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 22px;
}
.dep-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
}
.dep-sub {
  color: var(--txt-dim);
  font-size: 13px;
  margin: 3px 0 0;
}
.dep-error {
  color: var(--red);
  margin: 12px 0;
}

.dep-panel {
  border: 1px solid var(--border);
  background: var(--panel-gradient);
  border-radius: 14px;
  padding: 18px;
}

/* One card per distinct branch — pushes are shared state, so the deploy
   controls live here, once, not duplicated per service row. */
.dep-strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.dep-branch {
  border: 1px solid var(--border);
  background: var(--panel-gradient);
  border-radius: 14px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dep-branch-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dep-branch-name {
  font-family: var(--mono);
  font-weight: 700;
  font-size: 15px;
}
.dep-ff {
  font-size: 11px;
  color: var(--txt-faint);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 9px;
}
.dep-branch-state {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.dep-ab {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--txt-faint);
  padding: 2px 8px;
  border-radius: 8px;
}
.dep-ab.hot {
  color: var(--cyan);
  background: var(--cyan-dim);
  font-weight: 700;
}
.dep-ab[data-behind="true"].hot {
  color: var(--amber);
  background: var(--amber-tint);
}
.dep-vs {
  color: var(--txt-faint);
  font-size: 11.5px;
}
.dep-vs code {
  font-family: var(--mono);
}
.dep-branch .p-button,
.dep-branch button {
  align-self: flex-start;
}

.dep-dirty {
  border: 1px solid var(--amber-border-tint);
  background: var(--amber-tint);
  color: var(--amber);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  margin: 0 0 16px;
}

.dep-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}
.dep-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dep-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dep-name {
  font-size: 14px;
  font-weight: 700;
}
.dep-pill {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--cyan);
  background: var(--cyan-dim);
  border-radius: 999px;
  padding: 2px 9px;
  flex-shrink: 0;
}
/* The URL is the point of the page: the row's one big, obvious link. */
.dep-url {
  font-family: var(--mono);
  font-size: 13.5px;
  color: var(--cyan);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.dep-url:hover {
  text-decoration: underline;
}
.dep-nourl {
  color: var(--txt-faint);
  font-size: 13px;
  font-style: italic;
}
.dep-fresh {
  color: var(--txt-faint);
  font-size: 12px;
}
.dep-fresh code {
  font-family: var(--mono);
  color: var(--txt-dim);
}
.dep-row-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
}
.dep-provider {
  color: var(--txt-faint);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.02em;
}
.dep-dash {
  color: var(--txt-dim);
  font-size: 12px;
  text-decoration: none;
}
.dep-dash:hover {
  text-decoration: underline;
  color: var(--cyan);
}

.dep-note {
  color: var(--txt-faint);
  font-size: 12px;
  line-height: 1.55;
  margin: 14px 2px 0;
  max-width: 72ch;
}

.dep-empty {
  color: var(--txt-faint);
}
.dep-empty code {
  font-family: var(--mono);
  color: var(--txt-dim);
}

.dep-outcome {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 13.5px;
  white-space: pre-wrap;
}
.dep-outcome--ok {
  border-color: var(--green-border-tint);
  background: var(--green-tint);
  color: var(--green);
}
.dep-outcome--fail {
  border-color: var(--red-border-tint);
  background: var(--red-tint);
  color: var(--red);
}

@media (max-width: 640px) {
  .dep-strip,
  .dep-grid {
    grid-template-columns: 1fr;
  }
}
</style>
