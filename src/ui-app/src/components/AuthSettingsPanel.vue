<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api, JSON_OPTS } from "../api";
import { useAuthStore } from "../stores/auth";
import { useDocsStore } from "../stores/docs";
import ConfirmDialog from "./ConfirmDialog.vue";
import Button from "./ui/button.vue";
import Card from "./ui/card.vue";
import Input from "./ui/input.vue";
import Select from "./ui/select/root.vue";
import SelectContent from "./ui/select/content.vue";
import SelectItem from "./ui/select/item.vue";
import SelectTrigger from "./ui/select/trigger.vue";
import SelectValue from "./ui/select/value.vue";
import SelectViewport from "./ui/select/viewport.vue";

const router = useRouter();
const auth = useAuthStore();
const docs = useDocsStore();

function openAuthDocs(): void {
  void docs.loadDoc("docs/native-auth.md");
  void router.push({ name: "repo" });
}

interface AuthUser {
  email: string;
  role: "admin" | "member";
  displayName: string | null;
  authSource: string;
  addedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuditEntry {
  id: number;
  action: string;
  targetEmail: string | null;
  actorEmail: string | null;
  details: string | null;
  createdAt: string;
}

interface TelegramLink {
  telegramUserId: number;
  email: string;
  telegramUsername: string | null;
  boundAt: string;
  boundBy: string | null;
  lastSeenAt: string | null;
  role: "admin" | "member" | null;
  allowlisted: boolean;
}

interface TelegramInvite {
  email: string;
  startPayload: string;
  expiresAt: string;
  deepLink: string | null;
}

const users = ref<AuthUser[]>([]);
const auditLog = ref<AuditEntry[]>([]);
const loadingUsers = ref(false);
const loadingAudit = ref(false);
const newEmail = ref("");
const newRole = ref<"admin" | "member">("member");
const adding = ref(false);
const errorMsg = ref("");
const successMsg = ref("");
const showAudit = ref(false);
const invitingEmail = ref<string | null>(null);
const linkingEmail = ref<string | null>(null);
const telegramLinks = ref<TelegramLink[]>([]);
const loadingLinks = ref(false);
const pendingInvite = ref<TelegramInvite | null>(null);
const reassignEmail = ref<Record<number, string>>({});
const disconnectingTelegram = ref(false);
/** Email waiting on the shared removal dialog (replaces native confirm()). */
const pendingRemoval = ref<string | null>(null);
/** Email offered an invite right after it was added. */
const pendingInviteOffer = ref<string | null>(null);
/** Set when the list cannot load, so offline never reads as "No users added yet." */
const usersError = ref("");
/** Telegram account waiting on the unbind dialog. */
const pendingUnbind = ref<TelegramLink | null>(null);
/** Whether the disconnect dialog is open. */
const pendingDisconnect = ref(false);
/** Telegram reassignment waiting on its dialog, with the target fixed at open time. */
const pendingReassign = ref<{ link: TelegramLink; email: string } | null>(null);
/** Same rule for the Telegram links and audit panes: an error is never an empty list. */
const linksError = ref("");
const auditError = ref("");

async function loadUsers(): Promise<void> {
  loadingUsers.value = true;
  usersError.value = "";
  try {
    const data = await api<{ users: AuthUser[] }>("/api/auth/users");
    users.value = data.users;
  } catch {
    usersError.value = "Couldn’t load users. Check the connection, then try again.";
  } finally {
    loadingUsers.value = false;
  }
}

async function loadTelegramLinks(): Promise<void> {
  loadingLinks.value = true;
  linksError.value = "";
  try {
    const data = await api<{ links: TelegramLink[] }>("/api/auth/telegram/links");
    telegramLinks.value = data.links;
    const next: Record<number, string> = {};
    for (const link of data.links) next[link.telegramUserId] = link.email;
    reassignEmail.value = next;
  } catch {
    // Shown as an error, never as an empty list (#1239 review).
    linksError.value = "Couldn’t load Telegram accounts. Check the connection, then try again.";
  } finally {
    loadingLinks.value = false;
  }
}

async function loadAudit(): Promise<void> {
  loadingAudit.value = true;
  auditError.value = "";
  try {
    const data = await api<{ entries: AuditEntry[] }>("/api/auth/audit?limit=30");
    auditLog.value = data.entries;
  } catch {
    auditError.value = "Couldn’t load the audit log. Check the connection, then try again.";
  } finally {
    loadingAudit.value = false;
  }
}

async function addUser(): Promise<void> {
  // Enter repeats while the first add is in flight must not re-POST (#1239 review).
  if (!newEmail.value.trim() || adding.value) return;
  const email = newEmail.value.trim().toLowerCase();
  adding.value = true;
  errorMsg.value = "";
  successMsg.value = "";
  try {
    await api(
      "/api/auth/users",
      JSON_OPTS("POST", {
        email,
        role: newRole.value,
      }),
    );
    successMsg.value = `Added ${email}`;
    newEmail.value = "";
    newRole.value = "member";
    await loadUsers();
    pendingInviteOffer.value = email;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Failed to add user";
  } finally {
    adding.value = false;
  }
}

async function sendInvite(email: string): Promise<void> {
  invitingEmail.value = email;
  errorMsg.value = "";
  successMsg.value = "";
  try {
    await api(`/api/auth/users/${encodeURIComponent(email)}/invite`, JSON_OPTS("POST", {}));
    successMsg.value = `Invite sent to ${email}`;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Failed to send invite";
  } finally {
    invitingEmail.value = null;
  }
}

async function createTelegramInvite(email: string): Promise<void> {
  linkingEmail.value = email;
  errorMsg.value = "";
  successMsg.value = "";
  try {
    const created = await api<TelegramInvite>(
      "/api/auth/telegram/invites",
      JSON_OPTS("POST", { email }),
    );
    pendingInvite.value = created;
    successMsg.value = `Telegram invite ready for ${email}`;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Failed to create Telegram invite";
  } finally {
    linkingEmail.value = null;
  }
}

async function copyStartPayload(): Promise<void> {
  const invite = pendingInvite.value;
  if (!invite) return;
  const text = invite.deepLink ?? `/start ${invite.startPayload}`;
  try {
    await navigator.clipboard.writeText(text);
    successMsg.value = "Copied Telegram start link";
  } catch {
    errorMsg.value = "Could not copy to clipboard";
  }
}

/** The Telegram account the unbind dialog is asking about. */
function askUnbindTelegram(link: TelegramLink): void {
  pendingUnbind.value = link;
}

async function confirmUnbind(): Promise<void> {
  const link = pendingUnbind.value;
  pendingUnbind.value = null;
  if (link) await unbindTelegram(link);
}

function askDisconnectTelegram(): void {
  pendingDisconnect.value = true;
}

async function confirmDisconnect(): Promise<void> {
  pendingDisconnect.value = false;
  await disconnectTelegramIntegration();
}

/** The reassign dialog keeps the target chosen when it opened (#1239 review). */
function askReassignTelegram(link: TelegramLink): void {
  const email = reassignEmail.value[link.telegramUserId] ?? "";
  if (!email || email === link.email) return;
  pendingReassign.value = { link, email };
}

async function confirmReassign(): Promise<void> {
  const pending = pendingReassign.value;
  pendingReassign.value = null;
  if (pending) await reassignTelegram(pending.link, pending.email);
}

async function unbindTelegram(link: TelegramLink): Promise<void> {
  errorMsg.value = "";
  try {
    await api(`/api/auth/telegram/links/${link.telegramUserId}`, { method: "DELETE" });
    await loadTelegramLinks();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Failed to unbind Telegram user";
  }
}

async function disconnectTelegramIntegration(): Promise<void> {
  disconnectingTelegram.value = true;
  errorMsg.value = "";
  successMsg.value = "";
  try {
    const body = (await api("/api/auth/telegram/disconnect", {
      method: "POST",
      ...JSON_OPTS,
    })) as { result?: { complete?: boolean; warning?: string } };
    successMsg.value = "Telegram disconnected for this repository";
    await loadTelegramLinks();
  } catch (err) {
    errorMsg.value =
      err instanceof Error ? err.message : "Failed to disconnect Telegram for this repository";
  } finally {
    disconnectingTelegram.value = false;
  }
}

async function reassignTelegram(link: TelegramLink, email: string): Promise<void> {
  errorMsg.value = "";
  try {
    await api(
      `/api/auth/telegram/links/${link.telegramUserId}/reassign`,
      JSON_OPTS("POST", { email }),
    );
    await loadTelegramLinks();
    successMsg.value = `Reassigned Telegram account to ${email}`;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Failed to reassign Telegram user";
  }
}

function askRemoveUser(email: string): void {
  pendingRemoval.value = email;
}

async function confirmRemoval(): Promise<void> {
  const email = pendingRemoval.value;
  pendingRemoval.value = null;
  if (email) await removeUser(email);
}

async function confirmInviteOffer(): Promise<void> {
  const email = pendingInviteOffer.value;
  pendingInviteOffer.value = null;
  if (email) await sendInvite(email);
}

async function removeUser(email: string): Promise<void> {
  errorMsg.value = "";
  try {
    await api(`/api/auth/users/${encodeURIComponent(email)}`, { method: "DELETE" });
    await loadUsers();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Failed to remove user";
  }
}

async function toggleRole(user: AuthUser): Promise<void> {
  const newR = user.role === "admin" ? "member" : "admin";
  if (
    newR === "member" &&
    user.role === "admin" &&
    users.value.filter((u) => u.role === "admin").length <= 1
  ) {
    errorMsg.value = "Cannot demote the last admin";
    return;
  }
  errorMsg.value = "";
  try {
    await api(
      `/api/auth/users/${encodeURIComponent(user.email)}`,
      JSON_OPTS("PATCH", { role: newR }),
    );
    await loadUsers();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Failed to change role";
  }
}

watch(showAudit, (show) => {
  if (show && auditLog.value.length === 0) void loadAudit();
});

onMounted(() => {
  if (auth.authEnabled) {
    void loadUsers();
    void loadTelegramLinks();
  }
});

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
</script>

<template>
  <Card style="padding: 0 18px 6px; margin-bottom: 16px">
    <div class="setting-group">
      <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
        <span class="live-dot"></span>Authentication & Users
      </div>

