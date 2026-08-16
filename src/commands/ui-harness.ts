/**
 * Shared headless-UI setup for the two places that start the built app's
 * ephemeral HTTP server and a WebKit browser against it:
 *   - `runUISmokeTest` in src/commands/check.ts (`repoos check`'s UI gate)
 *   - `scripts/capture-screenshots.mjs` (`bun run screenshots`)
 *
 * Both previously hand-rolled the same "start server on an ephemeral port via
 * createRequire + launch headless WebKit" boilerplate, each with its own copy
 * of the `@playwright/test` / server wiring — so close-out ended up with two
 * independent browser+server launch cycles to verify the same built UI.
 *
 * They run in separate OS processes that are never alive at the same time —
 * `repoos check` is a subprocess of the close-out gate, while screenshots are
 * an on-demand `bun run screenshots` run that, per #0140, is never part of a
 * close-out — so each still performs its own launch at runtime. A literal
 * single shared server + single browser *instance* across that boundary is
 * therefore impossible without folding screenshots into `repoos check` (which
 * would contradict #0140), so the shared logic itself is the intended AC3
 * scope-down (task #0213): one launch implementation, zero drift between the
 * two call sites.
 */
import { createRequire } from "node:module";
import type { ServeOptions } from "../server/server.js";

export interface PreviewServer {
  close: () => void;
  url: string;
}

/** Structural subset of the Playwright WebKit API both callers use. */
export interface SmokeConsoleMessage {
  type(): string;
  text(): string;
}
export interface SmokePage {
  on(event: "console", handler: (msg: SmokeConsoleMessage) => void): void;
  on(event: "pageerror", handler: (err: Error) => void): void;
  goto(url: string, options: { waitUntil: string; timeout: number }): Promise<unknown>;
  title(): Promise<string>;
  evaluate<R>(fn: () => R): Promise<R>;
  $(selector: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
}
export interface SmokeBrowser {
  newPage(): Promise<SmokePage>;
  newPage(options: { viewport: { width: number; height: number } }): Promise<SmokePage>;
  close(): Promise<void>;
}
export interface SmokePlaywright {
  webkit: {
    launch(options: { headless: boolean }): Promise<SmokeBrowser>;
  };
}

/**
 * Start the built UI's server on an ephemeral port so the gate works even when
 * a `repoos serve` instance is already running on the default port. `root` is
 * optional — the smoke test serves the checkout's own config/work; the
 * screenshot script passes a throwaway fixture copy for determinism.
 */
export async function startPreviewServer(root?: string): Promise<PreviewServer> {
  const { startServer } = await import("../server/server.js");
  const opts: ServeOptions = { host: "127.0.0.1", port: 0 };
  if (root !== undefined) opts.root = root;
  return startServer(opts);
}

/**
 * Resolve `@playwright/test` and launch headless WebKit. Throws a descriptive
 * error when the package isn't installed so callers can report it as a
 * graceful skip rather than a gate failure.
 */
export async function launchWebkit(): Promise<SmokeBrowser> {
  // @playwright/test is a CJS package. Bun's ESM `import()` of it resolves the
  // named browser exports to `undefined` (root cause of #0200), so load it via
  // createRequire, which handles the CJS interop under both Bun and Node.
  // Types are structural (Smoke*) rather than `typeof import("@playwright/test")`
  // so `tsc` compiles even when the package is absent — the build must not fail
  // before the "not installed" skip can run.
  const require = createRequire(import.meta.url);
  let playwright: SmokePlaywright;
  try {
    playwright = require("@playwright/test");
  } catch {
    throw new Error("Cannot find module @playwright/test (not installed)");
  }
  return playwright.webkit.launch({ headless: true });
}
