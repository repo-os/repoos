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
    if (!s.tailscaleHost) return "Needs setup — tailscaleHost missing";
    if (!s.running) return "Enabled — restart server to apply";
    return "Ready (tailscale)";
  }
  if (!s.hasApiToken || !s.snapshotConfigured) return "Needs setup";
  if (!s.running) return "Enabled — restart server to apply";
  if (s.activeServer) return `Runner up · ${s.activeServer.ageMinutes}m old`;
  return "Ready — no VM running";
});

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
tailscaleHost = "bee"        # Tailscale hostname or 100.x.x.x IP
tailscaleUser = "root"       # SSH user (default "root")
containerImage = "repoos-ci" # Docker image (default "repoos-ci")
fallbackToLocal = false`;

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
    body: "The image is built from the Dockerfile in this repo — it is not on a public registry. Run this on the runner machine (clones the repo, builds, then cleans up):",
    cmd: `ssh bee 'git clone git@github.com:repo-os/repoos.git /tmp/repoos-build && docker build -f /tmp/repoos-build/scripts/remote-runner/Dockerfile.ci -t repoos-ci /tmp/repoos-build && sudo install -Dm755 /tmp/repoos-build/scripts/remote-runner/validate.sh /opt/repoos/validate.sh && sudo mkdir -p /var/cache/repoos/bun && rm -rf /tmp/repoos-build && echo done'`,
  },
  {
    label: "3 · Configure repoos.toml",
    body: "Add the [remoteValidation] block below. tailscaleHost can be a Tailscale hostname (e.g. 'bee') or a 100.x.x.x IP.",
  },
  {
    label: "4 · Restart RepoOS",
    body: "Restart the server to pick up the new config, then use Test connection below to verify SSH and Docker are reachable.",
    cmd: "just restart",
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
    cmd: "just restart",
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
              Off (recommended): if the runner is unreachable the task stays in review for retry.
              On: run the full gate locally instead.
            </span>
          </label>
          <Switch
            :checked="fallbackToLocal"
            @update:checked="(v: boolean) => (fallbackToLocal = v)"
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
              <span>tailscaleHost: {{ status.tailscaleHost || "missing" }}</span>
              <span>tailscaleUser: {{ status.tailscaleUser }}</span>
              <span>containerImage: {{ status.containerImage }}</span>
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
              SSHes into the tailscale host and runs <code>docker info</code> to confirm the
              connection and Docker are working. Set <code>tailscaleHost</code> in repoos.toml first
              — you can test before restarting the server.
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
  background: var(--bg-card, rgba(255, 255, 255, 0.08));
  color: var(--txt);
}
.rvr-codeblock {
  margin-top: 6px;
  padding: 10px 12px;
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
  border-color: var(--red, #e05c5c);
  color: var(--red, #e05c5c);
}
.rvr-test-section {
  margin-top: 4px;
}
</style>