      <div class="auth-info">
        <p class="auth-desc">
          Authentication is configured via <code>repoos.toml</code> and requires a server restart.
          <button class="model-pricing-link" @click="openAuthDocs">Setup guide →</button>
          Manage the allowed users and their roles below.
        </p>
      </div>

      <!-- Add user -->
      <div class="auth-add-row">
        <Input
          v-model="newEmail"
          type="email"
          placeholder="user@example.com"
          style="flex: 1; max-width: 280px"
          @keyup.enter="addUser"
        />
        <Select
          :model-value="newRole"
          @update:model-value="(v) => (newRole = v === 'admin' ? 'admin' : 'member')"
        >
          <SelectTrigger
            class="h-[36px] w-[130px] rounded-[9px] px-[11px]"
            aria-label="New user's role"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectViewport>
          </SelectContent>
        </Select>
        <Button size="sm" :disabled="adding || !newEmail.trim()" @click="addUser">
          {{ adding ? "Adding..." : "Add user" }}
        </Button>
      </div>
      <p v-if="errorMsg" class="auth-error">{{ errorMsg }}</p>
      <p v-if="successMsg" class="auth-success">{{ successMsg }}</p>

      <!-- User list -->
      <div v-if="loadingUsers" class="auth-loading">Loading users...</div>
      <div v-else-if="usersError" class="auth-error" role="alert">
        {{ usersError }}
        <button class="auth-action" @click="loadUsers">Try again</button>
      </div>
      <div v-else-if="users.length === 0" class="auth-empty">No users added yet.</div>
      <div v-else class="auth-user-list">
        <div v-for="user in users" :key="user.email" class="auth-user-row">
          <div class="auth-user-info">
            <span class="auth-user-email">{{ user.email }}</span>
            <span class="auth-user-role" :class="user.role">{{ user.role }}</span>
          </div>
          <div class="auth-user-actions">
            <button
              class="auth-action"
              :disabled="invitingEmail === user.email"
              @click="sendInvite(user.email)"
            >
              {{ invitingEmail === user.email ? "Sending..." : "Invite" }}
            </button>
            <button
              class="auth-action"
              :disabled="linkingEmail === user.email"
              @click="createTelegramInvite(user.email)"
            >
              {{ linkingEmail === user.email ? "Creating..." : "Telegram" }}
            </button>
            <button class="auth-action" @click="toggleRole(user)">
              {{ user.role === "admin" ? "Demote" : "Promote" }}
            </button>
            <button class="auth-action danger" @click="askRemoveUser(user.email)">Remove</button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        :open="pendingRemoval !== null"
        :title="`Remove ${pendingRemoval ?? ''}?`"
        confirm-label="Remove user"
        @update:open="
          (v) => {
            if (!v) pendingRemoval = null;
          }
        "
        @confirm="confirmRemoval"
      >
        Their sessions will be revoked right away.
      </ConfirmDialog>
      <ConfirmDialog
        :open="pendingInviteOffer !== null"
        :title="`Send an invite email to ${pendingInviteOffer ?? ''} now?`"
        confirm-label="Send invite"
        @update:open="
          (v) => {
            if (!v) pendingInviteOffer = null;
          }
        "
        @confirm="confirmInviteOffer"
      >
        They get an email with a link to sign in.
      </ConfirmDialog>

