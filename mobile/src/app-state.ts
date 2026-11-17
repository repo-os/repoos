/**
 * App-wide state: the server list and current selection.
 * A tiny reactive module (Vue refs) rather than Pinia — the mobile shell has
 * one screen and a handful of fields; a full store is overkill.
 */
import { ref, computed } from "vue";
import type { ServerEntry, LockSettings, ReachabilityState } from "./types";
import * as store from "./store";
import { validateServer, serverUrlOf } from "./reachability";
import {
  fetchTailnetServers,
  mergeTailnetResults,
  tailnetDiscoveryMessage,
  type DiscoveredServer,
  type TailnetServer,
} from "./tailnet";
import { probeDeviceLock } from "./lock";
import { fixtureServers, fixtureTailnetRows, readHubFixture } from "./fixture";
import {
  applyThemesToDocument,
  loadThemePrefs,
  saveAppearanceMode,
  saveDesignTheme,
  syncNativeChrome,
  mirrorThemePrefs,
  type AppearanceMode,
  type DesignThemeId,
} from "./theme";

export const servers = ref<ServerEntry[]>([]);
export const selectedId = ref<string | null>(null);
export const lockSettings = ref<LockSettings>({ enabled: false, scope: "reopen" });
export const lockSupported = ref(false);
export const loaded = ref(false);
export const designTheme = ref<DesignThemeId>("classic");
export const appearanceMode = ref<AppearanceMode>("system");
export const reachability = ref<Record<string, ReachabilityState>>({});

export interface DiscoveryState {
  status: "idle" | "loading" | "ready";
  /** The saved server Hub asked for the list. */
  trustedName: string;
  trustedUrl: string;
  /** Plain message shown when there is no list (off, auth, unreachable). */
  message: string;
  /** Save failures, kept separate from the neutral info message. */
  error: string;
  /** Rows returned by the trusted server, before de-duplication. */
  rows: TailnetServer[];
  results: DiscoveredServer[];
  selected: string[];
}

export const discovery = ref<DiscoveryState>({
  status: "idle",
  trustedName: "",
  trustedUrl: "",
  message: "",
  error: "",
  rows: [],
  results: [],
  selected: [],
});

export const discoveryLoading = computed(() => discovery.value.status === "loading");

export const selected = computed<ServerEntry | null>(
  () => servers.value.find((s) => s.id === selectedId.value) ?? null,
);

export async function init(): Promise<void> {
  const [srv, sel, lock, lockProbe, themePrefs] = await Promise.all([
    store.loadServers(),
    store.loadSelectedId(),
    store.loadLock(),
    probeDeviceLock(),
    loadThemePrefs(),
  ]);
  const fixture = readHubFixture();
  const fixtureList = fixtureServers(fixture);
  servers.value = fixtureList ?? srv;
  selectedId.value = sel;
  lockSettings.value = lock;
  lockSupported.value = lockProbe.supported;
  designTheme.value = themePrefs.design;
  appearanceMode.value = themePrefs.appearanceMode;
  mirrorThemePrefs(themePrefs.design, themePrefs.appearanceMode);
  applyThemesToDocument(themePrefs.design, themePrefs.appearanceMode);
  await syncNativeChrome(themePrefs.design, themePrefs.appearanceMode);
  loaded.value = true;
  void refreshReachability();
}

export async function setDesignTheme(id: DesignThemeId): Promise<void> {
  designTheme.value = id;
  applyThemesToDocument(id, appearanceMode.value);
  await Promise.all([saveDesignTheme(id), syncNativeChrome(id, appearanceMode.value)]);
}

export async function setAppearanceMode(mode: AppearanceMode): Promise<void> {
  appearanceMode.value = mode;
  applyThemesToDocument(designTheme.value, mode);
  await Promise.all([saveAppearanceMode(mode), syncNativeChrome(designTheme.value, mode)]);
}

