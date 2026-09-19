import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth";
import {
  checkUiBuild,
  consumeRouteIntent,
  isStaleImportError,
  isstaleDismissed,
  showStaleUi,
  uiRecoveryState,
} from "./lib/uiRecovery";

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
    {
      path: "/deployments",
      name: "deployments",
      component: () => import("./views/DeploymentsView.vue"),
    },
    { path: "/inputs", name: "inputs", component: () => import("./views/InputsView.vue") },
    { path: "/repo", name: "repo", component: () => import("./views/ContextView.vue") },
    { path: "/settings", name: "settings", component: () => import("./views/SettingsView.vue") },
    { path: "/agents", name: "agents", component: () => import("./views/AgentsView.vue") },
    {
      path: "/tasks/:taskId/diff",
      name: "diff",
      component: () => import("./views/DiffView.vue"),
      meta: { fullscreen: true },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

// The server already gates every API route and redirects a full-page
// navigation to /login (server.ts's auth middleware) — but a client-side
// route change inside the already-loaded SPA shell never hits the server
// again, so without this guard an unauthenticated visitor who lands on the
// app (or a session that's since expired) just sees the dashboard chrome
// with every API call failing 401 instead of being sent to /login.
let initialNavigation = true;
router.beforeEach(async (to) => {
  if (initialNavigation) {
    initialNavigation = false;
    const pending = consumeRouteIntent();
    if (pending && pending !== to.fullPath) {
      return { path: pending, replace: true };
    }
  }
  if (to.meta.public) return true;
  const auth = useAuthStore();
  if (!auth.loaded) await auth.loadMe();
  if (auth.authEnabled && !auth.authenticated) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }
  return true;
});

router.onError((error, to) => {
  if (uiRecoveryState().kind === "stale") return;
  // Don't re-show after dismiss: the user has already acknowledged the stale
  // state; chunk 404s on navigation are an expected consequence of that choice.
  if (isstaleDismissed()) return;
  const message = error instanceof Error ? error.message : String(error);
  if (isStaleImportError(message)) {
    showStaleUi(to?.fullPath ?? window.location.pathname + window.location.search);
  }
});

router.afterEach(() => {
  void checkUiBuild();
});