      <div v-if="pendingInvite" class="tg-invite">
        <div class="tg-invite-label">Telegram bind invite for {{ pendingInvite.email }}</div>
        <p class="tg-invite-help">
          The person opens the project bot with this start payload. The numeric Telegram user ID is
          what binds; a username is only a label.
        </p>
        <code class="tg-invite-code">{{
          pendingInvite.deepLink ?? `/start ${pendingInvite.startPayload}`
        }}</code>
        <div class="tg-invite-meta">Expires {{ formatDate(pendingInvite.expiresAt) }}</div>
        <button class="auth-action" @click="copyStartPayload">Copy</button>
      </div>

      <div class="sec-label tg-links-label">Telegram accounts</div>
      <p class="auth-desc tg-links-desc">
        Each Telegram account must be bound to an allowlisted email before it can act. Reassigning
        an already-bound account is an explicit admin action.
      </p>
      <div class="tg-disconnect-row">
        <button
          class="auth-action danger"
          :disabled="disconnectingTelegram"
          @click="askDisconnectTelegram"
        >
          {{ disconnectingTelegram ? "Disconnecting…" : "Disconnect Telegram" }}
        </button>
        <span class="tg-disconnect-hint">
          Revokes the project bot and clears every binding for this repository.
        </span>
      </div>
      <div v-if="loadingLinks" class="auth-loading">Loading Telegram links...</div>
      <div v-else-if="linksError" class="auth-error" role="alert">
        {{ linksError }}
        <button class="auth-action" @click="loadTelegramLinks">Try again</button>
      </div>
      <div v-else-if="telegramLinks.length === 0" class="auth-empty">
        No Telegram accounts bound yet.
      </div>
      <div v-else class="tg-link-list">
        <div v-for="link in telegramLinks" :key="link.telegramUserId" class="tg-link-row">
          <div class="tg-link-info">
            <span class="tg-handle">{{
              link.telegramUsername ? `@${link.telegramUsername}` : `id ${link.telegramUserId}`
            }}</span>
            <span class="tg-email">{{ link.email }}</span>
            <span v-if="!link.allowlisted" class="tg-inert">not on allowlist</span>
          </div>
          <div class="auth-user-actions tg-link-actions">
            <Select
              :model-value="reassignEmail[link.telegramUserId] ?? link.email"
              @update:model-value="(v) => (reassignEmail[link.telegramUserId] = String(v))"
            >
              <SelectTrigger class="h-[28px] w-[200px] rounded-[9px] px-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem v-for="user in users" :key="user.email" :value="user.email">{{
                    user.email
                  }}</SelectItem>
                </SelectViewport>
              </SelectContent>
            </Select>
            <button
              class="auth-action"
              :disabled="(reassignEmail[link.telegramUserId] ?? link.email) === link.email"
              @click="askReassignTelegram(link)"
            >
              Reassign
            </button>
            <button class="auth-action danger" @click="askUnbindTelegram(link)">Unbind</button>
          </div>
        </div>
      </div>

      <!-- Audit log toggle -->
      <div class="auth-audit-toggle">
        <button class="auth-link" @click="showAudit = !showAudit">
          {{ showAudit ? "▾ Hide audit log" : "▸ Show audit log" }}
        </button>
      </div>
      <div v-if="showAudit" class="auth-audit">
        <div v-if="loadingAudit" class="auth-loading">Loading...</div>
        <div v-else-if="auditError" class="auth-error" role="alert">
          {{ auditError }}
          <button class="auth-action" @click="loadAudit">Try again</button>
        </div>
        <div v-else-if="auditLog.length === 0" class="auth-empty">No audit entries yet.</div>
        <div v-else class="auth-audit-list">
          <div v-for="entry in auditLog" :key="entry.id" class="auth-audit-entry">
            <span class="auth-audit-action">{{ entry.action }}</span>
            <span class="auth-audit-target">{{ entry.targetEmail ?? "-" }}</span>
            <span class="auth-audit-actor">by {{ entry.actorEmail ?? "system" }}</span>
            <span class="auth-audit-time">{{ formatDate(entry.createdAt) }}</span>
          </div>
        </div>
      </div>

      <ConfirmDialog
        :open="pendingUnbind !== null"
        :title="`Unbind Telegram ${pendingUnbind?.telegramUsername ? `@${pendingUnbind.telegramUsername}` : (pendingUnbind?.telegramUserId ?? '')} from ${pendingUnbind?.email ?? ''}?`"
        confirm-label="Unbind"
        @update:open="
          (v) => {
            if (!v) pendingUnbind = null;
          }
        "
        @confirm="confirmUnbind"
      >
        This Telegram account stops acting for that email until it is bound again.
      </ConfirmDialog>
      <ConfirmDialog
        :open="pendingDisconnect"
        title="Disconnect Telegram for this repository?"
        confirm-label="Disconnect"
        @update:open="
          (v) => {
            if (!v) pendingDisconnect = false;
          }
        "
        @confirm="confirmDisconnect"
      >
        This revokes the project bot, removes every chat binding and user link, and cannot be undone
        for a bring-your-own token. You will need a new token from BotFather to reconnect.
      </ConfirmDialog>
      <ConfirmDialog
        :open="pendingReassign !== null"
        :title="`Reassign this Telegram account from ${pendingReassign?.link.email ?? ''} to ${pendingReassign?.email ?? ''}?`"
        confirm-label="Reassign"
        @update:open="
          (v) => {
            if (!v) pendingReassign = null;
          }
        "
        @confirm="confirmReassign"
      >
        This Telegram account will act for the new email instead of the current one.
      </ConfirmDialog>
    </div>
  </Card>
