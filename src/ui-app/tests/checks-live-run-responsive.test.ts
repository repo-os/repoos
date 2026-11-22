// @vitest-environment node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { LIVE_RUN_STATES, liveRunSeed, type LiveRunState } from "./fixtures/checks-live-run-states";

// QA for the Checks page live run view (#1247): running, queued, stalled and
// failed runs at phone, tablet and desktop widths. Headless WebKit only, with
// the real ChecksView and its live components mounted against seeded fixture
// data. The API is mocked, so no real check run is started and no server board
// is needed. Only the repo store is swapped for a seeded stand-in.
const WIDTHS = [375, 768, 1280] as const;

interface BoxProblem {
  selector: string;
  text: string;
  reason: string;
}

interface LayoutReport {
  docOverflow: number;
  problems: BoxProblem[];
  pageText: string;
}

// Each box must stay inside the viewport and inside its own container. A box
// whose content is wider than itself spills out of the box, even when the page
// itself does not scroll sideways.
const BOX_SELECTORS = [
  ".ck-live-check",
  ".ck-live-check-heading",
  ".check-progress",
  ".ck-local-slot",
  ".ips",
  ".ips-active",
  ".ips-err",
  ".ips-queue",
  ".ips-chip",
  ".trp-head",
  ".trp-log",
  ".trp-failures",
];

function measureLayout(boxSelectors: string[]): LayoutReport {
  const problems: BoxProblem[] = [];
  const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  for (const selector of boxSelectors) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.left < -1 || rect.right > innerWidth + 1) {
        problems.push({ selector, text: text(el), reason: "outside the viewport" });
      }
      // A box whose own content is wider than it is spills out of the box.
      if (el.scrollWidth > el.clientWidth + 1) {
        problems.push({ selector, text: text(el), reason: "content wider than its box" });
      }
      // The inner box must not poke out of the container it sits in.
      const container = el.closest<HTMLElement>(
        ".ck-live-checks, .ck-local-slots, .ips, .test-run-panel",
      );
      if (container && el !== container) {
        const box = container.getBoundingClientRect();
        if (rect.left < box.left - 1 || rect.right > box.right + 1) {
          problems.push({ selector, text: text(el), reason: "outside its container" });
        }
      }
    }
  }
  return {
    docOverflow: document.documentElement.scrollWidth - innerWidth,
    problems,
    pageText: (document.querySelector(".ck-page")?.textContent ?? "").replace(/\s+/g, " "),
  };
}

