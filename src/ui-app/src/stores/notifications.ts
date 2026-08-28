import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";

/**
 * Client-side attention notifications for task state transitions that need a
 * human (0100): a review-ready handoff, a pause, a stuck task, or a task that
 * explicitly needs attention. Each event type can be toggled independently and
 * there are two master toggles — one for a bell sound and one for browser push
 * notifications.
 *
 * Everything is disabled by default and persisted in localStorage so the
 * choices survive a page reload.
 */

/** The monitorable "attention" event types. */
export type NotificationType = "review" | "paused" | "stuck" | "needsInput";

const STORAGE_KEY = "repoos.notifications";

interface PersistedSettings {
  soundEnabled: boolean;
  pushEnabled: boolean;
  types: Record<NotificationType, boolean>;
}

/** Sensible default: everything off. */
const DEFAULT_SETTINGS: PersistedSettings = {
  soundEnabled: false,
  pushEnabled: false,
  types: { review: false, paused: false, stuck: false, needsInput: false },
};

function readSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    return {
      soundEnabled: !!parsed.soundEnabled,
      pushEnabled: !!parsed.pushEnabled,
      types: {
        review: !!parsed.types?.review,
        paused: !!parsed.types?.paused,
        stuck: !!parsed.types?.stuck,
        needsInput: !!parsed.types?.needsInput,
      },
    };
  } catch {
    /* corrupt / privacy-mode storage — fall back to all-off */
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function persist(s: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

/** Ready for a browser notification system when this is resolved. */
function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && Notification.requestPermission !== undefined;
}

/**
 * Play a short bell-like chime using the Web Audio API. No audio asset is
 * needed — the tone is synthesised on the fly. Best-effort: if audio is
 * unavailable (or the browser blocks it) it silently does nothing.
 */
export function playBell(): void {
  try {
    const ctx =
      typeof window !== "undefined" && "AudioContext" in window
        ? new AudioContext()
        : null;
    if (!ctx) return;
    const now = ctx.currentTime;
    // Two quick sine tones at 880Hz -> 1320Hz approximate a "ding-dong" bell.
    for (const [start, freq, dur] of [
      [0, 880, 0.18],
      [0.22, 1174.7, 0.22],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.25, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    }
  } catch {
    /* audio unsupported or blocked — nothing to do */
  }
}

/** Request the browser's notification permission, if the API exists. */
export async function ensurePushPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  try {
    // Handle both callback and promise-based APIs for compatibility
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch (err) {
    console.warn("Failed to request notification permission:", err);
    return false;
  }
}

/** Deliver a browser notification. Best-effort and never throws. */
export function sendPush(title: string, body: string): void {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch (err) {
    /* constructing a notification can throw in exotic environments — ignore */
    console.warn("Failed to send notification:", err);
  }
}

/** Human-friendly labels for each event type, shared with the settings page. */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  review: "Review ready",
  paused: "Paused",
  stuck: "Stuck",
  needsInput: "Needs attention",
};

export const useNotificationsStore = defineStore("notifications", () => {
  const loaded = ref(false);
  const soundEnabled = ref(false);
  const pushEnabled = ref(false);
  const types = reactive<Record<NotificationType, boolean>>({
    review: false,
    paused: false,
    stuck: false,
    needsInput: false,
  });
  /** Latest push-permission request error, shown inline in settings. */
  const permissionError = ref("");

  // Hydrate from localStorage the moment the store is first used.
  hydrate();

  function hydrate(): void {
    const s = readSettings();
    soundEnabled.value = s.soundEnabled;
    pushEnabled.value = s.pushEnabled;
    types.review = s.types.review;
    types.paused = s.types.paused;
    types.stuck = s.types.stuck;
    types.needsInput = s.types.needsInput;
    loaded.value = true;
  }

  function persistAll(): void {
    persist({
      soundEnabled: soundEnabled.value,
      pushEnabled: pushEnabled.value,
      types: { ...types },
    });
  }

  function setSoundEnabled(v: boolean): void {
    soundEnabled.value = v;
    persistAll();
  }

  function setPushEnabled(v: boolean): void {
    pushEnabled.value = v;
    if (v) void requestPushPermission();
    persistAll();
  }

  function setTypeEnabled(t: NotificationType, v: boolean): void {
    types[t] = v;
    persistAll();
  }

  /** Whether the effective sound channel is live for a given event type. */
  const channelEnabled = computed(() => ({
    soundOn: soundEnabled.value,
    pushOn: pushEnabled.value,
  }));

  /** True when any type (and at least one master channel) is configured on. */
  const isActive = computed(
    () =>
      (soundEnabled.value || pushEnabled.value) &&
      Object.values(types).some(Boolean),
  );

  /**
   * Ask for the browser's notification permission when the master push toggle
   * is turned on (the AC "permission flow"). Result is surfaced via
   * `permissionError` only on refusal.
   */
  async function requestPushPermission(): Promise<void> {
    try {
      permissionError.value = "";
      // Add a small delay to ensure UI updates before requesting permission
      await new Promise(resolve => setTimeout(resolve, 100));
      const granted = await ensurePushPermission();
      if (!granted) {
        permissionError.value = "Notification permission was not granted.";
      }
    } catch (err) {
      permissionError.value = "Failed to request notification permission.";
      console.warn("Failed to request notification permission:", err);
    }
  }

  /**
   * Fire both channels (bell + push) for a detected transition, respecting the
   * master toggles and the per-type toggle. Never throws.
   */
  async function notify(type: NotificationType, title: string, body: string): Promise<void> {
    if (!types[type]) return;
    if (soundEnabled.value) playBell();
    if (pushEnabled.value) {
      const granted = await ensurePushPermission();
      if (granted) sendPush(title, body);
    }
  }

  return {
    loaded,
    soundEnabled,
    pushEnabled,
    types,
    permissionError,
    channelEnabled,
    isActive,
    hydrate,
    setSoundEnabled,
    setPushEnabled,
    setTypeEnabled,
    requestPushPermission,
    notify,
  };
});
