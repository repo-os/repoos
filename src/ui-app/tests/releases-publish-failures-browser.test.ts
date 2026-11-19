/**
 * Releases publish flow QA pass (#1240).
 *
 * Headless WebKit against the built app, with Playwright request interception
 * standing in for every `/api/**` call. Nothing here reaches the real release
 * API: the catch-all answers 404 instead of continuing to the server, and the
 * only pass-through is the SSE stream. Each scenario counts the `POST
 * /api/release` requests it sees, so "nothing is published by accident" is
 * asserted directly rather than inferred from the UI.
 *
 * Covers the failure states (blocked checkout, tag already exists, server
 * offline, failed check run with long output, failed CI workflow) and the
 * long-notes editor, at 375 / 768 / 1280 px. Skips cleanly when Playwright or
 * WebKit is not installed.
 */
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSmokeFixture } from "../../commands/ui-smoke.js";
import {
  isPlaywrightUnavailable,
  launchWebkit,
  startPreviewServer,
  teardownUiHarness,
  type PreviewServer,
  type SmokeBrowser,
  type SmokePage,
  type SmokeRoute,
} from "../../commands/ui-harness.js";

let browser: SmokeBrowser | null = null;
let server: PreviewServer | null = null;
let fixtureRoot: string | null = null;
let unavailable = false;
const bootErrors: string[] = [];
try {
  fixtureRoot = makeSmokeFixture();
  server = await startPreviewServer(fixtureRoot);
  browser = await launchWebkit();
} catch (err) {
  const message = (err as Error).message ?? String(err);
  if (isPlaywrightUnavailable(message)) unavailable = true;
  else bootErrors.push(message);
}

const describeBrowser = browser && !unavailable ? describe : describe.skip;

afterAll(async () => {
  try {
    await teardownUiHarness({
      browser: browser ?? undefined,
      server: server ?? undefined,
      removeFixture: () => {
        if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
      },
    });
  } catch (err) {
    console.error((err as Error).message);
  }
  fixtureRoot = null;
});

const VIEWPORTS = [375, 768, 1280] as const;
const PUBLISH = '[data-test-id="release-publish"]';
const VERSION = "#rel-version";
const NOTES = "#rel-notes";

/** Release status for a clean checkout on the release branch, already released. */
function readyStatus(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    supported: true,
    name: "Cut release",
    provider: "git-tag",
    branch: "main",
    version: "0.6.0",
    tag: "v0.6.0",
    latestTag: "v0.6.0",
    latestTagAt: "2026-11-10T00:00:00.000Z",
    latestTagSha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    commitsBehindMain: 0,
    latestStableTag: "v0.6.0",
    head: "b1c2d3e4f5a60718293a4b5c6d7e8f9012345678",
    clean: true,
    onReleaseBranch: true,
    tagExists: false,
    released: true,
    ready: true,
    blockers: [],
    releaseUrl: null,
    workflowUrl: null,
    ...overrides,
  };
}

interface Scenario {
  status?: Record<string, unknown>;
  /** Override for `POST /api/release`; default starts a run that is still running. */
  post?: (route: SmokeRoute) => Promise<void>;
  distribution?: Record<string, unknown>;
}

interface Stub {
  postCount: () => number;
}

/**
 * Stub every release API the page reads. Unknown `/api/**` paths answer 404,
 * never the real server, so a missed stub cannot publish anything.
 */
async function stubReleaseApi(page: SmokePage, scenario: Scenario): Promise<Stub> {
  let posts = 0;
  const status = readyStatus(scenario.status);
  const runningRun = {
    state: "running",
    phase: "checking",
    message: "",
    startedAt: "2026-11-20T10:00:00.000Z",
    updatedAt: "2026-11-20T10:00:05.000Z",
  };
  let currentRun: Record<string, unknown> = {
    state: "idle",
    phase: null,
    message: "",
    startedAt: null,
    updatedAt: null,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === "/api/events") {
      await route.fulfill({ response: await route.fetch() });
      return;
    }
    const json = (body: unknown, code = 200) =>
      route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/release" && method === "GET") return json(status);
    if (url.pathname === "/api/release" && method === "POST") {
      posts++;
      if (scenario.post) return scenario.post(route);
      currentRun = runningRun;
      return json({ ok: true, run: runningRun }, 202);
    }
    if (url.pathname === "/api/release/run") return json(currentRun);
    if (url.pathname === "/api/release/distribution")
      return json(
        scenario.distribution ?? {
          ciFailure: null,
          releaseVersion: "0.6.0",
          releaseTag: "v0.6.0",
          channels: [],
        },
      );
    if (url.pathname === "/api/release/notes/unpushed") return json(null);
    if (url.pathname === "/api/release/notes/run")
      return json({ state: "idle", notes: "", error: null, startedAt: null, updatedAt: null });
    if (url.pathname === "/api/release/notes/auto-publish")
      return json({ state: "idle", error: null });
    if (url.pathname === "/api/release/email")
      return json({ state: "idle", records: [], includePrereleases: false });
    if (url.pathname === "/api/release/email/preview") return json({ subject: "", body: "" });
    return json({ error: `Not stubbed in this QA pass: ${method} ${url.pathname}` }, 404);
  });
  return { postCount: () => posts };
}

