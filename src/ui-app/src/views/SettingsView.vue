<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfigStore } from "../stores/config";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";
import {
  useNotificationsStore,
  NOTIFICATION_TYPE_LABELS,
  PUSH_AVAILABILITY_HELP,
  type NotificationType,
} from "../stores/notifications";
import { api } from "../api";
import Button from "../components/ui/button.vue";
import Card from "../components/ui/card.vue";
import Input from "../components/ui/input.vue";
import Switch from "../components/ui/switch.vue";
import AuthSettingsPanel from "../components/AuthSettingsPanel.vue";
import Select from "../components/ui/select/root.vue";
import SelectContent from "../components/ui/select/content.vue";
import SelectItem from "../components/ui/select/item.vue";
import SelectTrigger from "../components/ui/select/trigger.vue";
import SelectValue from "../components/ui/select/value.vue";
import SelectViewport from "../components/ui/select/viewport.vue";

const config = useConfigStore();
const ui = useUiStore();
const repo = useRepoStore();
const notifications = useNotificationsStore();
const notificationTypes = [
  "review",
  "paused",
  "stuck",
  "needsInput",
] as NotificationType[];
const route = useRoute();
const router = useRouter();

// --- Attention (browser) notifications diagnostics (#0316) ---
const testSending = ref(false);
async function runTestNotification(): Promise<void> {
  testSending.value = true;
  try {
    await notifications.sendTestPush();
  } finally {
    testSending.value = false;
  }
}
const pushStatus = computed(() => {
  const a = notifications.availability;
  const map = {
    granted: { label: "granted", color: "var(--green)", tone: "ok" as const },
    default: { label: "not requested", color: "var(--txt-dim)", tone: "ok" as const },
    denied: { label: "blocked", color: "var(--red)", tone: "error" as const },
    insecure: { label: "unavailable (insecure origin)", color: "var(--red)", tone: "error" as const },
    unsupported: { label: "unsupported browser", color: "var(--red)", tone: "error" as const },
  }[a];
  return {
    ...map,
    // Hide the "just turn it on" hint once permission is already granted.
    help: a === "granted" && notifications.pushEnabled ? "" : PUSH_AVAILABILITY_HELP[a],
  };
});
const tunnelReadiness = ref<Record<string, any> | null>(null);
const tunnelStatus = computed(() => {
  if (!tunnelReadiness.value?.configured?.tunnelId) return "Not configured";
  if (tunnelReadiness.value.running) return "Running";
  return tunnelReadiness.value.originCertificate?.usable ? "Configured but stopped" : "Needs attention";
});
const rvStatus = ref<Record<string, any> | null>(null);
const rvStatusLabel = computed(() => {
  const s = rvStatus.value;
  if (!s || !s.enabled) return "Disabled";
  if (!s.hasApiToken || !s.hasSshKey || !s.snapshotConfigured) return "Needs setup";
  if (!s.running) return "Enabled — restart to apply";
  if (s.activeServer) return `Runner up · ${s.activeServer.ageMinutes}m`;
  return "Ready";
});
async function refreshRvStatus(): Promise<void> {
  try { rvStatus.value = await api("/api/remote-validation/status"); } catch { rvStatus.value = null; }
}
onMounted(async () => {
  notifications.refreshAvailability();
  try { tunnelReadiness.value = await api("/api/tunnel/readiness?port=7171"); } catch { /* status remains safe default */ }
  void refreshRvStatus();
});

const testState = ref<"idle" | "sending" | "sent" | "failed">("idle");
let testStateTimer: ReturnType<typeof setTimeout> | undefined;

async function sendTestNotification(): Promise<void> {
  testState.value = "sending";
  clearTimeout(testStateTimer);
  try {
    await api("/api/ntfy/test", { method: "POST" });
    testState.value = "sent";
  } catch {
    testState.value = "failed";
  }
  testStateTimer = setTimeout(() => {
    testState.value = "idle";
  }, 2000);
}

