<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Check, Clipboard, ExternalLink, Loader2, X } from "lucide-vue-next";
import { api } from "../api";
import { copyToClipboard } from "../lib/clipboard";
import { useUiStore } from "../stores/ui";
import { useConfigStore } from "../stores/config";
import Button from "./ui/button.vue";
import Switch from "./ui/switch.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

const ui = useUiStore();
const config = useConfigStore();

const status = ref<Record<string, any> | null>(null);
const copied = ref("");
const testState = ref<"idle" | "running" | "ok" | "fail">("idle");
const testOutput = ref("");
let copiedTimer: number | undefined;

async function refresh(): Promise<void> {
  try {
    status.value = await api("/api/remote-validation/status");
    syncHostsInput();
  } catch {
    status.value = null;
  }
}

async function runTest(): Promise<void> {
  testState.value = "running";
  testOutput.value = "";
  try {
    const res = await api("/api/remote-validation/test", { method: "POST" });
    testState.value = res.ok ? "ok" : "fail";
    testOutput.value = res.ok ? (res.output ?? "") : (res.error ?? "Unknown error");
  } catch (e) {
    testState.value = "fail";
    testOutput.value = (e as Error).message;
  }
}

const provider = computed<"hetzner" | "tailscale">(() => status.value?.provider ?? "hetzner");

const statusLabel = computed(() => {
  const s = status.value;
  if (!s || !s.enabled) return "Disabled";
  if (s.provider === "tailscale") {
    const hosts: string[] = s.tailscaleHosts ?? [];
    if (!hosts.length) return "Needs setup — no tailscale host configured";
    if (!s.running) return "Enabled — restart server to apply";
    const down = (s.hosts ?? []).filter((h: any) => h.probed && !h.healthy).length;
    if (down > 0) return `${hosts.length} host${hosts.length > 1 ? "s" : ""} · ${down} unavailable`;
    return `Ready (tailscale, ${hosts.length} host${hosts.length > 1 ? "s" : ""})`;
  }
  if (!s.hasApiToken || !s.snapshotConfigured) return "Needs setup";
  if (!s.running) return "Enabled — restart server to apply";
  if (s.activeServer) return `Runner up · ${s.activeServer.ageMinutes}m old`;
  return "Ready — no VM running";
});

/** Per-host pool state line (#0521): never jargon, always says what to do. */
function hostState(h: Record<string, any>): string {
  if (!h.probed) return "not checked yet";
  if (h.healthy) return "ready";
  return h.detail || "unavailable — run Test connection";
}
function hostStateClass(h: Record<string, any>): string {
  if (!h.probed) return "rvr-host-state--idle";
  return h.healthy ? "rvr-host-state--ok" : "rvr-host-state--bad";
}
function hostCaps(h: Record<string, any>): string {
  const caps = [h.os, ...(h.labels ?? [])].filter(Boolean);
  return caps.length ? caps.join(" · ") : "no os/labels";
}

const enabled = computed({
  get: () => !!config.form["remoteValidation.enabled"],
  set: (v: boolean) => {
    void config.setConfigValues({ "remoteValidation.enabled": v }).then(refresh);
  },
});
const fallbackToLocal = computed({
  get: () => !!config.form["remoteValidation.fallbackToLocal"],
  set: (v: boolean) => {
    void config.setConfigValues({ "remoteValidation.fallbackToLocal": v });
  },
});
const retryOtherHosts = computed({
  get: () => config.form["remoteValidation.retryOtherHosts"] !== false,
  set: (v: boolean) => {
    void config.setConfigValues({ "remoteValidation.retryOtherHosts": v });
  },
});
const engineerSelfCheckRemote = computed({
  get: () => config.form["remoteValidation.engineerSelfCheckRemote"] !== false,
  set: (v: boolean) => {
    void config.setConfigValues({ "remoteValidation.engineerSelfCheckRemote": v });
  },
});

