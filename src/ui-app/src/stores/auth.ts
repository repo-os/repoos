import { ref } from "vue";
import { defineStore } from "pinia";

export const useAuthStore = defineStore("auth", () => {
  const authEnabled = ref(false);
  const authenticated = ref(false);
  const email = ref<string | null>(null);
  const role = ref<"admin" | "member" | null>(null);
  const loaded = ref(false);

  async function loadMe(): Promise<void> {
    try {
      const res = await fetch("/api/auth/me");
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
