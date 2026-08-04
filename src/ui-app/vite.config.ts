import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

/**
 * Emits a service worker that precaches the built app shell for offline use.
 * Cache name is hashed from the asset list so stale caches never survive a
 * deploy. API requests are never intercepted (the live server owns them).
 */
function repoosSw(): Plugin {
  return {
    name: "repoos:sw",
    apply: "build",
    generateBundle(_opts, bundle) {
      const assets = Object.keys(bundle).filter((n) => !n.endsWith(".map"));
      const precache = ["/", ...assets.map((a) => "/" + a)];
      const tag = createHash("sha256").update(precache.join("|")).digest("hex").slice(0, 10);
      const sw = `const CACHE = "repoos-shell-${tag}";
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }).catch(() => caches.match("/")),
    ),
  );
});`;
      this.emitFile({ type: "asset", fileName: "sw.js", source: sw });
    },
  };
}

// RepoOS web UI — built by `bun run build:ui` into the repo-root dist/ui/,
// which `ros serve` serves as the app shell + assets.
const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: appRoot,
  plugins: [vue(), tailwindcss(), repoosSw()],
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
