#!/usr/bin/env bun
/**
 * Hub server picker and add-server QA sweep (#1242).
 *
 * Start the dev server first, then run the sweep:
 *   cd mobile && bunx vite --port 5188
 *   bun scripts/hub-picker-qa.ts
 *
 * Environment:
 *   QA_BASE_URL   origin of the dev server (default http://localhost:5188)
 *
 * Headless Chromium only, on the `many` fixture. Every request the page makes
 * goes through a route table: the fixture hosts answer with canned replies, and
 * any other host is aborted. The sweep records every host it sees and fails if
 * an unsafe address reached the network. Prints one line per check, writes no
 * files, and exits 1 if any check fails.
 */
import { chromium, type Page, type Route } from "@playwright/test";

const BASE = process.env.QA_BASE_URL ?? "http://localhost:5188";
const BASE_ORIGIN = new URL(BASE).origin;

// Phone portrait and landscape, tablet portrait and landscape, and the desktop
// width where the picker sits in its centred 560px column (#1271).
const VIEWPORTS = [
  { label: "phone 360x800", width: 360, height: 800 },
  { label: "phone 375x812", width: 375, height: 812 },
  { label: "phone 412x915", width: 412, height: 915 },
  { label: "tablet 768x1024", width: 768, height: 1024 },
  { label: "tablet 1024x768", width: 1024, height: 768 },
  { label: "desktop 1280x800", width: 1280, height: 800 },
];

const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

/** Canned replies for the only hosts the add form may contact. */
const FIXTURE_HOSTS: Record<string, (route: Route) => Promise<void>> = {
  "ok.example.test": (route) =>
    route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) }),
  "gone.example.test": (route) => route.fulfill({ status: 404, headers: JSON_HEADERS, body: "{}" }),
  "page.example.test": (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" },
      body: "<!doctype html><title>Sign in</title><p>Sign in</p>",
    }),
  "dead.example.test": (route) => route.abort("connectionrefused"),
  // Never answers; the app's own 10-second timeout has to end the request.
  "slow.example.test": async () => {},
};

interface AddCase {
  name: string;
  url: string;
  serverName?: string;
  /** Text the inline error must contain, or "saved" for a successful add. */
  expect: string;
  /** True when no request may reach any host (the URL is refused before the network). */
  noRequest: boolean;
}

const ADD_CASES: AddCase[] = [
  { name: "empty address", url: "", expect: "Enter a server URL.", noRequest: true },
  {
    name: "http address",
    url: "http://ok.example.test",
    expect: "uses http://, which Hub doesn't connect to",
    noRequest: true,
  },
  {
    name: "file scheme",
    url: "file:///etc/passwd",
    expect: "starts with file:, which Hub can't use",
    noRequest: true,
  },
  {
    name: "javascript scheme",
    url: "javascript:alert(1)",
    expect: "starts with javascript:, which Hub can't use",
    noRequest: true,
  },
  {
    name: "ftp scheme",
    url: "ftp://ok.example.test",
    expect: "starts with ftp:, which Hub can't use",
    noRequest: true,
  },
  {
    name: "address with a query string",
    url: "https://ok.example.test/?x=1",
    expect: "Remove everything after the ? or #",
    noRequest: true,
  },
  {
    name: "address with credentials",
    url: "https://user:pass@ok.example.test",
    expect: "Remove the username and password from the address",
    noRequest: true,
  },
  {
    name: "malformed host",
    url: "https://ok example",
    expect: "doesn't look like a web address",
    noRequest: true,
  },
  {
    name: "duplicate address",
    url: "https://dev.repoos.org",
    expect: 'already saved as "dev"',
    noRequest: true,
  },
  {
    name: "duplicate name, different case",
    url: "https://ok.example.test",
    serverName: "DEV",
    expect: 'A server named "dev" is already saved',
    noRequest: true,
  },
  {
    name: "HTTP 404 answer",
    url: "https://gone.example.test",
    expect: "answered with HTTP 404, so it isn't a RepoOS server",
    noRequest: false,
  },
  {
    name: "non-RepoOS page",
    url: "https://page.example.test",
    expect: "answered, but it isn't a RepoOS server",
    noRequest: false,
  },
  {
    name: "unreachable server",
    url: "https://dead.example.test",
    expect: "Can't reach that server. Check the address and your connection",
    noRequest: false,
  },
  {
    name: "slow server",
    url: "https://slow.example.test",
    expect: "didn't answer within 10 seconds",
    noRequest: false,
  },
  {
    name: "valid RepoOS server",
    url: "https://ok.example.test",
    expect: "saved",
    noRequest: false,
  },
];

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const record = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail });

/** Hosts the page asked for since the last reset, for the no-real-network check. */
let seenHosts: string[] = [];

