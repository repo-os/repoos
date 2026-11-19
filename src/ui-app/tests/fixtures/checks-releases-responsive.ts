import "../../src/style.css";
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import ChecksView from "../../src/views/ChecksView.vue";
import ReleasesView from "../../src/views/ReleasesView.vue";

const screen = new URLSearchParams(location.search).get("screen");
const component = screen === "releases" ? ReleasesView : ChecksView;
const route = screen === "releases" ? "/releases" : "/checks?tab=plan";
const router = createRouter({
  history: createWebHistory("/tests/fixtures/"),
  routes: [{ path: "/:pathMatch(.*)*", component }],
});
await router.push(route);
await router.isReady();
createApp({ render: () => h("main", { class: "main" }, [h(component)]) })
  .use(createPinia())
  .use(router)
  .mount("#app");
