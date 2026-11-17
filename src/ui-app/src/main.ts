import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import "./style.css";
import { installTooltips } from "./lib/tooltip";
import { claimHubContext } from "./lib/hub-shell";

// Read and hide the native Hub's one-time `?repoos_hub=` token before the
// router mounts, so it survives a login round-trip without lingering in the
// URL. A normal browser has no token and is unaffected (#1152).
claimHubContext();

createApp(App).use(createPinia()).use(router).mount("#app");
installTooltips();

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