</template>

<style scoped>
.auth-info {
  padding: 12px 0;
}
.auth-desc {
  font-size: 13px;
  color: var(--txt-dim);
  margin: 0;
}
.auth-add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}
.auth-error {
  color: var(--red);
  font-size: 12px;
  margin: 4px 0;
}
.auth-success {
  color: var(--green);
  font-size: 12px;
  margin: 4px 0;
}
.auth-loading,
.auth-empty {
  padding: 12px 0;
  font-size: 13px;
  color: var(--txt-dim);
}
.auth-user-list {
  padding: 8px 0;
}
.auth-user-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.auth-user-row:last-child {
  border-bottom: none;
}
.auth-user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.auth-user-email {
  font-size: 14px;
  font-weight: 500;
  color: var(--txt);
}
.auth-user-role {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}
.auth-user-role.admin {
  background: var(--violet-tint);
  color: var(--violet);
}
.auth-user-role.member {
  background: var(--border);
  color: var(--txt-dim);
}
.auth-user-actions {
  display: flex;
  gap: 8px;
}
.auth-action {
  background: none;
  border: none;
  color: var(--accent-foreground);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}
.auth-action.danger {
  color: var(--red);
}
/* Phones get finger-sized row actions (#1239); desktop keeps the compact text buttons. */
@media (max-width: 759px) {
  .auth-action {
    min-height: 44px;
    padding: 0 10px;
  }
}
.auth-audit-toggle {
  padding: 8px 0 0 0;
}
.auth-link {
  background: none;
  border: none;
  color: var(--accent-foreground);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}
