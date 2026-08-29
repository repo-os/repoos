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

/** True when this browser exposes a usable Notification API. */
function notificationsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.Notification === "function" &&
    typeof window.Notification.requestPermission === "function"
  );
}

/**
 * Why browser push is or isn't available right now — surfaced in Settings so a
 * silent failure is diagnosable (#0316):
 *  - `granted`     permission is granted; delivery is up to the OS
 *  - `denied`      the browser is blocking this origin; must be reset by the user
 *  - `default`     not asked yet (turning the toggle on will prompt)
 *  - `insecure`    the page isn't a secure context (plain HTTP on a LAN IP / remote
 *                  host) so the API is unavailable — localhost or HTTPS is required
 *  - `unsupported` no Notification API at all (older Safari, an embedded web view)
 */
export type PushAvailability = "granted" | "denied" | "default" | "insecure" | "unsupported";

/** Classify the current browser-push situation. Never throws. */
export function pushAvailability(): PushAvailability {
  if (typeof window === "undefined") return "unsupported";
  // jsdom / very old browsers leave `isSecureContext` undefined — only an
  // explicit `false` (http:// on a non-localhost origin) means insecure.
  if (window.isSecureContext === false) return "insecure";
  if (!notificationsSupported()) return "unsupported";
  const p = Notification.permission;
  return p === "granted" ? "granted" : p === "denied" ? "denied" : "default";
}

/** Actionable one-liner for each {@link PushAvailability} state. */
export const PUSH_AVAILABILITY_HELP: Record<PushAvailability, string> = {
  granted:
    "Permission granted. If notifications still don't appear, check System Settings → Notifications for your browser and that Do Not Disturb / a Focus mode isn't on — and keep a RepoOS tab open (there's no background service worker).",
  denied:
    "Your browser is blocking notifications for this site. Allow them in the site permissions (the button left of the address bar, or the browser's notification settings), then reload.",
  default: "Turn on Push notifications to grant permission.",
  insecure:
    "This page is plain HTTP on a non-local address, which browsers don't treat as secure — the notification API is unavailable. Open RepoOS at http://localhost:<port> on the machine running the server, or via an HTTPS URL (e.g. the tunnel).",
  unsupported:
    "This browser doesn't expose a usable notification API (older Safari, or an embedded web view). Try a recent Chrome, Edge, or Firefox.",
};

/**
 * Play a short bell-like chime using the Web Audio API. No audio asset is
 * needed — the tone is synthesised on the fly. Best-effort: if audio is
 * unavailable (or the browser blocks it) it silently does nothing.
 */
export function playBell(): void {
  try {
    const ctx =
      typeof window !== "undefined" && "AudioContext" in window ? new AudioContext() : null;
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
    // Safari < 16 only supports the legacy callback form and returns void
    // (not a promise) from requestPermission — resolve either way.
    const res = await new Promise<NotificationPermission>((resolve, reject) => {
      try {
        const maybe = Notification.requestPermission((p) => resolve(p));
        if (maybe && typeof maybe.then === "function") maybe.then(resolve, reject);
      } catch (err) {
        reject(err);
      }
    });
    return res === "granted";
  } catch {
    return false;
  }
}

/** Deliver a browser notification. Best-effort and never throws. */
export function sendPush(title: string, body: string): void {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    /* constructing a notification can throw in exotic environments — ignore */
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
  /** Why browser push is / isn't available right now (diagnostic, #0316). */
  const availability = ref<PushAvailability>("default");
  /** Outcome of the last "send test notification" click, shown inline. */
  const testResult = ref<{ ok: boolean; detail: string } | null>(null);

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
    refreshAvailability();
  }

  /** Re-read the live browser-push situation (permission can change out of band). */
  function refreshAvailability(): void {
    availability.value = pushAvailability();
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
    () => (soundEnabled.value || pushEnabled.value) && Object.values(types).some(Boolean),
  );

  /**
   * Ask for the browser's notification permission when the master push toggle
   * is turned on (the AC "permission flow"). The outcome (and any reason it
   * failed) is reflected in `availability` for the settings page to surface.
   */
  async function requestPushPermission(): Promise<void> {
    await ensurePushPermission();
    refreshAvailability();
  }

  /**
   * Send a test notification so the user can confirm delivery end-to-end
   * (#0316). Requests permission if needed, fires the bell too when sound is
   * on, and records a human-readable outcome in `testResult`. Never throws.
   */
  async function sendTestPush(): Promise<void> {
    testResult.value = null;
    refreshAvailability();
    if (availability.value === "insecure" || availability.value === "unsupported") {
      testResult.value = { ok: false, detail: PUSH_AVAILABILITY_HELP[availability.value] };
      return;
    }
    if (soundEnabled.value) playBell();
    const granted = await ensurePushPermission();
    refreshAvailability();
    if (!granted) {
      testResult.value = {
        ok: false,
        detail: PUSH_AVAILABILITY_HELP[availability.value] ?? "Permission was not granted.",
      };
      return;
    }
    sendPush(
      "RepoOS test notification",
      "Notifications are working — you'll be pinged when a task needs you.",
    );
    testResult.value = {
      ok: true,
      detail:
        "Sent. If nothing appeared, your OS is suppressing it — check System Settings → Notifications for this browser, and Do Not Disturb / Focus.",
    };
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
    availability,
    testResult,
    channelEnabled,
    isActive,
    hydrate,
    refreshAvailability,
    setSoundEnabled,
    setPushEnabled,
    setTypeEnabled,
    requestPushPermission,
    sendTestPush,
    notify,
  };
});
