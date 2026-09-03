<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Check, Clipboard, ExternalLink, X } from "lucide-vue-next";
import { api } from "../api";
import {
  buildTunnelPublishPlan,
  validateTunnelPublishInput,
  type TunnelPublishPlan,
} from "../../../core/tunnel-assistant.js";
import { copyToClipboard } from "../lib/clipboard";
import { useUiStore } from "../stores/ui";
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import Input from "./ui/input.vue";

const ui = useUiStore();
const copied = ref("");
const copyFailed = ref("");
const plan = ref<TunnelPublishPlan | null>(null);
const errors = ref<string[]>([]);
const readiness = ref<Record<string, any> | null>(null);
const portTouched = ref(false);
const form = reactive({
  zone: "repoos.org",
  app: "dev",
  port: "",
  emails: "you@example.com",
  runMode: "foreground" as "foreground" | "background",
  noAccess: false,
});
let copiedTimer: number | undefined;

const status = computed(() => {
  if (!readiness.value?.configured?.tunnelId) return "Not configured";
  if (readiness.value.running) return "Running";
  return readiness.value.originCertificate?.usable ? "Configured but stopped" : "Needs attention";
});

async function refreshReadiness(): Promise<void> {
  try {
    const query = form.port ? `?port=${encodeURIComponent(form.port)}` : "";
    readiness.value = await api(`/api/tunnel/readiness${query}`);
    // Pre-fill the port with the one `repoos serve` actually uses for this
    // repo (an explicit `servePort`, or the derived per-repo port) as long as
    // the user hasn't typed their own.
    if (!portTouched.value && readiness.value?.serveDefaultPort) {
      form.port = String(readiness.value.serveDefaultPort);
    }
  } catch {
    readiness.value = null;
  }
  // Readiness unavailable (offline / not configured) — still give the form a
  // sane default so the preview works.
  if (!portTouched.value && !form.port) form.port = "7171";
}

function preview(): void {
  const input = { ...form, port: Number(form.port) };
  errors.value = validateTunnelPublishInput(input);
  plan.value = errors.value.length ? null : buildTunnelPublishPlan(input);
}

async function copyCommand(command: string): Promise<void> {
  const ok = await copyToClipboard(command);
  window.clearTimeout(copiedTimer);
  if (!ok) {
    copyFailed.value = command;
    copied.value = "";
    copiedTimer = window.setTimeout(() => (copyFailed.value = ""), 2600);
    return;
  }
  copyFailed.value = "";
  copied.value = command;
  copiedTimer = window.setTimeout(() => (copied.value = ""), 1800);
}

function setOpen(open: boolean): void {
  if (!open) ui.closeTunnel();
}

onMounted(() => {
  void refreshReadiness();
});
</script>

