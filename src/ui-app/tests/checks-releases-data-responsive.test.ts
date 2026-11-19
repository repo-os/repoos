// @vitest-environment node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";

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
        page.setDefaultTimeout(5000);
        const checkRows = Array.from({ length: 24 }, (_, i) => ({
          name: `${"integration-verification-long-step-name-".repeat(4)}${i}`,
          command: `bun run test -- ${"very-long-directory-name/".repeat(5)}case-${i}`,
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
          name: `registry-${i}-${"long-channel-name-".repeat(3)}`,
          kind: "npm",
          url: `https://packages.example.org/${"long-package-path/".repeat(5)}${i}`,
          install: [`npm install -g ${"@repo-os/long-package-name-".repeat(3)}${i}`],
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
          await new Promise((done) => setTimeout(done, 100));
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
          await page.locator(".ck-step").first().waitFor();
          const checks = await page.evaluate(() => ({
            rows: document.querySelectorAll(".ck-step").length,
            bodyWidth: document.body.scrollWidth,
            viewport: innerWidth,
          }));
          expect(checks.rows).toBe(24);
          expect(checks.bodyWidth).toBeLessThanOrEqual(checks.viewport);

          await page.goto(
            `${baseUrl}/tests/fixtures/checks-releases-responsive.html?screen=releases`,
          );
          await page.locator(".rel-channel").first().waitFor();
          const releases = await page.evaluate(() => {
            const action = document.querySelector<HTMLElement>(".rel-dist-title-row button")!;
            return {
              rows: document.querySelectorAll(".rel-channel").length,
              bodyWidth: document.body.scrollWidth,
              viewport: innerWidth,
              actionRight: action.getBoundingClientRect().right,
            };
          });
          expect(releases.rows).toBe(24);
          expect(releases.bodyWidth).toBeLessThanOrEqual(releases.viewport);
          expect(releases.actionRight).toBeLessThanOrEqual(releases.viewport);
          await page.getByRole("button", { name: "Check again" }).click();
          await expect.poll(() => distributionRequests).toBe(2);
        } finally {
          await page.close();
        }
      },
    );
  },
);
