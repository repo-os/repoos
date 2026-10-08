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
  /**
   * First match of the locator, when the driver supports it (Playwright does).
   * A declared `waitFor` means "wait until this exists", not "assert exactly
   * one" — teleported overlays and layout shells can legitimately duplicate an
   * id, and strict mode turned that into a fragile capture abort (#0603
   * review: "#app resolved to 2 elements").
   */
  first?(): ShotLocator;
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
  /** Settle time after load (and between steps) before capturing. */
  waitMs: number;
  fullPage: boolean;
}

/**
 * The outline a declared shot's `highlight` selector draws (#0603): the box
 * reads as "this is what changed" at a glance. Colors are inline because the
 * highlight must be visible over ANY app/theme; the outline sits offset
 * outside the element so it does not cover the content being pointed at.
 */
const HIGHLIGHT_COLOR = "#e0b252";

/**
 * The outcome of drawing a highlight: how many elements matched, and an undo
 * handle. A zero count means the selector matched nothing — the caller should
 * record a visible warning rather than silently capturing unhighlighted.
 */
type HighlightResult = { matched: number; undo: () => Promise<void> };

/**
 * Draw the highlight box on every element `selector` matches (#0603) and
 * return the undo handle. Runs in the page via `page.evaluate`, exactly like
 * Playwright's own test-failure highlighting; best-effort — an evaluateless
 * driver or a selector matching nothing leaves the capture unhighlighted,
 * never failed. The undo takes the same selector because the matching
 * elements are tagged with a data attribute the script cleans up.
 */
type PageEvaluate = (body: string, arg: string) => Promise<unknown>;

async function applyHighlight(
  page: ShotDriverPage,
  selector: string,
  scroll: boolean,
): Promise<HighlightResult> {
  const evaluatable = page as unknown as { evaluate?: PageEvaluate };
  const evaluate = evaluatable.evaluate;
  if (typeof evaluate !== "function") return { matched: 0, undo: async () => {} };
  const marker = "data-shot-highlight";
  // One style node, tagged, plus per-element tagging — one query removes all
  // of it, including on elements Playwright matched with its own selector
  // engine but `document.querySelectorAll` would miss (Playwright selectors
  // are supersets of CSS; a miss is tolerated by the cleanup's count check).
  const draw =
    `(() => {
    const sel = ${JSON.stringify(selector)};
    const skip = ${JSON.stringify(marker)};
    let n = 0;
    let first = null;
    for (const el of document.querySelectorAll(sel)) {
      if (el instanceof Element) {
        if (first === null) first = el;
        // Count every match, even an element an earlier overlapping selector
        // already marked — otherwise it would read as "matched nothing".
        el.setAttribute(skip, "");
        n++;
      }
    }
    if (document.getElementById("repoos-shot-highlight-style") === null) {
      const style = document.createElement("style");
      style.id = "repoos-shot-highlight-style";
      style.textContent =
        \`:where([$\{skip}]) { outline: 3px solid ${HIGHLIGHT_COLOR} !important; outline-offset: 2px !important; ` +
    `box-shadow: 0 0 0 6px ${HIGHLIGHT_COLOR}40 !important; border-radius: 3px; }\`;
      document.head.append(style);
    }
    // Bring the first match into the viewport (the whole-window capture would
    // otherwise show the top of the page, not the thing that changed).
    if (${scroll} && first !== null && typeof first.scrollIntoView === "function") {
      first.scrollIntoView({ block: "center", inline: "nearest" });
    }
    return n;
  })()`;
  const undo = `(() => {
    const sel = ${JSON.stringify(selector)};
    const skip = ${JSON.stringify(marker)};
    for (const el of document.querySelectorAll(sel)) {
      if (el instanceof Element) el.removeAttribute(skip);
    }
    document.getElementById("repoos-shot-highlight-style")?.remove();
  })()`;
  try {
    const matched = (await evaluate.call(page, draw, selector)) as number | undefined;
    const n = typeof matched === "number" ? matched : 0;
    return {
      matched: n,
      undo: async () => {
        try {
          await evaluate.call(page, undo, selector);
        } catch {
          /* best-effort */
        }
      },
    };
  } catch {
    return { matched: 0, undo: async () => {} };
  }
}