async function routeNetwork(page: Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === BASE_ORIGIN) return route.continue();
    seenHosts.push(url.hostname);
    const handler = FIXTURE_HOSTS[url.hostname];
    if (!handler) return route.abort("blockedbyclient");
    return handler(route);
  });
}

/** Elements whose box sticks out past the viewport (SVG internals excluded). */
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

/** Text inside a box wider than its own content overflows that box. */
function overflowOf(page: Page, selector: string): Promise<{ count: number; worst: number }> {
  return page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)] as HTMLElement[];
    const worst = Math.max(0, ...els.map((el) => el.scrollWidth - el.clientWidth));
    return { count: els.length, worst };
  }, selector);
}

async function runAddCases(label: string) {
  const page = await newPage(label);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // The refused-network lines are the expected result of the dead and blocked hosts.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) {
      errors.push(`console: ${m.text()}`);
    }
  });
  await page.goto(`${BASE}/?fixture=many&platform=android`);
  await page.getByTestId("hub-add-server").click();
  await page.getByTestId("hub-add-server-form").waitFor();

  for (const c of ADD_CASES) {
    const tag = `${label} ${c.name}`;
    seenHosts = [];
    await page.locator('input[type="url"]').fill(c.url);
    await page.locator(".form-view input[type='text']").fill(c.serverName ?? "");
    // Typing an address clears the last error. Wait for that, so a stale message
    // from the previous case can't be read as this case's result.
    if (c.url) {
      const cleared = await page
        .locator(".form-error")
        .waitFor({ state: "detached", timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      record(`${tag}: previous error cleared`, cleared, cleared ? "cleared" : "still showing");
    }
    await page.getByTestId("hub-save-server").click();

    const outcome = await Promise.race([
      page
        .locator(".form-error")
        .waitFor({ state: "visible", timeout: 25_000 })
        .then(() => "error" as const),
      page
        .getByTestId("hub-add-server-form")
        .waitFor({ state: "detached", timeout: 25_000 })
        .then(() => "saved" as const),
    ]).catch(() => "timeout" as const);

    if (c.expect === "saved") {
      record(`${tag}: saved`, outcome === "saved", `outcome ${outcome}`);
      continue;
    }
    if (outcome !== "error") {
      record(`${tag}: shows an error`, false, `outcome ${outcome}`);
      continue;
    }
    const message = (await page.locator(".form-error").innerText()).trim();
    record(`${tag}: message`, message.includes(c.expect), message);
    if (c.noRequest) {
      record(
        `${tag}: no network request`,
        seenHosts.length === 0,
        `hosts ${seenHosts.join(", ") || "none"}`,
      );
    }
    const role = await page.locator(".form-error").getAttribute("role");
    record(`${tag}: announced`, role === "alert", `role=${role ?? "none"}`);
    const past = await pastViewport(page);
    record(`${tag}: in bounds`, past.length === 0, past.join(", ") || "all in bounds");
    const fit = await overflowOf(page, ".form-error");
    record(
      `${tag}: error text fits`,
      fit.count > 0 && fit.worst <= 1,
      `worst overflow ${fit.worst}px`,
    );
  }

  record(`${label}: no page or console errors`, errors.length === 0, errors.join("; ") || "clean");
  await page.context().close();
}

async function runSheetRename(label: string) {
  const page = await newPage(label);
  await page.goto(`${BASE}/?fixture=many&platform=android`);
  await page.getByRole("button", { name: "Edit celleris" }).click();
  await page.locator(".sheet-field input").fill("dev");
  await page.getByTestId("hub-sheet-save").click();
  const error = page.getByTestId("hub-sheet-error");
  await error.waitFor({ state: "visible" });
  const message = (await error.innerText()).trim();
  record(
    `${label} rename to a saved name: message`,
    message.includes('A server named "dev" is already saved'),
    message,
  );
  record(
    `${label} rename error: announced`,
    (await error.getAttribute("role")) === "alert",
    "role=alert",
  );
  const past = await pastViewport(page);
  record(`${label} rename error: in bounds`, past.length === 0, past.join(", ") || "all in bounds");
  await page.context().close();
}

async function newPage(label: string): Promise<Page> {
  const browser = await browserPromise;
  const [viewport] = VIEWPORTS.filter((v) => label.startsWith(v.label));
  const context = await browser.newContext({
    viewport: { width: viewport!.width, height: viewport!.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await routeNetwork(page);
  return page;
}

const browserPromise = chromium.launch({ headless: true });

for (const v of VIEWPORTS) {
  await runAddCases(v.label);
  await runSheetRename(v.label);
}

await (await browserPromise).close();

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name} — ${r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed > 0) process.exit(1);
