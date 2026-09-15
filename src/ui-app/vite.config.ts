import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { shellPrecache } from "./src/lib/sw-precache";
import { serviceWorkerSource } from "./src/lib/sw-source";

/**
 * Emits the service worker (source and caching rules: `serviceWorkerSource`),
 * precaching the app shell (`shellPrecache`). Cache name is hashed from the
 * generated source so stale caches never survive a deploy or a logic change.
 */
function repoosSw(): Plugin {
  return {
    name: "repoos:sw",
    apply: "build",
    generateBundle(_opts, bundle) {
      const precache = shellPrecache(bundle);
      // Hash the whole worker source (precache list included), so a change to
      // its logic rotates the cache too and stale entries get deleted.
      const draft = serviceWorkerSource(precache, "repoos-shell-pending");
      const tag = createHash("sha256").update(draft).digest("hex").slice(0, 10);
      const sw = serviceWorkerSource(precache, `repoos-shell-${tag}`);
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
    // Runs once before the whole test run starts (not per test file) —
    // sweeps orphaned fake-agent processes a previous run's worker left
    // behind when it was torn down before its own try/finally could fire.
    // See the file for the failure mode this closes.
    globalSetup: ["./tests/setup/global-reap.ts"],
    // Process-spawning tests boot real child processes (fixture CLI stubs,
    // git, whole HTTP servers) and wait on them with waitFor() polls. Vitest's
    // default 5s per-test timeout flaked the `repoos check` gate under load;
    // 15s still flaked the heaviest suites (agent-review, done-reliability,
    // boot-timing) on a memory-starved box — server boot + agent subprocess +
    // poll legitimately reaches ~20s there. 30s gives real headroom while
    // still failing a genuine hang fast (waitFor throws well before this).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Vitest's default forks pool sizes itself to (CPU cores - 1) per run —
    // fine for one run alone, but repoos routinely has several agent-driven
    // `bun run test`/`repoos check` runs happening at once across worktrees,
    // and each one's pool multiplies against the others rather than
    // sharing the machine. Capping a single run's own pool bounds that
    // multiplier so maxConcurrentAgents (src/core/config.ts) can be sized off
    // total cores instead of assuming any one run might claim all of them.
    //
    // `repoos check` overrides this via REPOOS_TEST_WORKERS when it detects a
    // solo run with cpu + memory headroom (see check.ts testPoolSize) — the
    // subprocess-heavy suites are I/O-bound and scale close to linearly.
    maxWorkers: Number(process.env.REPOOS_TEST_WORKERS) || 2,
  },
});