export async function refreshReachability(): Promise<void> {
  if (readHubFixture() === "unreachable") {
    for (const s of servers.value) reachability.value[s.id] = "unreachable";
    return;
  }
  if (readHubFixture() && readHubFixture() !== "unreachable") {
    for (const s of servers.value) reachability.value[s.id] = "reachable";
    return;
  }
  const ids = servers.value.map((s) => s.id);
  for (const id of ids) reachability.value[id] = "checking";
  await Promise.all(
    servers.value.map(async (s) => {
      const res = await validateServer(s.url);
      reachability.value[s.id] = res.ok ? "reachable" : "unreachable";
    }),
  );
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface AddResult {
  server?: ServerEntry;
  error?: string;
}

/**
 * Add a server after validating HTTPS + reachability. Returns the new entry
 * or an error string. The caller persists via `persist()`.
 */
export async function addServer(name: string, url: string): Promise<AddResult> {
  const serverUrl = serverUrlOf(url);
  if (!serverUrl) return { error: "Enter an HTTPS URL (e.g. https://dev.repoos.org)." };
  // Distinct Serve paths can map to different RepoOS projects on one host.
  if (servers.value.some((s) => serverUrlOf(s.url) === serverUrl)) {
    return { error: "That server is already saved." };
  }
  const reach = await validateServer(url);
  if (!reach.ok) return { error: reach.error ?? "Unreachable." };

  const trimmedName = name.trim() || serverUrl.replace("https://", "");
  const entry: ServerEntry = {
    id: uuid(),
    url: serverUrl,
    name: trimmedName,
    order: servers.value.length,
    createdAt: Date.now(),
  };
  servers.value.push(entry);
  await persist();
  return { server: entry };
}

/**
 * Ask the selected (or first) saved server for the RepoOS servers it can see
 * on the tailnet. Nothing is saved here; `addSelectedDiscovered` is the only
 * path that persists, and it reuses the normal HTTPS reachability gate.
 */
export async function discoverTailnet(): Promise<void> {
  const trusted = selected.value ?? servers.value[0] ?? null;
  if (!trusted) {
    discovery.value = {
      status: "ready",
      trustedName: "",
      trustedUrl: "",
      message: "Add one server you trust before finding others on your tailnet.",
      error: "",
      rows: [],
      results: [],
      selected: [],
    };
    return;
  }
  discovery.value = {
    status: "loading",
    trustedName: trusted.name,
    trustedUrl: trusted.url,
    message: "",
    error: "",
    rows: [],
    results: [],
    selected: [],
  };
  if (readHubFixture() === "discover") {
    const rows = fixtureTailnetRows();
    discovery.value = {
      status: "ready",
      trustedName: trusted.name,
      trustedUrl: trusted.url,
      message: "",
      error: "",
      rows,
      results: mergeTailnetResults(rows, servers.value),
      selected: [],
    };
    return;
  }
  const outcome = await fetchTailnetServers(trusted.url, { serverName: trusted.name });
  if (outcome.kind !== "ok") {
    discovery.value = {
      ...discovery.value,
      status: "ready",
      message: outcome.message,
    };
    return;
  }
  const results = mergeTailnetResults(outcome.servers, servers.value);
  const selectable = results.filter((result) => result.selectable);
  const message = tailnetDiscoveryMessage(results, selectable.length, outcome.message);
  discovery.value = {
    status: "ready",
    trustedName: trusted.name,
    trustedUrl: trusted.url,
    message,
    error: "",
    rows: outcome.servers,
    results,
    selected: [],
  };
}

/** Toggle one selectable discovery result. */
export function toggleDiscovered(key: string): void {
  const result = discovery.value.results.find((entry) => entry.key === key);
  if (!result?.selectable) return;
  const selected = discovery.value.selected;
  discovery.value.selected = selected.includes(key)
    ? selected.filter((entry) => entry !== key)
    : [...selected, key];
}

/**
 * Save the rows the user picked. Each pick goes through `addServer`, which
 * re-validates HTTPS + reachability and refuses duplicates, so a stale or
 * unreachable result can never slip into the saved list. Sequential on
 * purpose: `addServer` persists the whole list after each add.
 */
export async function addSelectedDiscovered(): Promise<void> {
  if (discovery.value.status === "loading") return;
  const picks = discovery.value.results.filter(
    (result) => result.selectable && discovery.value.selected.includes(result.key),
  );
  if (picks.length === 0) return;
  discovery.value = { ...discovery.value, status: "loading", error: "" };
  const errors: string[] = [];
  let added = 0;
  for (const pick of picks) {
    const res = await addServer(pick.name, pick.url);
    if (res.error) errors.push(`${pick.name}: ${res.error}`);
    else added += 1;
  }
  const results = mergeTailnetResults(discovery.value.rows, servers.value);
  discovery.value = {
    ...discovery.value,
    status: "ready",
    results,
    selected: [],
    message:
      added > 0 ? `Added ${added} server${added === 1 ? "" : "s"}.` : "No servers were added.",
    error: errors.join(" "),
  };
  if (added > 0) void refreshReachability();
}

export async function selectServer(id: string): Promise<void> {
  selectedId.value = id;
  await store.saveSelectedId(id);
}

export async function renameServer(id: string, name: string): Promise<void> {
  const s = servers.value.find((x) => x.id === id);
  if (!s) return;
  s.name = name.trim() || s.url.replace("https://", "");
  await persist();
}

export async function removeServer(id: string): Promise<void> {
  servers.value = servers.value.filter((s) => s.id !== id);
  if (selectedId.value === id) {
    selectedId.value = null;
    await store.saveSelectedId(null);
  }
  await persist();
}

export async function moveServer(id: string, toIndex: number): Promise<void> {
  const idx = servers.value.findIndex((s) => s.id === id);
  if (idx < 0 || toIndex < 0 || toIndex >= servers.value.length || idx === toIndex) return;
  const arr = servers.value.slice();
  const [moved] = arr.splice(idx, 1);
  arr.splice(toIndex, 0, moved);
  arr.forEach((s, i) => (s.order = i));
  servers.value = arr;
  await persist();
}

export async function reorderServer(id: string, direction: -1 | 1): Promise<void> {
  const idx = servers.value.findIndex((s) => s.id === id);
  const target = idx + direction;
  if (idx < 0 || target < 0 || target >= servers.value.length) return;
  const arr = servers.value.slice();
  const [moved] = arr.splice(idx, 1);
  arr.splice(target, 0, moved);
  arr.forEach((s, i) => (s.order = i));
  servers.value = arr;
  await persist();
}

export async function setLock(settings: LockSettings): Promise<void> {
  lockSettings.value = settings;
  await store.saveLock(settings);
}

export async function persist(): Promise<void> {
  await store.saveServers(servers.value);
}
