#!/usr/bin/env bun
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:7286";
const output = process.env.QA_SHOTS ?? ".repoos/qa-releases-cut-flow";
await mkdir(output, { recursive: true });

const status = (overrides = {}) => ({
  enabled: true,
  supported: true,
  name: "RepoOS",
  provider: "git-tag",
  branch: "main",
  version: "0.5.89",
  tag: "v0.5.89",
  latestTag: "v0.5.89",
  latestTagAt: "2026-11-18T00:00:00Z",
  latestTagSha: "abc1234",
  commitsBehindMain: 4,
  latestStableTag: "v0.5.89",
  head: "abc1234",
  clean: true,
  onReleaseBranch: true,
  tagExists: true,
  released: true,
  ready: true,
  blockers: [],
  releaseUrl: null,
  workflowUrl: null,
  ...overrides,
});

const idle = { state: "idle", phase: null, message: "", startedAt: null, updatedAt: null };
const notesRun = {
  state: "idle",
  startedAt: null,
  updatedAt: null,
  error: null,
  key: null,
  notes: null,
  sinceTag: null,
  commitCount: 0,
  truncated: false,
};
const scenarios = {
  ready: { status: status(), run: idle },
  blocked: {
    status: status({ clean: false, blockers: ["Working tree has uncommitted changes."] }),
    run: idle,
  },
  running: {
    status: status(),
    run: {
      state: "running",
      phase: "checking",
      message: "PASS release preflight\nChecking package metadata",
      startedAt: "2026-11-19T04:00:00Z",
      updatedAt: "2026-11-19T04:00:22Z",
    },
  },
  failed: {
    status: status(),
    run: {
      state: "failed",
      phase: "checking",
      message: "FAIL src/core/release.test.ts\nError: expected ready\n1 failed",
      startedAt: "2026-11-19T03:50:00Z",
      updatedAt: "2026-11-19T03:50:35Z",
      failedTests: ["src/core/release.test.ts"],
      tldr: "A release check failed.",
    },
  },
  done: {
    status: status({
      version: "0.5.90",
      tag: "v0.5.90",
      latestTag: "v0.5.90",
      commitsBehindMain: 0,
    }),
    run: {
      state: "succeeded",
      phase: "pushing_tag",
      message: "Published v0.5.90",
      startedAt: "2026-11-19T03:40:00Z",
      updatedAt: "2026-11-19T03:41:04Z",
    },
  },
};

const browser = await chromium.launch({ headless: true });
let releasePosts = 0;
const results = [];
try {
  for (const width of [1280, 375]) {
    for (const [name, state] of Object.entries(scenarios)) {
      const context = await browser.newContext({
        viewport: { width, height: width === 375 ? 812 : 900 },
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));
      await page.route("**/api/release**", async (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        const method = req.method();
        if (path === "/api/release" && method === "POST") {
          releasePosts++;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ run: state.run }),
          });
        } else if (path === "/api/release") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(state.status),
          });
        } else if (path === "/api/release/run") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(state.run),
          });
        } else if (path === "/api/release/distribution") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              channels: [],
              releaseVersion: state.status.version,
              releaseTag: state.status.tag,
            }),
          });
        } else if (path === "/api/release/email") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(null),
          });
        } else if (path === "/api/release/notes") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ notes: "", cached: false }),
          });
        } else if (path === "/api/release/notes/run") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(notesRun),
          });
        } else if (path === "/api/release/notes/unpushed") {
          await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
        } else if (path === "/api/release/notes/auto-publish") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ autoPublish: null, defaultWhenReady: "notify" }),
          });
        } else {
          await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        }
      });
      await page.goto(`${base}/releases?drawer=cut`, { waitUntil: "domcontentloaded" });
      await page.locator(".release-drawer").waitFor();
      await page.waitForTimeout(250);
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      const drawerMetrics = await page.evaluate(() => {
        const drawer = document.querySelector(".release-drawer");
        const body = drawer?.querySelector(".drawer-body");
        const actions = drawer?.querySelector(".release-drawer-actions");
        return {
          drawerBottom: drawer?.getBoundingClientRect().bottom ?? null,
          viewportHeight: innerHeight,
          bodyClientHeight: body?.clientHeight ?? null,
          bodyScrollHeight: body?.scrollHeight ?? null,
          actionsBottom: actions?.getBoundingClientRect().bottom ?? null,
          actionsHeight: actions?.getBoundingClientRect().height ?? null,
        };
      });
      if (horizontalOverflow) throw new Error(`${name} at ${width}px has horizontal overflow`);
      if (
        drawerMetrics.actionsBottom !== null &&
        drawerMetrics.actionsBottom > drawerMetrics.viewportHeight
      )
        throw new Error(`${name} action footer is below the viewport at ${width}px`);
      if (name === "ready") {
        if (!(await page.locator('[data-test-id="release-generate-notes"]').count()))
          throw new Error(
            `generate button missing at ${width}px: ${page.url()} :: ${body.slice(-1000)}`,
          );
        await page.locator('[data-test-id="release-generate-notes"]').click();
        await page.getByRole("heading", { name: "When the AI notes are ready" }).waitFor();
        const dialog = page.locator(".rel-whenready");
        if (!(await dialog.isVisible())) throw new Error(`chooser not visible at ${width}px`);
        if (
          !(await dialog.getByText("Publish automatically").isVisible()) ||
          !(await dialog.getByText("Notify me").isVisible())
        )
          throw new Error(`chooser options are not visible at ${width}px`);
        const generate = dialog.getByRole("button", { name: "Generate notes" });
        const generateBox = await generate.boundingBox();
        if (!generateBox || generateBox.y + generateBox.height > (width === 375 ? 812 : 900))
          throw new Error(`chooser action is below the viewport at ${width}px`);
        await page.screenshot({ path: `${output}/chooser-${width}.png` });
      } else {
        await page.screenshot({ path: `${output}/${name}-${width}.png` });
      }
      if (
        name === "blocked" &&
        (!body.includes("Working tree has uncommitted changes") ||
          !(await page.locator('[data-test-id="cut-release-open"]').isDisabled()))
      )
        throw new Error(`blocker state incorrect at ${width}px`);
      if (name === "running" && !body.includes("Step 4 of 7 · Running checks"))
        throw new Error(`running phase missing at ${width}px`);
      if (name === "failed" && !body.includes("one or more tests failed"))
        throw new Error(`failure summary missing at ${width}px`);
      if (name === "done" && !body.includes("Published v0.5.90"))
        throw new Error(`success outcome missing at ${width}px`);
      results.push({
        width,
        state: name,
        noHorizontalOverflow: !horizontalOverflow,
        drawerMetrics,
        pageErrors,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (releasePosts !== 0)
  throw new Error(`Safety failure: intercepted ${releasePosts} release POST(s)`);
console.log(JSON.stringify({ results, releasePosts }, null, 2));
