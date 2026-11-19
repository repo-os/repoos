import "../../src/style.css";
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import ChecksView from "../../src/views/ChecksView.vue";

// Mounts the real Checks page on a seeded live-run state (#1247). The page
// URL carries `tab` and `liveState`; the store stub reads `liveState` from it.
const params = new URLSearchParams(location.search);
const tab = params.get("tab") ?? "now";
const liveState = params.get("liveState") ?? "running";
const router = createRouter({
  history: createWebHistory("/tests/fixtures/"),
  routes: [{ path: "/:pathMatch(.*)*", component: ChecksView }],
});
await router.push(
  `/checks?tab=${encodeURIComponent(tab)}&liveState=${encodeURIComponent(liveState)}`,
);
await router.isReady();
createApp({ render: () => h("main", { class: "main" }, [h(ChecksView)]) })
  .use(createPinia())
  .use(router)
  .mount("#app");
