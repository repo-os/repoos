<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Button from "../components/ui/button.vue";
import { api, JSON_OPTS } from "../api";

interface DeploymentRow {
  name: string;
  service: string;
  branch: string;
  provider: string | null;
  url: string | null;
  dashboardUrl: string | null;
  subdir: string | null;
  lastPushAt: string | null;
  lastPushSha: string | null;
}

interface DeploymentMainSync {
  state: "same" | "behind" | "ahead" | "diverged" | "unknown";
  aheadOfMain: number;
  behindMain: number;
}

interface DeploymentBranch {
  branch: string;
  ahead: number | null;
  behind: number | null;
  hasOrigin: boolean;
  localExists: boolean;
  ffFrom: string | null;
  mainSync: DeploymentMainSync;
}

interface DeploymentsStatus {
  enabled: boolean;
  rows: DeploymentRow[];
  branches: DeploymentBranch[];
  root: string | null;
  dirty: boolean;
  currentBranch: string | null;
}

/** One row of the services × branches matrix: a service and its cell per branch. */
interface ServiceGroup {
  name: string;
  provider: string | null;
  cells: Map<string, DeploymentRow>;
}

/** Cycled per branch column — distinct, theme-aware accent tokens (#0365). */
const ACCENT_VARS = ["--cyan", "--violet", "--amber", "--green"];

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

/** Services grouped across branches, in first-appearance order (#0365). */
const services = computed<ServiceGroup[]>(() => {
  const order: string[] = [];
  const byName = new Map<string, ServiceGroup>();
  for (const row of status.value?.rows ?? []) {
    let group = byName.get(row.service);
    if (!group) {
      group = { name: row.service, provider: row.provider, cells: new Map() };
      byName.set(row.service, group);
      order.push(row.service);
    }
    group.cells.set(row.branch, row);
  }
  return order.map((name) => byName.get(name)!);
});

function branchAccent(index: number): Record<string, string> {
  const token = ACCENT_VARS[index % ACCENT_VARS.length];
  return { "--accent": `var(${token})` };
}

function targetCount(branch: string): number {
  return status.value?.rows.filter((r) => r.branch === branch).length ?? 0;
}

const PLURAL = (n: number): string => (n === 1 ? "commit" : "commits");