describe.skipIf(!existsSync(webkit.executablePath()))(
  "Checks live run view at phone, tablet and desktop widths (WebKit)",
  () => {
    let browser: Browser;
    let server: ViteDevServer;
    let baseUrl: string;
    const releaseCalls: string[] = [];

    beforeAll(async () => {
      server = await createServer({
        configFile: resolve(__dirname, "../vite.config.ts"),
        server: { host: "127.0.0.1", port: 0, strictPort: false },
        // Vite only scans index.html for dependencies by default. Listing the
        // fixture entries here bundles their dependencies before the first
        // page loads; otherwise a late discovery re-hashes the bundle and the
        // page's already-loaded `vue.js` / `pinia.js` requests return 504
        // "Outdated Optimize Dep", and the view never mounts.
        optimizeDeps: {
          entries: [
            "tests/fixtures/checks-live-run-responsive.ts",
            "tests/fixtures/checks-live-run-store-stub.ts",
          ],
        },
        plugins: [
          {
            name: "checks-live-run-store",
            enforce: "pre",
            resolveId(source) {
              if (source === "../stores/repo")
                return resolve(__dirname, "fixtures/checks-live-run-store-stub.ts");
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

    async function openPage(
      width: number,
      liveState: LiveRunState,
      tab: "now" | "test-suite",
      options: { releaseFails?: boolean } = {},
    ): Promise<Page> {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      // The first page of a run cold-loads the Checks view through Vite, which
      // can outlast a 5 s budget on a loaded machine. Layout checks are unchanged.
      page.setDefaultTimeout(30_000);
      const seed = liveRunSeed(liveState);
      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        let body: unknown = {};
        if (url.pathname === "/api/check-plan")
          body = {
            ok: true,
            checkPlan: {
              source: "declared",
              defaultProfile: "default",
              profile: "default",
              profiles: ["default"],
              warnings: [],
              errors: [],
              steps: [],
              lastRun: null,
            },
          };
        else if (url.pathname === "/api/check-runs")
          body = { ok: true, runs: [], activeRuns: seed.activeRuns };
        else if (url.pathname === "/api/local-check-slots") body = seed.slots;
        else if (url.pathname === "/api/remote-validation/status")
          body = { enabled: false, running: false, hosts: [], tailscaleHosts: [] };
        else if (
          url.pathname.startsWith("/api/local-check-slots/") &&
          route.request().method() === "POST"
        ) {
          releaseCalls.push(url.pathname);
          if (options.releaseFails) {
            await route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({ error: "slot 0 is no longer held by PID 5150" }),
            });
            return;
          }
          body = { ok: true };
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      });
      await page.goto(
        `${baseUrl}/tests/fixtures/checks-live-run-responsive.html?tab=${tab}&liveState=${liveState}`,
      );
      return page;
    }

    it.each(WIDTHS)(
      "keeps every live run state inside its boxes at %i px",
      async (width) => {
        for (const liveState of LIVE_RUN_STATES) {
          const page = await openPage(width, liveState, "now");
          try {
            await page.locator(".ck-page").waitFor();
            await page.waitForTimeout(150);
            const report = await page.evaluate(measureLayout, BOX_SELECTORS);
            expect(report.docOverflow, `${liveState}: page overflows`).toBeLessThanOrEqual(1);
            expect(report.problems, `${liveState}: boxes leak`).toEqual([]);
          } finally {
            await page.close();
          }
        }
      },
      60_000,
    );

    it.each(WIDTHS)(
      "keeps the test suite output inside its box at %i px",
      async (width) => {
        for (const liveState of ["running", "failed"] as const) {
          const page = await openPage(width, liveState, "test-suite");
          try {
            await page.locator(".trp-log").waitFor();
            await page.waitForTimeout(150);
            const report = await page.evaluate(measureLayout, BOX_SELECTORS);
            expect(report.docOverflow, `${liveState}: page overflows`).toBeLessThanOrEqual(1);
            expect(report.problems, `${liveState}: output leaks`).toEqual([]);
          } finally {
            await page.close();
          }
        }
      },
      60_000,
    );

    it("names each live run state in plain English", async () => {
      const expectations: Record<LiveRunState, RegExp[]> = {
        running: [/Running checks/, /Handoff/, /step 3 of 6/, /tests 40\/120/, /attempt 2/],
        queued: [/Local check slots/, /Queue 1/, /position 1/, /waiting/, /Queued behind/],
        stalled: [/No recent heartbeat/, /Release slot/],
        failed: [/#1190 failed/],
      };
      for (const liveState of LIVE_RUN_STATES) {
        const page = await openPage(1280, liveState, "now");
        try {
          await page.locator(".ck-page").waitFor();
          await page.waitForTimeout(150);
          const text = await page.locator(".ck-page").innerText();
          for (const pattern of expectations[liveState]) {
            expect(text, `${liveState} should match ${pattern}`).toMatch(pattern);
          }
        } finally {
          await page.close();
        }
      }
    }, 60_000);

    it("confirms what releasing a stalled slot did", async () => {
      releaseCalls.length = 0;
      const page = await openPage(1280, "stalled", "now");
      try {
        await page.getByRole("button", { name: "Release slot" }).click();
        await page.getByRole("button", { name: "Release slot" }).last().click();
        await page.waitForTimeout(300);
        expect(releaseCalls).toEqual(["/api/local-check-slots/0/release/5150"]);
        // The page must say what happened, not just quietly refresh the slot.
        const notice = page.locator(".ck-slot-notice");
        await notice.waitFor();
        expect(await notice.innerText()).toMatch(/Released slot 0 \(PID 5150\)/);
      } finally {
        await page.close();
      }
    }, 60_000);

    it("shows a failed slot release on the Now tab instead of going quiet", async () => {
      const page = await openPage(375, "stalled", "now", { releaseFails: true });
      try {
        await page.getByRole("button", { name: "Release slot" }).click();
        await page.getByRole("button", { name: "Release slot" }).last().click();
        const alert = page.locator(".ck-local-slots [role='alert']");
        await alert.waitFor();
        expect(await alert.innerText()).toMatch(/no longer held by PID 5150/);
        expect(await page.locator(".ck-slot-notice").count()).toBe(0);
        // The dialog closes on failure too, so the error is not hidden behind it.
        expect(await page.locator(".ck-slot-release-dialog").count()).toBe(0);
      } finally {
        await page.close();
      }
    }, 60_000);
  },
);
