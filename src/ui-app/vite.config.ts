import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// RepoOS web UI — built by `bun run build:ui` into the repo-root dist/ui/,
// which `ros serve` serves as the app shell + assets.
const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: appRoot,
  plugins: [vue(), tailwindcss()],
  base: "/",
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
  },
  server: {
    // Dev-server proxy so the app can talk to a locally running `ros serve`.
    proxy: {
      "/api": "http://127.0.0.1:7171",
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
