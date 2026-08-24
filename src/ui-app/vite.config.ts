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
// which `repoos serve` serves as the app shell + assets.
const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: appRoot,
  plugins: [vue(), tailwindcss(), repoosSw()],
  base: "/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Vue core changes far less often than app code and views, so
            // split it out for cross-deploy caching.
            { name: "vendor-vue", test: /\/node_modules\/(vue|@vue|vue-router|pinia)\// },
            // UI primitives/icons: large and independent of app logic.
            { name: "vendor-ui", test: /\/node_modules\/(radix-vue|lucide-vue-next)\// },
          ],
        },
      },
    },
  },
  server: {
    // Dev-server proxy so the app can talk to a locally running `repoos serve`.
    proxy: {
      "/api": "http://127.0.0.1:7171",
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    // Node >= 25 occupies globalThis.localStorage with an accessor that yields
    // undefined, which makes jsdom skip installing its own Storage. Without
    // this shim the suite passes under Node 24 and fails under Node 26 — and
    // the close-out gate runs under whichever Node is serving. See the file.
    setupFiles: ["./tests/setup/web-storage.ts"],
    // Process-spawning tests boot real child processes (fixture CLI stubs,
    // git) and wait on them with waitFor() polls of up to 10s. Vitest's
    // default 5s per-test timeout flaked the `repoos check` gate under load
    // (right after a build, or with other worktrees building in parallel) —
    // give the suite real headroom while still failing fast on genuine
    // breakage (waitFor throws well before these caps).
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Vitest's default forks pool sizes itself to (CPU cores - 1) per run —
    // fine for one run alone, but repoos routinely has several agent-driven
    // `bun run test`/`repoos check` runs happening at once across worktrees
    // (#0293), and each one's pool multiplies against the others rather than
    // sharing the machine. Capping a single run's own pool bounds that
    // multiplier so maxConcurrentAgents (src/core/config.ts) can be sized off
    // total cores instead of assuming any one run might claim all of them.
    maxWorkers: 2,
  },
});