// ── host pool editing (#0521) ────────────────────────────────────────────────

const hostsInput = ref("");
const hostsSaving = ref(false);
const hostsMsg = ref("");

function syncHostsInput(): void {
  const hosts: string[] = status.value?.tailscaleHosts ?? [];
  hostsInput.value = hosts.join(", ");
}

async function saveHosts(): Promise<void> {
  const list = hostsInput.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) {
    hostsMsg.value =
      "Nothing to save — add at least one host. To remove every host, edit repoos.toml.";
    return;
  }
  hostsSaving.value = true;
  hostsMsg.value = "";
  try {
    await config.setConfigValues({ "remoteValidation.tailscaleHosts": list });
    await refresh();
    // Never claim success on trust: re-read what the config actually resolves
    // to (a section-scoped line the patcher could not replace would silently
    // keep the old pool — #0521 review) and say so if it differs.
    const resolved: string[] = status.value?.tailscaleHosts ?? [];
    const live: string[] = (status.value?.hosts ?? []).map((h: { host: string }) => h.host);
    const same = resolved.length === list.length && list.every((h) => resolved.includes(h));
    const sameLive = live.length === list.length && list.every((h) => live.includes(h));
    hostsMsg.value =
      same && sameLive
        ? "Saved — new jobs will use this pool."
        : `Saved, but the live dispatcher has [${live.join(", ") || "none"}] ` +
          `(config: [${resolved.join(", ") || "none"}]) — check repoos.toml; ` +
          "a stale line there may be overriding the save.";
  } catch (e) {
    hostsMsg.value = (e as Error).message;
  } finally {
    hostsSaving.value = false;
  }
}

async function copy(text: string): Promise<void> {
  if (!(await copyToClipboard(text))) return;
  copied.value = text;
  window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => (copied.value = ""), 1800);
}

function setOpen(open: boolean): void {
  if (!open) ui.closeRemoteValidation();
}

onMounted(() => void refresh());

// ── config snippets ──────────────────────────────────────────────────────────

const tailscaleTomlBlock = `[remoteValidation]
enabled = true
provider = "tailscale"
tailscaleHost = "bee"        # single-host shorthand (or use the pool below)
tailscaleUser = "root"       # default SSH user (per-host user overrides it)
containerImage = "repoos-ci" # Docker image on Linux hosts (default "repoos-ci")
fallbackToLocal = false
maxConcurrent = 1            # global per-host limit (each host can override)

# Optional — a pool of hosts jobs dispatch across (#0521).
# Plain form (also editable as "Host pool" above):
tailscaleHosts = ["bee", "mac1"]

# Rich form: one row per host with its own settings.
[[remoteValidation.tailscaleHosts]]
host = "mac1"
user = "nick"
os = "macos"                 # jobs with runsOn = ["macos"] land here
labels = ["apple-silicon"]
maxConcurrent = 2`;

const hetznerTomlBlock = `[remoteValidation]
enabled = true
provider = "hetzner"          # default when omitted
serverType = "cax31"          # 8 vCPU ARM / 16 GB — must match the snapshot's arch
location = "hil"
snapshotId = "<snapshot-id>"  # from step 3
sshKeyName = "<your-key-name>"
idleShutdownMinutes = 8
maxServerLifetimeMinutes = 120
fallbackToLocal = false`;

const hetznerEnvBlock = `HETZNER_API_TOKEN=<hetzner-api-token>
REPOOS_REMOTE_SSH_KEY=/absolute/path/to/private_key`;

const tailscaleEnvBlock = `# Optional — only needed if SSH key auth isn't handled by your agent / ~/.ssh/config
REPOOS_REMOTE_SSH_KEY=/absolute/path/to/private_key`;

