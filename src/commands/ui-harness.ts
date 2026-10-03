/**
 * Shared headless-UI setup for the built app's ephemeral HTTP server and a
 * WebKit browser against it. This is used by `repoos check`'s UI gate so the
 * smoke test reuses one launch implementation instead of hand-rolling another
 * copy in a different flow.
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
  /** Where the console message originated — used to key resource errors to
   * the URL that failed, so known-benign 404s can be tolerated per-URL. */
  location(): { url: string };
}
export interface SmokeResponse {
  status(): number;
  url(): string;
}
export interface SmokePage {
  on(event: "console", handler: (msg: SmokeConsoleMessage) => void): void;
  on(event: "pageerror", handler: (err: Error) => void): void;
  on(event: "response", handler: (res: SmokeResponse) => void): void;
  route(
    url: string,
    handler: (route: {
      fetch(): Promise<{
        json(): Promise<unknown>;
      }>;
      fulfill(options: { status: number; contentType: string; body: string }): Promise<void>;
    }) => Promise<void>,
  ): Promise<void>;
  close(): Promise<void>;
  goto(url: string, options: { waitUntil: string; timeout: number }): Promise<unknown>;
  title(): Promise<string>;
  /**
   * Run `fn` in the page. Playwright serializes the function itself, so `fn`
   * must be self-contained (no module-scope references) — that is exactly how
   * the contrast audit ships its in-page probe (#0596).
   */
  evaluate<R, A = undefined>(fn: (arg: A) => R, arg?: A): Promise<R>;
  $(selector: string): Promise<unknown>;
  setViewportSize(viewport: { width: number; height: number }): Promise<void>;
  waitForFunction(fn: () => unknown, options?: { timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  /**
   * Real pointer click: unlike `el.click()` in evaluate, the browser runs the
   * focus-on-click default action, which is the whole point of the #0638
   * smoke flow (a teleported input must hold focus after a real click).
   */
  click(selector: string, options?: { timeout?: number }): Promise<void>;
  /** Programmatic focus — still dispatches focusin/focusout normally. */
  focus(selector: string, options?: { timeout?: number }): Promise<void>;
  keyboard: {
    type(text: string): Promise<void>;
    press(key: string): Promise<void>;
  };
  route(
    url: string,
    handler: (route: {
      fetch(): Promise<{ json(): Promise<unknown> }>;
      fulfill(options: { status: number; contentType: string; body: string }): Promise<void>;
    }) => Promise<void>,
  ): Promise<void>;
  close(): Promise<void>;
}
export interface SmokeBrowser {
  newPage(): Promise<SmokePage>;
  newPage(options: { viewport: { width: number; height: number } }): Promise<SmokePage>;
  newContext(options: { serviceWorkers: "allow" | "block" }): Promise<SmokeContext>;
  close(): Promise<void>;
}
export interface SmokeContext {
  newPage(): Promise<SmokePage>;
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
 * optional — both callers pass a throwaway fixture root for determinism: the
 * smoke test (check.ts) boots against a bare empty work/ + minimal repoos.toml
 * so it never touches the live board's jobs or preview auto-launch (#0260),
 * and the screenshot script serves a fixture copy.
 */
export async function startPreviewServer(root?: string): Promise<PreviewServer> {
  const { startServer } = await import("../server/server.js");
  // disableAuth: the smoke gate tests generic rendering (title, board,
  // buttons), not auth flows — a project with [auth] enabled must not make
  // `repoos check` itself unable to reach the dashboard.
  //
  // previewOverrides: this is the UI-test preview path, so it resolves the same
  // preview-only `[preview.*]` overlay a managed preview applies (#0464). The
  // smoke test's throwaway fixture declares no overlay, so this is normally a
  // no-op; it matters when the harness serves a real root.
  const opts: ServeOptions = {
    host: "127.0.0.1",
    port: 0,
    disableAuth: true,
    previewOverrides: true,
  };
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

/**
 * A missing @playwright/test install or WebKit binary — a skip, not a failure.
 * Shared by both Playwright callers (ui-smoke, the contrast audit #0596) so a
 * machine without a browser reports the same way from either gate step.
 */
export function isPlaywrightUnavailable(msg: string): boolean {
  return (
    msg.includes("Cannot find module") ||
    msg.includes("not installed") ||
    msg.includes("Executable doesn't exist")
  );
}
