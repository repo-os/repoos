<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from "vue";
import { Settings } from "lucide-vue-next";
import { App } from "@capacitor/app";
import {
  init,
  servers,
  selectedId,
  selectServer,
  addServer,
  removeServer,
  renameServer,
  moveServer,
  setLock,
  lockSettings,
  lockSupported,
  loaded,
  designTheme,
  appearanceMode,
  reachability,
  setDesignTheme,
  setAppearanceMode,
  discovery,
  discoveryLoading,
  discoverTailnet,
  toggleDiscovered,
  addSelectedDiscovered,
} from "./app-state";
import { openServer, onBrowserEvents } from "./browser";
import { lockOverlayShouldRemainOpen, verifyWithDeviceLock } from "./lock";
import type { ServerEntry } from "./types";
import HubLogo from "./components/HubLogo.vue";
import ServerListView from "./components/ServerListView.vue";
import SettingsView from "./components/SettingsView.vue";
import AddServerView from "./components/AddServerView.vue";
import TailnetDiscoveryView from "./components/TailnetDiscoveryView.vue";
import BottomSheet from "./components/BottomSheet.vue";
import LockOverlay from "./components/LockOverlay.vue";
import { resolveShellPlatform } from "./platform";
import { fixtureInitialRoute, readHubFixture } from "./fixture";
import { impactHeavy } from "./haptics";
import { installHubBackButton, type HubRoute } from "./back-navigation";
import { errorAfterServerUrlInput } from "./form-validation";
import type { AppearanceMode, DesignThemeId } from "./theme";

type Route = HubRoute;

const route = ref<Route>("picker");
const sheetServer = ref<ServerEntry | null>(null);
const sheetName = ref("");

const formName = ref("");
const formUrl = ref("");
const formBusy = ref(false);
const formError = ref("");
const formValidating = ref(false);

const lockOpen = ref(false);
const platform = ref(resolveShellPlatform());
const appVersion = "0.1.0";

const sheetOpen = computed(() => sheetServer.value !== null);

let disposeBackButton: (() => Promise<void>) | null = null;
let unmounted = false;

onMounted(async () => {
  document.documentElement.classList.add(`platform-${platform.value}`);

  // Android consumes the system back gesture once a listener exists, so map
  // every local Hub route explicitly instead of relying on WebView history.
  disposeBackButton = await installHubBackButton({
    platform: platform.value,
    subscribe: (listener) => App.addListener("backButton", listener),
    getState: () => ({
      route: route.value,
      sheetOpen: sheetOpen.value,
      lockOpen: lockOpen.value,
    }),
    handlers: {
      closeSheet,
      showPicker: backToPicker,
      exitApp: () => {
        void App.exitApp();
      },
    },
  });
  if (unmounted) await disposeBackButton();

  const fx = readHubFixture();
  const initial = fixtureInitialRoute(fx);
  if (initial === "settings") route.value = "settings";
  if (initial === "add") route.value = "add";
  if (initial === "discover") route.value = "discover";

  await init();
  if (initial === "discover") await discoverTailnet();
  onBrowserEvents({ closed: () => undefined });
  if (lockSettings.value.enabled && lockSettings.value.scope === "reopen") {
    await gateLock(null);
  }
});

onUnmounted(() => {
  unmounted = true;
  void disposeBackButton?.();
});

async function gateLock(_serverId: string | null): Promise<boolean> {
  lockOpen.value = true;
  const ok = await verifyWithDeviceLock("Unlock RepoOS Hub to continue");
  lockOpen.value = lockOverlayShouldRemainOpen(ok);
  return ok;
}

async function retryLock() {
  await gateLock(null);
}

async function onSelect(server: ServerEntry) {
  if (lockSettings.value.enabled && lockSettings.value.scope === "server") {
    const ok = await gateLock(server.id);
    if (!ok) return;
  }
  await selectServer(server.id);
  await openServer(server.url);
}

function openSettings() {
  route.value = "settings";
}

function startAdd() {
  formName.value = "";
  formUrl.value = "";
  formError.value = "";
  route.value = "add";
}

async function startDiscovery() {
  route.value = "discover";
  await discoverTailnet();
}

function onDiscoveryToggle(key: string) {
  toggleDiscovered(key);
}

async function onAddDiscovered() {
  await addSelectedDiscovered();
}

function openSheet(server: ServerEntry) {
  sheetServer.value = server;
  sheetName.value = server.name;
}

function closeSheet() {
  sheetServer.value = null;
}

