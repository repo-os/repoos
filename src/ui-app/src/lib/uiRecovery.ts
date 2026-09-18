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
let clientBuild = (): string | null =>
  typeof window !== "undefined" ? (window.__REPOOS_BUILD_HASH__ ?? null) : null;

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

function rememberIntent(route: string): void {
  state.attemptedRoute = route;
  try {
    sessionStorage.setItem(INTENT_KEY, route);
  } catch {
    /* private browsing can disable session storage */
  }
}

export function consumeRouteIntent(): string | null {
  try {
    const route = sessionStorage.getItem(INTENT_KEY);
    sessionStorage.removeItem(INTENT_KEY);
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
    window.setTimeout(() => {
      if (state.kind === "stale" && !isDirty() && !isBusy()) reloadNow();
    }, 250);
  }
}

export function shouldAutoReload(dirty: boolean, busy: boolean): boolean {
  return !dirty && !busy;
}

export function showOffline(
  message = "The RepoOS server is offline or stalled. Retry or reload when it is ready.",
): void {
  state.kind = "offline";
  state.message = message;
}

export function reloadNow(): void {
  const intent = state.attemptedRoute;
  if (intent) rememberIntent(intent);
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (intent && intent !== current) window.location.assign(intent);
  else window.location.reload();
}

export async function checkUiBuild(): Promise<void> {
  if (!configured) return;
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
  }
}

export function uiRecoveryState(): UiRecoveryState {
  return state;
}
