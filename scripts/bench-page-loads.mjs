#!/usr/bin/env bun
/**
 * Measure actual fixture HTTP latency and DOM time-to-content, cold and revisit.
 * Build this UI first. To compare a separately built baseline on the same backend:
 * bun scripts/bench-page-loads.mjs --runs=5 --baseline-ui=<directory>
 * Optional --delay-ms=500 models a slow connection; those results are synthetic.
 * No production server is started: this uses the check gate's isolated fixture.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const RUNS = Number(arg("runs", "5"));
if (!Number.isInteger(RUNS) || RUNS < 1) throw new Error("runs must be a positive integer");
const REPO_ROOT = arg("root", process.cwd());

const BASELINE_UI = arg("baseline-ui", "");
const DELAY_MS = Number(arg("delay-ms", "0"));
const PAGES = [
  { id: "Releases", path: "/releases", root: ".releases-page", content: ".rel-card" },
  { id: "Checks", path: "/checks", root: ".ck-page", content: ".cr-empty, .cr-table" },
  {
    id: "Deployments",
    path: "/deployments",
    root: ".dep-page",
    content: ".dep-empty, .dep-matrix",
  },
  { id: "Dev", path: "/dev", root: ".dev-page", content: ".dev-card, .dev-empty" },
  {
    id: "Secrets",
    path: "/secrets",
    root: ".secrets-page",
    content: ".secrets-empty, .secrets-ledger",
  },
  {
    id: "Agents",
    path: "/agents",
    root: ".agents-page",
    content: ".agents-tab-content .agent-tab-panel",
  },
];
const ENDPOINTS = [
  "/api/release",
  "/api/release/distribution",
  "/api/check-plan",
  "/api/check-runs?limit=300",
  "/api/deployments",
  "/api/dev/targets",
  "/api/project-environments",
  "/api/agents/detect",
];

function median(list) {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const fmt = (n) => `${n} ms`;

// ── 1. endpoint: the server-side work behind GET /api/deployments ───────────

async function benchEndpoint() {
  let getDeploymentsStatus;
  let loadConfig;
  try {
    ({ loadConfig } = await import("../dist/core/config.js"));
    ({ getDeploymentsStatus } = await import("../dist/server/deployments.js"));
  } catch (err) {
    console.log(`endpoint: skipped (${err instanceof Error ? err.message : String(err)})`);
    console.log("         run `bun run build` first — this script reads dist/.");
    return null;
  }
  const config = loadConfig(REPO_ROOT);
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    try {
      await getDeploymentsStatus(config);
      times.push(Date.now() - t0);
    } catch (err) {
      console.log(`endpoint: failed (${err instanceof Error ? err.message : String(err)})`);
      return null;
    }
  }
  return {
    median: median(times),
    min: Math.min(...times),
    max: Math.max(...times),
    runs: times,
  };
}

// Observe the first rendered frame with the shell and with usable content.
// Sampling and timing run together: an absent skeleton never adds a timeout.
async function measureNavigation(page, target, navigate) {
  await page.evaluate(() => {
    window.__pageBench = { start: performance.now(), shell: null, content: null, skeleton: false };
  });
  // For document navigation the sampler is installed before application JS.
  const start = performance.now();
  await navigate();
  await page.waitForFunction(
    ({ root, content }) => {
      const sample = (window.__pageBench ??= {
        start: 0,
        shell: null,
        content: null,
        skeleton: false,
      });
      const el = document.querySelector(root);
      if (!el) return false;
      const now = performance.now() - sample.start;
      if (el.querySelector("h1, .page-title, .agents-page-title") && sample.shell === null)
        sample.shell = now;
      const skeleton = [...el.querySelectorAll(".page-skeleton")].some(
        (node) => node.getClientRects().length,
      );
      sample.skeleton ||= skeleton;
      if (
        !skeleton &&
        [...el.querySelectorAll(content)].some((node) => node.getClientRects().length)
      ) {
        sample.content = now;
        return true;
      }
      return false;
    },
    target,
    { polling: "raf", timeout: 30_000 },
  );
  const result = await page.evaluate(() => window.__pageBench);
  return { ...result, wall: Math.round(performance.now() - start) };
}

async function benchPages() {
  let startServer;
  let fixture;
  let playwright;
  try {
    ({ startServer } = await import("../dist/server/server.js"));
    fixture = await import("../dist/commands/ui-smoke.js");
    playwright = require("@playwright/test");
  } catch (err) {
    console.log(`pages: skipped (${err instanceof Error ? err.message : String(err)})`);
    return null;
  }

  // `makeSmokeFixture()`'s bare repoos.toml leaves Releases, Deployments and
  // Dev out of the sidebar (each is opt-in on config), and this bench needs to
  // reach them by an in-app navigation, so the fixture declares all three.
  const root = fixture.makeSmokeFixture();
  writeFileSync(
    join(root, "repoos.toml"),
    [
      'theme = "dark"',
      'uiTheme = "classic"',
      "",
      "[auth]",
      "enabled = true",
      'bootstrapAdmin = "bench@example.com"',
      "",
      "[auth.emailProvider]",
      'type = "resend"',
      'fromAddress = "bench@example.com"',
      "",
      "[release]",
      "enabled = true",
      'provider = "git-tag"',
      "",
      "[[deployments]]",
      'name = "bench"',
      'branch = "main"',
      "",
      "[[dev.targets]]",
      'name = "bench-dev"',
      'kind = "process"',
      'command = "true"',
      "",
    ].join("\n"),
  );
  process.env.REPOOS_RESEND_API_KEY = "fake-benchmark-only";
  process.env.REPOOS_PREVIEW_CHILD = "1";
  const server = await startServer({ root, host: "127.0.0.1", port: 0, previewOverrides: true });
  const { getAuthStore } = await import("../dist/core/auth-store.js");
  const { SESSION_COOKIE_NAME } = await import("../dist/core/auth.js");
  const store = getAuthStore(root);
  store.upsertUser("bench@example.com", "admin", null);
  const session = store.createSession("bench@example.com", "admin", 3600);
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${session}` };
  const browser = await playwright.webkit.launch({ headless: true });
  const results = [];
  try {
    for (const [version, ui] of [
      ["before", BASELINE_UI],
      ["after", ""],
    ]) {
      if (version === "before" && !ui) continue;
      if (ui && !existsSync(join(ui, "index.html")))
        throw new Error(`Missing baseline build: ${ui}`);
      const endpointTimes = {};
      for (const path of ENDPOINTS) {
        const times = [];
        for (let i = 0; i < RUNS; i++) {
          const start = performance.now();
          const response = await fetch(`${server.url}${path}`, { headers });
          await response.arrayBuffer();
          if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
          times.push(Math.round(performance.now() - start));
        }
        endpointTimes[path] = { median: median(times), runs: times };
      }
      console.log(`${version} fixture HTTP endpoints: ${JSON.stringify(endpointTimes)}`);
      for (const target of PAGES) {
        const samples = [];
        for (let run = 0; run < RUNS; run++) {
          const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            serviceWorkers: "block",
            extraHTTPHeaders: headers,
          });
          await context.addInitScript(() => {
            window.__pageBench = { start: 0, shell: null, content: null, skeleton: false };
          });
          if (ui) {
            // Use only baseline UI files; APIs still reach the identical backend.
            await context.route("**/*", async (route) => {
              const path = new URL(route.request().url()).pathname;
              if (path.startsWith("/api/")) return route.continue();
              const file = resolve(ui, path.startsWith("/assets/") ? path.slice(1) : "index.html");
              if (!existsSync(file)) return route.continue();
              await route.fulfill({ path: file });
            });
          }
          const page = await context.newPage();
          if (DELAY_MS)
            await page.route("**/api/**", async (route) => {
              await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
              await route.fallback();
            });
          const cold = await measureNavigation(page, target, () =>
            page.goto(`${server.url}${target.path}`, { waitUntil: "commit" }),
          );
          await page.locator('.nav-item[href="/"]').click();
          await page.waitForFunction(
            () =>
              !document.querySelector(
                ".releases-page, .ck-page, .dep-page, .dev-page, .secrets-page, .agents-page",
              ),
          );
          const revisit = await measureNavigation(page, target, () =>
            page.locator(`.nav-item[href="${target.path}"]`).click({ noWaitAfter: true }),
          );
          samples.push({ cold, revisit });
          await context.close();
        }
        const result = {
          version,
          page: target.id,
          cold: median(samples.map((s) => s.cold.content)),
          revisit: median(samples.map((s) => s.revisit.content)),
          shellCold: median(samples.map((s) => s.cold.shell)),
          shellRevisit: median(samples.map((s) => s.revisit.shell)),
          coldSkeleton: samples.filter((s) => s.cold.skeleton).length,
          revisitSkeleton: samples.filter((s) => s.revisit.skeleton).length,
          samples,
        };
        results.push(result);
        console.log(JSON.stringify(result));
      }
    }
    const captureDir = arg("capture-dir", "");
    if (captureDir) {
      mkdirSync(captureDir, { recursive: true });
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        extraHTTPHeaders: headers,
      });
      for (const [path, state, selector] of [
        ["deployments", "deployments:loading", ".page-skeleton"],
        ["deployments", "deployments:environmentBinding", ".dep-matrix"],
        ["dev", "dev:loading", ".page-skeleton"],
        ["dev", "dev:running", ".dev-card"],
      ]) {
        await page.goto(`${server.url}/${path}?shotState=${encodeURIComponent(state)}`);
        await page.locator(selector).first().waitFor();
        await page.screenshot({ path: join(captureDir, `${state.replace(":", "-")}.png`) });
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return results;
}