/** A fresh page that records uncaught errors (asserted per test). */
async function openPage(width: (typeof VIEWPORTS)[number] = 1280): Promise<SmokePage> {
  const page = await browser!.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (err: Error) => {
    // Same tolerance as the other QA browser tests: WebKit reports failed
    // optional API requests as page errors while the fixture server settles.
    if (!err.message.includes("/api/") || !err.message.includes("access control checks")) {
      bootErrors.push(`pageerror: ${err.message}`);
    }
  });
  return page;
}

async function expectNoHorizontalOverflow(page: SmokePage, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
}

/** Open the Cut-a-release drawer directly (the page honours `?drawer=cut`). */
async function openCutDrawer(page: SmokePage): Promise<void> {
  await page.goto(`${server!.url}/releases?drawer=cut`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForFunction(() => document.querySelector(".release-drawer") !== null, {
    timeout: 10_000,
  });
}

/** Set a field the way a user would: the value plus the `input` event Vue listens for. */
async function setField(page: SmokePage, selector: string, value: string): Promise<void> {
  await page.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
      if (!el) throw new Error(`missing field ${selector}`);
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { selector, value },
  );
}

async function fieldValue(page: SmokePage, selector: string): Promise<string> {
  return page.evaluate(
    (sel) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)?.value ?? "",
    selector,
  );
}

async function isDisabled(page: SmokePage, selector: string): Promise<boolean> {
  return page.evaluate(
    (sel) => document.querySelector<HTMLButtonElement>(sel)?.disabled === true,
    selector,
  );
}