const tailscaleSteps: { label: string; body: string; cmd?: string }[] = [
  {
    label: "1 · Install Docker on the runner machine",
    body: "The tailscale host needs Docker. On Arch: pacman -S docker && systemctl enable --now docker. On macOS: install Docker Desktop. Verify with:",
    cmd: "ssh bee 'docker --version'",
  },
  {
    label: "2 · Build the repoos-ci image on the runner (one-time)",
    body: "The image is built from the Dockerfile in this repo — it is not on a public registry. Run this on the runner machine (clones the repo under $HOME — never /tmp or /var/tmp, which Docker Desktop won't share — builds, then cleans up):",
    cmd: `ssh bee 'git clone git@github.com:repo-os/repoos.git ~/.repoos-build && docker build -f ~/.repoos-build/scripts/remote-runner/Dockerfile.ci -t repoos-ci ~/.repoos-build && sudo install -Dm755 ~/.repoos-build/scripts/remote-runner/validate.sh /opt/repoos/validate.sh && rm -rf ~/.repoos-build && echo done'`,
  },
  {
    label: "3 · Configure repoos.toml",
    body: "Add the [remoteValidation] block below. tailscaleHost is a Tailscale hostname (e.g. 'bee') or a 100.x.x.x IP; add more machines to the pool with tailscaleHosts or [[remoteValidation.tailscaleHosts]] rows (per-host user, os, labels, maxConcurrent).",
  },
  {
    label: "4 · Restart RepoOS",
    body: "Restart the server to pick up the new config, then use Test connection below to verify SSH and Docker are reachable.",
    cmd: "repoos stop && repoos serve",
  },
];

const hetznerSteps: { label: string; body: string; cmd?: string }[] = [
  {
    label: "1 · Hetzner API token",
    body: "In the Hetzner Cloud console: your project → Security → API Tokens → Generate (Read & Write). Put it in .env as HETZNER_API_TOKEN.",
  },
  {
    label: "2 · SSH key",
    body: "Add your public SSH key under the project's Security → SSH Keys and note its name. The matching private key path goes in .env as REPOOS_REMOTE_SSH_KEY.",
  },
  {
    label: "3 · Build the runner snapshot (one-time)",
    body: "Boots a throwaway box, bakes Docker + the repoos-ci image into a snapshot, prints the snapshot ID. Needs the hcloud CLI (brew install hcloud).",
    cmd: "less scripts/remote-runner/build-snapshot.md",
  },
  {
    label: "4 · Configure repoos.toml",
    body: "Add the [remoteValidation] block with the snapshot ID and SSH key name from the steps above.",
  },
  {
    label: "5 · Restart RepoOS",
    body: "On boot, RepoOS reconciles (deletes any leaked runner VM) and the next review → done runs the gate remotely.",
    cmd: "repoos stop && repoos serve",
  },
];
</script>

