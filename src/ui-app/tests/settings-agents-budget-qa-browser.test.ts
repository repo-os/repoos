/**
 * #1263 — QA pass: Settings General, the Agents page and its Budget Controls
 * tab at 375 / 768 / 1280 px.
 *
 * Headless WebKit against the built app, served in-process with auth disabled
 * (the harness default). `/api/**` requests are answered by the fixture server,
 * so no real agent, budget or account is touched.
 *
 * Each page is walked at every width and checked for the same classes of
 * problem, so one fix covers every control of that kind:
 *   - no horizontal overflow, and no visible element sticking out of the
 *     viewport unless an ancestor scrolls it on purpose
 *   - every visible form control and button has an accessible name (its own
 *     label, aria-label, a wrapping <label>, or an image's alt text)
 *   - every control reached with the Tab key shows a visible focus change
 *   - no uncaught page exceptions
 *
 * Skips cleanly when Playwright/WebKit is not installed.
 */
import { rmSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { makeSmokeFixture } from "../../commands/ui-smoke.js";
import {
  isPlaywrightUnavailable,
  launchWebkit,
  startPreviewServer,
  teardownUiHarness,
  type PreviewServer,
  type SmokeBrowser,
  type SmokePage,
} from "../../commands/ui-harness.js";

let browser: SmokeBrowser | null = null;
let server: PreviewServer | null = null;
let fixtureRoot: string | null = null;
let unavailable = false;
const bootErrors: string[] = [];
try {
  fixtureRoot = makeSmokeFixture();
  server = await startPreviewServer(fixtureRoot);
  browser = await launchWebkit();
} catch (err) {
  const message = (err as Error).message ?? String(err);
  if (isPlaywrightUnavailable(message)) unavailable = true;
  else bootErrors.push(message);
}

const describeBrowser = browser && !unavailable ? describe : describe.skip;

afterAll(async () => {
  try {
    await teardownUiHarness({
      browser: browser ?? undefined,
      server: server ?? undefined,
      removeFixture: () => {
        if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
      },
    });
  } catch (err) {
    console.error((err as Error).message);
  }
  fixtureRoot = null;
});

const VIEWPORTS = [375, 768, 1280] as const;

/** The pages this pass covers, by the path a reviewer would open. */
const PAGES = [
  { name: "Settings → General", path: "/settings?tab=general" },
  { name: "Settings → Notifications", path: "/settings?tab=notifications" },
  { name: "Settings → Security", path: "/settings?tab=security" },
  { name: "Settings → Advanced", path: "/settings?tab=advanced" },
  { name: "Settings → Import/Export", path: "/settings?tab=import-export" },
  { name: "Agents → Agents", path: "/agents" },
  { name: "Agents → Build Your Team", path: "/agents?tab=team" },
  { name: "Agents → Scheduled Tasks", path: "/agents?tab=scheduled" },
  { name: "Agents → Reminders", path: "/agents?tab=reminders" },
  { name: "Agents → Detected Coding Agents", path: "/agents?tab=detected" },
  { name: "Agents → Model Playground", path: "/agents?tab=playground" },
  { name: "Agents → Model providers", path: "/agents?tab=providers" },
  { name: "Agents → Model routing", path: "/agents?tab=model-routing" },
  { name: "Agents → Budget Controls", path: "/agents?tab=budget-controls" },
] as const;

/** Static findings for the page as it stands; each string names one problem. */
function auditPage(): string[] {
  const issues: string[] = [];
  const vw = window.innerWidth;
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };
  const hiddenFromAt = (el: Element): boolean => el.closest("[aria-hidden='true']") !== null;
  const describe = (el: Element): string => {
    const cls =
      typeof el.className === "string" && el.className
        ? "." + el.className.trim().split(/\s+/)[0]
        : "";
    const id = el.id ? "#" + el.id : "";
    const row = el.closest("[id^='setting-']")?.id ?? "";
    const hint = ["type", "placeholder", "aria-label", "name"]
      .map((a) => (el.getAttribute(a) ? a + "=" + el.getAttribute(a) : ""))
      .filter(Boolean)
      .join(" ");
    const where = row || "(no setting row) " + hint;
    return el.tagName.toLowerCase() + id + cls + " in " + where;
  };
  const named = (el: Element): boolean => {
    const control = el as HTMLInputElement;
    if (el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")) return true;
    if (control.labels && control.labels.length > 0) return true;
    if ((el.textContent || "").trim()) return true;
    return [...el.querySelectorAll("img[alt], svg[aria-label]")].some(
      (img) => (img.getAttribute("alt") || img.getAttribute("aria-label") || "").trim() !== "",
    );
  };
  const clipsX = (el: Element): boolean => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
    }
    return false;
  };

  const docOverflow = document.documentElement.scrollWidth - vw;
  if (docOverflow > 1) issues.push("page scrolls sideways by " + docOverflow + "px");

  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || hiddenFromAt(el)) continue;
    if (el.getBoundingClientRect().right > vw + 1 && !clipsX(el)) {
      issues.push("element runs past the viewport: " + describe(el));
    }
  }

  const controls = [...document.querySelectorAll("input, select, textarea")].filter(
    (el) =>
      (el as HTMLInputElement).type !== "hidden" &&
      (el as HTMLElement).tabIndex >= 0 &&
      !hiddenFromAt(el) &&
      visible(el),
  );
  for (const el of controls) {
    if (!named(el)) issues.push("form control has no label: " + describe(el));
  }

  // The selected tab must be inside its strip, not scrolled out of view.
  for (const tab of document.querySelectorAll(
    ".tab-btn.active, [role=tab][aria-selected='true']",
  )) {
    if (!visible(tab)) continue;
    let strip = tab.parentElement;
    while (strip && strip !== document.body && getComputedStyle(strip).overflowX === "visible") {
      strip = strip.parentElement;
    }
    if (!strip || strip === document.body) continue;
    const t = tab.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    if (t.left < s.left - 1 || t.right > s.right + 1) {
      issues.push("selected tab is scrolled out of its strip: " + describe(tab));
    }
  }

  const buttons = [
    ...document.querySelectorAll(
      "button, [role=button], [role=switch], [role=combobox], [role=checkbox]",
    ),
  ].filter((el) => visible(el) && !hiddenFromAt(el));
  for (const el of buttons) {
    if (!named(el)) issues.push("control has no accessible name: " + describe(el));
  }
  return issues;
}