async function textOf(page: SmokePage, selector: string): Promise<string> {
  return page.evaluate(
    (sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    selector,
  );
}

describeBrowser("Releases publish flow failures (#1240)", { timeout: 60_000 }, () => {
  it("has a usable headless browser and server", () => {
    expect(bootErrors).toEqual([]);
    expect(unavailable).toBe(false);
  });

  it("blocked checkout: says why publishing is disabled and keeps Publish off", async () => {
    const page = await openPage();
    try {
      const stub = await stubReleaseApi(page, {
        status: {
          clean: false,
          blockers: ["Commit or stash all working-tree changes first."],
          ready: false,
        },
      });
      await openCutDrawer(page);
      await setField(page, VERSION, "0.7.0");
      const text = await textOf(page, ".release-drawer");
      expect(text).toContain("Publishing is disabled");
      expect(text).toContain("working tree must be clean");
      expect(await isDisabled(page, PUBLISH)).toBe(true);
      await page.focus(VERSION);
      await page.keyboard.press("Enter");
      expect(stub.postCount()).toBe(0);
      for (const width of VIEWPORTS) await expectNoHorizontalOverflow(page, width);
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("tag already exists: the named blocker is shown and Publish stays disabled", async () => {
    const page = await openPage();
    try {
      const stub = await stubReleaseApi(page, {
        status: {
          tagExists: true,
          released: false,
          ready: false,
          blockers: ["v0.7.0 already exists."],
          tag: "v0.7.0",
          version: "0.7.0",
        },
      });
      await openCutDrawer(page);
      await setField(page, VERSION, "0.8.0");
      // The drawer must explain the blocker, not only the main page panel.
      expect(await textOf(page, '[data-test-id="release-drawer-blockers"]')).toContain(
        "v0.7.0 already exists.",
      );
      expect(await isDisabled(page, PUBLISH)).toBe(true);
      await page.focus(VERSION);
      await page.keyboard.press("Enter");
      expect(stub.postCount()).toBe(0);
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("offline: Publish reports the server is unreachable, keeps the notes, and starts no cut", async () => {
    const page = await openPage();
    try {
      const stub = await stubReleaseApi(page, {
        post: async (route) => {
          await route.abort();
        },
      });
      await openCutDrawer(page);
      await setField(page, VERSION, "0.7.0");
      await setField(page, NOTES, "Fixes the publish flow");
      await page.click(PUBLISH);
      await page.waitForFunction(() => document.querySelector(".release-drawer-error") !== null, {
        timeout: 10_000,
      });
      const error = await textOf(page, ".release-drawer-error");
      expect(error).toContain("Can't reach the RepoOS server");
      expect(stub.postCount()).toBe(1);
      // A failed attempt must not wipe the drafted notes or the chosen version.
      expect(await fieldValue(page, NOTES)).toBe("Fixes the publish flow");
      expect(await fieldValue(page, VERSION)).toBe("0.7.0");
      for (const width of VIEWPORTS) await expectNoHorizontalOverflow(page, width);
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("failed check run with long output: names the phase and keeps the full log scrollable", async () => {
    const page = await openPage();
    try {
      const failingLog = [
        "running repoos check",
        ...Array.from(
          { length: 400 },
          (_, i) => `FAIL src/server/some-very-long-module-name-${i}.test.ts > case ${i}`,
        ),
        "  37 failed | 4120 passed",
      ].join("\n");
      const stub = await stubReleaseApi(page, {});
      // Registered after the catch-all, so Playwright matches it first: the
      // cut starts, then its run poll reports the failure.
      await page.route("**/api/release/run", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            state: "failed",
            phase: "checking",
            message: failingLog,
            startedAt: "2026-11-20T10:00:00.000Z",
            updatedAt: "2026-11-20T10:03:00.000Z",
            failedTests: [],
            tldr: null,
            tldrPending: false,
          }),
        });
      });
      await openCutDrawer(page);
      await setField(page, VERSION, "0.7.0");
      await page.click(PUBLISH);
      await page.waitForFunction(() => document.querySelector(".release-drawer-error") !== null, {
        timeout: 15_000,
      });
      const headline = await textOf(page, ".release-drawer-error strong");
      expect(headline).toContain("during checking");
      expect(headline).toContain("one or more tests failed");
      expect(stub.postCount()).toBe(1);
      for (const width of VIEWPORTS) await expectNoHorizontalOverflow(page, width);
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("CI workflow failed after the tag: says what to do next, not just what broke", async () => {
    const page = await openPage();
    try {
      await stubReleaseApi(page, {
        distribution: {
          ciFailure: {
            runUrl: "https://github.com/example/repoos/actions/runs/1",
            failedStep: "publish",
            jobName: "release",
          },
          releaseVersion: "0.6.0",
          releaseTag: "v0.6.0",
          channels: [],
        },
      });
      await page.goto(`${server!.url}/releases`, { waitUntil: "load", timeout: 20_000 });
      await page.waitForFunction(() => document.querySelector(".ff-error[role='alert']") !== null, {
        timeout: 10_000,
      });
      const text = await textOf(page, ".ff-error[role='alert']");
      expect(text).toContain("The release workflow failed");
      expect(text).toContain("publish");
      expect(text).toContain("Open the failed run to see the error");
      for (const width of VIEWPORTS) await expectNoHorizontalOverflow(page, width);
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("long notes: a draft of about 6,300 characters with an unbroken URL keeps the drawer inside every width", async () => {
    const page = await openPage();
    try {
      const stub = await stubReleaseApi(page, {});
      await openCutDrawer(page);
      const longNotes = [
        "https://github.com/example/repoos/compare/v0.5.0...v0.6.0?verbose=true".repeat(20),
        ...Array.from(
          { length: 60 },
          (_, i) => `- Change ${i}: a fairly long release note line that wraps across the drawer`,
        ),
      ].join("\n");
      await setField(page, NOTES, longNotes);
      for (const width of VIEWPORTS) {
        await expectNoHorizontalOverflow(page, width);
        const drawerOverflow = await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>(".release-drawer");
          return el ? el.scrollWidth - el.clientWidth : -1;
        });
        expect(drawerOverflow, `drawer overflow at ${width}px`).toBeLessThanOrEqual(1);
      }
      // Editing still works after resizing: the appended line round-trips.
      await setField(page, NOTES, `${longNotes}\n- Final line`);
      expect(await fieldValue(page, NOTES)).toContain("- Final line");
      expect(stub.postCount()).toBe(0);
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("nothing is published by accident: Enter with no version does not cut", async () => {
    const page = await openPage();
    try {
      const stub = await stubReleaseApi(page, {});
      await openCutDrawer(page);
      await page.focus(VERSION);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      expect(stub.postCount()).toBe(0);
      expect(await isDisabled(page, PUBLISH)).toBe(true);
      expect(bootErrors).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
