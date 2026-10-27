<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComponentPublicInstance,
} from "vue";
import Button from "../components/ui/button.vue";
import Select from "../components/ui/select/root.vue";
import SelectContent from "../components/ui/select/content.vue";
import SelectItem from "../components/ui/select/item.vue";
import SelectTrigger from "../components/ui/select/trigger.vue";
import SelectValue from "../components/ui/select/value.vue";
import SelectViewport from "../components/ui/select/viewport.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import Dialog from "../components/ui/dialog/root.vue";
import DialogContent from "../components/ui/dialog/content.vue";
import DialogOverlay from "../components/ui/dialog/overlay.vue";
import DialogTitle from "../components/ui/dialog/title.vue";
import DialogDescription from "../components/ui/dialog/description.vue";
import DialogClose from "../components/ui/dialog/close.vue";
import { ApiError, api, JSON_OPTS } from "../api";
import { useAuthStore } from "../stores/auth";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { readShotPreviewFixtureFromLocation } from "../lib/shot-preview-fixtures";
import PageSkeleton from "../components/PageSkeleton.vue";
import { invalidatePageData, refreshPageData } from "../composables/page-data-cache";

type Environment = {
  id: string;
  sources: { id: string; path: string; examplePath?: string; exists?: boolean }[];
};
type KeyRow = {
  name: string;
  status: "set" | "missing" | "inherited";
  inherited?: boolean;
  source: string;
  visibility: string;
  version: string;
  consumers: string[];
  restartNeeded: boolean;
};
type Snapshot = { environment: string; version: string; keys: KeyRow[] };
const environments = ref<Environment[]>([]);
const selected = ref("");
const snapshot = ref<Snapshot | null>(null);
const loading = ref(true);
const error = ref("");
const snapshotRefreshError = ref("");
const query = ref("");
const createOpen = ref(false);
const newName = ref("");
const keyDraft = ref("");
const valueDraft = ref("");
const saving = ref(false);
const confirmKey = ref<KeyRow | null>(null);
const message = ref("");
const createError = ref("");
const addOpen = ref(false);
const restartKeys = ref(new Set<string>());
const shotFixture = readShotPreviewFixtureFromLocation(window.location);
const fixture = shotFixture === "secrets:populated" || shotFixture === "secrets:removeDialog";
const auth = useAuthStore();
const repo = useRepoStore();
const config = useConfigStore();
const canManage = computed(() => fixture || auth.role === "admin");
const environmentFile = computed(() => {
  const env = environments.value.find((item) => item.id === selected.value);
  return (
    env?.sources
      .map((source) => source.path)
      .filter(Boolean)
      .join(", ") ?? ""
  );
});
const visibleRows = computed(() =>
  (snapshot.value?.keys ?? [])
    .map((row) =>
      row.inherited && row.status === "set" ? { ...row, status: "inherited" as const } : row,
    )
    .filter((row) =>
      [row.name, row.status, row.source, row.visibility, ...row.consumers]
        .join(" ")
        .toLowerCase()
        .includes(query.value.trim().toLowerCase()),
    ),
);
const rowVisibility = (row: KeyRow) =>
  row.visibility === "public" ? "Public · exposed to client builds" : "Server only";

// ---- Compact rows (#0953) ----
//
// Every key is one line: status dot, monospace name, short badges, a masked
// value placeholder, and an options menu. Values are write-only — the masked
// column is decorative and no reveal or copy control exists anywhere on this
// page (user-docs/environment-and-secrets.md, "What file-backed means").

/** Decorative masked placeholder; never derived from a real value. */
const MASK = "•••••••";
const statusLabel = (status: KeyRow["status"]) =>
  status === "set" ? "Set" : status === "inherited" ? "Inherited" : "Missing";
