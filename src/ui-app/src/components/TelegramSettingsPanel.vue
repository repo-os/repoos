<script setup lang="ts">
/**
 * Telegram connection panel (#0538): Connect Telegram (managed provisioning
 * or Bring Your Own Bot Token), connection status, a test-message control,
 * and a compact bound-chats list with unbind. Bound-user *identity*
 * management (invites, role reassignment) lives in Settings → Security →
 * Authentication & Users (`AuthSettingsPanel.vue`, #0533); this panel reuses
 * the same `/api/auth/telegram/links` list for the chats a test message or
 * an unbind can target, so both surfaces always reflect one live source —
 * never a cached copy.
 *
 * Security invariant this panel exists to uphold: no response rendered here
 * ever contains a bot token. `TelegramStatus` is a status-only projection
 * (see `src/server/telegram/types.ts`); the connect/redeem calls return the
 * same shape. Nothing in this component's state can hold a token past the
 * connect call that consumed it.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ApiError, api, JSON_OPTS } from "../api";
import { useAuthStore } from "../stores/auth";
import Button from "./ui/button.vue";
import Input from "./ui/input.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";

const props = defineProps<{ enabled: boolean }>();
const auth = useAuthStore();

type BotSource = "byo-token" | "managed";

interface TelegramStatus {
  enabled: boolean;
  connected: boolean;
  bot?: {
    id: number;
    username: string;
    displayName: string;
    canReadAllGroupMessages: boolean | null;
    source: BotSource;
  };
  transport: { mode: "off" | "polling" | "webhook"; webhookUrl?: string };
  managedProvisioning: { configured: boolean };
  lastError: string | null;
  updatedAt: string | null;
}

type ProvisioningState =
  | "pending"
  | "awaiting_bot_creation"
  | "ready"
  | "redeemed"
  | "expired"
  | "failed";

interface ProvisioningRequestView {
  id: string;
  state: ProvisioningState;
  deepLink: string;
  expiresAt: string;
  error?: string;
}

interface TelegramLink {
  telegramUserId: number;
  email: string;
  telegramUsername: string | null;
  role: "admin" | "member" | null;
  allowlisted: boolean;
}

const status = ref<TelegramStatus | null>(null);
const statusLoading = ref(false);
const statusError = ref("");

const links = ref<TelegramLink[]>([]);
const linksLoading = ref(false);

const byoToken = ref("");
const byoConnecting = ref(false);
const byoError = ref("");
const byoWarnings = ref<string[]>([]);

const provisionStarting = ref(false);
const provisionError = ref("");
const provisionNotConfigured = ref(false);
const provisionRequest = ref<ProvisioningRequestView | null>(null);
let provisionTimer: ReturnType<typeof setInterval> | null = null;

const disconnecting = ref(false);

const testChatId = ref<number | null>(null);
const testText = ref("");
const testSending = ref(false);
const testResult = ref<{ ok: boolean; detail: string } | null>(null);

const unbindingChat = ref<number | null>(null);

const connected = computed(() => status.value?.connected === true);
const canManage = computed(() => props.enabled);

async function loadStatus(): Promise<void> {
  statusLoading.value = true;
  statusError.value = "";
  try {
    status.value = await api<TelegramStatus>("/api/telegram/status");
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : "Failed to load Telegram status";
  } finally {
    statusLoading.value = false;
  }
}

async function loadLinks(): Promise<void> {
  // /api/auth/telegram/links always requires an authenticated admin (unlike
  // /api/telegram/status, it has no auth-disabled fallback) — same gate
  // AuthSettingsPanel.vue uses for the identical route.
  if (!auth.authEnabled) return;
  linksLoading.value = true;
  try {
    const data = await api<{ links: TelegramLink[] }>("/api/auth/telegram/links");
    links.value = data.links;
    if (
      testChatId.value !== null &&
      !links.value.some((l) => l.telegramUserId === testChatId.value)
    ) {
      testChatId.value = null;
    }
  } catch {
    /* the Security tab surfaces the failure; this panel degrades to empty */
  } finally {
    linksLoading.value = false;
  }
}

function chatLabel(link: TelegramLink): string {
  const handle = link.telegramUsername ? `@${link.telegramUsername}` : `id ${link.telegramUserId}`;
  return `${handle} — ${link.email}`;
}

