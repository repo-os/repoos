import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import "./style.css";

createApp(App).use(createPinia()).use(router).mount("#app");

const canUseServiceWorker =
  "serviceWorker" in navigator &&
  window.isSecureContext &&
  !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

if (canUseServiceWorker) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
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