const maskedFor = (row: KeyRow) => (row.status === "missing" ? "Not set" : MASK);
/** Hover/focus tooltip for a truncated key: one line of key metadata. */
const rowTip = (row: KeyRow) =>
  [
    `${statusLabel(row.status)} · ${rowVisibility(row)}`,
    `Source: ${row.source}`,
    `Consumers: ${row.consumers.length ? row.consumers.join(", ") : "none"}`,
    row.restartNeeded || restartKeys.value.has(row.name) ? "Restart needed after change" : "",
  ]
    .filter(Boolean)
    .join(" · ");
const countText = computed(() => {
  const total = snapshot.value?.keys.length ?? 0;
  const shown = visibleRows.value.length;
  return query.value.trim() ? `${shown} of ${total} keys` : `${total} keys`;
});

// ---- Per-row options menu ----

const openMenuKey = ref<string | null>(null);
const editingKey = ref<string | null>(null);
const menuPopover = ref<HTMLElement | null>(null);
const menuTrigger = ref<HTMLElement | null>(null);

function toggleMenu(row: KeyRow, event: MouseEvent): void {
  if (openMenuKey.value === row.name) {
    closeMenu();
    return;
  }
  openMenuKey.value = row.name;
  menuTrigger.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  void nextTick(() => menuPopover.value?.querySelector<HTMLElement>("button")?.focus());
}
/** Function ref: rows render in a v-for, so only the open menu binds here. */
function setMenuRef(el: Element | ComponentPublicInstance | null): void {
  menuPopover.value = el instanceof HTMLElement ? el : null;
}
function closeMenu(refocusTrigger = false): void {
  openMenuKey.value = null;
  if (refocusTrigger) void nextTick(() => menuTrigger.value?.focus());
}
/** Arrow keys walk the items, Escape closes back onto the trigger. */
function onMenuKeydown(event: KeyboardEvent): void {
  const popover = menuPopover.value;
  if (!popover) return;
  const items = [...popover.querySelectorAll<HTMLElement>("button")];
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (event.key === "Escape") {
    event.stopPropagation();
    closeMenu(true);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    items[(index + 1) % items.length]?.focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    items[(index - 1 + items.length) % items.length]?.focus();
  }
}
function onDocumentPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Element)) return;
  if (!event.target.closest(".secrets-row-menu")) closeMenu();
}
function beginEdit(row: KeyRow): void {
  keyDraft.value = row.name;
  valueDraft.value = "";
  editingKey.value = row.name;
  closeMenu();
}
function cancelEdit(): void {
  editingKey.value = null;
  keyDraft.value = "";
  valueDraft.value = "";
}
function menuLabel(row: KeyRow): string {
  return `Options for ${row.name}`;
}
function editLabel(row: KeyRow): string {
  return row.status === "missing" ? "Set value" : "Replace value";
}

// ---- Open the environment file in the editor (#0953) ----
//
// Values stay write-only in the UI and API. The file itself is plaintext
// dotenv on this machine, so the page offers to open it in the configured
// editor — only on a local connection, only with an editor command set, and
// only when the registered source file exists.

const EDITOR_HINT =
  "Open in editor is off until an editor command is set: Settings → General → “Editor command”.";
const isLocalOrigin = computed(() => {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
});
const editorConfigured = computed(() => {
  const inspector = (
    config.data?.dev as { inspector?: { enabled?: boolean; editorCommand?: string } } | undefined
  )?.inspector;
  const devCommand =
    typeof inspector?.editorCommand === "string" ? inspector.editorCommand.trim() : "";
  if (devCommand) return inspector?.enabled !== false;
  const generalCommand = (config.data?.editor as { command?: string } | undefined)?.command?.trim();
  return !!generalCommand;
});
const selectedEnv = computed(() => environments.value.find((item) => item.id === selected.value));
const envSourceExists = computed(() => {
  if (fixture) return true;
  const source = selectedEnv.value?.sources.at(-1);
  return source?.exists === true;
});
const canOpenInEditor = computed(
  () =>
    canManage.value &&
    // The fixture page fakes the whole setup so the shot shows the affordance.
    (fixture || (isLocalOrigin.value && editorConfigured.value)) &&
    envSourceExists.value,
);
const showEditorHint = computed(
  () => canManage.value && !fixture && isLocalOrigin.value && !editorConfigured.value,
);
async function openEnvInEditor(): Promise<void> {
  const source = selectedEnv.value?.sources.at(-1);
  try {
    await api(
      `/api/project-environments/${encodeURIComponent(selected.value)}/open-in-editor`,
      JSON_OPTS("POST", source ? { source: source.id } : {}),
    );
    repo.pushToast(`${source?.path ?? "Environment file"} opened in your editor.`, "success");
  } catch (err) {
    repo.pushToast(err instanceof Error ? err.message : "Could not open editor", "error");
  }
}

