/**
 * `ros check` — the definition-of-done gate.
 *
 * Runs, in sequence: build staleness check, full build (tsc + asset copy),
 * test suite (if present), and a headless browser smoke test that verifies
 * the UI mounts and has zero console errors.
 *
 * Exits non-zero on any failure. Designed for CI gates and agent pre-review.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { c } from "../cli/colors.js";
import { checkBuild, type BuildCheckResult } from "../core/build.js";

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

function pass(name: string, detail?: string): CheckResult {
  return { name, ok: true, detail };
}
function fail(name: string, detail: string): CheckResult {
  return { name, ok: false, detail };
}

function heading(label: string): void {
  console.log(c.bold(c.cyan(`\n  ◆ ${label}`)));
}

export async function cmdCheck(): Promise<void> {
  let exitCode = 0;
  const results: CheckResult[] = [];

  // ── 1. Build staleness ──────────────────────────────────────────────
  heading("Build staleness check");
  const stale: BuildCheckResult = checkBuild();
  if (stale.stale) {
    console.log(c.yellow(`  ⚠ ${stale.message}`));
    results.push(fail("staleness", stale.message ?? "build is stale"));
    exitCode = 1;
  } else if (stale.code === "fresh") {
    console.log(c.green("  ✔ Build is fresh"));
    results.push(pass("staleness"));
  } else {
    console.log(c.dim(`  · ${stale.message ?? stale.code}`));
    results.push(pass("staleness", stale.message ?? stale.code));
  }

  // ── 2. Full build ───────────────────────────────────────────────────
  heading("Full build");
  try {
    execSync("bun run build", { stdio: "inherit", timeout: 120_000 });
    console.log(c.green("  ✔ Build succeeded"));
    results.push(pass("build"));
  } catch (e) {
    const msg = (e as Error).message;
    console.log(c.red("  ✗ Build failed"));
    results.push(fail("build", msg));
    exitCode = 1;
  }

  // ── 3. Tests (if any) ───────────────────────────────────────────────
  heading("Tests");
  const pkg = JSON.parse(existsSync("package.json") ? readFileSync("package.json", "utf8") : "{}");
  const hasTestScript = Boolean(pkg.scripts && pkg.scripts.test);
  const hasTestFiles = existsSync("test") || existsSync("__tests__") || existsSync("tests");
  if (hasTestScript || hasTestFiles) {
    const cmd = hasTestScript ? "bun run test" : "bun test";
    try {
      execSync(cmd, { stdio: "inherit", timeout: 120_000 });
      console.log(c.green("  ✔ Tests passed"));
      results.push(pass("tests"));
    } catch (e) {
      console.log(c.red("  ✗ Tests failed"));
      results.push(fail("tests", (e as Error).message));
      exitCode = 1;
    }
  } else {
    console.log(c.dim("  · No test suite found — skipping"));
    results.push(pass("tests", "skipped — no test suite"));
  }

  // ── 4. UI smoke test ────────────────────────────────────────────────
  heading("UI smoke test");
  try {
    await runUISmokeTest();
    results.push(pass("ui-smoke"));
    console.log(c.green("  ✔ UI smoke test passed"));
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (msg.includes("Cannot find module") || msg.includes("not installed")) {
      console.log(c.dim("  · Playwright not available — UI smoke test skipped"));
      console.log(c.dim("    Install: bun add -d @playwright/test && npx playwright install webkit"));
      results.push(pass("ui-smoke", "skipped — playwright not available"));
    } else {
      console.log(c.red("  ✗ UI smoke test failed: " + msg.split("\n")[0]));
      results.push(fail("ui-smoke", msg));
      exitCode = 1;
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(c.bold(c.cyan("\n  ── Results ──")));
  for (const r of results) {
    const icon = r.ok ? c.green("✔") : c.red("✗");
    const detail = r.detail ? c.dim(`  — ${r.detail}`) : "";
    console.log(`  ${icon} ${r.name}${detail}`);
  }
  if (failed.length === 0) {
    console.log(c.bold(c.green("\n  All checks passed.\n")));
  } else {
    console.log(c.bold(c.red(`\n  ${failed.length} check(s) failed.\n`)));
  }
  process.exit(exitCode);
}

/**
 * Start the dev server, run Playwright WebKit smoke tests, then stop.
 * Exports failures as thrown errors.
 */
async function runUISmokeTest(): Promise<void> {
  let server: { close: () => void; url: string };

  // Dynamic import — playwright may not be installed.
  let playwright: { webkit: typeof import("@playwright/test")["webkit"] };
  try {
    playwright = await import("@playwright/test");
  } catch {
    throw new Error("Cannot find module @playwright/test (not installed)");
  }
  const webkit = playwright.webkit;

  // Start the server on an ephemeral port so the check works even when a
  // `ros serve` instance is already running on the default port.
  const { startServer } = await import("../server/server.js");
  try {
    server = await startServer({ host: "127.0.0.1", port: 0 }) as unknown as { close: () => void; url: string };
  } catch (e) {
    throw new Error("Failed to start server: " + (e as Error).message);
  }

  try {
    const browser = await webkit.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const consoleErrs: string[] = [];
      const pageErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrs.push(msg.text());
      });
      page.on("pageerror", (err) => {
        pageErrors.push(err.message);
      });

      await page.goto(server.url, { waitUntil: "load", timeout: 20_000 });

      // Check page title is correct
      const title = await page.title();
      if (title !== "RepoOS") throw new Error(`Unexpected title: "${title}"`);

      // Verify we are testing the BUILT Vite app, not the legacy app.html —
      // the built SPA references hashed assets in /assets/.
      const hashedAsset = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll("script[src]"));
        return scripts.some((s) => (s.getAttribute("src") ?? "").startsWith("/assets/"));
      });
      if (!hashedAsset) {
        throw new Error("Served page is not the built Vite app (no /assets/ bundle)");
      }

      // Check that the app MOUNTED — no unrendered mustache in the DOM
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (bodyText.includes("{{") || bodyText.includes("}}")) {
        throw new Error("Unrendered mustache found in DOM — Vue did not mount");
      }

      // Check that a known root element rendered with real content
      const appEl = await page.$("#app");
      if (!appEl) throw new Error("#app element not found");

      const hasBrand = await page.evaluate(() =>
        document.body.innerText.includes("RepoOS"),
      );
      if (!hasBrand) throw new Error('Expected "RepoOS" in rendered content');

      // Navigate to work page and click +New Task
      await page.evaluate(() => {
        const navItems = document.querySelectorAll(".nav-item");
        for (const item of Array.from(navItems)) {
          if (item.textContent?.includes("Work")) (item as HTMLElement).click();
        }
      });
      await page.waitForTimeout(500);

      // Verify work page rendered
      const workEl = await page.$(".board");
      if (!workEl) {
        consoleErrs.push("Work page board not rendered — check page navigation");
      }

      // Check that the +New Task button exists
      const newBtn = await page.$(".new-btn");
      if (!newBtn) {
        consoleErrs.push("+New Task button not found in DOM");
      }

      // Check for zero console errors
      if (consoleErrs.length > 0) {
        let msg = "Console errors (" + consoleErrs.length + "): " + consoleErrs.join("; ");
        if (pageErrors.length > 0) msg += " | Page errors: " + pageErrors.join("; ");
        throw new Error(msg);
      }
      if (pageErrors.length > 0) {
        throw new Error(
          "Page errors (" + pageErrors.length + "): " + pageErrors.join("; "),
        );
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}