.auth-audit {
  padding: 8px 0;
}
.auth-audit-list {
  max-height: 300px;
  overflow-y: auto;
}
.auth-audit-entry {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--border);
}
.auth-audit-action {
  font-weight: 500;
  min-width: 100px;
  color: var(--txt);
}
.auth-audit-target {
  min-width: 140px;
  color: var(--txt);
}
.auth-audit-actor {
  color: var(--txt-dim);
  flex: 1;
}
.auth-audit-time {
  color: var(--txt-dim);
  font-size: 11px;
}
.tg-invite {
  margin: 8px 0 16px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.tg-invite-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--txt);
}
.tg-invite-help,
.tg-invite-meta,
.tg-links-desc {
  font-size: 12px;
  color: var(--txt-dim);
  margin: 6px 0;
}
.tg-invite-code {
  display: block;
  font-size: 12px;
  word-break: break-all;
  color: var(--txt);
  margin: 8px 0;
}
.tg-links-label {
  padding-top: 16px;
  margin-bottom: 0;
}
.tg-link-list {
  padding: 8px 0 12px;
}
.tg-link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.tg-link-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tg-handle {
  font-size: 14px;
  font-weight: 500;
  color: var(--txt);
}
.tg-email {
  font-size: 12px;
  color: var(--txt-dim);
}
.tg-inert {
  font-size: 11px;
  color: var(--red);
}
.tg-link-actions {
  align-items: center;
}
</style>