// Exposed for the shot-preview fixture: the fixture page runs in a browser the
// server cannot open an editor from, so config is faked rather than read.

async function loadEnvironments(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    await refreshPageData(
      "project-environments",
      () => api<{ environments: Environment[] }>("/api/project-environments"),
      (data) => {
        environments.value = data.environments;
        loading.value = false;
        if (!selected.value || !data.environments.some((env) => env.id === selected.value))
          selected.value = data.environments[0]?.id ?? "";
        // Load keys as soon as the environment list is known (including a
        // cache hit delivered before the network refresh settles). loadSnapshot
        // ignores responses that no longer match the selected environment.
        void loadSnapshot();
      },
      (e) => {
        if (environments.value.length) snapshotRefreshError.value = safeError(e);
        else error.value = safeError(e);
      },
    );
  } catch (e) {
    error.value = safeError(e);
  } finally {
    loading.value = false;
  }
}
async function loadSnapshot(): Promise<void> {
  if (fixture) {
    snapshot.value = {
      environment: "dev-nick",
      version: "fixture-version",
      keys: [
        {
          name: "DATABASE_URL",
          status: "set",
          source: ".env.dev-nick",
          visibility: "server-only",
          version: "fixture-version",
          consumers: ["Dev · web", "Checks"],
          restartNeeded: true,
        },
        {
          name: "STRIPE_SECRET_KEY",
          status: "inherited",
          source: ".env.shared, .env.dev-nick",
          visibility: "server-only",
          version: "fixture-version",
          consumers: ["Dev · web"],
          restartNeeded: false,
        },
        {
          name: "VITE_PUBLIC_ORIGIN",
          status: "missing",
          source: ".env.dev-nick",
          visibility: "public",
          version: "fixture-version",
          consumers: ["Dev · web"],
          restartNeeded: false,
        },
      ],
    };
    return;
  }
  if (!selected.value) {
    snapshot.value = null;
    return;
  }
  // Remember which environment this request belongs to: if the selection changes
  // before it answers (cached list vs fresh list), the late response must not
  // show one environment's keys under another's selection.
  const requestedEnv = selected.value;
  if (snapshot.value?.environment !== requestedEnv) {
    snapshot.value = null;
    error.value = "";
    snapshotRefreshError.value = "";
  }
  try {
    await refreshPageData(
      `secrets:${requestedEnv}`,
      () => api<Snapshot>(`/api/project-environments/${encodeURIComponent(requestedEnv)}/secrets`),
      (value) => {
        if (selected.value !== requestedEnv) return;
        snapshot.value = value;
        error.value = "";
        snapshotRefreshError.value = "";
      },
      (e) => {
        if (selected.value !== requestedEnv) return;
        if (snapshot.value) {
          snapshotRefreshError.value = safeError(e);
          return;
        }
        error.value = safeError(e);
      },
    );
  } catch (e) {
    if (selected.value !== requestedEnv) return;
    if (snapshot.value) snapshotRefreshError.value = safeError(e);
    else error.value = safeError(e);
  }
}
function safeError(e: unknown): string {
  if (e instanceof ApiError && e.status === 409)
    return "This environment changed since it was loaded. Reload the key list, then retry your change.";
  return "Could not update environment metadata. Check the environment and try again.";
}
async function createEnvironment(): Promise<void> {
  const name = newName.value.trim();
  if (!name) return;
  saving.value = true;
  error.value = "";
  createError.value = "";
  message.value = "";
  try {
    const result = await api<{ environment: Environment }>(
      "/api/project-environments",
      JSON_OPTS("POST", { name }),
    );
    invalidatePageData("project-environments");
    environments.value.push(result.environment);
    selected.value = result.environment.id;
    newName.value = "";
    createOpen.value = false;
    message.value = `Environment “${result.environment.id}” created.`;
    window.dispatchEvent(new CustomEvent("repoos:project-environments-changed"));
    await loadSnapshot();
  } catch (e) {
    createError.value = e instanceof ApiError ? e.message : safeError(e);
  } finally {
    saving.value = false;
  }
}
function beginAdd(): void {
  keyDraft.value = "";
  valueDraft.value = "";
  message.value = "";
  addOpen.value = true;
}
async function saveKey(row?: KeyRow): Promise<void> {
  const name = row?.name ?? keyDraft.value.trim();
  if (!name || !valueDraft.value || !snapshot.value) return;
  saving.value = true;
  error.value = "";
  try {
    await api(
      `/api/project-environments/${encodeURIComponent(selected.value)}/secrets`,
      JSON_OPTS("PUT", {
        action: row ? (row.status === "missing" ? "add" : "replace") : "add",
        key: name,
        value: valueDraft.value,
        version: snapshot.value.version,
      }),
    );
    invalidatePageData(`secrets:${selected.value}`);
    valueDraft.value = "";
    keyDraft.value = "";
    addOpen.value = false;
    editingKey.value = null;
    restartKeys.value = new Set(restartKeys.value).add(name);
    message.value = `${name} saved. Restart affected processes to use the new value.`;
    await loadSnapshot();
  } catch (e) {
    error.value = safeError(e);
  } finally {
    saving.value = false;
  }
}
async function removeKey(): Promise<void> {
  const row = confirmKey.value;
  if (!row || !snapshot.value) return;
  saving.value = true;
  error.value = "";
  try {
    await api(
      `/api/project-environments/${encodeURIComponent(selected.value)}/secrets`,
      JSON_OPTS("PUT", { action: "delete", key: row.name, version: snapshot.value.version }),
    );
    invalidatePageData(`secrets:${selected.value}`);
    confirmKey.value = null;
    restartKeys.value = new Set(restartKeys.value).add(row.name);
    message.value = `${row.name} removed.`;
    await loadSnapshot();
  } catch (e) {
    error.value = safeError(e);
  } finally {
    saving.value = false;
  }
}
onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  if (fixture) {
    const theme = new URLSearchParams(location.search).get("theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
    environments.value = [
      { id: "dev-nick", sources: [{ id: "local", path: ".env.dev-nick", exists: true }] },
    ];
    selected.value = "dev-nick";
    void loadSnapshot();
    if (shotFixture === "secrets:removeDialog") confirmKey.value = snapshot.value?.keys[0] ?? null;
    loading.value = false;
  } else void loadEnvironments();
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
});
</script>