/**
 * Focus check for every visible control, in DOM order: focus it, compare its
 * look with its resting look, and report any control whose focus changes
 * nothing. Driven in-page rather than with the Tab key, because headless
 * WebKit does not reliably give a fresh page the key focus that Tab needs.
 */
function focusAudit(): { visited: number; missing: string[] } {
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };
  const look = (el: HTMLElement): string => {
    const s = getComputedStyle(el);
    return [
      s.outlineStyle,
      s.outlineWidth,
      s.outlineColor,
      s.boxShadow,
      s.borderColor,
      s.backgroundColor,
    ].join("|");
  };
  const stops = [
    ...document.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [role=switch], [role=combobox], [role=checkbox]",
    ),
  ].filter(
    (el) =>
      !(el as HTMLButtonElement).disabled &&
      el.tabIndex >= 0 &&
      !el.closest("[aria-hidden='true']") &&
      visible(el),
  );
  const missing: string[] = [];
  for (const el of stops) {
    (document.activeElement as HTMLElement | null)?.blur();
    const resting = look(el);
    el.focus({ preventScroll: true });
    const focused = look(el);
    el.blur();
    if (focused === resting) {
      missing.push(
        "no visible focus change: " + el.tagName.toLowerCase() + " " + el.outerHTML.slice(0, 140),
      );
    }
  }
  return { visited: stops.length, missing };
}

/** A fresh page at `width` that records uncaught page errors. */
async function openPage(width: number, pageErrors: string[]): Promise<SmokePage> {
  const page = await browser!.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (err: Error) => {
    pageErrors.push(err.message);
  });
  return page;
}

describeBrowser("Settings General, Agents and Budget Controls QA (#1263)", () => {
  it("has a usable headless browser and server", () => {
    expect(bootErrors).toEqual([]);
    expect(server).not.toBeNull();
    expect(browser).not.toBeNull();
  });

  for (const width of VIEWPORTS) {
    for (const target of PAGES) {
      it(`${target.name} at ${width}px: no overflow, named controls, visible focus`, async () => {
        const pageErrors: string[] = [];
        const page = await openPage(width, pageErrors);
        await page.goto(`${server!.url}${target.path}`, { waitUntil: "load", timeout: 15_000 });
        await page.waitForTimeout(400);

        const issues = await page.evaluate(auditPage);
        // Colour transitions would make the resting and focused looks read mid-fade.
        await page.evaluate(() => {
          const style = document.createElement("style");
          style.textContent = "*, *::before, *::after { transition: none !important; }";
          document.head.appendChild(style);
        });
        const focus = await page.evaluate(focusAudit);
        await page.close();
        // An audit that reached no control would pass vacuously.
        expect(focus.visited, `focusable controls reached at ${width}px`).toBeGreaterThan(0);
        expect([...issues, ...focus.missing], `${target.name} at ${width}px`).toEqual([]);
        expect(pageErrors, `${target.name} page errors at ${width}px`).toEqual([]);
      }, 60_000);
    }
  }
});
