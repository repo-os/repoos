#!/usr/bin/env bun
/**
 * Fixture QA sweep for the Android Hub UI at phone width (#1171).
 *
 * Start the dev server first, then run the sweep:
 *   cd mobile && bunx vite --port 5188
 *   bun scripts/fixture-qa.ts
 *
 * Environment:
 *   QA_BASE_URL     origin of the dev server (default http://localhost:5188)
 *   QA_STRIP_WRAP=1 remove every `overflow-wrap: anywhere` from the served
 *                   stylesheet, to see the wrapping checks fail
 *
 * Prints one line per check and exits 1 if any check fails. Writes no files.
 * Every long-text case rewrites the served fixture or injects the element with
 * the real class name, so the CSS under test is the CSS the app ships.
 */
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.QA_BASE_URL ?? "http://localhost:5188";
const STRIP_WRAP = process.env.QA_STRIP_WRAP === "1";
const VIEWPORTS = [360, 412].map((width) => ({ width, height: 812 }));
const FIXTURES = ["many", "one", "empty", "unreachable", "settings", "add", "discover"];
const LONG_PATH_URL =
  "https://celleris-long-hostname.internal-tailnet.example.ts.net:8443/repoos/very/long/path/segments/that/keep/going/and/going/and/going";
const UNBROKEN_URL =
  "https://abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz.example.ts.net";
const LONG_NAME = "celleris-nightly-build-with-an-extremely-long-unbroken-identifier";
const LONG_TOKEN = "x".repeat(120);

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const record = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail });

/** Rewrites one string in the served fixture module, or none when `pairs` is empty. */
async function serveFixture(page: Page, pairs: [string, string][]) {
  await page.route("**/src/fixture.ts*", async (route) => {
    const res = await route.fetch();
    let body = await res.text();
    for (const [from, to] of pairs) body = body.split(from).join(to);
    await route.fulfill({ response: res, body });
  });
}

async function serveStylesheet(page: Page) {
  if (!STRIP_WRAP) return;
  await page.route("**/src/style.css*", async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).split("overflow-wrap: anywhere;").join("");
    await route.fulfill({ response: res, body });
  });
}

