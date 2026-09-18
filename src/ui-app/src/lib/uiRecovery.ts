import { reactive } from "vue";
import { api } from "../api";
import type { Health } from "../types";

export type UiRecoveryKind = "stale" | "offline" | null;

export interface UiRecoveryState {
  kind: UiRecoveryKind;
  message: string;
  attemptedRoute: string | null;
  currentBuild: string | null;
  newBuild: string | null;
  newBuildAt: string | null;
}

const INTENT_KEY = "repoos.route-intent";
const state = reactive<UiRecoveryState>({
  kind: null,
  message: "",
  attemptedRoute: null,
  currentBuild: null,
  newBuild: null,
  newBuildAt: null,
});

let isDirty = () => false;
let isBusy = () => false;
let configured = false;
let healthCheckInFlight: Promise<void> | null = null;
let clientBuild = (): string | null => {
  if (typeof document !== "undefined") {
    const meta = document.querySelector('meta[name="repoos-build-hash"]');
    const metaValue = meta?.getAttribute("content");
    if (metaValue) return metaValue;
  }
  if (typeof globalThis !== "undefined") {
    const buildHash = (globalThis as { __REPOOS_BUILD_HASH__?: string }).__REPOOS_BUILD_HASH__;
    if (buildHash) return buildHash;
  }
  if (typeof window !== "undefined") {
    return window.__REPOOS_BUILD_HASH__ ?? null;
  }
  return null;
};

export function configureUiRecovery(options: {
  isDirty: () => boolean;
  isBusy: () => boolean;
  clientBuild?: () => string | null;
}): void {
  isDirty = options.isDirty;
  isBusy = options.isBusy;
  if (options.clientBuild) clientBuild = options.clientBuild;
  configured = true;
}

function getSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

function rememberIntent(route: string): void {
  state.attemptedRoute = route;
  try {
    const storage = getSessionStorage();
    storage?.setItem(INTENT_KEY, route);
  } catch {
    /* private browsing can disable session storage */
  }
}

export function consumeRouteIntent(): string | null {
  try {
    const storage = getSessionStorage();
    if (!storage) return null;
    const route = storage.getItem(INTENT_KEY);
    storage.removeItem(INTENT_KEY);
    return route;
  } catch {
    return null;
  }
}

export function showStaleUi(
  route: string,
  newBuild: string | null = null,
  buildAt: string | null = null,
): void {
  rememberIntent(route);
  state.kind = "stale";
  state.message = "RepoOS was updated while this page was open. Reload to continue.";
  state.currentBuild = clientBuild();
  state.newBuild = newBuild;
  state.newBuildAt = buildAt;
  if (shouldAutoReload(isDirty(), isBusy())) {
    const schedule = typeof window !== "undefined" ? window.setTimeout : globalThis.setTimeout;
    schedule(() => {
      if (state.kind === "stale" && !isDirty() && !isBusy()) reloadNow();
    }, 250);
  }
}

export function shouldAutoReload(dirty: boolean, busy: boolean): boolean {
  return !dirty && !busy;
}

export function isStaleImportError(message: string): boolean {
  const normalized = message.toLowerCase();
  if (
    /loading chunk|failed to fetch dynamically imported module|dynamically imported module|importing a module script failed|chunk load error|unexpected token </i.test(
      message,
    ) ||
    (normalized.includes("mime") && /\/assets\/|\.js|\.css/i.test(message))
  ) {
    return true;
  }
  return (
    /(?:^|[^a-z])(?:failed to fetch|networkerror)(?:[^a-z]|$)/i.test(message) &&
    /(?:chunk|module|asset)/i.test(message)
  );
}

export function showOffline(
  message = "The RepoOS server is offline or stalled. Retry or reload when it is ready.",
): void {
  if (state.kind === "stale") return;
  state.kind = "offline";
  state.message = message;
}

export function reloadNow(): void {
  const intent = consumeRouteIntent() ?? state.attemptedRoute;
  if (intent) rememberIntent(intent);
  if (typeof window === "undefined") return;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (intent && intent !== current) {
    window.location.assign(intent);
    return;
  }
  window.location.reload();
}

export async function checkUiBuild(): Promise<void> {
  if (!configured || state.kind === "stale") return;
  if (healthCheckInFlight) return healthCheckInFlight;
  healthCheckInFlight = (async () => {
    try {
      const health = await api<Health>("/api/health");
      const local = clientBuild();
      if (local && health.buildHash && local !== health.buildHash) {
        showStaleUi(
          window.location.pathname + window.location.search,
          health.buildHash,
          health.buildAt,
        );
      }
    } catch (err) {
      if (err instanceof Error && /timed out|can't reach/i.test(err.message))
        showOffline(err.message);
    } finally {
      healthCheckInFlight = null;
    }
  })();
  await healthCheckInFlight;
}

export function uiRecoveryState(): UiRecoveryState {
  return state;
}