async function connectByo(): Promise<void> {
  const token = byoToken.value.trim();
  if (!token) return;
  byoConnecting.value = true;
  byoError.value = "";
  byoWarnings.value = [];
  try {
    const result = await api<{ ok: true; warnings: string[] }>(
      "/api/telegram/connect",
      JSON_OPTS("POST", { token }),
    );
    byoToken.value = "";
    byoWarnings.value = result.warnings ?? [];
    await loadStatus();
  } catch (err) {
    byoError.value = err instanceof Error ? err.message : "Failed to connect the bot token";
  } finally {
    byoConnecting.value = false;
  }
}

async function disconnect(): Promise<void> {
  if (!confirm("Disconnect the Telegram bot? The stored credential is forgotten immediately.")) {
    return;
  }
  disconnecting.value = true;
  statusError.value = "";
  try {
    await api("/api/telegram/disconnect", { method: "POST" });
    await loadStatus();
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : "Failed to disconnect";
  } finally {
    disconnecting.value = false;
  }
}

function stopProvisionPolling(): void {
  if (provisionTimer !== null) {
    clearInterval(provisionTimer);
    provisionTimer = null;
  }
}

async function pollProvisioning(id: string): Promise<void> {
  try {
    const data = await api<{ ok: true; request: ProvisioningRequestView }>(
      `/api/telegram/provision/${encodeURIComponent(id)}`,
    );
    provisionRequest.value = data.request;
    if (data.request.state === "ready") {
      stopProvisionPolling();
      await redeemProvisioning(id);
    } else if (data.request.state === "failed" || data.request.state === "expired") {
      stopProvisionPolling();
      provisionError.value =
        data.request.error ?? `The provisioning request ${data.request.state}.`;
    } else if (data.request.state === "redeemed") {
      // Already picked up (e.g. a second browser tab redeemed it first).
      stopProvisionPolling();
      provisionRequest.value = null;
      await loadStatus();
    }
  } catch (err) {
    stopProvisionPolling();
    provisionError.value = err instanceof Error ? err.message : "Lost contact with provisioning";
  }
}

async function redeemProvisioning(id: string): Promise<void> {
  try {
    const result = await api<{ ok: true; warnings: string[] }>(
      `/api/telegram/provision/${encodeURIComponent(id)}/redeem`,
      { method: "POST" },
    );
    byoWarnings.value = result.warnings ?? [];
    provisionRequest.value = null;
    await loadStatus();
  } catch (err) {
    provisionError.value =
      err instanceof Error ? err.message : "Failed to redeem the provisioned credential";
  }
}

async function beginProvisioning(): Promise<void> {
  provisionStarting.value = true;
  provisionError.value = "";
  provisionNotConfigured.value = false;
  try {
    const data = await api<{ ok: true; request: ProvisioningRequestView }>(
      "/api/telegram/provision",
      JSON_OPTS("POST", {}),
    );
    provisionRequest.value = data.request;
    if (typeof window !== "undefined") {
      window.open(data.request.deepLink, "_blank", "noopener,noreferrer");
    }
    stopProvisionPolling();
    provisionTimer = setInterval(() => void pollProvisioning(data.request.id), 2500);
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.body as { managedProvisioning?: { configured?: boolean } } | null)?.managedProvisioning
        ?.configured === false
    ) {
      provisionNotConfigured.value = true;
    }
    provisionError.value = err instanceof Error ? err.message : "Failed to start provisioning";
  } finally {
    provisionStarting.value = false;
  }
}

function cancelProvisioning(): void {
  stopProvisionPolling();
  provisionRequest.value = null;
  provisionError.value = "";
}

async function sendTestMessage(): Promise<void> {
  if (testChatId.value === null) return;
  testSending.value = true;
  testResult.value = null;
  try {
    await api(
      "/api/telegram/test-message",
      JSON_OPTS("POST", {
        chatId: testChatId.value,
        ...(testText.value.trim() ? { text: testText.value.trim() } : {}),
      }),
    );
    testResult.value = { ok: true, detail: "Sent — check the chat in Telegram." };
  } catch (err) {
    testResult.value = {
      ok: false,
      detail: err instanceof Error ? err.message : "Failed to send the test message",
    };
  } finally {
    testSending.value = false;
  }
}

async function unbindChat(link: TelegramLink): Promise<void> {
  const label = link.telegramUsername
    ? `@${link.telegramUsername}`
    : `Telegram id ${link.telegramUserId}`;
  if (!confirm(`Unbind ${label} (${link.email})? It will stop receiving notifications.`)) return;
  unbindingChat.value = link.telegramUserId;
  try {
    await api(`/api/auth/telegram/links/${link.telegramUserId}`, { method: "DELETE" });
    await loadLinks();
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : "Failed to unbind chat";
  } finally {
    unbindingChat.value = null;
  }
}

