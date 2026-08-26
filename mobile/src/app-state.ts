/**
 * App-wide state: the server list and current selection.
 * A tiny reactive module (Vue refs) rather than Pinia — the mobile shell has
 * one screen and a handful of fields; a full store is overkill.
 */
import { ref, computed } from "vue";
import type { ServerEntry, LockSettings } from "./types";
import * as store from "./store";
import { validateServer, originOf } from "./reachability";
import { probeDeviceLock } from "./lock";

export const servers = ref<ServerEntry[]>([]);
export const selectedId = ref<string | null>(null);
export const lockSettings = ref<LockSettings>({ enabled: false, scope: "reopen" });
export const lockSupported = ref(false);
export const loaded = ref(false);

export const selected = computed<ServerEntry | null>(
  () => servers.value.find((s) => s.id === selectedId.value) ?? null,
);

export async function init(): Promise<void> {
  const [srv, sel, lock, lockProbe] = await Promise.all([
    store.loadServers(),
    store.loadSelectedId(),
    store.loadLock(),
    probeDeviceLock(),
  ]);
  servers.value = srv;
  selectedId.value = sel;
  lockSettings.value = lock;
  lockSupported.value = lockProbe.supported;
  loaded.value = true;
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
  const origin = originOf(url);
  if (!origin) return { error: "Enter an HTTPS URL (e.g. https://dev.repoos.org)." };
  // Duplicate guard by normalized origin.
  if (servers.value.some((s) => originOf(s.url) === origin)) {
    return { error: "That server is already saved." };
  }
  const reach = await validateServer(url);
  if (!reach.ok) return { error: reach.error ?? "Unreachable." };

  const trimmedName = name.trim() || origin.replace("https://", "");
  const entry: ServerEntry = {
    id: uuid(),
    url: origin,
    name: trimmedName,
    order: servers.value.length,
    createdAt: Date.now(),
  };
  servers.value.push(entry);
  await persist();
  return { server: entry };
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
