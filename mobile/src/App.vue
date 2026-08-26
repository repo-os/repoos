<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { init, servers, selected, selectServer, addServer, removeServer, renameServer, reorderServer, setLock, lockSettings, lockSupported, loaded } from "./app-state";
import { openServer, onBrowserEvents } from "./browser";
import { verifyWithDeviceLock } from "./lock";
import type { ServerEntry } from "./types";

const mode = ref<"picker" | "add" | "edit">("picker");
const editingId = ref<string | null>(null);

// ── add/edit form state ────────────────────────────────────────────────
const formName = ref("");
const formUrl = ref("");
const formBusy = ref(false);
const formError = ref("");
const formValidating = ref(false);

// ── lock gate state ─────────────────────────────────────────────────────
const lockOpen = ref(false);
const lockStagingId = ref<string | null>(null);

const showSettings = ref(false);
const lockScope = ref<"reopen" | "server">("reopen");

const hasServers = computed(() => servers.value.length > 0);
const isEmpty = computed(() => loaded.value && !hasServers.value);

onMounted(async () => {
  await init();
  onBrowserEvents({ closed: () => { /* returning to picker */ } });
  // If a lock is enabled at reopen scope, gate on launch.
  if (lockSettings.value.enabled && lockSettings.value.scope === "reopen") {
    await gateLock(null);
  }
});

async function gateLock(serverId: string | null): Promise<boolean> {
  if (!lockSettings.value.enabled) return true;
  lockStagingId.value = serverId;
  lockOpen.value = true;
  const ok = await verifyWithDeviceLock("Unlock RepoOS to continue");
  lockOpen.value = false;
  return ok;
}

// ── picker actions ──────────────────────────────────────────────────────
async function onSelect(server: ServerEntry) {
  if (lockSettings.value.enabled && lockSettings.value.scope === "server") {
    const ok = await gateLock(server.id);
    if (!ok) return;
  }
  await selectServer(server.id);
  await openServer(server.url);
}

function startAdd() {
  formName.value = "";
  formUrl.value = "";
  formError.value = "";
  mode.value = "add";
}

function startEdit(server: ServerEntry) {
  editingId.value = server.id;
  formName.value = server.name;
  formUrl.value = server.url;
  formError.value = "";
  mode.value = "edit";
}

function cancelForm() {
  mode.value = "picker";
  editingId.value = null;
  formError.value = "";
}

async function submitForm() {
  formError.value = "";
  if (!formUrl.value.trim()) {
    formError.value = "Enter a server URL.";
    return;
  }
  if (mode.value === "add") {
    formBusy.value = true;
    formValidating.value = true;
    const res = await addServer(formName.value, formUrl.value);
    formValidating.value = false;
    formBusy.value = false;
    if (res.error) {
      formError.value = res.error;
      return;
    }
    mode.value = "picker";
  } else {
    if (editingId.value) await renameServer(editingId.value, formName.value);
    mode.value = "picker";
    editingId.value = null;
  }
}

async function onRemove(server: ServerEntry) {
  await removeServer(server.id);
}

// ── lock settings ───────────────────────────────────────────────────────
function toggleLock() {
  lockSettings.value.enabled = !lockSettings.value.enabled;
  persistLock();
}
function setScope(scope: "reopen" | "server") {
  lockScope.value = scope;
  lockSettings.value.scope = scope;
  persistLock();
}
async function persistLock() {
  await setLock({ enabled: lockSettings.value.enabled, scope: lockSettings.value.scope });
}
</script>

