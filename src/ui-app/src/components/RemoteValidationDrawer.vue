<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Check, Clipboard, ExternalLink, X } from "lucide-vue-next";
import { api } from "../api";
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
let copiedTimer: number | undefined;

async function refresh(): Promise<void> {
  try {
    status.value = await api("/api/remote-validation/status");
  } catch {
    status.value = null;
  }
}

const statusLabel = computed(() => {
  const s = status.value;
  if (!s || !s.enabled) return "Disabled";
  if (!s.hasApiToken || !s.hasSshKey || !s.snapshotConfigured) return "Needs setup";
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
  await navigator.clipboard.writeText(text);
  copied.value = text;
  window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => (copied.value = ""), 1800);
}

function setOpen(open: boolean): void {
  if (!open) ui.closeRemoteValidation();
}

onMounted(() => void refresh());

const tomlBlock = `[remoteValidation]
enabled = true
serverType = "cax31"          # 8 vCPU ARM / 16 GB — must match the snapshot's arch
location = "hil"
snapshotId = "<snapshot-id>"  # from step 3
sshKeyName = "<your-key-name>"
idleShutdownMinutes = 8
maxServerLifetimeMinutes = 120
fallbackToLocal = false`;

const envBlock = `HETZNER_API_TOKEN=<hetzner-api-token>
REPOOS_REMOTE_SSH_KEY=/absolute/path/to/private_key`;

const steps: { label: string; body: string; cmd?: string }[] = [
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
    body: "On boot, RepoOS reconciles (deletes any leaked runner VM) and the next review → done runs the gate remotely. Watch the per-task log at .repoos/logs/remote-validation/<id>.log.",
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
            >. Runs <code>bun run build</code> + <code>bun run test</code> on a disposable Hetzner
            VM so the close-out gate isn't starved of memory on this machine.
          </DialogDescription>
        </div>
        <DialogClose class="close-x" aria-label="Close remote validation setup">
          <X class="size-[15px]" />
        </DialogClose>
      </div>

      <div class="drawer-body tunnel-drawer-body">
        <div class="tunnel-notice">
          Enabling this sends a git bundle of the repo to Hetzner for each close-out. The failure
          output shown in RepoOS is credential-redacted, but the working tree is not — don't enable
          on a repo with secrets committed in-tree.
        </div>

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

        <div class="tunnel-readiness">
          <div class="tunnel-section-heading">
            <h3>Readiness</h3>
            <Button variant="ghost" size="sm" @click="refresh">Refresh</Button>
          </div>
          <div v-if="status" class="tunnel-checks">
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
          </div>
          <p v-else class="tunnel-help">Status unavailable.</p>
        </div>

        <div class="tunnel-access">
          <h3>Setup</h3>
          <div v-for="s in steps" :key="s.label" style="margin-bottom: 12px">
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
            <Button
              variant="outline"
              size="sm"
              aria-label="Copy repoos.toml block"
              @click="copy(tomlBlock)"
            >
              <Check v-if="copied === tomlBlock" class="size-[14px]" />
              <Clipboard v-else class="size-[14px]" />
              {{ copied === tomlBlock ? "Copied" : "Copy" }}
            </Button>
          </div>
          <div class="rvr-codeblock">{{ tomlBlock }}</div>

          <div class="tunnel-section-heading" style="margin-top: 16px">
            <h3>.env (secrets — never commit)</h3>
            <Button
              variant="outline"
              size="sm"
              aria-label="Copy .env block"
              @click="copy(envBlock)"
            >
              <Check v-if="copied === envBlock" class="size-[14px]" />
              <Clipboard v-else class="size-[14px]" />
              {{ copied === envBlock ? "Copied" : "Copy" }}
            </Button>
          </div>
          <div class="rvr-codeblock">{{ envBlock }}</div>

          <p class="tunnel-help" style="margin-top: 14px">
            Full reference, cost model, and the two close-out hook points:
            <code>docs/remote-validation.md</code> and
            <code>scripts/remote-runner/build-snapshot.md</code>.
          </p>
          <a href="https://console.hetzner.cloud/" target="_blank" rel="noreferrer">
            Open Hetzner Cloud console <ExternalLink class="size-[13px]" />
          </a>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
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
</style>
