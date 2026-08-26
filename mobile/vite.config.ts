import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

// RepoOS mobile hub — the native shell around the RepoOS web UI.
// This is a *separate* app from src/ui-app (which is the hosted RepoOS PWA).
// Built with Capacitor: the same `www/` output runs in the shared web dev
// server (for browser testing of the picker) and inside the iOS/Android shell.
const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: appRoot,
  plugins: [vue()],
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "www",
    emptyOutDir: true,
  },
});