<template>
  <div class="shell">
    <!-- ── App header ─────────────────────────────────────────────── -->
    <header class="topbar">
      <div class="brand">
        <span class="logo" aria-hidden="true">◈</span>
        <span class="brand-name">RepoOS</span>
      </div>
      <button
        class="icon-btn"
        :disabled="!loaded"
        aria-label="Settings"
        @click="showSettings = !showSettings"
      >
        ⚙
      </button>
    </header>

    <!-- ── Lock gate overlay ──────────────────────────────────────── -->
    <div v-if="lockOpen" class="lock-overlay">
      <div class="lock-card">
        <div class="lock-icon" aria-hidden="true">🔒</div>
        <div class="lock-title">RepoOS is locked</div>
        <div class="lock-sub">Authenticate with your device to continue.</div>
      </div>
    </div>

    <!-- ── Settings sheet ─────────────────────────────────────────── -->
    <div v-if="showSettings" class="settings">
      <div class="section-title">Device lock</div>
      <p class="hint">
        Optionally require biometrics or your device passcode before reopening the app or a
        selected server. This is separate from each server's own sign-in.
      </p>
      <label class="row">
        <span class="row-label">Enable device lock</span>
        <button
          class="switch"
          :class="{ on: lockSettings.enabled }"
          role="switch"
          :aria-checked="lockSettings.enabled"
          @click="toggleLock"
        >
          <span class="knob"></span>
        </button>
      </label>
      <template v-if="lockSettings.enabled">
        <label class="row">
          <span class="row-label">Lock on</span>
          <select class="select" :value="lockSettings.scope" @change="setScope(($event.target as HTMLSelectElement).value as 'reopen' | 'server')">
            <option value="reopen">Reopening the app</option>
            <option value="server">Opening a server</option>
          </select>
        </label>
        <p v-if="!lockSupported" class="warn">
          Biometrics aren't available on this device — the lock will be skipped.
        </p>
      </template>
      <button class="link" @click="showSettings = false">Close</button>
    </div>

    <!-- ── Picker / empty state ───────────────────────────────────── -->
    <main v-if="mode === 'picker'" class="content">
      <div v-if="!loaded" class="center muted">Loading…</div>

      <div v-else-if="isEmpty" class="center">
        <div class="hero-logo" aria-hidden="true">◈</div>
        <h1 class="hero-title">Add your first server</h1>
        <p class="hero-sub">
          Enter the address of a self-hosted RepoOS instance. It's saved on this device only —
          never sent anywhere.
        </p>
        <button class="primary" @click="startAdd">+ Add server</button>
      </div>

      <ul v-else class="server-list">
        <li
          v-for="(server, i) in servers"
          :key="server.id"
          class="server-item"
          :class="{ selected: selected?.id === server.id }"
        >
          <button class="server-main" @click="onSelect(server)">
            <span class="server-avatar" aria-hidden="true">{{ server.name.slice(0, 1).toUpperCase() }}</span>
            <span class="server-meta">
              <span class="server-name">{{ server.name }}</span>
              <span class="server-url">{{ server.url.replace("https://", "") }}</span>
            </span>
            <span class="chevron" aria-hidden="true">›</span>
          </button>
          <div class="server-actions">
            <button class="icon-btn sm" :disabled="i === 0" aria-label="Move up" @click="reorderServer(server.id, -1)">↑</button>
            <button class="icon-btn sm" :disabled="i === servers.length - 1" aria-label="Move down" @click="reorderServer(server.id, 1)">↓</button>
            <button class="icon-btn sm" aria-label="Edit" @click="startEdit(server)">✎</button>
            <button class="icon-btn sm danger" aria-label="Delete" @click="onRemove(server)">✕</button>
          </div>
        </li>
      </ul>

      <button v-if="hasServers" class="primary block" @click="startAdd">+ Add server</button>
    </main>

    <!-- ── Add / edit form ────────────────────────────────────────── -->
    <main v-else class="content">
      <h1 class="form-title">{{ mode === "add" ? "Add server" : "Edit server" }}</h1>
      <label class="field">
        <span class="field-label">Display name</span>
        <input v-model="formName" type="text" placeholder="dev" autocomplete="off" enterkeyhint="done" />
      </label>
      <label class="field">
        <span class="field-label">Server URL (HTTPS)</span>
        <input
          v-model="formUrl"
          type="url"
          placeholder="https://dev.repoos.org"
          inputmode="url"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="go"
        />
      </label>
      <p v-if="formError" class="form-error">{{ formError }}</p>
      <p v-if="mode === 'edit'" class="hint">URL can't be changed here — delete and re-add to point elsewhere.</p>

      <div class="form-actions">
        <button class="ghost" @click="cancelForm">Cancel</button>
        <button class="primary" :disabled="formBusy" @click="submitForm">
          {{ formValidating ? "Checking…" : mode === "add" ? "Save" : "Done" }}
        </button>
      </div>
    </main>
  </div>
</template>
