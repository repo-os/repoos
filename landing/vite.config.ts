import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { themeBootPlugin } from "./vite-plugin-theme-boot.js";
import { llmsTxtPlugin } from "./vite-plugin-llms-txt.js";

// repoos.org marketing app. Static pages plus a separate Worker for enquiries.
// Independent of src/ui-app, with its own package and deployment pipeline.
const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: appRoot,
  plugins: [
    themeBootPlugin(),
    llmsTxtPlugin(),
    vue(),
    tailwindcss(),
    {
      name: "repoos:client-page-entry",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          const url = new URL(request.url || "/", "http://localhost");
          if (url.pathname === "/for-clients" || url.pathname === "/for-clients/") {
            request.url = "/for-clients/index.html" + url.search;
          }
          next();
        });
      },
    },
  ],
  base: "/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        home: fileURLToPath(new URL("./index.html", import.meta.url)),
        clients: fileURLToPath(new URL("./for-clients/index.html", import.meta.url)),
      },
    },
  },
});