<template>
  <Dialog :open="ui.tunnelOpen" @update:open="setOpen">
    <DialogOverlay />
    <DialogContent :style="{ width: ui.drawerWidth + 'px', 'max-width': '100vw' }">
      <div class="drawer-resize" @mousedown.prevent="ui.startResize"></div>
      <div class="drawer-head">
        <div class="tunnel-drawer-title">
          <DialogTitle class="tunnel-title">Cloudflare publishing assistant</DialogTitle>
          <DialogDescription class="tunnel-description"
            >Status: <strong>{{ status }}</strong
            >. Configure values, review the mapping, then run the generated commands in a
            terminal.</DialogDescription
          >
        </div>
        <DialogClose class="close-x" aria-label="Close Cloudflare publishing assistant"
          ><X class="size-[15px]"
        /></DialogClose>
      </div>

      <div class="drawer-body tunnel-drawer-body">
        <div class="tunnel-notice">
          RepoOS does not start a tunnel from this page. The Cloudflare API token is never entered,
          shown, saved, or copied here; paste it only into the interactive
          <code>repoos tunnel setup</code> prompt.
        </div>

        <div class="tunnel-form-grid">
          <label
            >Cloudflare zone/base domain<Input v-model="form.zone" placeholder="repoos.org"
          /></label>
          <label>App or subdomain<Input v-model="form.app" placeholder="dev" /></label>
          <label
            >Local port<Input
              v-model="form.port"
              type="number"
              min="1"
              max="65535"
              placeholder="7171"
              @input="portTouched = true"
          /></label>
          <label v-if="!form.noAccess"
            >Allowed email address(es)<Input
              v-model="form.emails"
              placeholder="you@example.com, team@example.com"
          /></label>
          <label
            >Run mode<select v-model="form.runMode">
              <option value="foreground">Foreground (development)</option>
              <option value="background">Background service</option>
            </select></label
          >
        </div>
        <label class="tunnel-no-access-toggle">
          <input type="checkbox" v-model="form.noAccess" />
          Skip Cloudflare Access — fully public tunnel, RepoOS native auth only
        </label>
        <p v-if="form.noAccess" class="tunnel-help tunnel-no-access-warning">
          No Access policy will be created at all. This only refuses to publish if RepoOS native
          auth (<code>auth.enabled = true</code>) isn't already on — see the Authentication settings
          above.
        </p>
        <p class="tunnel-help">
          Pre-filled with the port <code>repoos serve</code> uses for this repo{{
            readiness?.serveDefaultPort ? ` (${readiness.serveDefaultPort})` : ""
          }}
          — an explicit <code>servePort</code> in <code>repoos.toml</code>, otherwise a stable
          per-repo derived port. Change it only if the app you're publishing listens elsewhere.
        </p>
        <Button @click="preview">Validate and preview commands</Button>
        <div v-if="errors.length" class="tunnel-errors">
          <div v-for="error in errors" :key="error">{{ error }}</div>
        </div>

        <div v-if="plan" class="tunnel-preview">
          <div class="tunnel-mapping">
            <span>Public URL</span><code>{{ plan.publicUrl }}</code
            ><span>Local service</span><code>{{ plan.localOrigin }}</code>
          </div>
          <div class="tunnel-command-list">
            <div v-for="(command, label) in plan.commands" :key="label" class="tunnel-command-row">
              <div>
                <span class="tunnel-command-label">{{ label }}</span
                ><code>{{ command }}</code>
              </div>
              <Button
                variant="outline"
                size="sm"
                :aria-label="`Copy ${command}`"
                @click="copyCommand(command)"
                ><Check v-if="copied === command" class="size-[14px]" /><Clipboard
                  v-else
                  class="size-[14px]"
                />{{
                  copied === command ? "Copied" : copyFailed === command ? "Copy failed" : "Copy"
                }}</Button
              >
            </div>
          </div>
          <p class="tunnel-help" :class="{ 'tunnel-no-access-warning': plan.noAccess }">
            {{ plan.authNote }}
          </p>
        </div>

        <div class="tunnel-readiness">
          <div class="tunnel-section-heading">
            <h3>Safe readiness checks</h3>
            <Button variant="ghost" size="sm" @click="refreshReadiness">Refresh</Button>
          </div>
          <p v-if="!readiness">Checks unavailable. Generated instructions remain usable.</p>
          <div v-else class="tunnel-checks">
            <span
              >cloudflared:
              {{
                readiness.cloudflared.installed
                  ? readiness.cloudflared.version || "installed"
                  : "not installed"
              }}</span
            >
            <span
              >origin certificate:
              {{ readiness.originCertificate.usable ? "ready" : "missing or unusable" }}</span
            >
            <span>API token stored: {{ readiness.apiTokenStored ? "yes" : "no" }}</span>
            <span
              >local origin:
              {{ readiness.localOrigin.listening ? "listening" : "not listening" }}</span
            >
            <span>tunnel: {{ readiness.running ? "running" : "stopped" }}</span>
            <span
              >published:
              {{
                readiness.publishedHostnames.length
                  ? readiness.publishedHostnames.join(", ")
                  : "none"
              }}</span
            >
          </div>
          <p class="tunnel-help">
            If the certificate is unauthorized, re-run <code>cloudflared tunnel login</code>. Wait
            for <code>cloudflared tunnel list</code> to succeed before creating a route.
          </p>
        </div>

        <div class="tunnel-access">
          <h3>Cloudflare token permissions</h3>
          <p>
            Create a custom token with least privilege: Account / Access: Apps and Policies / Edit;
            Account / Cloudflare Tunnel / Edit; Zone / DNS / Edit scoped to your zone; Account
            Settings / Read only only if your setup still requires it.
          </p>
          <p>
            The token resource scope is the zone, such as <code>repoos.org</code>. Do not enter
            wildcard hostnames there: <code>dev.repoos.org</code> and other subdomains are
            individual published apps/routes.
          </p>
          <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer"
            >Open Cloudflare custom-token creation <ExternalLink class="size-[13px]"
          /></a>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