/** Headline sync text for a branch card (#0365) — replaces the raw ↑/↓ chips. */
function mainSyncLabel(b: DeploymentBranch): string {
  if (!b.hasOrigin) return `no origin/${b.branch} yet`;
  const sync = b.mainSync;
  switch (sync.state) {
    case "same":
      return "up to date with main";
    case "behind":
      return `${sync.behindMain} ${PLURAL(sync.behindMain)} behind main`;
    case "ahead":
      return `${sync.aheadOfMain} ${PLURAL(sync.aheadOfMain)} ahead of main`;
    case "diverged":
      return `diverged from main (${sync.aheadOfMain} ahead, ${sync.behindMain} behind)`;
    default:
      return "sync with main unknown";
  }
}

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
          Where this repo's services are live, and how far each is from what's on your local
          <code>main</code>.
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
        <section class="dep-branches" aria-label="Branch deploy state">
          <article
            v-for="(b, i) in status.branches"
            :key="b.branch"
            class="dep-branch"
            :style="branchAccent(i)"
          >
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
            <div class="dep-branch-meta">
              {{ targetCount(b.branch) }} deployment target{{
                targetCount(b.branch) === 1 ? "" : "s"
              }}
            </div>
            <div class="dep-branch-sync">
              <span class="dep-sync" :data-state="b.hasOrigin ? b.mainSync.state : 'unknown'">{{
                mainSyncLabel(b)
              }}</span>
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

        <!-- Services × branches matrix: one row per service, one column per branch. -->
        <section class="dep-matrix" role="table" aria-label="Deployment targets">
          <div class="dep-matrix-row dep-matrix-head" role="row">
            <div role="columnheader">Service</div>
            <div
              v-for="(b, i) in status.branches"
              :key="b.branch"
              class="dep-matrix-colhead"
              :style="branchAccent(i)"
              role="columnheader"
            >
              <span class="dep-dot"></span>{{ b.branch }}
            </div>
          </div>

          <div v-for="svc in services" :key="svc.name" class="dep-matrix-row" role="row">
            <div class="dep-service" role="rowheader">
              <div class="dep-service-name">{{ svc.name }}</div>
              <div v-if="svc.provider" class="dep-service-type">{{ svc.provider }}</div>
            </div>

            <div
              v-for="(b, i) in status.branches"
              :key="b.branch"
              class="dep-cell"
              :style="branchAccent(i)"
              role="cell"
            >
              <span class="dep-cellbar"></span>
              <template v-if="svc.cells.get(b.branch)">
                <div class="dep-cell-top">
                  <a
                    v-if="svc.cells.get(b.branch)!.url"
                    class="dep-url"
                    :href="svc.cells.get(b.branch)!.url!"
                    target="_blank"
                    rel="noreferrer"
                    :title="`Open ${svc.cells.get(b.branch)!.url}`"
                    >{{ svc.cells.get(b.branch)!.url!.replace(/^https:\/\//, "") }}&nbsp;↗</a
                  >
                  <span v-else class="dep-nourl">no URL configured</span>
                </div>
                <div class="dep-fresh" :title="svc.cells.get(b.branch)!.lastPushAt ?? undefined">
                  <template v-if="svc.cells.get(b.branch)!.lastPushAt">
                    Latest branch change {{ relativeTime(svc.cells.get(b.branch)!.lastPushAt) }}
                    <template v-if="svc.cells.get(b.branch)!.lastPushSha">
                      · <code>{{ svc.cells.get(b.branch)!.lastPushSha }}</code></template
                    >
                  </template>
                  <template v-else>
                    no commits yet<span v-if="svc.cells.get(b.branch)!.subdir">
                      under <code>{{ svc.cells.get(b.branch)!.subdir }}/</code></span
                    >
                    on <code>{{ b.branch }}</code>
                  </template>
                </div>
                <div class="dep-cell-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    :disabled="!b.localExists || !!status.dirty || deploying !== null"
                    @click="openConfirm(b.branch)"
                  >
                    {{ deploying === b.branch ? "Deploying…" : "Deploy" }}
                  </Button>
                  <a
                    v-if="svc.cells.get(b.branch)!.dashboardUrl"
                    class="dep-dash"
                    :href="svc.cells.get(b.branch)!.dashboardUrl!"
                    target="_blank"
                    rel="noreferrer"
                    >Dashboard ↗</a
                  >
                </div>
              </template>
              <span v-else class="dep-nocell">— not deployed on {{ b.branch }}</span>
            </div>
          </div>
        </section>

        <div class="dep-legend">
          <span v-for="(b, i) in status.branches" :key="b.branch" :style="branchAccent(i)">
            <span class="dep-dot"></span>{{ b.branch }}
          </span>
          <span class="dep-legend-note"
            >RepoOS reads git state, not the provider's build result — click "Dashboard" on a target
            to check its real build status.</span
          >
        </div>

        <p class="dep-note">
          “Latest branch change” is the newest commit on the branch touching this service's
          directory — the push that tells the provider to build. It is not confirmed build success:
          a broken build still shows a fresh time while the site serves an older version. Check the
          linked dashboard for the actual build/deploy result.
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
.dep-sub code {
  font-family: var(--mono);
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
   controls live here, once, not duplicated per service row. Each card carries
   its own --accent (cycled per branch, #0365) used by its matrix column too,
   so the same color identifies a branch everywhere on the page. */
.dep-branches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.dep-branch {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--panel-gradient);
  border-radius: 14px;
  padding: 16px 18px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.dep-branch::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--accent);
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
  white-space: nowrap;
}
.dep-branch-meta {
  color: var(--txt-faint);
  font-size: 12px;
}
.dep-branch-sync {
  display: flex;
}
.dep-sync {
  font-size: 12.5px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  color: var(--txt-dim);
  background: color-mix(in srgb, var(--border) 55%, transparent);
}
.dep-sync[data-state="same"] {
  color: var(--green);
  background: var(--green-tint);
}
.dep-sync[data-state="behind"] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}
.dep-sync[data-state="ahead"],
.dep-sync[data-state="diverged"] {
  color: var(--amber);
  background: var(--amber-tint);
}
.dep-branch .p-button,
.dep-branch button {
  align-self: flex-start;
  margin-top: 2px;
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

/* Services × branches matrix (#0365). */
.dep-matrix {
  border: 1px solid var(--border);
  background: var(--panel-gradient);
  border-radius: 14px;
  overflow: hidden;
}
.dep-matrix-row {
  display: grid;
  /* CSS's repeat() can't take a dynamic (JS-computed) count, so this sizes
     itself: a fixed service column, then one auto-fit column per remaining
     cell — every row has the same number of cells (one per branch), so this
     lands each row's columns evenly without needing the exact count. */
  grid-template-columns: minmax(160px, 220px) repeat(auto-fit, minmax(160px, 1fr));
}
.dep-matrix-row + .dep-matrix-row {
  border-top: 1px solid var(--border);
}
.dep-matrix-head {
  background: color-mix(in srgb, var(--border) 30%, transparent);
  color: var(--txt-faint);
  font-size: 11.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.dep-matrix-head > div {
  padding: 11px 16px;
}
.dep-matrix-colhead {
  display: flex;
  align-items: center;
  gap: 7px;
  border-left: 1px solid var(--border);
}
.dep-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}
.dep-service {
  padding: 18px 16px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.dep-service-name {
  font-weight: 750;
  font-size: 14.5px;
}
.dep-service-type {
  font-size: 11.5px;
  color: var(--txt-faint);
  font-family: var(--mono);
  margin-top: 3px;
}
.dep-cell {
  position: relative;
  padding: 16px 16px 16px 19px;
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.dep-cellbar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent);
  opacity: 0.85;
}
.dep-cell-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}
.dep-nocell {
  color: var(--txt-faint);
  font-size: 12.5px;
  font-style: italic;
}
/* The URL is the point of the page: the row's one big, obvious link. */
.dep-url {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.dep-url:hover {
  text-decoration: underline;
}
.dep-nourl {
  color: var(--txt-faint);
  font-size: 12.5px;
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
.dep-cell-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 2px;
}
.dep-dash {
  color: var(--txt-dim);
  font-size: 12px;
  text-decoration: none;
}
.dep-dash:hover {
  text-decoration: underline;
  color: var(--accent);
}

.dep-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-top: 14px;
  color: var(--txt-faint);
  font-size: 12.5px;
}
.dep-legend > span:not(.dep-legend-note) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dep-legend-note {
  max-width: 60ch;
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

@media (max-width: 900px) {
  .dep-matrix-row {
    grid-template-columns: 1fr;
  }
  .dep-matrix-head {
    display: none;
  }
  .dep-service {
    border-right: 0;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--border) 18%, transparent);
  }
  .dep-cell {
    border-left: 0;
    border-top: 1px solid var(--border);
  }
}

@media (max-width: 640px) {
  .dep-branches {
    grid-template-columns: 1fr;
  }
}
</style>
