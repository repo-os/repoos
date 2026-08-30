import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("./views/LoginView.vue"),
      meta: { public: true },
    },
    { path: "/", name: "dashboard", component: () => import("./views/DashboardView.vue") },
    { path: "/work", name: "work", component: () => import("./views/WorkView.vue") },
    { path: "/releases", name: "releases", component: () => import("./views/ReleasesView.vue") },
    { path: "/inputs", name: "inputs", component: () => import("./views/InputsView.vue") },
    { path: "/repo", name: "repo", component: () => import("./views/ContextView.vue") },
    { path: "/settings", name: "settings", component: () => import("./views/SettingsView.vue") },
    { path: "/agents", name: "agents", component: () => import("./views/AgentsView.vue") },
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
