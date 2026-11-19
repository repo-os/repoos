import { ref } from "vue";
import { defineStore } from "pinia";

export const useAuthStore = defineStore("auth", () => {
  const authEnabled = ref(false);
  const authenticated = ref(false);
  const email = ref<string | null>(null);
  const role = ref<"admin" | "member" | null>(null);
  const loaded = ref(false);

  /**
   * #1226: `/api/auth/me` is plain `fetch` with no `api()` timeout, and both
   * the router guard and App's `onMounted` await it before anything else can
   * load. On a stalled (but not refused) server the request hangs for minutes,
   * leaving every page an endless skeleton — exactly what the slow-network QA
   * pass bans. Bound it; on timeout the app renders (auth treated as off) and
   * a reload picks the real answer up.
   */
  const AUTH_ME_TIMEOUT_MS = 6_000;

  async function loadMe(): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTH_ME_TIMEOUT_MS);
    try {
      const res = await fetch("/api/auth/me", { signal: controller.signal });
      const data = await res.json();
      authEnabled.value = Boolean(data.authEnabled);
      authenticated.value = Boolean(data.authenticated);
      email.value = data.email ?? null;
      role.value = data.role ?? null;
    } catch {
      // Server unreachable or auth not wired up yet — treat as disabled.
      authEnabled.value = false;
      authenticated.value = false;
    } finally {
      clearTimeout(timer);
      loaded.value = true;
    }
  }

  async function logout(): Promise<void> {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      authenticated.value = false;
      email.value = null;
      role.value = null;
      window.location.href = "/login";
    }
  }

  return { authEnabled, authenticated, email, role, loaded, loadMe, logout };
});