const generalFields = computed(() =>
  config.visibleFields.filter(
    (field) =>
      field.key !== "tunnelEnabled" &&
      field.key !== "ntfyEnabled" &&
      field.key !== "ntfyTopic" &&
      field.key !== "auth.enabled" &&
      field.key !== "auth.sessionMaxAge" &&
      !field.key.startsWith("remoteValidation."),
  ),
);

/**
 * auth.sessionMaxAge is stored and sent to the server as seconds (it backs a
 * cookie Max-Age / session-expiry check — see routes/auth.ts), but "how long
 * should a login last" is naturally a day count for a human to set. This
 * converts for display/edit only; the underlying config key, its string
 * storage, and the server's >= 300s validation are untouched.
 */
const sessionMaxAgeDays = computed<number>({
  get: () => {
    const seconds = Number(form["auth.sessionMaxAge"]);
    return Number.isFinite(seconds) && seconds > 0 ? Math.round((seconds / 86400) * 100) / 100 : 7;
  },
  set: (days: number) => {
    if (!Number.isFinite(days) || days <= 0) return;
    form["auth.sessionMaxAge"] = String(Math.round(days * 86400));
  },
});

function focusSetting(key: string): void {
  const el = document.getElementById(`setting-${key}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  window.setTimeout(() => el.classList.remove("flash"), 2000);
  const input = el.querySelector<HTMLElement>("input, select, [role='combobox']");
  if (input) input.focus();
}

watch(
  () => route.query.focus as string | undefined,
  (key) => {
    if (!key) return;
    const tryFocus = (attempt = 0): void => {
      if (config.loaded && document.getElementById(`setting-${key}`)) {
        focusSetting(key);
        void router.replace({ name: "settings" });
      } else if (attempt < 20) {
        window.setTimeout(() => tryFocus(attempt + 1), 100);
      }
    };
    tryFocus();
  },
  { immediate: true },
);

// ---- Auto-save settings (mirrors the Agents page implementation) ----

const form = reactive<Record<string, unknown>>({});
let syncing = false;
let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
let saveInFlight = false;
let savePending = false;

function sync(): void {
  syncing = true;
  for (const key of Object.keys(config.form)) {
    form[key] = config.form[key];
  }
  syncing = false;
}

watch(
  () => config.loaded,
  (loaded) => {
    if (loaded) sync();
  },
  { immediate: true },
);

function buildBody(): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of config.schema) {
    if (f.tier === "guarded" && !config.showAdvanced) continue;
    let val = form[f.key];
    if (f.type === "array" && typeof val === "string") {
      val = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    body[f.key] = val;
  }
  return body;
}

async function autoSave(): Promise<void> {
  if (saveInFlight) {
    savePending = true;
    return;
  }
  saveInFlight = true;
  savePending = false;
  let saved = false;
  try {
    await config.save(buildBody());
    saved = true;
  } catch {
    // The store exposes the error inline; keep edits in place for the next retry.
  } finally {
    saveInFlight = false;
    if (savePending) {
      // New edits arrived while the save was in flight — save again, keeping
      // whatever the user typed (possibly a fresh secret).
      scheduleAutoSave(0);
    } else if (saved) {
      // The save succeeded and nothing is pending, so the local form is a
      // stale copy of what was just saved. Re-sync from the store so
      // server-redacted values (e.g. the voice transcription API key) never
      // linger plaintext in the local form. On a failed save we keep edits.
      sync();
    }
  }
}

function scheduleAutoSave(delay = 450): void {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => void autoSave(), delay);
}

watch(
  form,
  () => {
    if (syncing || !config.loaded) return;
    config.msg = "";
    config.error = "";
    if (saveInFlight) savePending = true;
    scheduleAutoSave();
  },
  { deep: true, flush: "sync" },
);

onUnmounted(() => {
  clearTimeout(autoSaveTimer);
  clearTimeout(testStateTimer);
});
</script>

<template>
  <div>
    <div class="page-title">Settings</div>
    <div class="page-desc">
      RepoOS configuration · <span class="mono" style="color: var(--cyan)">repoos.toml</span>
      <span v-if="config.saving"> · Saving…</span>
      <span v-else-if="config.error" class="save-msg err"> · {{ config.error }}</span>
      <span v-else-if="config.msg" class="save-msg ok"> · {{ config.msg }}</span>
    </div>

    <div v-if="!config.loaded" class="spin"></div>

    <div v-else>
      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span class="live-dot"></span>General
          </div>
          <div v-for="f in generalFields" :key="f.key" :id="`setting-${f.key}`" class="setting-row">
            <div class="setting-info">
              <div class="setting-label">{{ f.label }}</div>
              <div class="setting-desc">{{ f.description }}</div>
            </div>
            <div class="setting-input">
              <Select
                v-if="f.type === 'select'"
                :model-value="String(form[f.key])"
                :disabled="config.saving"
                @update:model-value="(v) => (form[f.key] = v)"
              >
                <SelectTrigger class="h-[34px] w-[200px] rounded-[9px] px-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                    <SelectItem v-for="o in f.options" :key="o.value" :value="o.value">{{
                      o.label
                    }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
              <Switch
                v-else-if="f.type === 'boolean'"
                :checked="!!form[f.key]"
                :disabled="config.saving"
                @update:checked="(v: boolean) => (form[f.key] = v)"
              />
            </div>
            <span v-if="f.restartRequired" class="restart-badge">restart required</span>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span class="live-dot"></span>Publishing
          </div>
          <div id="setting-tunnelEnabled" class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Cloudflare publishing</div>
              <div class="setting-desc">
                Configure a protected public hostname for a local RepoOS service. This card reports
                status; it does not start or stop cloudflared.
              </div>
            </div>
            <div class="setting-input tunnel-setting-actions">
              <span class="tunnel-status-chip">{{ tunnelStatus }}</span>
              <Button variant="outline" size="sm" @click="ui.openTunnel()">Configure publishing</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span class="live-dot"></span>Remote validation
          </div>
          <div id="setting-remoteValidation.enabled" class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Remote validation runner</div>
              <div class="setting-desc">
                Run the close-out build + test suite on a disposable Hetzner VM instead of this
                machine, so MTD isn't blocked by local memory pressure. Off by default; enabling
                sends repo contents to Hetzner.
              </div>
            </div>
            <div class="setting-input tunnel-setting-actions">
              <span class="tunnel-status-chip">{{ rvStatusLabel }}</span>
              <Button variant="outline" size="sm" @click="ui.openRemoteValidation()">
                Configure runner
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span class="live-dot"></span>ntfy Notifications
          </div>
          <div class="ntfy-layout">
            <div class="ntfy-controls">
              <div id="setting-ntfyEnabled" class="setting-row">
                <div class="setting-info">
                  <div class="setting-label">Enable ntfy notifications</div>
                  <div class="setting-desc">
                    When on, RepoOS publishes a message to your topic on task lifecycle events
                    (moved to review, approved, or returned with issues).
                  </div>
                </div>
                <div class="setting-input">
                  <Switch
                    :checked="!!form.ntfyEnabled"
                    :disabled="config.saving"
                    @update:checked="(v: boolean) => (form.ntfyEnabled = v)"
                  />
                </div>
              </div>
              <div id="setting-ntfyTopic" class="setting-row">
                <div class="setting-info">
                  <div class="setting-label">Subscription topic</div>
                  <div class="setting-desc">
                    The ntfy topic RepoOS publishes events to, e.g. <code>repoos_myproject</code>.
                    Leave empty to never send.
                  </div>
                </div>
                <div class="setting-input" style="display: flex; gap: 8px; align-items: center">
                  <Input
                    :model-value="String(form.ntfyTopic ?? '')"
                    type="text"
                    placeholder="repoos_myproject"
                    @update:model-value="(v) => (form.ntfyTopic = v)"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    :disabled="!form.ntfyEnabled || !String(form.ntfyTopic ?? '').trim()"
                    @click="sendTestNotification"
                  >
                    {{ testState === "sent" ? "✓ Sent!" : testState === "failed" ? "✗ Failed" : "Send test" }}
                  </Button>
                </div>
              </div>
            </div>
            <aside class="ntfy-info">
              <h3>About ntfy</h3>
              <p>
                ntfy is a free, open-source push notification service. Install the ntfy app on
                your phone from the App Store or Google Play, subscribe to a unique topic (e.g.
                <code>repoos_myproject</code>), and enter that topic below.
              </p>
              <p>
                Notifications are sent to <code>ntfy.sh</code> by default. Self-hosted ntfy
                instances work too — set the <code>NTFY_BASE_URL</code> environment variable (or
                the <code>ntfyBaseUrl</code> config key in <code>repoos.toml</code>).
              </p>
              <a href="https://ntfy.sh/docs/subscribe/phone/" target="_blank" rel="noreferrer">
                ntfy install + subscribe guide →
              </a>
            </aside>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span class="live-dot"></span>Authentication
          </div>
          <div id="setting-auth.enabled" class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Authentication</div>
              <div class="setting-desc">Require login to access RepoOS (email OTP or Google OAuth).</div>
            </div>
            <div class="setting-input">
              <Switch
                :checked="!!form['auth.enabled']"
                :disabled="config.saving"
                @update:checked="(v: boolean) => (form['auth.enabled'] = v)"
              />
            </div>
            <span class="restart-badge">restart required</span>
          </div>
          <div id="setting-auth.sessionMaxAge" class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Session duration (days)</div>
              <div class="setting-desc">How long a login session lasts before requiring sign-in again. Default 7 days.</div>
            </div>
            <div class="setting-input">
              <Input
                :model-value="sessionMaxAgeDays"
                type="number"
                min="1"
                step="1"
                style="width: 100px"
                @update:model-value="(v) => (sessionMaxAgeDays = Number(v))"
              />
            </div>
            <span class="restart-badge">restart required</span>
          </div>
        </div>
      </Card>

      <AuthSettingsPanel />

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span class="live-dot"></span>Voice transcription
          </div>
          <div
            v-for="f in config.voiceFields"
            :key="f.key"
            :id="`setting-${f.key}`"
            class="setting-row"
          >
            <div class="setting-info">
              <div class="setting-label">{{ f.label }}</div>
              <div class="setting-desc">{{ f.description }}</div>
            </div>
            <div class="setting-input">
              <Select
                v-if="f.type === 'select'"
                :model-value="String(form[f.key])"
                :disabled="config.saving"
                @update:model-value="(v) => (form[f.key] = v)"
              >
                <SelectTrigger class="h-[34px] w-[200px] rounded-[9px] px-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                    <SelectItem v-for="o in f.options" :key="o.value" :value="o.value">{{
                      o.label
                    }}</SelectItem>
                  </SelectViewport>
                </SelectContent>
              </Select>
              <Input
                v-else-if="f.type === 'string'"
                :model-value="String(form[f.key] ?? '')"
                type="password"
                autocomplete="new-password"
                placeholder="sk-… or gsk_…"
                @update:model-value="(v) => (form[f.key] = v)"
              />
            </div>
            <span v-if="f.restartRequired" class="restart-badge">restart required</span>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span class="live-dot"></span>Attention Notifications
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Sound notifications</div>
              <div class="setting-desc">
                Play a bell sound on your computer when a task moves into a state that needs
                you. Off by default.
              </div>
            </div>
            <div class="setting-input">
              <Switch
                :checked="notifications.soundEnabled"
                @update:checked="notifications.setSoundEnabled"
              />
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Push notifications</div>
              <div class="setting-desc">
                Send a notification through your computer's notification system when a task
                moves into a state that needs you. Turning this on will ask for permission.
                Requires a RepoOS tab to stay open — there's no background service worker.
              </div>
            </div>
            <div class="setting-input">
              <Switch
                :checked="notifications.pushEnabled"
                @update:checked="notifications.setPushEnabled"
              />
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label" style="font-weight: 500">
                Browser permission:
                <span :style="{ color: pushStatus.color }">{{ pushStatus.label }}</span>
              </div>
              <div
                v-if="pushStatus.help"
                class="setting-desc"
                :style="{ color: pushStatus.tone === 'error' ? 'var(--red)' : 'var(--txt-dim)' }"
              >
                {{ pushStatus.help }}
              </div>
              <div
                v-if="notifications.testResult"
                class="setting-desc"
                :style="{ marginTop: '4px', color: notifications.testResult.ok ? 'var(--green)' : 'var(--red)' }"
              >
                {{ notifications.testResult.detail }}
              </div>
            </div>
            <div class="setting-input">
              <Button
                variant="outline"
                size="sm"
                :disabled="testSending"
                @click="runTestNotification"
              >
                {{ testSending ? "Sending…" : "Send test" }}
              </Button>
            </div>
          </div>
          <div style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--txt-faint); font-weight: 600; padding-top: 8px">Events</div>
          <div
            v-for="t in notificationTypes"
            :key="t"
            class="setting-row"
          >
            <div class="setting-info">
              <div class="setting-label">{{ NOTIFICATION_TYPE_LABELS[t] }}</div>
              <div class="setting-desc">
                {{
                  t === "review"
                    ? "A task moved from active to review, ready for your sign-off."
                    : t === "paused"
                      ? "A running task was paused."
                      : t === "stuck"
                        ? "A task was surfaced as stuck (no progress detected)."
                        : "A task explicitly needs your attention."
                }}
              </div>
            </div>
            <div class="setting-input">
              <Switch :checked="notifications.types[t]" @update:checked="notifications.setTypeEnabled(t, $event)" />
            </div>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span class="live-dot"></span>Board
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Glide animations</div>
              <div class="setting-desc">
                When a card changes state, animate it gliding between columns to show where it
                came from and where it went. Off by default; when off, cards change state
                instantly as before.
              </div>
            </div>
            <div class="setting-input">
              <Switch :checked="ui.glideAnimations" @update:checked="ui.setGlideAnimations" />
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Keyboard navigation</div>
              <div class="setting-desc">
                Power-user shortcut mode: move around the board with the keyboard —
                <span class="mono">j</span>/<span class="mono">k</span> (
                <span class="mono">h</span>/<span class="mono">l</span> between columns),
                <span class="mono">Enter</span> to open, <span class="mono">Esc</span> to close
                or clear. Off by default; when off the board behaves exactly as before.
              </div>
            </div>
            <div class="setting-input">
              <Switch :checked="ui.keyboardNavEnabled" @update:checked="ui.setKeyboardNavEnabled" />
            </div>
          </div>
        </div>
      </Card>

      <Card style="padding: 0 18px 6px; margin-bottom: 16px">
        <div class="setting-group">
          <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
            <span
              style="cursor: pointer; user-select: none"
              @click="config.showAdvanced = !config.showAdvanced"
            >
              <span v-if="config.showAdvanced">▾</span><span v-else>▸</span> Advanced
            </span>
          </div>
          <div v-if="config.showAdvanced">
            <div class="adv-gate">
              <div class="warning">
                ⚠ Changing these may break the running server. Edit with care.
              </div>
            </div>
            <div
              v-for="f in config.guardedFields"
              :key="f.key"
              :id="`setting-${f.key}`"
              class="setting-row"
            >
              <div class="setting-info">
                <div class="setting-label">{{ f.label }}</div>
                <div class="setting-desc">{{ f.description }}</div>
              </div>
              <div class="setting-input">
                <Input
                  v-if="f.type === 'string'"
                  :model-value="String(form[f.key])"
                  type="text"
                  @update:model-value="(v) => (form[f.key] = v)"
                />
                <Input
                  v-else-if="f.type === 'array'"
                  :model-value="String(form[f.key])"
                  type="text"
                  placeholder=".md, .markdown"
                  @update:model-value="(v) => (form[f.key] = v)"
                />
              </div>
              <span v-if="f.restartRequired" class="restart-badge">restart required</span>
            </div>
          </div>
        </div>
      </Card>

    </div>
  </div>
</template>
