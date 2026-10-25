#!/usr/bin/env bun
/**
 * Repeatable page-load measurement for #0950 — "fast, consistent page loads".
 *
 *   bun scripts/bench-page-loads.mjs [--runs 5] [--root <repo>]
 *
 * Two independent halves, both repeatable and both printing medians:
 *
 *   1. ENDPOINT — the server-side work behind `GET /api/deployments`, timed
 *      in-process (no HTTP listener, no server boot) by calling the same
 *      function the route calls. This is the one endpoint the recorded
 *      baseline showed in the seconds; every other page endpoint measured at
 *      ~0–5 ms there.
 *
 *   2. PAGES — per-page time-to-content in headless WebKit against the BUILT
 *      app, served by the same ephemeral harness `repoos check`'s UI gate uses
 *      (a throwaway fixture root, so it never touches the live board). Each
 *      page's endpoint latency is replayed by delaying the matching API
 *      response at the browser (Playwright route interception), so a page's
 *      blocking window reflects the real server cost.
 *
 *        cold    = `page.goto()` — a fresh document, i.e. no in-memory page
 *                  cache: this is what every visit cost before #0950, because
 *                  each view fetched from empty component-local state on
 *                  mount.
 *        revisit = clicking back to the page in the same session — what #0950
 *                  changed: cached data renders at once, refresh in background.
 *
 * Runtime: Bun (this repo's default). It reads only from `dist/`, so build
 * first: `bun run build`.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const RUNS = Number(arg("runs", "5"));
const REPO_ROOT = arg("root", process.cwd());

/** Recorded medians (ms) used to replay each endpoint's server cost. */
const LATENCY = {
  "/api/deployments": 2687,
  "/api/project-environments": 1,
  "/api/dev/targets": 600,
  "/api/check-plan": 350,
  "/api/check-runs": 350,
  "/api/release": 350,
  "/api/release/distribution": 350,
  "/api/agents/detect": 200,
  default: 1,
};

const PAGES = [
  { id: "Releases", path: "/releases", root: ".releases-page" },
  { id: "Checks", path: "/checks", root: ".ck-page" },
  { id: "Deployments", path: "/deployments", root: ".dep-page" },
  { id: "Dev", path: "/dev", root: ".dev-page" },
  { id: "Secrets", path: "/secrets", root: ".secrets-page" },
  { id: "Agents", path: "/agents", root: ".agents-page" },
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

// ── 2. pages: cold vs revisit, latencies replayed ───────────────────────────

const CONTENT_READY = (sel) => {
  const root = document.querySelector(sel);
  if (!root) return false;
  if (root.querySelector(".page-skeleton")) return false;
  const body =
    root.querySelector(".page-scroll-body") || root.querySelector(".agents-tab-content") || root;
  return !!body && body.children.length > 0;
};

async function readyOrReport(page, target, phase) {
  try {
    await page.waitForFunction(CONTENT_READY, target.root, { timeout: 30_000 });
  } catch (err) {
    const state = await page
      .evaluate(
        (sel) => {
          const root = document.querySelector(sel);
          return {
            root: !!root,
            skeleton: !!document.querySelector(".page-skeleton"),
            kids: root ? root.children.length : -1,
            text: root ? root.textContent.slice(0, 200) : null,
          };
        },
        target.root,
      )
      .catch((e) => ({ error: String(e) }));
    throw new Error(
      `${target.id} ${phase}: content never became ready (${JSON.stringify(state)}) — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

async function applyLatency(page) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const path = new URL(url).pathname;
    const delay = Object.entries(LATENCY).find(([key]) => key !== "default" && path.startsWith(key));
    await new Promise((r) => setTimeout(r, delay ? delay[1] : LATENCY.default));
    await route.continue();
  });
}

async function sawSkeleton(page, root, timeout) {
  try {
    await page.waitForFunction(
      (sel) => !!document.querySelector(`${sel} .page-skeleton`),
      root,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

async function benchPages() {
  let harness;
  let fixture;
  let playwright;
  try {
    harness = await import("../dist/commands/ui-harness.js");
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
  const server = await harness.startPreviewServer(root);
  const browser = await playwright.webkit.launch({ headless: true });
  const results = PAGES.map((page) => ({
    ...page,
    cold: [],
    revisit: [],
    coldSkeleton: 0,
    revisitSkeleton: 0,
  }));

  try {
    for (let run = 0; run < RUNS; run++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await applyLatency(page);

      for (const target of results) {
        // Cold: a fresh document, so no page cache exists yet.
        const t0 = Date.now();
        await page.goto(`${server.url}${target.path}`, { waitUntil: "commit", timeout: 30_000 });
        if (await sawSkeleton(page, target.root, 10_000)) target.coldSkeleton += 1;
        await readyOrReport(page, target, "cold");
        target.cold.push(Date.now() - t0);

        // Warm: leave through the sidebar and come straight back with another
        // in-app navigation, so the JS module cache (the page cache) survives.
        await page.click('.nav-item[href="/"]', { timeout: 10_000 });
        await page.waitForFunction(() => !!document.querySelector(".page-title"), null, {
          timeout: 15_000,
        });
        const t1 = Date.now();
        const back = page.click(`.nav-item[href="${target.path}"]`, { timeout: 10_000 });
        if (await sawSkeleton(page, target.root, 3_000)) target.revisitSkeleton += 1;
        await back;
        await readyOrReport(page, target, "revisit");
        target.revisit.push(Date.now() - t1);
      }
      await context.close();
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
  console.log(`- \`GET /api/deployments\` → getDeploymentsStatus(): median ${fmt(endpoint.median)} (min ${fmt(endpoint.min)}, max ${fmt(endpoint.max)}, ${RUNS} runs: ${endpoint.runs.map(fmt).join(", ")})`);
}

let pages;
try {
  pages = await benchPages();
} catch (err) {
  console.log(`pages: failed — ${err instanceof Error ? err.stack || err.message : String(err)}`);
}
console.log("");
console.log("## Pages (headless WebKit, recorded endpoint latencies replayed)");
console.log("");
if (pages) {
  console.log("| Page | Cold (before) | Revisit (after) | Skeleton on cold | Skeleton on revisit |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const p of pages) {
    const cold = p.cold.length ? median(p.cold) : NaN;
    const warm = p.revisit.length ? median(p.revisit) : NaN;
    console.log(
      `| ${p.id} | ${fmt(cold)} | ${fmt(warm)} | ${p.coldSkeleton}/${RUNS} | ${p.revisitSkeleton}/${RUNS} |`,
    );
  }
  console.log("");
  console.log("Cold timings (ms per run):");
  for (const p of pages) console.log(`- ${p.id}: ${p.cold.map(fmt).join(", ")}`);
  console.log("Revisit timings (ms per run):");
  for (const p of pages) console.log(`- ${p.id}: ${p.revisit.map(fmt).join(", ")}`);
}
