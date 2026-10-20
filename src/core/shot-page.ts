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
import { shotFixtureContainer, SHOT_PREVIEW_APPLIED_ATTR } from "./shot-fixtures.js";

export const SHOT_NAV_TIMEOUT_MS = 30_000;
/** How long Playwright waits for a selector before giving up (avoids a 30s hang). */
export const SHOT_SELECTOR_TIMEOUT_MS = 5_000;

export interface ShotLocator {
  click(options?: { timeout?: number }): Promise<unknown>;
  fill(text: string, options?: { timeout?: number }): Promise<unknown>;
  hover(options?: { timeout?: number }): Promise<unknown>;
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
  emulateMedia?(options: { reducedMotion?: "reduce" | "no-preference" }): Promise<void>;
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

/**
 * #0755: signals that a page is still loading. Kept deliberately NARROW so a
 * mounted app is never mistaken for a loading one — a false "loading" verdict
 * would flip a good capture to `check`. Only unambiguous, author-intended
 * markers count:
 *   - a VISIBLE `aria-busy="true"` region (the ARIA loading contract), or a
 *     `data-loading`/`data-loading-state="true"` opt-in marker;
 *   - visible text that opens with "Loading …" (the "Loading changes…" state
 *     this task calls out).
 * Deliberately NOT class globs like `.loading`/`[class*="spinner"]`: those
 * match unrelated decorators on a fully rendered page (review round 1), and the
 * text/ARIA signals already cover the real loading state.
 */
const LOADING_STATE_QUERY = `(() => {
  const visible = (el) => {
    if (!(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return false;
    return true;
  };
  const attrs = [
    '[aria-busy="true"]',
    '[data-loading="true"]',
    '[data-loading-state="true"]',
  ];
  for (const sel of attrs) {
    for (const el of document.querySelectorAll(sel)) {
      if (visible(el)) return "loading indicator " + sel;
    }
  }
  // Visible text that opens with "Loading …" — the "Loading changes…" state the
  // task calls out. Matched on element text, so a mounted app with no loader
  // text never trips it.
  const body = document.body;
  if (body) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) !== null) {
      const text = (node.textContent || "").trim();
      if (/^loading(\\b|\\s|…|\\.)/i.test(text) && visible(node.parentElement)) {
        return "loading text \\"" + text.slice(0, 40) + "\\"";
      }
    }
  }
  return "";
})()`;

/**
 * Probe the captured page for a still-visible loading state (#0755). Returns a
 * short description (e.g. `loading text "Loading changes…"`) or empty when the
 * page looks mounted. Best-effort: a driver without `evaluate` yields empty.
 */
async function detectLoadingState(page: ShotDriverPage): Promise<string> {
  const evaluatable = page as unknown as { evaluate?: PageEvaluate };
  const evaluate = evaluatable.evaluate;
  if (typeof evaluate !== "function") return "";
  try {
    const found = (await evaluate.call(page, LOADING_STATE_QUERY, "")) as string | undefined;
    return typeof found === "string" ? found : "";
  } catch {
    return "";
  }
}

/**
 * Pin the page's light/dark mode before capture (#0782). The app resolves its
 * theme from `localStorage.repoos.theme` at first paint (`index.html`) and
 * again when the config store initialises, so writing the same two values the
 * contrast audit writes — the stored choice plus the resolved `data-theme` —
 * restyles the mounted app without touching the DOM the shot is about. Like
 * the highlight this is best-effort; an evaluate-less driver (or a throwing
 * script) records a miss so a wrong-theme frame is never silent evidence.
 */
async function applyReducedMotion(page: ShotDriverPage): Promise<void> {
  const emulate = page.emulateMedia;
  if (typeof emulate !== "function") return;
  try {
    await emulate.call(page, { reducedMotion: "reduce" });
  } catch {
    /* best-effort */
  }
}

async function applyShotTheme(
  page: ShotDriverPage,
  theme: string,
  route: string,
  miss?: (theme: string, route: string) => void,
): Promise<void> {
  const evaluatable = page as unknown as { evaluate?: PageEvaluate };
  const evaluate = evaluatable.evaluate;
  if (typeof evaluate !== "function") {
    miss?.(theme, route);
    return;
  }
  const script = `(() => {
    try { localStorage.setItem("repoos.theme", ${JSON.stringify(theme)}); } catch (e) {}
    document.documentElement.dataset.theme = ${JSON.stringify(theme)};
  })()`;
  try {
    await evaluate.call(page, script, "");
  } catch {
    miss?.(theme, route);
  }
}

export interface ShotCaptureMissHandlers {
  onHighlightMiss?: (selector: string, route: string) => void;
  onSelectorMiss?: (selector: string, route: string) => void;
  /** Step selector timeouts become warnings instead of aborting capture (#0743). */
  onStepMiss?: (message: string, route: string) => void;
  /**
   * #0866: a declared `state` fixture that did not render — the page never
   * applied it, or the fixture's container (drawer/card) is absent, so the PNG
   * is the wrong screen. Reported as a failed shot, not a silent pass.
   */
  onStateMiss?: (message: string, route: string) => void;
  /**
   * #0866: the target returned its HTML/404 shell for an app module, so the
   * route is not served by that target (the vitepress MIME failure). Reported
   * as "route not served by this target", never a passing screenshot.
   */
  onRouteNotServed?: (message: string, route: string) => void;
  /**
   * #0782: a declared `theme` could not be applied (the driver has no
   * `evaluate`, or the script threw), so the capture would show the WRONG
   * theme — recorded like a highlight miss instead of silently standing in
   * as light/dark evidence.
   */
  onThemeMiss?: (theme: string, route: string) => void;
  /**
   * #0755: after the steps and settle, the page still shows a loading state
   * (a visible `aria-busy` region, or "Loading changes…" text). A capture of a
   * loading page is not the declared evidence — the route matched but the
   * content never rendered — so the caller records this as a FAILED step, not a
   * passing capture. Best-effort: a driver without `evaluate` cannot probe, and
   * the capture proceeds.
   */
  onLoadingState?: (message: string, route: string) => void;
}

/**
 * Run one declared step against the page. Click/fill/waitFor use plain CSS
 * selectors or test ids. Without `onStepMiss`, a step timeout aborts capture;
 * with it, the miss is recorded and capture continues (#0743).
 */
async function runStep(
  page: ShotDriverPage,
  step: {
    click?: string;
    fill?: string;
    text?: string;
    waitFor?: string;
    hover?: string;
    waitMs?: number;
  },
  route: string,
  onStepMiss?: (message: string, route: string) => void,
): Promise<void> {
  const soft = async (label: string, run: () => Promise<unknown>): Promise<void> => {
    try {
      await run();
    } catch (err) {
      if (onStepMiss) {
        onStepMiss(`${label}: ${(err as Error).message.split("\n")[0]}`, route);
        return;
      }
      throw err;
    }
  };
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
  if (typeof step.hover === "string") {
    await soft(`hover ${step.hover}`, () =>
      page.locator(step.hover!).hover({ timeout: SHOT_SELECTOR_TIMEOUT_MS }),
    );
    return;
  }
  if (typeof step.waitMs === "number") await page.waitForTimeout(step.waitMs);
}

/** What a captured page reports about the fixture/container it rendered (#0866). */
export interface ShotPageProbe {
  /** Fixture id the app recorded applying, or null when none was applied. */
  appliedState: string | null;
  /** A drawer/modal is open. */
  hasDialog: boolean;
  /** A task card is on screen. */
  hasTaskCard: boolean;
}

const SHOT_PAGE_PROBE_SCRIPT = `(() => ({
  appliedState: document.documentElement.getAttribute(${JSON.stringify(SHOT_PREVIEW_APPLIED_ATTR)}),
  hasDialog: !!document.querySelector('[role="dialog"]'),
  hasTaskCard: !!document.querySelector('[data-task-id]'),
}))()`;

/** Read the fixture/container markers a preview page exposes, if it can be evaluated. */
export async function probeShotPage(page: ShotDriverPage): Promise<ShotPageProbe | null> {
  const evaluatable = page as unknown as { evaluate?: PageEvaluate };
  if (typeof evaluatable.evaluate !== "function") return null;
  try {
    const raw = (await evaluatable.evaluate.call(page, SHOT_PAGE_PROBE_SCRIPT, "")) as
      | Partial<ShotPageProbe>
      | undefined;
    if (!raw || typeof raw !== "object") return null;
    return {
      appliedState: typeof raw.appliedState === "string" ? raw.appliedState : null,
      hasDialog: raw.hasDialog === true,
      hasTaskCard: raw.hasTaskCard === true,
    };
  } catch {
    return null;
  }
}

/**
 * Why a declared `state` fixture produced the wrong screen (#0866), or
 * undefined when it rendered. The app records the fixture it applied; a target
 * that never ran the app (docs/landing) has no marker, and a fixture whose
 * container never opened (a board where a drawer was declared) has the marker
 * but not the drawer. Both are failed evidence, with the target named so the
 * engineer can see which preview was shot.
 */
export function shotStateProblem(
  entry: { state?: string; route: string; target?: string },
  probe: ShotPageProbe,
): string | undefined {
  if (!entry.state) return undefined;
  const target = entry.target ? `target "${entry.target}"` : "the captured target";
  if (probe.appliedState !== entry.state) {
    return (
      `state "${entry.state}" did not render on ${target} — the page at ${entry.route} ` +
      `did not apply the fixture (is this the app target?)`
    );
  }
  const container = shotFixtureContainer(entry.state);
  if (container === "dialog" && !probe.hasDialog) {
    return (
      `state "${entry.state}" did not render on ${target} — ${entry.route} has no open ` +
      `drawer/dialog (declare the route that opens it, e.g. /work?task=9999&tab=changes)`
    );
  }
  if (container === "task-card" && !probe.hasTaskCard) {
    return `state "${entry.state}" did not render on ${target} — ${entry.route} shows no task card`;
  }
  return undefined;
}

/**
 * Console errors that mean the target served its HTML/404 shell for a module
 * instead of the app the route belongs to (#0866): VitePress answers an app
 * asset with HTML, and the browser reports a MIME-type failure. The message
 * names the route and target so it reads as "route not served by this target"
 * rather than a mystery console error.
 */
const MODULE_MIME_ERROR_RE =
  /(is not a valid (?:JavaScript|module) MIME type|MIME type of ["']?text\/html|Expected a JavaScript module script|Failed to load module script)/i;

export function shotRouteNotServedProblem(
  entry: { route: string; target?: string },
  consoleErrors: string[],
): string | undefined {
  const hit = consoleErrors.find((message) => MODULE_MIME_ERROR_RE.test(message));
  if (!hit) return undefined;
  const target = entry.target ? `target "${entry.target}"` : "the captured target";
  return (
    `route ${entry.route} is not served by ${target} — the target returned its HTML shell ` +
    `for an app module (${hit.split("\n")[0]})`
  );
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
  entry: {
    route: string;
  } & Partial<
    Pick<
      CaptureEntry,
      | "selector"
      | "steps"
      | "highlight"
      | "highlights"
      | "theme"
      | "reducedMotion"
      | "state"
      | "target"
    >
  >,
  options: ShotCaptureOptions,
  misses: ShotCaptureMissHandlers = {},
): Promise<Buffer> {
  const {
    onHighlightMiss,
    onSelectorMiss,
    onStepMiss,
    onLoadingState,
    onThemeMiss,
    onStateMiss,
    onRouteNotServed,
  } = misses;
  // #0866: collect console errors from BEFORE navigation so a module MIME
  // failure (the target serving HTML for app JS) is seen at all.
  const consoleErrors: string[] = [];
  if (onRouteNotServed) {
    const listen = (
      page as unknown as {
        on?: (event: "console", handler: (msg: { type(): string; text(): string }) => void) => void;
      }
    ).on;
    if (typeof listen === "function") {
      listen.call(page, "console", (msg) => {
        try {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        } catch {
          /* best-effort */
        }
      });
    }
  }
  await page.goto(url, { waitUntil: "load", timeout: SHOT_NAV_TIMEOUT_MS });
  try {
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  } catch {
    /* a dev server with HMR may never go idle — the settle below still applies */
  }
  if (options.waitMs > 0) await page.waitForTimeout(options.waitMs);
  for (const step of entry.steps ?? []) await runStep(page, step, entry.route, onStepMiss);
  // #0866: did the declared fixture actually render, and did the target serve
  // the app module at all? Both are checked on the settled page, BEFORE the
  // screenshot, so a wrong target is reported as a failed shot, not a pass.
  if (onStateMiss || onRouteNotServed) {
    const probe = await probeShotPage(page);
    if (probe && onStateMiss) {
      const problem = shotStateProblem(entry, probe);
      if (problem) onStateMiss(problem, entry.route);
    }
    if (onRouteNotServed) {
      const problem = shotRouteNotServedProblem(entry, consoleErrors);
      if (problem) onRouteNotServed(problem, entry.route);
    }
  }
  // #0755: after the steps and settle the route may still be showing its loading
  // state (a placeholder-selector step timed out and the content never
  // rendered). Probe BEFORE the highlight/selector miss checks so a loading page
  // is recorded even when a declared selector happens to match the spinner.
  if (onLoadingState) {
    const loading = await detectLoadingState(page);
    if (loading) onLoadingState(`loading state detected: ${loading}`, entry.route);
  }
  // #0782: a declared light/dark capture pins the theme on the mounted page,
  // after steps (they are theme-agnostic) and before the frame is composed, so
  // the screenshot — and the assertion checks below — see the requested theme.
  if (entry.theme) await applyShotTheme(page, entry.theme, entry.route, onThemeMiss);
  if (entry.reducedMotion) await applyReducedMotion(page);
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