function backToPicker() {
  route.value = "picker";
  formError.value = "";
}

async function submitAdd() {
  formError.value = "";
  if (!formUrl.value.trim()) {
    formError.value = "Enter a server URL.";
    return;
  }
  formBusy.value = true;
  formValidating.value = true;
  const res = await addServer(formName.value, formUrl.value);
  formValidating.value = false;
  formBusy.value = false;
  if (res.error) {
    formError.value = res.error;
    return;
  }
  route.value = "picker";
}

async function saveSheet() {
  if (!sheetServer.value) return;
  await renameServer(sheetServer.value.id, sheetName.value);
  closeSheet();
}

async function deleteSheet() {
  if (!sheetServer.value) return;
  await removeServer(sheetServer.value.id);
  void impactHeavy();
  closeSheet();
}

async function onReorder(id: string, toIndex: number) {
  await moveServer(id, toIndex);
}

async function onDesignTheme(id: DesignThemeId) {
  await setDesignTheme(id);
}

async function onAppearanceMode(mode: AppearanceMode) {
  await setAppearanceMode(mode);
}

async function onLockEnabled(enabled: boolean) {
  lockSettings.value.enabled = enabled;
  await setLock({ ...lockSettings.value });
}

async function onLockScope(scope: "reopen" | "server") {
  lockSettings.value.scope = scope;
  await setLock({ ...lockSettings.value });
}
</script>

<template>
  <div class="shell" data-repoos-hub-shell :class="`platform-${platform}`">
    <header v-if="route === 'picker'" class="topbar">
      <div class="brand">
        <HubLogo />
        <span class="brand-name">RepoOS Hub</span>
      </div>
      <button
        type="button"
        class="icon-touch"
        :disabled="!loaded"
        aria-label="Settings"
        data-testid="hub-open-settings"
        @click="openSettings"
      >
        <Settings :size="22" stroke-width="2" />
      </button>
    </header>

    <LockOverlay :open="lockOpen" @retry="retryLock" />

    <main class="main-pane">
      <ServerListView
        v-if="route === 'picker'"
        :servers="servers"
        :selected-id="selectedId"
        :reachability="reachability"
        :loaded="loaded"
        :platform="platform"
        @select="onSelect"
        @add="startAdd"
        @edit="openSheet"
        @reorder="onReorder"
        @discover="startDiscovery"
      />

      <TailnetDiscoveryView
        v-else-if="route === 'discover'"
        :busy="discoveryLoading"
        :trusted-name="discovery.trustedName"
        :trusted-url="discovery.trustedUrl"
        :message="discovery.message"
        :error="discovery.error"
        :servers="discovery.results"
        :selected="discovery.selected"
        :platform="platform"
        @back="backToPicker"
        @toggle="onDiscoveryToggle"
        @add="onAddDiscovered"
        @manual="startAdd"
      />

      <SettingsView
        v-else-if="route === 'settings'"
        :design-theme="designTheme"
        :appearance-mode="appearanceMode"
        :lock="lockSettings"
        :lock-supported="lockSupported"
        :platform="platform"
        :app-version="appVersion"
        @back="backToPicker"
        @update:design-theme="onDesignTheme"
        @update:appearance-mode="onAppearanceMode"
        @update:lock-enabled="onLockEnabled"
        @update:lock-scope="onLockScope"
      />

      <AddServerView
        v-else-if="route === 'add'"
        mode="add"
        :name="formName"
        :url="formUrl"
        :busy="formBusy"
        :validating="formValidating"
        :error="formError"
        :platform="platform"
        @back="backToPicker"
        @update:name="(v) => (formName = v)"
        @update:url="
          (v) => {
            formUrl = v;
            formError = errorAfterServerUrlInput(formError, v);
          }
        "
        @submit="submitAdd"
      />
    </main>

    <BottomSheet :open="sheetOpen" title="Edit server" @close="closeSheet">
      <label class="field sheet-field">
        <span class="field-label">Display name</span>
        <input v-model="sheetName" type="text" autocomplete="off" />
      </label>
      <p v-if="sheetServer" class="hint">{{ sheetServer.url }}</p>
      <div class="sheet-actions">
        <button
          type="button"
          class="btn-ghost danger"
          data-testid="hub-sheet-delete"
          @click="deleteSheet"
        >
          Delete
        </button>
        <span class="spacer" />
        <button type="button" class="btn-primary" data-testid="hub-sheet-save" @click="saveSheet">
          Save
        </button>
      </div>
    </BottomSheet>
  </div>
</template>