// ── report ──────────────────────────────────────────────────────────────────

const endpoint = await benchEndpoint();
console.log("");
console.log("## Endpoint (server-side work, in-process, no HTTP server)");
console.log("");
if (endpoint) {
  console.log(`- root: \`${REPO_ROOT}\``);
  console.log(
    `- \`GET /api/deployments\` → getDeploymentsStatus(): median ${fmt(endpoint.median)} (min ${fmt(endpoint.min)}, max ${fmt(endpoint.max)}, ${RUNS} runs: ${endpoint.runs.map(fmt).join(", ")})`,
  );
}

let pages;
try {
  pages = await benchPages();
} catch (err) {
  console.log(`pages: failed — ${err instanceof Error ? err.stack || err.message : String(err)}`);
  process.exitCode = 1;
}
console.log("");
console.log(`## Pages: actual fixture backend, added delay ${DELAY_MS} ms`);
if (pages) {
  console.log(
    "| Version | Page | Cold content | Revisit content | Cold shell | Revisit shell | Cold/revisit skeleton | ",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const p of pages)
    console.log(
      `| ${p.version} | ${p.page} | ${fmt(p.cold)} | ${fmt(p.revisit)} | ${fmt(p.shellCold)} | ${fmt(p.shellRevisit)} | ${p.coldSkeleton}/${p.revisitSkeleton} of ${RUNS} |`,
    );
}
