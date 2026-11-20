// @vitest-environment node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";

// Long-data QA for the real Checks and Releases pages (#1219). The fixture
// mounts ChecksView/ReleasesView with their actual templates and scoped
// styles; only the repo store is stubbed so the test does not need a server
// board. Every row uses unbroken tokens as well as long hyphenated paths so a
// missing `min-width: 0` / `overflow-wrap: anywhere` widens the document.
const CHECK_PLAN_DELAY_MS = 350;
const OTHER_API_DELAY_MS = 100;

interface HorizontalOverflow {
  selector: string;
  text: string;
  left: number;
  right: number;
}

describe.skipIf(!existsSync(webkit.executablePath()))(
  "Checks and Releases long data (WebKit)",
  () => {
    let browser: Browser;
    let server: ViteDevServer;
    let baseUrl: string;

    beforeAll(async () => {
      server = await createServer({
        configFile: resolve(__dirname, "../vite.config.ts"),
        server: { host: "127.0.0.1", port: 0, strictPort: false },
        // Pre-scan the fixture entries so their dependencies are bundled up
        // front; a late discovery would re-hash them and strand the page on
        // 504 "Outdated Optimize Dep" responses (see checks-live-run-responsive).
        optimizeDeps: {
          entries: [
            "tests/fixtures/checks-releases-responsive.ts",
            "tests/fixtures/repo-store-browser-stub.ts",
          ],
        },
        plugins: [
          {
            name: "responsive-fixture-repo-store",
            enforce: "pre",
            resolveId(source) {
              if (source === "../stores/repo")
                return resolve(__dirname, "fixtures/repo-store-browser-stub.ts");
            },
          },
        ],
      });
      await server.listen();
      const address = server.httpServer!.address();
      if (!address || typeof address === "string") throw new Error("Vite test server did not bind");
      baseUrl = `http://127.0.0.1:${address.port}`;
      browser = await webkit.launch({ headless: true });
    });

    afterAll(async () => {
      await browser?.close();
      await server?.close();
    });

    it.each([375, 768, 1280])(
      "renders real page components with long data at %i px",
      async (width) => {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        // The first case cold-loads the real Checks and Releases components
        // through Vite; a 5 s budget is too tight on a loaded machine.
        page.setDefaultTimeout(30_000);
        const checkRows = Array.from({ length: 24 }, (_, i) => ({
          name: `integration-verification-${"x".repeat(120)}-${i}`,
          command: `bun run test -- ${"very-long-directory-name/".repeat(5)}${"y".repeat(80)}-${i}`,
          timeoutMs: 600_000,
          required: true,
          profiles: [],
          whenChanged: [],
          dependsOn: [],
          requires: [],
          crossCutting: true,
          selected: true,
          missing: [],
        }));
        const channels = Array.from({ length: 24 }, (_, i) => ({
          name: `registry-${i}-${"z".repeat(120)}`,
          kind: "npm",
          url: `https://packages.example.org/${"long-package-path/".repeat(5)}${"q".repeat(80)}-${i}`,
          install: [
            `npm install -g ${"@repo-os/long-package-name-".repeat(3)}${"w".repeat(80)}-${i}`,
          ],
          version: "1.2.3",
          state: "matching",
          detail: null,
        }));
        let distributionRequests = 0;

        await page.route("**/api/**", async (route) => {
          const path = new URL(route.request().url()).pathname;
          let body: unknown = {};
          if (path === "/api/check-plan") {
            body = {
              ok: true,
              checkPlan: {
                source: "declared",
                defaultProfile: "default",
                profile: "default",
                profiles: ["default"],
                warnings: [],
                errors: [],
                steps: checkRows,
                lastRun: null,
              },
            };
          } else if (path === "/api/check-runs") body = { activeRuns: [] };
          else if (path === "/api/local-check-slots") body = { holders: [], queue: [] };
          else if (path === "/api/integration/pipeline")
            body = { ok: true, pipeline: { empty: true, active: null, queue: [], at: "" } };
          else if (path === "/api/remote-validation/status")
            body = { enabled: false, running: false, hosts: [], tailscaleHosts: [] };
          else if (path === "/api/release")
            body = {
              enabled: true,
              supported: true,
              name: "Publish RepoOS",
              provider: "git-tag",
              branch: "main",
              version: "1.2.3",
              tag: "v1.2.3",
              latestTag: "v1.2.3",
              latestTagAt: "2026-09-01T00:00:00Z",
              latestTagSha: "abc1234",
              commitsBehindMain: 0,
              latestStableTag: "v1.2.3",
              head: "abc1234",
              clean: true,
              onReleaseBranch: true,
              tagExists: true,
              released: true,
              ready: false,
              blockers: [],
              releaseUrl: null,
              workflowUrl: null,
            };
          else if (path === "/api/release/distribution") {
            distributionRequests++;
            body = { releaseVersion: "1.2.3", releaseTag: "v1.2.3", channels };
          } else if (path === "/api/release/run")
            body = { state: "idle", phase: null, message: "", startedAt: null, updatedAt: null };
          else if (path === "/api/release/email") body = null;
          else if (path === "/api/release/notes/unpushed") body = null;
          else if (path === "/api/release/notes/run")
            body = { state: "idle", startedAt: null, updatedAt: null };
          else if (path === "/api/release/notes/auto-publish") body = { state: "idle" };
          const delay = path === "/api/check-plan" ? CHECK_PLAN_DELAY_MS : OTHER_API_DELAY_MS;
          await new Promise((done) => setTimeout(done, delay));
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        });

        try {
          await page.goto(
            `${baseUrl}/tests/fixtures/checks-releases-responsive.html?screen=checks`,
          );
          // Slow data must show the loading skeleton, then the full list — not
          // an empty page or a half-rendered list.
          expect(await page.locator(".ck-step").count()).toBe(0);
          await page.locator(".ck-step").first().waitFor();
          const checks = await page.evaluate(() => {
            const overflowing: HorizontalOverflow[] = [];
            for (const selector of [
              ".ck-step",
              ".ck-step-name",
              ".ck-badge",
              ".ck-step-cmd",
              ".ck-step-meta",
            ]) {
              for (const el of document.querySelectorAll<HTMLElement>(selector)) {
                const rect = el.getBoundingClientRect();
                if (rect.left < -1 || rect.right > innerWidth + 1) {
                  overflowing.push({
                    selector,
                    text: (el.textContent ?? "").slice(0, 40),
                    left: rect.left,
                    right: rect.right,
                  });
                }
              }
            }
            const names = [...document.querySelectorAll<HTMLElement>(".ck-step-name")];
            return {
              rows: document.querySelectorAll(".ck-step").length,
              bodyWidth: document.body.scrollWidth,
              viewport: innerWidth,
              overflowing,
              // A wrapped name fits its box; a clipped name would be wider.
              clippedNames: names.filter((el) => el.scrollWidth > el.clientWidth + 1).length,
              longestName: Math.max(...names.map((el) => (el.textContent ?? "").length)),
            };
          });
          expect(checks.rows).toBe(24);
          expect(checks.bodyWidth).toBeLessThanOrEqual(checks.viewport);
          expect(checks.overflowing).toEqual([]);
          expect(checks.clippedNames).toBe(0);
          expect(checks.longestName).toBeGreaterThan(100);

          await page.goto(
            `${baseUrl}/tests/fixtures/checks-releases-responsive.html?screen=releases`,
          );
          await page.locator(".rel-channel").first().waitFor();
          const releases = await page.evaluate(() => {
            const overflowing: HorizontalOverflow[] = [];
            for (const selector of [
              ".rel-dist",
              ".rel-dist-title-row",
              ".rel-channel",
              ".rel-channel-name",
              ".rel-channel-state",
              ".rel-install",
              ".rel-copy",
            ]) {
              for (const el of document.querySelectorAll<HTMLElement>(selector)) {
                const rect = el.getBoundingClientRect();
                if (rect.left < -1 || rect.right > innerWidth + 1) {
                  overflowing.push({
                    selector,
                    text: (el.textContent ?? "").slice(0, 40),
                    left: rect.left,
                    right: rect.right,
                  });
                }
              }
            }
            const names = [...document.querySelectorAll<HTMLElement>(".rel-channel-name")];
            const copy = [...document.querySelectorAll<HTMLButtonElement>(".rel-copy")];
            return {
              rows: document.querySelectorAll(".rel-channel").length,
              bodyWidth: document.body.scrollWidth,
              viewport: innerWidth,
              overflowing,
              clippedNames: names.filter((el) => el.scrollWidth > el.clientWidth + 1).length,
              // A control that is hidden, zero-sized, or pushed off-screen is
              // dead even though it is in the DOM.
              deadCopyButtons: copy.filter((button) => {
                const rect = button.getBoundingClientRect();
                return rect.width === 0 || rect.height === 0 || button.disabled;
              }).length,
              copyButtons: copy.length,
            };
          });
          expect(releases.rows).toBe(24);
          expect(releases.bodyWidth).toBeLessThanOrEqual(releases.viewport);
          expect(releases.overflowing).toEqual([]);
          expect(releases.clippedNames).toBe(0);
          expect(releases.copyButtons).toBe(24);
          expect(releases.deadCopyButtons).toBe(0);

          const refresh = page.getByRole("button", { name: "Check again" });
          // Vitest's default poll timeout is 1 s; the fixture's delayed
          // responses can outlast that on a loaded runner, so poll for longer
          // instead of racing it.
          const POLL = { timeout: 5000 };
          await expect.poll(() => refresh.isVisible(), POLL).toBe(true);
          await refresh.click();
          await expect.poll(() => distributionRequests, POLL).toBe(2);
          await expect.poll(() => refresh.isEnabled(), POLL).toBe(true);

          // The declared shots rely on these two fixtures; render them through
          // the real views so a broken seed fails here, not at handoff.
          await page.goto(
            `${baseUrl}/tests/fixtures/checks-releases-responsive.html?screen=checks&shotState=checks:longData`,
          );
          await page.locator(".ck-step").first().waitFor();
          expect(await page.locator(".ck-step").count()).toBe(24);
          expect(await page.locator(".ck-step-name").first().textContent()).toMatch(
            /^fixture-check-x{100,}/,
          );
          expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);

          await page.goto(
            `${baseUrl}/tests/fixtures/checks-releases-responsive.html?screen=releases&shotState=release:longDistribution`,
          );
          await page.locator(".rel-channel").first().waitFor();
          expect(await page.locator(".rel-channel").count()).toBe(24);
          expect(await page.locator(".rel-channel-name").first().textContent()).toMatch(
            /^fixture-channel-0-z{100,}/,
          );
          expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
        } finally {
          await page.close();
        }
      },
      // Each case cold-loads the real Checks and Releases components through
      // Vite and drives two page loads; the 5 s default is too tight for a
      // first WebKit run on a loaded machine. Layout assertions are unchanged.
      60_000,
    );
  },
);
