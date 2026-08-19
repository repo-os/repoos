<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api, JSON_OPTS } from "../api";
import { useDocsStore } from "../stores/docs";
import Button from "./ui/button.vue";
import Card from "./ui/card.vue";
import Input from "./ui/input.vue";
import Switch from "./ui/switch.vue";

const router = useRouter();
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

const users = ref<AuthUser[]>([]);
const auditLog = ref<AuditEntry[]>([]);
const loadingUsers = ref(false);
const loadingAudit = ref(false);
const newEmail = ref("");
const newRole = ref<"admin" | "member">("member");
const adding = ref(false);
const errorMsg = ref("");
const successMsg = ref("");
const authEnabled = ref(false);
const showAudit = ref(false);

async function loadUsers(): Promise<void> {
  loadingUsers.value = true;
  try {
    const data = await api<{ users: AuthUser[] }>("/api/auth/users");
    users.value = data.users;
  } catch { /* ignore */ } finally {
    loadingUsers.value = false;
  }
}

async function loadAudit(): Promise<void> {
  loadingAudit.value = true;
  try {
    const data = await api<{ entries: AuditEntry[] }>("/api/auth/audit?limit=30");
    auditLog.value = data.entries;
  } catch { /* ignore */ } finally {
    loadingAudit.value = false;
  }
}

async function addUser(): Promise<void> {
  if (!newEmail.value.trim()) return;
  adding.value = true;
  errorMsg.value = "";
  successMsg.value = "";
  try {
    await api("/api/auth/users", JSON_OPTS("POST", {
      email: newEmail.value.trim().toLowerCase(),
      role: newRole.value,
    }));
    successMsg.value = `Added ${newEmail.value}`;
    newEmail.value = "";
    newRole.value = "member";
    await loadUsers();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Failed to add user";
  } finally {
    adding.value = false;
  }
}

async function removeUser(email: string): Promise<void> {
  if (!confirm(`Remove ${email}? Their sessions will be revoked.`)) return;
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
  if (newR === "member" && user.role === "admin" && users.value.filter((u) => u.role === "admin").length <= 1) {
    errorMsg.value = "Cannot demote the last admin";
    return;
  }
  errorMsg.value = "";
  try {
    await api(`/api/auth/users/${encodeURIComponent(user.email)}`, JSON_OPTS("PATCH", { role: newR }));
    await loadUsers();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "Failed to change role";
  }
}

watch(showAudit, (show) => {
  if (show && auditLog.value.length === 0) void loadAudit();
});

onMounted(loadUsers);

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
        <select v-model="newRole" class="auth-role-select">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <Button size="sm" :disabled="adding || !newEmail.trim()" @click="addUser">
          {{ adding ? "Adding..." : "Add user" }}
        </Button>
      </div>
      <p v-if="errorMsg" class="auth-error">{{ errorMsg }}</p>
      <p v-if="successMsg" class="auth-success">{{ successMsg }}</p>

      <!-- User list -->
      <div v-if="loadingUsers" class="auth-loading">Loading users...</div>
      <div v-else-if="users.length === 0" class="auth-empty">No users added yet.</div>
      <div v-else class="auth-user-list">
        <div v-for="user in users" :key="user.email" class="auth-user-row">
          <div class="auth-user-info">
            <span class="auth-user-email">{{ user.email }}</span>
            <span class="auth-user-role" :class="user.role">{{ user.role }}</span>
            <span class="auth-user-source">{{ user.authSource }}</span>
          </div>
          <div class="auth-user-actions">
            <button class="auth-action" @click="toggleRole(user)">
              {{ user.role === "admin" ? "Demote" : "Promote" }}
            </button>
            <button class="auth-action danger" @click="removeUser(user.email)">Remove</button>
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
    </div>
  </Card>
</template>

<style scoped>
.auth-info {
  padding: 12px 0;
}
.auth-desc {
  font-size: 13px;
  color: var(--text-secondary, #666);
  margin: 0;
}
.auth-add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}
.auth-role-select {
  padding: 6px 10px;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
  font-size: 13px;
  background: var(--surface, #fff);
  color: var(--text, #1a1a1a);
}
.auth-error {
  color: #dc2626;
  font-size: 12px;
  margin: 4px 0;
}
.auth-success {
  color: #16a34a;
  font-size: 12px;
  margin: 4px 0;
}
.auth-loading, .auth-empty {
  padding: 12px 0;
  font-size: 13px;
  color: var(--text-secondary, #999);
}
.auth-user-list {
  padding: 8px 0;
}
.auth-user-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-light, #f0f0f0);
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
}
.auth-user-role {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}
.auth-user-role.admin {
  background: #dbeafe;
  color: #1e40af;
}
.auth-user-role.member {
  background: #f3f4f6;
  color: #374151;
}
.auth-user-source {
  font-size: 11px;
  color: var(--text-secondary, #999);
}
.auth-user-actions {
  display: flex;
  gap: 8px;
}
.auth-action {
  background: none;
  border: none;
  color: var(--accent, #3b82f6);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}
.auth-action.danger {
  color: #dc2626;
}
.auth-audit-toggle {
  padding: 8px 0 0 0;
}
.auth-link {
  background: none;
  border: none;
  color: var(--accent, #3b82f6);
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
  border-bottom: 1px solid var(--border-light, #f0f0f0);
}
.auth-audit-action {
  font-weight: 500;
  min-width: 100px;
}
.auth-audit-target {
  min-width: 140px;
}
.auth-audit-actor {
  color: var(--text-secondary, #999);
  flex: 1;
}
.auth-audit-time {
  color: var(--text-secondary, #999);
  font-size: 11px;
}
</style>
