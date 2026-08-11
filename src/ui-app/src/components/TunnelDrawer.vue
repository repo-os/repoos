<script setup lang="ts">
import { ref } from "vue";
import { Check, Clipboard, ExternalLink, X } from "lucide-vue-next";
import { useUiStore } from "../stores/ui";
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";

const ui = useUiStore();
const copied = ref("");
let copiedTimer: number | undefined;

function setOpen(open: boolean): void {
  if (!open) ui.closeTunnel();
}

async function copyCommand(command: string): Promise<void> {
  await navigator.clipboard.writeText(command);
  copied.value = command;
  window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => (copied.value = ""), 1800);
}

const steps = [
  {
    title: "Run the guided machine setup",
    body: "This checks for cloudflared, offers to install it, opens Cloudflare login in your browser, creates or reuses one tunnel for this machine, and asks for your base domain and API token.",
    command: "repoos tunnel setup",
  },
  {
    title: "Publish an app behind Access",
    body: "Choose an app name and local port. Add at least one allowed email so the hostname is protected instead of publicly accessible.",
    command: "repoos tunnel create dashboard --port 3000 --allow you@example.com",
  },
  {
    title: "Start it",
    body: "Run in the foreground while testing, or install the tunnel as a login/system service once the routes look right.",
    command: "repoos tunnel start",
    alternate: "repoos tunnel install",
  },
] as const;
</script>

<template>
  <Dialog :open="ui.tunnelOpen" @update:open="setOpen">
    <DialogOverlay />
    <DialogContent :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }">
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
      <div class="drawer-head">
        <div class="tunnel-drawer-title">
          <DialogTitle class="tunnel-title">Cloudflare Tunnel setup</DialogTitle>
          <DialogDescription class="tunnel-description">
            Publish local apps without opening inbound ports, protected by an email allowlist.
          </DialogDescription>
        </div>
        <DialogClose class="close-x" aria-label="Close Cloudflare Tunnel setup">
          <X class="size-[15px]" />
        </DialogClose>
      </div>

      <div class="drawer-body tunnel-drawer-body">
        <div class="tunnel-notice">
          Run these commands in a terminal at your repository root. Setup is interactive because
          Cloudflare must authenticate you in a browser; RepoOS never stores your login or tunnel
          credentials in the repository.
        </div>

        <ol class="tunnel-steps">
          <li v-for="(step, index) in steps" :key="step.command" class="tunnel-step">
            <div class="tunnel-step-number">{{ index + 1 }}</div>
            <div class="tunnel-step-content">
              <h3>{{ step.title }}</h3>
              <p>{{ step.body }}</p>
              <div class="tunnel-command-row">
                <code>{{ step.command }}</code>
                <Button
                  variant="outline"
                  size="sm"
                  :aria-label="`Copy ${step.command}`"
                  @click="copyCommand(step.command)"
                >
                  <Check v-if="copied === step.command" class="size-[14px]" />
                  <Clipboard v-else class="size-[14px]" />
                  {{ copied === step.command ? "Copied" : "Copy" }}
                </Button>
              </div>
              <div v-if="'alternate' in step" class="tunnel-alternate">
                Persistent service:
                <button type="button" @click="copyCommand(step.alternate)">
                  <code>{{ step.alternate }}</code>
                </button>
              </div>
            </div>
          </li>
        </ol>

        <div class="tunnel-manage">
          <h3>Manage the tunnel</h3>
          <p>
            Use <code>repoos tunnel status</code> to check installation and routes,
            <code>repoos tunnel list</code> to see published apps, and
            <code>repoos tunnel allow|deny &lt;app&gt; &lt;email&gt;</code> to update Access.
          </p>
          <a
            href="https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/"
            target="_blank"
            rel="noreferrer"
          >
            Cloudflare Tunnel documentation <ExternalLink class="size-[13px]" />
          </a>
        </div>

        <div class="tunnel-safety">
          Turning this setting off only hides RepoOS's tunnel controls. It does not stop a running
          tunnel or delete routes, credentials, DNS records, or Access policies.
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
