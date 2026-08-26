/**
 * On-device persistence for the server list and lock settings.
 *
 * Uses @capacitor/preferences on native, falling back to localStorage on the
 * web (browser dev). Preferences on native is a thin key/value store backed by
 * UserDefaults (iOS) / SharedPreferences (Android) — NOT SharedPreferences for
 * secrets; the server list holds no credentials, only URLs + display names,
 * so plain preferences is the right fit. Server auth cookies live in the
 * isolated InAppBrowser WebView container, never here.
 */
import { Preferences } from "@capacitor/preferences";

const SERVERS_KEY = "repoos.servers";
const LOCK_KEY = "repoos.lock";
const SELECTED_KEY = "repoos.selected";

async function getItem(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
  } catch {
    // Native preferences unavailable (web dev without Capacitor). Fall back
    // to localStorage so the picker is still usable in a browser.
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable — picker still works in-memory */
    }
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    await Preferences.remove({ key });
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** Load all saved server entries, ordered by `order`. */
export async function loadServers(): Promise<import("./types").ServerEntry[]> {
  const raw = await getItem(SERVERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

export async function saveServers(servers: import("./types").ServerEntry[]): Promise<void> {
  await setItem(SERVERS_KEY, JSON.stringify(servers));
}

export async function loadSelectedId(): Promise<string | null> {
  return getItem(SELECTED_KEY);
}

export async function saveSelectedId(id: string | null): Promise<void> {
  if (id === null) await removeItem(SELECTED_KEY);
  else await setItem(SELECTED_KEY, id);
}

export async function loadLock(): Promise<import("./types").LockSettings> {
  const raw = await getItem(LOCK_KEY);
  if (!raw) return { enabled: false, scope: "reopen" };
  try {
    const parsed = JSON.parse(raw);
    return { enabled: Boolean(parsed.enabled), scope: parsed.scope === "server" ? "server" : "reopen" };
  } catch {
    return { enabled: false, scope: "reopen" };
  }
}

export async function saveLock(lock: import("./types").LockSettings): Promise<void> {
  await setItem(LOCK_KEY, JSON.stringify(lock));
}