export interface ShotCaptureMissHandlers {
  onHighlightMiss?: (selector: string, route: string) => void;
  onSelectorMiss?: (selector: string, route: string) => void;
  /** Step selector timeouts become warnings instead of aborting capture (#0743). */
  onStepMiss?: (message: string, route: string) => void;
}

/**
 * Run one declared step against the page. Click/fill/waitFor use plain CSS
 * selectors or test ids. Without `onStepMiss`, a step timeout aborts capture;
 * with it, the miss is recorded and capture continues (#0743).
 */
async function runStep(
  page: ShotDriverPage,
  step: { click?: string; fill?: string; text?: string; waitFor?: string; waitMs?: number },
  route: string,
  onStepMiss?: (message: string, route: string) => void,
): Promise<void> {
  const soft = (label: string, run: () => Promise<unknown>): Promise<void> =>
    run().catch((err: Error) => {
      if (onStepMiss) {
        onStepMiss(`${label}: ${err.message.split("\n")[0]}`, route);
        return;
      }
      throw err;
    });
  if (typeof step.click === "string") {
    await soft(`click ${step.click}`, () =>
      page.locator(step.click!).click({ timeout: SHOT_SELECTOR_TIMEOUT_MS }),
    );
    return;
  }
  if (typeof step.fill === "string" && typeof step.text === "string") {
    await soft(`fill ${step.fill}`, () =>
      page.locator(step.fill!).fill(step.text!, { timeout: SHOT_SELECTOR_TIMEOUT_MS }),
    );
    return;
  }
  if (typeof step.waitFor === "string") {
    const base = page.locator(step.waitFor);
    const target = typeof base.first === "function" ? base.first() : base;
    await soft(`waitFor ${step.waitFor}`, () =>
      target.waitFor({ timeout: SHOT_SELECTOR_TIMEOUT_MS }),
    );
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
  entry: Pick<CaptureEntry, "selector" | "steps" | "highlight" | "highlights" | "route">,
  options: ShotCaptureOptions,
  misses: ShotCaptureMissHandlers = {},
): Promise<Buffer> {
  const { onHighlightMiss, onSelectorMiss, onStepMiss } = misses;
  await page.goto(url, { waitUntil: "load", timeout: SHOT_NAV_TIMEOUT_MS });
  try {
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  } catch {
    /* a dev server with HMR may never go idle — the settle below still applies */
  }
  if (options.waitMs > 0) await page.waitForTimeout(options.waitMs);
  for (const step of entry.steps ?? []) await runStep(page, step, entry.route, onStepMiss);
  // Merged duplicate declarations carry each selector separately: apply and
  // miss-check them one by one, since a comma-joined list "matches" as soon as
  // any member does (#0613).
  const highlightSelectors = entry.highlights?.length
    ? entry.highlights
    : entry.highlight
      ? [entry.highlight]
      : [];
  const applied: { selector: string; matched: number; undo: () => Promise<void> }[] = [];
  for (const selector of highlightSelectors) {
    // Only the first highlight scrolls: later ones must not undo its position.
    applied.push({ selector, ...(await applyHighlight(page, selector, applied.length === 0)) });
  }
  if (applied.length > 0 && options.waitMs > 0)
    await page.waitForTimeout(Math.min(options.waitMs, 300));
  try {
    for (const h of applied) {
      if (h.matched === 0 && onHighlightMiss) onHighlightMiss(h.selector, entry.route);
    }
    if (entry.selector) {
      const element = page.locator(entry.selector) as unknown as {
        count?(): Promise<number>;
        screenshot(options: { fullPage?: boolean; timeout?: number }): Promise<Buffer>;
      };
      if (typeof element.count === "function") {
        const n = await element.count();
        if (n === 0) {
          if (onSelectorMiss) onSelectorMiss(entry.selector, entry.route);
          return await page.screenshot({ fullPage: options.fullPage });
        }
      }
      return await element.screenshot({
        fullPage: options.fullPage,
        timeout: SHOT_SELECTOR_TIMEOUT_MS,
      });
    }
    return await page.screenshot({ fullPage: options.fullPage });
  } finally {
    // The next navigation re-renders everything anyway, but the same page can
    // serve multiple sequential captures (CLI loop) — undo promptly so a
    // highlight meant for one shot never bleeds into the next.
    for (const h of applied) await h.undo();
  }
}
