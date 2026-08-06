#!/usr/bin/env node
/**
 * Regenerate `screenshots/` against a controlled fixture repo.
 *
 *   bun run screenshots        (builds first, then runs this script)
 *
 * Serves the BUILT app (dist/ui) from `startServer` on an ephemeral port,
 * pointed at a throwaway COPY of `scripts/screenshot-fixtures`. Your real
 * repoos.toml and work/ are never read or written. Writes one PNG per feature
 * plus `screenshots/.ui-hash`, a sha256 of the UI source + fixtures + PNGs,
 * so `repoos check` can detect drift and tell you to re-run this.
 *
 * Exits non-zero if any capture produced console/page errors.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startServer } from "../dist/server/server.js";
import { HASH_FILE, SCREENSHOT_NAMES, screenshotsHash } from "../dist/commands/screenshots.js";

const ROOT = process.cwd();
const SHOTS = resolve(ROOT, "screenshots");
const FIXTURES = resolve(ROOT, "scripts/screenshot-fixtures");
const VIEWPORT = { width: 1440, height: 900 };

if (!existsSync(FIXTURES)) {
  console.error(`Missing fixture repo: ${FIXTURES}`);
  process.exit(1);
}

// Serve a throwaway copy of the fixtures so captures are deterministic and
// independent of the developer's own config and work/ state.
const tmp = mkdtempSync(join(tmpdir(), "repoos-shots-"));
cpSync(FIXTURES, tmp, { recursive: true });

let server;
try {
  server = await startServer({ root: tmp, host: "127.0.0.1", port: 0 });
} catch (e) {
  console.error("Failed to start server:", e);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

let playwright;
try {
  playwright = await import("@playwright/test");
} catch {
  console.error("Cannot find module @playwright/test (not installed).");
  console.error("Install: bun add -d @playwright/test && npx playwright install webkit");
  server.close();
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const errors = [];
const done = [];

async function capture(newPage, name, url, ready, act) {
  const page = await newPage;
  const pageErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") pageErrors.push(`[console] ${m.text()}`);
  });
  page.on("pageerror", (e) => pageErrors.push(`[pageerror] ${e.message}`));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.waitForSelector(ready, { timeout: 15_000 });
  await page.waitForTimeout(900);
  if (act) await act(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, name) });

  if (pageErrors.length) {
    errors.push(`${name}: ${pageErrors.join(" | ")}`);
  } else {
    done.push(name);
  }
  await page.close();
}

try {
  const browser = await playwright.webkit.launch({ headless: true });
  try {
    // ── dashboard ──
    await capture(
      browser.newPage({ viewport: VIEWPORT }),
      "dashboard.png",
      `${server.url}/`,
      ".stat-grid",
    );
    // ── work queue board ──
    await capture(
      browser.newPage({ viewport: VIEWPORT }),
      "work-board.png",
      `${server.url}/work`,
      ".board",
    );
    // ── open task drawer (click first card on the board) ──
    await capture(
      browser.newPage({ viewport: VIEWPORT }),
      "task-drawer.png",
      `${server.url}/work`,
      ".board",
      async (page) => {
        await page.click(".task-card");
        await page.waitForSelector(".drawer-resize", { timeout: 10_000 });
      },
    );
    // ── repo / docs context ──
    await capture(
      browser.newPage({ viewport: VIEWPORT }),
      "docs-context.png",
      `${server.url}/repo`,
      ".repo-grid",
    );
    // ── settings ──
    await capture(
      browser.newPage({ viewport: VIEWPORT }),
      "settings.png",
      `${server.url}/settings`,
      ".setting-group",
    );
  } finally {
    await browser.close();
  }

  // Write the freshness marker AFTER the PNGs, so it covers their contents.
  writeFileSync(join(ROOT, HASH_FILE), screenshotsHash(ROOT) ?? "", "utf8");
} finally {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}

if (errors.length) {
  console.error("\nCapture finished with errors:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`\nSaved ${done.length} screenshots to screenshots/`);
for (const n of done) console.log(`  ✓ ${n}`);
