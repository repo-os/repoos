import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import "./style.css";

createApp(App).use(createPinia()).use(router).mount("#app");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then((registration) => {
      registration.update();
      const refresh = () => {
        if (document.visibilityState === "visible") registration.update();
      };
      document.addEventListener("visibilitychange", refresh);
      window.addEventListener("focus", refresh);
    })
      .catch(() => {
        /* offline shell unavailable — app still works online */
      });
  });
}