<template>
  <Dialog :open="ui.remoteValidationOpen" @update:open="setOpen">
    <DialogOverlay />
    <DialogContent :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }">
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
      <div class="drawer-head">
        <div class="tunnel-drawer-title">
          <DialogTitle class="tunnel-title">Remote validation runner</DialogTitle>
          <DialogDescription class="tunnel-description">
            Status: <strong>{{ statusLabel }}</strong
            >. Runs <code>bun run build</code> + <code>bun run test</code> on a remote machine so
            the close-out gate isn't starved of memory on this machine.
          </DialogDescription>
        </div>
        <DialogClose class="close-x" aria-label="Close remote validation setup">
          <X class="size-[15px]" />
        </DialogClose>
      </div>

      <div class="drawer-body tunnel-drawer-body">
        <!-- master switches -->
        <div class="tunnel-form-grid" style="grid-template-columns: 1fr auto; gap: 10px 16px">
          <label style="display: flex; flex-direction: column; gap: 2px">
            Enable remote validation
            <span class="tunnel-help" style="margin: 0"
              >Requires a server restart to take effect.</span
            >
          </label>
          <Switch :checked="enabled" @update:checked="(v: boolean) => (enabled = v)" />

          <label style="display: flex; flex-direction: column; gap: 2px">
            Fall back to local on infra failure
            <span class="tunnel-help" style="margin: 0">
              Off (recommended): unreachable runner fails retryably (close-out stays in review;
              pre-review handoff may auto-resume the engineer). On: run the full local gate instead.
            </span>
          </label>
          <Switch
            :checked="fallbackToLocal"
            @update:checked="(v: boolean) => (fallbackToLocal = v)"
          />
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px">
          <label style="display: flex; flex-direction: column; gap: 2px">
            Engineer self-check on runner
            <span class="tunnel-help" style="margin: 0">
              Default on when remote validation is enabled. Managed engineers run install + build +
              tests on the runner during <code>repoos check</code> (format/lint stay local). Handoff
              reuses a green pass at the same commit.
            </span>
          </label>
          <Switch
            :checked="engineerSelfCheckRemote"
            @update:checked="(v: boolean) => (engineerSelfCheckRemote = v)"
          />
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px">
          <label style="display: flex; flex-direction: column; gap: 2px">
            Retry on other hosts when one fails
            <span class="tunnel-help" style="margin: 0">
              Default true when 2+ hosts configured. Off: a transient failure on one host fails
              retryably immediately (close-out stays in review for retry). On: try the next healthy
              host before giving up.
            </span>
          </label>
          <Switch
            :checked="retryOtherHosts"
            @update:checked="(v: boolean) => (retryOtherHosts = v)"
          />
        </div>

        <!-- provider tabs -->
        <div class="rvr-provider-tabs">
          <div class="rvr-provider-label">Provider</div>
          <div class="rvr-tabs">
            <button
              type="button"
              class="rvr-tab"
              :class="{ active: provider === 'tailscale' }"
              @click="
                void config
                  .setConfigValues({ 'remoteValidation.provider': 'tailscale' })
                  .then(refresh)
              "
            >
              Tailscale
            </button>
            <button
              type="button"
              class="rvr-tab"
              :class="{ active: provider === 'hetzner' }"
              @click="
                void config
                  .setConfigValues({ 'remoteValidation.provider': 'hetzner' })
                  .then(refresh)
              "
            >
              Hetzner
            </button>
          </div>
        </div>

        <!-- readiness -->
        <div class="tunnel-readiness">
          <div class="tunnel-section-heading">
            <h3>Readiness</h3>
            <Button variant="ghost" size="sm" @click="refresh">Refresh</Button>
          </div>
          <div v-if="status" class="tunnel-checks">
            <template v-if="provider === 'tailscale'">
              <span>enabled in config: {{ status.enabled ? "yes" : "no" }}</span>
              <span
                >hosts:
                {{
                  (status.tailscaleHosts || []).join(", ") ||
                  "missing — set tailscaleHost or tailscaleHosts"
                }}</span
              >
              <span>containerImage: {{ status.containerImage }}</span>
              <span>global run limit: {{ status.maxConcurrent ?? 1 }} per host</span>
              <span
                >SSH key (optional):
                {{ status.hasSshKey ? "set" : "using agent / ~/.ssh/config" }}</span
              >
              <span v-if="status.enabled && !status.running">
                ⚠ enabled in config but not active — restart the server
              </span>
            </template>
            <template v-else>
              <span>enabled in config: {{ status.enabled ? "yes" : "no" }}</span>
              <span>HETZNER_API_TOKEN: {{ status.hasApiToken ? "set" : "missing" }}</span>
              <span>REPOOS_REMOTE_SSH_KEY: {{ status.hasSshKey ? "set" : "missing" }}</span>
              <span>snapshotId: {{ status.snapshotConfigured ? "set" : "missing" }}</span>
              <span>sshKeyName: {{ status.sshKeyName || "missing" }}</span>
              <span>server type / location: {{ status.serverType }} · {{ status.location }}</span>
              <span>
                runner VM:
                {{
                  status.activeServer
                    ? `#${status.activeServer.id} @ ${status.activeServer.ip} (${status.activeServer.ageMinutes}m)`
                    : "none running"
                }}
              </span>
              <span v-if="status.enabled && !status.running">
                ⚠ enabled in config but not active — restart the server
              </span>
            </template>
          </div>
          <p v-else class="tunnel-help">Status unavailable.</p>
        </div>

        <!-- per-host pool state (#0521) — a genuinely empty list has nothing
             to show, so this stays gated on hosts existing. -->
        <div v-if="provider === 'tailscale' && (status?.hosts || []).length" class="rvr-hosts">
          <div class="tunnel-section-heading">
            <h3>Hosts</h3>
            <Button variant="ghost" size="sm" @click="refresh">Refresh</Button>
          </div>
          <div v-for="h in status!.hosts" :key="h.host" class="rvr-host">
            <code class="rvr-host-name">{{ h.user }}@{{ h.host }}</code>
            <span class="rvr-host-meta">{{ hostCaps(h) }}</span>
            <span class="rvr-host-meta">
              in flight {{ h.inFlight }}/{{ h.maxConcurrent
              }}<template v-if="h.queued"> · {{ h.queued }} queued</template>
            </span>
            <span class="rvr-host-state" :class="hostStateClass(h)">{{ hostState(h) }}</span>
            <span v-if="h.probed && h.healthy" class="rvr-host-meta">
              validate.sh:
              {{
                h.validateScriptMirrorSupported
                  ? "incremental uploads"
                  : "legacy (full bundle only)"
              }}
            </span>
            <span v-if="h.lastRun" class="rvr-host-meta"
              >last: #{{ h.lastRun.taskId }} {{ h.lastRun.ok ? "passed" : "failed" }}</span
            >
            <p
              v-if="h.probed && h.healthy && h.validateScriptMirrorSupported === false && h.validateScriptInstallCommand"
              class="tunnel-help mono"
            >
              Update:
              <button
                type="button"
                class="rvr-copy-inline"
                @click="copy(h.validateScriptInstallCommand)"
              >
                {{ h.validateScriptInstallCommand }}
              </button>
            </p>
          </div>
          <p class="tunnel-help">
            Jobs dispatch to an idle host that provides what the check plan's
            <code>runsOn</code> requires; a job queues only when every eligible host is at its
            limit, and an unavailable host is skipped and re-checked.
          </p>
        </div>

        <!-- Host pool editor (#0521 review): deliberately NOT gated on
             status?.hosts having any entries — that condition used to wrap
             this whole editor too, so an empty pool hid the only UI that
             could add the first host, leaving raw TOML as the sole option. -->
        <div v-if="provider === 'tailscale'" class="rvr-hosts">
          <div class="tunnel-section-heading" style="margin-top: 10px">
            <h3>Host pool</h3>
          </div>
          <div class="field">
            <label for="rvr-hosts-input"
              >Hosts (comma-separated)
              <span class="tunnel-help"
                >Hostname or 100.x.x.x per host. Per-host SSH user, OS, labels and concurrency go in
                <code>[[remoteValidation.tailscaleHosts]]</code> rows — see the TOML below.</span
              >
            </label>
            <input
              id="rvr-hosts-input"
              v-model="hostsInput"
              type="text"
              placeholder="bee, mac1"
              @keydown.enter.prevent="saveHosts"
            />
          </div>
          <div class="btn-row">
            <Button
              variant="outline"
              size="sm"
              :disabled="hostsSaving"
              data-testid="save-hosts"
              @click="saveHosts"
            >
              Save hosts
            </Button>
            <span v-if="hostsMsg" class="tunnel-help">{{ hostsMsg }}</span>
          </div>
        </div>

        <!-- test connection -->
        <div class="rvr-test-section">
          <div class="tunnel-section-heading">
            <h3>Test connection</h3>
            <Button
              variant="outline"
              size="sm"
              :disabled="testState === 'running'"
              @click="runTest"
            >
              <Loader2 v-if="testState === 'running'" class="size-[14px] animate-spin" />
              <Check v-else-if="testState === 'ok'" class="size-[14px] text-green-500" />
              <X v-else-if="testState === 'fail'" class="size-[14px] text-red-500" />
              {{
                testState === "running"
                  ? "Testing…"
                  : testState === "ok"
                    ? "Passed"
                    : testState === "fail"
                      ? "Failed"
                      : "Test"
              }}
            </Button>
          </div>
          <p class="tunnel-help">
            <template v-if="provider === 'tailscale'">
              SSHes into every configured host and runs the per-host prerequisite check: SSH
              reachability, Docker (the setup recipes are Docker-based on Linux and macOS alike),
              and an up-to-date <code>validate.sh</code> that accepts the per-run artifacts dir.
              Runs before a host's first job, so a misconfigured host is reported here instead of
              failing jobs later.
            </template>
            <template v-else>
              Verifies the Hetzner API token is valid and can list servers.
            </template>
          </p>
          <div
            v-if="testOutput"
            class="rvr-codeblock"
            :class="{ 'rvr-codeblock--fail': testState === 'fail' }"
          >
            {{ testOutput }}
          </div>
        </div>

        <!-- setup steps -->
        <div class="tunnel-access">
          <h3>Setup</h3>

          <template v-if="provider === 'tailscale'">
            <div class="tunnel-notice" style="margin-bottom: 12px">
              The git bundle is sent to your tailnet machine over SSH — it stays on your private
              network, never Hetzner or any third party.
            </div>
            <div v-for="s in tailscaleSteps" :key="s.label" style="margin-bottom: 12px">
              <div class="tunnel-command-label">{{ s.label }}</div>
              <p style="margin: 2px 0 6px">{{ s.body }}</p>
              <div v-if="s.cmd" class="tunnel-command-row">
                <code>{{ s.cmd }}</code>
                <Button
                  variant="outline"
                  size="sm"
                  :aria-label="`Copy ${s.cmd}`"
                  @click="copy(s.cmd!)"
                >
                  <Check v-if="copied === s.cmd" class="size-[14px]" />
                  <Clipboard v-else class="size-[14px]" />
                  {{ copied === s.cmd ? "Copied" : "Copy" }}
                </Button>
              </div>
            </div>

            <div class="tunnel-section-heading" style="margin-top: 16px">
              <h3>repoos.toml</h3>
              <Button variant="outline" size="sm" @click="copy(tailscaleTomlBlock)">
                <Check v-if="copied === tailscaleTomlBlock" class="size-[14px]" />
                <Clipboard v-else class="size-[14px]" />
                {{ copied === tailscaleTomlBlock ? "Copied" : "Copy" }}
              </Button>
            </div>
            <div class="rvr-codeblock">{{ tailscaleTomlBlock }}</div>

            <div class="tunnel-section-heading" style="margin-top: 16px">
              <h3>.env (optional — only if not using SSH agent)</h3>
              <Button variant="outline" size="sm" @click="copy(tailscaleEnvBlock)">
                <Check v-if="copied === tailscaleEnvBlock" class="size-[14px]" />
                <Clipboard v-else class="size-[14px]" />
                {{ copied === tailscaleEnvBlock ? "Copied" : "Copy" }}
              </Button>
            </div>
            <div class="rvr-codeblock">{{ tailscaleEnvBlock }}</div>
          </template>

          <template v-else>
            <div class="tunnel-notice" style="margin-bottom: 12px">
              Enabling this sends a git bundle of the repo to Hetzner for each close-out. The
              failure output is credential-redacted, but the working tree is not — don't enable on a
              repo with secrets in-tree.
            </div>
            <div v-for="s in hetznerSteps" :key="s.label" style="margin-bottom: 12px">
              <div class="tunnel-command-label">{{ s.label }}</div>
              <p style="margin: 2px 0 6px">{{ s.body }}</p>
              <div v-if="s.cmd" class="tunnel-command-row">
                <code>{{ s.cmd }}</code>
                <Button
                  variant="outline"
                  size="sm"
                  :aria-label="`Copy ${s.cmd}`"
                  @click="copy(s.cmd!)"
                >
                  <Check v-if="copied === s.cmd" class="size-[14px]" />
                  <Clipboard v-else class="size-[14px]" />
                  {{ copied === s.cmd ? "Copied" : "Copy" }}
                </Button>
              </div>
            </div>

            <div class="tunnel-section-heading" style="margin-top: 16px">
              <h3>repoos.toml</h3>
              <Button variant="outline" size="sm" @click="copy(hetznerTomlBlock)">
                <Check v-if="copied === hetznerTomlBlock" class="size-[14px]" />
                <Clipboard v-else class="size-[14px]" />
                {{ copied === hetznerTomlBlock ? "Copied" : "Copy" }}
              </Button>
            </div>
            <div class="rvr-codeblock">{{ hetznerTomlBlock }}</div>

            <div class="tunnel-section-heading" style="margin-top: 16px">
              <h3>.env (secrets — never commit)</h3>
              <Button variant="outline" size="sm" @click="copy(hetznerEnvBlock)">
                <Check v-if="copied === hetznerEnvBlock" class="size-[14px]" />
                <Clipboard v-else class="size-[14px]" />
                {{ copied === hetznerEnvBlock ? "Copied" : "Copy" }}
              </Button>
            </div>
            <div class="rvr-codeblock">{{ hetznerEnvBlock }}</div>

            <p class="tunnel-help" style="margin-top: 14px">
              Full reference, cost model, and the two close-out hook points:
              <code>docs/remote-validation.md</code> and
              <code>scripts/remote-runner/build-snapshot.md</code>.
            </p>
            <a href="https://console.hetzner.cloud/" target="_blank" rel="noreferrer">
              Open Hetzner Cloud console <ExternalLink class="size-[13px]" />
            </a>
          </template>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.rvr-provider-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0 4px;
}
.rvr-provider-label {
  font-size: 13px;
  color: var(--txt-dim);
  flex-shrink: 0;
}
.rvr-tabs {
  display: flex;
  gap: 4px;
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  background: var(--bg-subtle, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  padding: 3px;
}
.rvr-tab {
  padding: 4px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--txt-dim);
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}
.rvr-tab:hover {
  color: var(--txt);
}
.rvr-tab.active {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  background: var(--bg-card, rgba(255, 255, 255, 0.08));
  color: var(--txt);
}
.rvr-codeblock {
  margin-top: 6px;
  padding: 10px 12px;
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 8px;
  background: var(--bg-subtle, rgba(255, 255, 255, 0.03));
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--txt, inherit);
}
.rvr-codeblock--fail {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  border-color: var(--red, #e05c5c);
  color: var(--red, #e05c5c);
}
.rvr-test-section {
  margin-top: 4px;
}
.rvr-hosts {
  margin-top: 6px;
}
.rvr-host {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 7px 10px;
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 8px;
  background: var(--bg-subtle, rgba(255, 255, 255, 0.03));
  font-size: 12px;
  margin-bottom: 6px;
}
.rvr-host-name {
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--txt, inherit);
}
.rvr-host-meta {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  color: var(--txt-dim, #8a8a8a);
}
.rvr-host-state {
  margin-left: auto;
  font-weight: 500;
}
.rvr-host-state--ok {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  color: var(--green, #3fb950);
}
.rvr-host-state--bad {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  color: var(--red, #e05c5c);
}
.rvr-host-state--idle {
  /* hardcode-ok: var() fallback for a theme token — renders only when that token is undefined */
  color: var(--txt-dim, #8a8a8a);
}
</style>