onMounted(() => {
  void loadStatus();
  void loadLinks();
});

onBeforeUnmount(() => {
  stopProvisionPolling();
});
</script>

<template>
  <div class="tgp-root">
    <div v-if="statusError" class="ff-error">{{ statusError }}</div>

    <!-- Status -->
    <div class="tgp-status-row">
      <span
        class="tgp-status-dot"
        :class="{ connected: connected, disconnected: !connected }"
        aria-hidden="true"
      ></span>
      <span class="tgp-status-text">
        <template v-if="statusLoading && !status">Loading status…</template>
        <template v-else-if="connected">
          Connected to <strong>{{ status?.bot?.displayName }}</strong> (<span class="mono"
            >@{{ status?.bot?.username }}</span
          >)
          <span class="tgp-status-meta">
            ·
            {{
              status?.bot?.source === "managed"
                ? "managed provisioning"
                : "Bring Your Own Bot Token"
            }}
            · transport {{ status?.transport?.mode ?? "off" }}
          </span>
        </template>
        <template v-else>Not connected</template>
      </span>
      <Button
        v-if="connected"
        variant="outline"
        size="sm"
        :disabled="disconnecting"
        @click="disconnect"
      >
        {{ disconnecting ? "Disconnecting…" : "Disconnect" }}
      </Button>
      <Button variant="outline" size="sm" :disabled="statusLoading" @click="loadStatus"
        >Refresh</Button
      >
    </div>
    <div v-if="status?.lastError" class="ff-error">Last error: {{ status.lastError }}</div>

    <div v-if="!canManage" class="ff-notice">
      Turn on the Telegram bot switch above to connect a bot for this repository.
    </div>

    <!-- Connect flows (only relevant while disconnected) -->
    <template v-if="canManage && !connected">
      <div class="tgp-connect-grid">
        <div class="tgp-connect-card">
          <div class="tgp-connect-title">Connect Telegram</div>
          <p class="tgp-connect-desc">
            Provisions a project bot for this repository through RepoOS's managed service — no
            BotFather required.
          </p>
          <div v-if="provisionRequest" class="tgp-provision-pending">
            <p>
              Waiting on Telegram — open the deep link if it didn't open automatically, finish the
              steps there, then come back.
            </p>
            <a :href="provisionRequest.deepLink" target="_blank" rel="noreferrer">{{
              provisionRequest.deepLink
            }}</a>
            <div class="btn-row" style="justify-content: flex-start">
              <Button variant="outline" size="sm" @click="cancelProvisioning">Cancel</Button>
            </div>
          </div>
          <div v-else class="btn-row" style="justify-content: flex-start">
            <Button size="sm" :disabled="provisionStarting" @click="beginProvisioning">
              {{ provisionStarting ? "Starting…" : "Connect Telegram" }}
            </Button>
          </div>
          <div v-if="provisionError" class="ff-error">{{ provisionError }}</div>
          <div v-if="provisionNotConfigured" class="ff-notice">
            Managed provisioning isn't configured for this repository yet — use Bring Your Own Bot
            Token instead.
          </div>
        </div>

        <div class="tgp-connect-card">
          <div class="tgp-connect-title">Bring Your Own Bot Token</div>
          <p class="tgp-connect-desc">
            Create a bot with
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>, paste
            its token here once. It's stored encrypted server-side and never sent back to the
            browser.
          </p>
          <div class="field">
            <label for="tgp-byo-token">Bot token</label>
            <Input
              id="tgp-byo-token"
              type="password"
              autocomplete="off"
              placeholder="123456789:AA…"
              :model-value="byoToken"
              @update:model-value="(v) => (byoToken = String(v))"
            />
          </div>
          <div class="btn-row" style="justify-content: flex-start">
            <Button size="sm" :disabled="byoConnecting || !byoToken.trim()" @click="connectByo">
              {{ byoConnecting ? "Connecting…" : "Connect" }}
            </Button>
          </div>
          <div v-if="byoError" class="ff-error">{{ byoError }}</div>
        </div>
      </div>
    </template>

    <div v-if="byoWarnings.length" class="ff-notice">
      <span v-for="(w, i) in byoWarnings" :key="i">{{ w }}</span>
    </div>

    <!-- Test message + bound chats -->
    <template v-if="canManage && connected">
      <div class="tgp-section-label">Send a test message</div>
      <div class="tgp-test-row">
        <Select
          :model-value="testChatId !== null ? String(testChatId) : ''"
          :disabled="links.length === 0"
          @update:model-value="(v) => (testChatId = v ? Number(v) : null)"
        >
          <SelectTrigger class="h-[34px] w-[260px] rounded-[9px] px-[11px]">
            <SelectValue placeholder="Choose a bound chat" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
              <SelectItem
                v-for="link in links"
                :key="link.telegramUserId"
                :value="String(link.telegramUserId)"
                >{{ chatLabel(link) }}</SelectItem
              >
            </SelectViewport>
          </SelectContent>
        </Select>
        <Input
          type="text"
          placeholder="Optional custom text"
          :model-value="testText"
          @update:model-value="(v) => (testText = String(v))"
        />
        <Button
          size="sm"
          variant="outline"
          :disabled="testChatId === null || testSending"
          @click="sendTestMessage"
        >
          {{ testSending ? "Sending…" : "Send test" }}
        </Button>
      </div>
      <div v-if="links.length === 0 && !linksLoading" class="ff-notice">
        No Telegram accounts are bound yet — create a bind invite from Settings → Security →
        Authentication &amp; Users, then pick a chat here to test it.
      </div>
      <div v-if="testResult" :class="testResult.ok ? 'tgp-test-ok' : 'ff-error'">
        {{ testResult.detail }}
      </div>

      <div class="tgp-section-label">Bound chats</div>
      <div v-if="linksLoading" class="tgp-muted">Loading bound chats…</div>
      <div v-else-if="links.length === 0" class="tgp-muted">No chats bound yet.</div>
      <div v-else class="tgp-chat-list">
        <div v-for="link in links" :key="link.telegramUserId" class="tgp-chat-row">
          <div class="tgp-chat-info">
            <span class="tgp-chat-handle">{{
              link.telegramUsername ? `@${link.telegramUsername}` : `id ${link.telegramUserId}`
            }}</span>
            <span class="tgp-chat-email">{{ link.email }}</span>
            <span v-if="link.role" class="tgp-chat-role">{{ link.role }}</span>
            <span v-if="!link.allowlisted" class="tgp-chat-inert">not on allowlist</span>
          </div>
          <button
            class="tgp-unbind-btn"
            :disabled="unbindingChat === link.telegramUserId"
            @click="unbindChat(link)"
          >
            Unbind
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tgp-root {
  padding: 4px 0 12px;
}
.tgp-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 0;
}
.tgp-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tgp-status-dot.connected {
  background: var(--green);
  box-shadow: 0 0 0 3px rgba(96, 217, 141, 0.18);
}
.tgp-status-dot.disconnected {
  background: var(--txt-faint);
}
.tgp-status-text {
  font-size: 13px;
  color: var(--txt);
  flex: 1;
}
.tgp-status-meta {
  color: var(--txt-dim);
  font-size: 12px;
}
.tgp-connect-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin: 8px 0 4px;
}
@media (max-width: 720px) {
  .tgp-connect-grid {
    grid-template-columns: 1fr;
  }
}
.tgp-connect-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.tgp-connect-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--txt);
  margin-bottom: 4px;
}
.tgp-connect-desc {
  font-size: 12px;
  color: var(--txt-dim);
  margin: 0 0 10px;
  line-height: 1.5;
}
.tgp-provision-pending p {
  font-size: 12px;
  color: var(--txt-dim);
  margin: 0 0 6px;
}
.tgp-provision-pending a {
  font-size: 12px;
  color: var(--cyan);
  word-break: break-all;
}
.tgp-section-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--txt-faint);
  font-weight: 600;
  margin: 18px 0 8px;
}
.tgp-test-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tgp-test-ok {
  font-size: 12px;
  color: var(--green);
  margin-top: 6px;
}
.tgp-muted {
  font-size: 13px;
  color: var(--txt-dim);
  padding: 4px 0;
}
.tgp-chat-list {
  padding: 4px 0;
}
.tgp-chat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.tgp-chat-row:last-child {
  border-bottom: none;
}
.tgp-chat-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tgp-chat-handle {
  font-size: 13px;
  font-weight: 500;
  color: var(--txt);
}
.tgp-chat-email {
  font-size: 12px;
  color: var(--txt-dim);
}
.tgp-chat-role {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--border);
  color: var(--txt-dim);
  text-transform: capitalize;
}
.tgp-chat-inert {
  font-size: 11px;
  color: var(--red);
}
.tgp-unbind-btn {
  background: none;
  border: none;
  color: var(--red);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}
.tgp-unbind-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