/** Elements with a box that sticks out past the 375px viewport (SVG internals excluded). */
function pastViewport(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((el) => {
        if (el.closest("svg")) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`),
  );
}

/** Every element matching `selector` must hold its content inside its own box. */
function everyFits(page: Page, selector: string): Promise<{ count: number; worst: number }> {
  return page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)] as HTMLElement[];
    const worst = Math.max(0, ...els.map((el) => el.scrollWidth - el.clientWidth));
    return { count: els.length, worst };
  }, selector);
}

async function checkFits(page: Page, name: string, selector: string) {
  const { count, worst } = await everyFits(page, selector);
  record(name, count > 0 && worst <= 1, `${count} element(s), worst overflow ${worst}px`);
}

async function checkNoPastViewport(page: Page, name: string) {
  const bad = await pastViewport(page);
  record(name, bad.length === 0, bad.length ? `past viewport: ${bad.join(", ")}` : "all in bounds");
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORTS[0], deviceScaleFactor: 2 });
  await serveStylesheet(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });

  // The requested phone widths: nothing past the viewport, no console or page errors.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const fx of FIXTURES) {
      errors.length = 0;
      await page.goto(`${BASE}/?fixture=${fx}&platform=android`);
      await page.waitForTimeout(700);
      await checkNoPastViewport(page, `${viewport.width}px fixture ${fx}: in bounds`);
      record(
        `${viewport.width}px fixture ${fx}: no console errors`,
        errors.length === 0,
        errors.join("; ") || "clean",
      );
    }

    // Enabling the lock reveals the scope selector and the browser's unsupported-device note.
    await page.goto(`${BASE}/?fixture=settings&platform=android`);
    const lockToggle = page.getByTestId("hub-lock-toggle");
    if ((await lockToggle.getAttribute("aria-checked")) !== "true") await lockToggle.click();
    await page.getByTestId("hub-lock-scope").waitFor();
    await checkNoPastViewport(page, `${viewport.width}px settings with lock enabled: in bounds`);
    const lockDetails = await page.evaluate(() => ({
      scope: Boolean(document.querySelector('[data-testid="hub-lock-scope"]')),
    }));
    record(
      `${viewport.width}px settings lock controls visible`,
      lockDetails.scope,
      `scope selector ${lockDetails.scope ? "present" : "missing"}`,
    );
  }

  await page.setViewportSize(VIEWPORTS[0]);

  // Long server name and URL in the picker: the row shrinks and ⋮ stays on the card.
  await serveFixture(page, [
    ['name: "celleris"', `name: "${LONG_NAME}"`],
    ['url: "https://celleris.repoos.org"', `url: "${LONG_PATH_URL}"`],
  ]);
  await page.goto(`${BASE}/?fixture=many&platform=android`);
  await page.waitForTimeout(700);
  await checkNoPastViewport(page, "picker, long name and URL: in bounds");

  // Edit sheet with a long saved URL, and one with no break points, at both widths.
  await serveFixture(page, [['url: "https://dev.repoos.org"', `url: "${LONG_PATH_URL}"`]]);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${BASE}/?fixture=many&platform=android`);
    await page.waitForTimeout(700);
    await page.getByTestId("hub-server-more").first().click();
    await page.waitForTimeout(500);
    await checkFits(page, `${viewport.width}px edit sheet URL (path) wraps`, ".sheet-panel .hint");
    await checkNoPastViewport(page, `${viewport.width}px edit sheet, long URL: in bounds`);
  }

  await serveFixture(page, [['url: "https://dev.repoos.org"', `url: "${UNBROKEN_URL}"`]]);
  await page.goto(`${BASE}/?fixture=many&platform=android`);
  await page.waitForTimeout(700);
  await page.getByTestId("hub-server-more").first().click();
  await page.waitForTimeout(500);
  await checkFits(page, "edit sheet URL (unbroken) wraps", ".sheet-panel .hint");

  // Add form: the HTTPS error appears under the field and stays in bounds.
  await serveFixture(page, []);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${BASE}/?fixture=add&platform=android`);
    await page.waitForTimeout(700);
    await page.getByLabel("Server URL (HTTPS)").fill("http://insecure.example.test");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(1000);
    await checkFits(page, `${viewport.width}px add form error: fits`, ".form-error");
    await checkNoPastViewport(page, `${viewport.width}px add form error: in bounds`);
  }

  // Discovery: failure reason with an unbroken token, plus message and warning text.
  await serveFixture(page, [['reason: "timed out"', `reason: "${LONG_TOKEN}"`]]);
  await page.goto(`${BASE}/?fixture=discover&platform=android`);
  await page.waitForTimeout(700);
  await page.locator("details summary").first().click();
  await page.waitForTimeout(300);
  await checkFits(page, "discovery failure reason wraps", ".discovery-failure-row .reachability");
  await page.evaluate((tok) => {
    const msg = document.createElement("p");
    msg.className = "discovery-message";
    msg.textContent = tok;
    const warn = document.createElement("p");
    warn.className = "warn";
    warn.textContent = tok;
    document.querySelector(".form-view")?.prepend(msg, warn);
  }, LONG_TOKEN);
  await checkFits(page, "discovery message wraps", ".discovery-message");
  await checkFits(page, "discovery warning wraps", ".warn");

  // Dev-update dialog: injected with the shell's real markup and classes, since the
  // manifest is remote. Notes come from latest.json, so one token must wrap.
  await page.evaluate((tok) => {
    const backdrop = document.createElement("div");
    backdrop.className = "update-backdrop";
    backdrop.innerHTML = `<section class="update-dialog" role="dialog"><h2>A new dev build is available</h2><ul><li></li></ul></section>`;
    backdrop.querySelector("li")!.textContent = tok;
    document.querySelector(".shell")?.append(backdrop);
  }, LONG_TOKEN);
  await checkFits(page, "dev-update dialog note wraps", ".update-dialog li");
  await checkNoPastViewport(page, "dev-update dialog: in bounds");

  await browser.close();

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name} — ${r.detail}`);
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed > 0) process.exit(1);
}

await run();
