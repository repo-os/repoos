import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "./views/DashboardView.vue";
import WorkView from "./views/WorkView.vue";
import ContextView from "./views/ContextView.vue";
import SettingsView from "./views/SettingsView.vue";
import AgentsView from "./views/AgentsView.vue";
import LoginView from "./views/LoginView.vue";
import { useAuthStore } from "./stores/auth";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginView, meta: { public: true } },
    { path: "/", name: "dashboard", component: DashboardView },
    { path: "/work", name: "work", component: WorkView },
    { path: "/repo", name: "repo", component: ContextView },
    { path: "/settings", name: "settings", component: SettingsView },
    { path: "/agents", name: "agents", component: AgentsView },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

// The server already gates every API route and redirects a full-page
// navigation to /login (server.ts's auth middleware) — but a client-side
// route change inside the already-loaded SPA shell never hits the server
// again, so without this guard an unauthenticated visitor who lands on the
// app (or a session that's since expired) just sees the dashboard chrome
// with every API call failing 401 instead of being sent to /login.
router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const auth = useAuthStore();
  if (!auth.loaded) await auth.loadMe();
  if (auth.authEnabled && !auth.authenticated) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }
  return true;
});
