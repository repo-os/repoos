/**
 * Shared choreography for a single screenshot capture (#0594).
 *
 * The structural `ShotDriverPage`/`ShotLocator` types are what the capture
 * needs from a Playwright page; `tsc` compiles against them with the optional
 * `@playwright/test` dev dependency absent, so "not installed" stays a clean
 * skip rather than a build failure. Both `repoos shot` (CLI) and the
 * handoff-time automatic capture (server) run the SAME function: navigate,
 * settle past the dev server's client mount, run the declared steps, then
 * screenshot the page or one selector.
 */
import type { CaptureEntry } from "./shot-plan.js";

export const SHOT_NAV_TIMEOUT_MS = 30_000;
/** How long Playwright waits for a selector before giving up (avoids a 30s hang). */
export const SHOT_SELECTOR_TIMEOUT_MS = 5_000;

export interface ShotLocator {
  click(options?: { timeout?: number }): Promise<unknown>;
  fill(text: string, options?: { timeout?: number }): Promise<unknown>;
  waitFor(options?: { timeout?: number }): Promise<unknown>;
}

export interface ShotDriverPage {
  goto(url: string, options: { waitUntil: string; timeout: number }): Promise<unknown>;
  waitForLoadState(state: string, options?: { timeout?: number }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  setViewportSize(viewport: { width: number; height: number }): Promise<void>;
  locator(selector: string): ShotLocator;
  screenshot(options?: { fullPage?: boolean }): Promise<Buffer>;
  close(): Promise<void>;
}

export interface ShotCaptureOptions {
  viewport: { width: number; height: number };
  /** Wait for the declared steps to have time to settle, too. */
  waitMs: number;
  fullPage: boolean;
}

/**
 * Run one declared step against the page. Click/fill/waitFor use plain CSS
 * selectors or test ids; a step failing its timeout aborts the capture so the
 * shot never shows an unreached state.
 */
async function runStep(
  page: ShotDriverPage,
  step: { click?: string; fill?: string; text?: string; waitFor?: string; waitMs?: number },
): Promise<void> {
  if (typeof step.click === "string") {
    await page.locator(step.click).click({ timeout: SHOT_SELECTOR_TIMEOUT_MS });
    return;
  }
  if (typeof step.fill === "string" && typeof step.text === "string") {
    await page.locator(step.fill).fill(step.text, { timeout: SHOT_SELECTOR_TIMEOUT_MS });
    return;
  }
  if (typeof step.waitFor === "string") {
    await page.locator(step.waitFor).waitFor({ timeout: SHOT_SELECTOR_TIMEOUT_MS });
    return;
  }
  if (typeof step.waitMs === "number") await page.waitForTimeout(step.waitMs);
}

/**
 * Capture one page. `waitUntil: "load"` fires before a dev server's client
 * bundle hydrates/mounts, so screenshotting immediately catches a spinner; we
 * then best-effort wait for network quiet and a short settle, so the frame
 * recorded is the mounted UI, not its loading state.
 */
export async function captureShotPage(
  page: ShotDriverPage,
  url: string,
  entry: Pick<CaptureEntry, "selector" | "steps">,
  options: ShotCaptureOptions,
): Promise<Buffer> {
  await page.goto(url, { waitUntil: "load", timeout: SHOT_NAV_TIMEOUT_MS });
  try {
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  } catch {
    /* a dev server with HMR may never go idle — the settle below still applies */
  }
  if (options.waitMs > 0) await page.waitForTimeout(options.waitMs);
  for (const step of entry.steps ?? []) await runStep(page, step);
  if (entry.selector) {
    const element = page.locator(entry.selector) as unknown as {
      screenshot(options: { fullPage?: boolean; timeout?: number }): Promise<Buffer>;
    };
    return element.screenshot({
      fullPage: options.fullPage,
      timeout: SHOT_SELECTOR_TIMEOUT_MS,
    });
  }
  return page.screenshot({ fullPage: options.fullPage });
}
