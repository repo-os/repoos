import "../../src/style.css";
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import ChecksView from "../../src/views/ChecksView.vue";
import ReleasesView from "../../src/views/ReleasesView.vue";

const params = new URLSearchParams(location.search);
const screen = params.get("screen");
const component = screen === "releases" ? ReleasesView : ChecksView;
const route = screen === "releases" ? "/releases" : "/checks?tab=plan";
// Shots are captured with `?shotState=` alongside the page query; the real
// router keeps it, so the harness must too (the views read window.location).
const shotState = params.get("shotState");
const router = createRouter({
  history: createWebHistory("/tests/fixtures/"),
  routes: [{ path: "/:pathMatch(.*)*", component }],
});
await router.push(
  shotState
    ? `${route}${route.includes("?") ? "&" : "?"}shotState=${encodeURIComponent(shotState)}`
    : route,
);
await router.isReady();
createApp({ render: () => h("main", { class: "main" }, [h(component)]) })
  .use(createPinia())
  .use(router)
  .mount("#app");
