import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "./views/DashboardView.vue";
import WorkView from "./views/WorkView.vue";
import ContextView from "./views/ContextView.vue";
import SettingsView from "./views/SettingsView.vue";
import AgentsView from "./views/AgentsView.vue";
import LoginView from "./views/LoginView.vue";

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