<template>
  <main class="secrets-page page-scroll">
    <header class="page-header">
      <div>
        <h1 class="page-title">Secrets</h1>
        <p class="page-desc">Manage the keys this project expects. Saved values stay hidden.</p>
      </div>
      <div class="secrets-env-control">
        <span class="secrets-label">Viewing environment</span>
        <div class="secrets-picker-wrap">
          <Select
            :model-value="selected"
            :disabled="!environments.length"
            @update:model-value="
              (value) => {
                selected = String(value);
                void loadSnapshot();
              }
            "
          >
            <SelectTrigger class="secrets-picker" aria-label="Viewing environment">
              <SelectValue placeholder="Choose environment" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                <SelectItem v-for="env in environments" :key="env.id" :value="env.id">{{
                  env.id
                }}</SelectItem>
              </SelectViewport>
            </SelectContent>
          </Select>
          <Button
            v-if="canManage"
            variant="outline"
            class="secrets-create-inline"
            @click="createOpen = true"
            >Create environment</Button
          >
        </div>
        <span class="secrets-view-note">Changes here do not switch running processes.</span>
      </div>
    </header>
    <div class="page-scroll-body">
      <div v-if="error" class="secrets-error" role="alert">
        <span>{{ error }}</span
        ><Button variant="outline" @click="selected ? loadSnapshot() : loadEnvironments()"
          >Reload</Button
        >
      </div>
      <p v-if="snapshotRefreshError" class="secrets-error" role="status">
        Refresh failed: {{ snapshotRefreshError }}
      </p>
      <p v-if="message" class="secrets-message" role="status">{{ message }}</p>
      <section
        v-if="!loading && !environments.length"
        class="secrets-empty"
        aria-labelledby="secrets-empty-title"
      >
        <div class="secrets-empty-mark" aria-hidden="true">⌁</div>
        <h2 id="secrets-empty-title">Give this project an environment</h2>
        <p>
          Start with an empty, private source file. Expected key names come from
          <code>.env.example</code>; its example values are never imported.
        </p>
        <Button variant="accent" @click="createOpen = true">Create environment</Button>
      </section>
      <PageSkeleton v-else-if="(loading || selected) && !snapshot && !error" kind="table" />
      <section v-else-if="snapshot" class="secrets-ledger" aria-label="Environment keys">
        <p v-if="environmentFile" class="secrets-file">
          <code>{{ environmentFile }}</code>
          <button
            v-if="canOpenInEditor"
            class="secrets-open-editor"
            type="button"
            @click="openEnvInEditor"
          >
            Open in editor
          </button>
          <span v-else-if="showEditorHint" class="secrets-editor-hint">{{ EDITOR_HINT }}</span>
        </p>
        <div class="secrets-ledger-top">
          <div class="secrets-ledger-heading">
            <h2>Key inventory</h2>
            <p>{{ countText }}<span class="secrets-separator">·</span>Values are never shown</p>
          </div>
          <label class="secrets-search"
            ><span aria-hidden="true">⌕</span
            ><input
              v-model="query"
              type="search"
              placeholder="Search keys"
              aria-label="Search keys"
          /></label>
          <Button v-if="canManage" variant="accent" @click="beginAdd">Add key</Button>
        </div>
        <div v-if="canManage && addOpen" class="secrets-add-row">
          <label
            >Key name<input
              v-model="keyDraft"
              autocomplete="off"
              placeholder="SERVICE_TOKEN" /></label
          ><label
            >New value<input
              v-model="valueDraft"
              type="password"
              autocomplete="new-password"
              placeholder="Enter a value"
              @keydown.enter="saveKey()" /></label
          ><Button
            variant="accent"
            :disabled="saving || !keyDraft || !valueDraft"
            @click="saveKey()"
            >Save</Button
          ><Button
            variant="outline"
            @click="
              addOpen = false;
              keyDraft = '';
              valueDraft = '';
            "
            >Cancel</Button
          >
        </div>
        <div v-if="visibleRows.length" class="secrets-rows">
          <article
            v-for="row in visibleRows"
            :key="row.name"
            class="secrets-row"
            :class="{ 'is-editing': editingKey === row.name }"
          >
            <span class="secrets-dot" :class="`is-${row.status}`" aria-hidden="true"></span>
            <span class="secrets-key-name" tabindex="0" :data-tip="rowTip(row)">{{
              row.name
            }}</span>
            <span class="sr-only">{{ rowTip(row) }}</span>
            <span class="secrets-badges">
              <span v-if="row.status === 'inherited'" class="secrets-badge is-inherited"
                >inherited</span
              >
              <span v-if="row.visibility === 'public'" class="secrets-badge is-public">public</span>
              <span
                v-if="row.restartNeeded || restartKeys.has(row.name)"
                class="secrets-badge is-restart"
                >restart</span
              >
            </span>
            <span class="secrets-masked" aria-hidden="true">{{ maskedFor(row) }}</span>
            <div v-if="canManage && row.status !== 'inherited'" class="secrets-row-menu">
              <button
                type="button"
                class="secrets-menu-trigger"
                :aria-label="menuLabel(row)"
                aria-haspopup="menu"
                :aria-expanded="openMenuKey === row.name"
                @click="toggleMenu(row, $event)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="5" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="12" cy="19" r="1.7" />
                </svg>
              </button>
              <div
                v-if="openMenuKey === row.name"
                :ref="setMenuRef"
                class="secrets-menu"
                role="menu"
                aria-label="Key actions"
                @keydown="onMenuKeydown"
              >
                <button type="button" role="menuitem" @click="beginEdit(row)">
                  {{ editLabel(row) }}
                </button>
                <button
                  v-if="row.status === 'set'"
                  type="button"
                  role="menuitem"
                  class="is-danger"
                  @click="
                    confirmKey = row;
                    closeMenu();
                  "
                >
                  Remove key
                </button>
              </div>
            </div>
            <span v-else-if="row.status === 'inherited'" class="secrets-readonly">read-only</span>
            <div v-if="editingKey === row.name" class="secrets-inline-form">
              <label class="sr-only" :for="`secret-${row.name}`">New value for {{ row.name }}</label
              ><input
                :id="`secret-${row.name}`"
                v-model="valueDraft"
                type="password"
                autocomplete="new-password"
                placeholder="Enter replacement value"
              /><Button variant="accent" :disabled="saving || !valueDraft" @click="saveKey(row)"
                >Save</Button
              ><Button variant="outline" @click="cancelEdit">Cancel</Button>
            </div>
          </article>
        </div>
        <p v-else class="secrets-no-results">
          {{
            query
              ? "No keys match this search."
              : "No expected keys yet. Add the first key when you are ready."
          }}
        </p>
      </section>
    </div>
    <ConfirmDialog
      :open="!!confirmKey"
      title="Remove project key?"
      confirm-label="Remove key"
      content-class="delete-confirm-modal"
      @update:open="
        (open) => {
          if (!open) confirmKey = null;
        }
      "
      @confirm="removeKey"
      ><template v-if="confirmKey"
        >Remove <strong>{{ confirmKey.name }}</strong> from {{ selected }}? Affected consumers:
        {{ confirmKey.consumers.length ? confirmKey.consumers.join(", ") : "none listed" }}. Their
        next start will no longer receive this key.</template
      ></ConfirmDialog
    >
    <Teleport to="body"
      ><Dialog :open="createOpen" @update:open="(open) => (createOpen = open)"
        ><DialogOverlay /><DialogContent class="secrets-create-panel"
          ><form @submit.prevent="createEnvironment">
            <div class="secrets-dialog-head">
              <DialogTitle id="create-env-title">Create environment</DialogTitle
              ><DialogClose class="close-x" aria-label="Close">×</DialogClose>
            </div>
            <DialogDescription
              >An empty ignored file will be created. Add values separately after
              setup.</DialogDescription
            ><label
              >Environment name<input
                v-model="newName"
                autofocus
                pattern="[A-Za-z][A-Za-z0-9_-]{0,63}"
                required
                placeholder="dev-local"
            /></label>
            <p v-if="createError" class="secrets-error" role="alert">{{ createError }}</p>
            <div class="secrets-create-actions">
              <DialogClose as-child
                ><Button variant="outline" type="button">Cancel</Button></DialogClose
              ><Button variant="accent" type="submit" :disabled="saving">Create environment</Button>
            </div>
          </form></DialogContent
        ></Dialog
      ></Teleport
    >
  </main>
</template>
