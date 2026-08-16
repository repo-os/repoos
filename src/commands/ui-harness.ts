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
 * They run in separate OS processes, so each still performs its own launch at
 * runtime, but the launch/teardown logic now lives in exactly one place and the
 * two call sites can never drift apart again. (A literal single shared server +
 * single browser across the process boundary is intentionally out of scope —
 * see task #0213's scope-down note.)
 */
import { createRequire } from "node:module";

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
  const opts: Record<string, unknown> = { host: "127.0.0.1", port: 0 };
  if (root !== undefined) opts.root = root;
  const server = (await startServer(opts as never)) as unknown as {
    close: () => void;
    url: string;
  };
  return { close: server.close.bind(server), url: server.url };
}

/**
 * Resolve `@playwright/test` and launch headless WebKit. Throws a descriptive
 * error when the package isn't installed so callers can report it as a
 * graceful skip rather than a gate failure.
 */
export async function launchWebkit(): Promise<{
  browser: SmokeBrowser;
  playwright: SmokePlaywright;
}> {
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
  const browser = await playwright.webkit.launch({ headless: true });
  return { browser, playwright };
}
