// @vitest-environment jsdom
/**
 * #1262 — QA pass: Checks page (Now, Runs, Check plan) at 375/768/1280px.
 * Mounts the real ChecksView (with its live child panels) against fixtures
 * only, renders the markup with the built global stylesheet and each
 * component's compiled scoped CSS in headless WebKit, and asserts that every
 * visible element stays inside the viewport. The error and empty states are
 * asserted on the mounted DOM: a failed load must never read as "nothing here".
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per fixture and width.
 */
import { resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import ChecksView from "../src/views/ChecksView.vue";
import { invalidatePageDataPrefix } from "../src/composables/page-data-cache";
import { FakeEventSource } from "./component-test-helpers";
import type { CheckPlanView, RemoteValidationStatusView, TaskCheckRun } from "../src/types";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");
const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

/** A long, unbroken token: the worst case for a row that has no break point. */
const LONG_TOKEN = `check-${"segment-".repeat(14)}end`;
const LONG_HOST = "a-very-long-hostname-for-the-build-machine-in-the-office.local";

const respond = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  }) as unknown as Response;

const idleRemote = (): RemoteValidationStatusView =>
  ({
    enabled: true,
    running: false,
    provider: "tailscale",
    tailscaleHosts: [],
    hosts: [],
    tailscaleHost: "",
    tailscaleHostPinsTop: false,
    hostPoolEditable: false,
    activeServer: null,
    maxConcurrent: 1,
  }) as unknown as RemoteValidationStatusView;

function longPlan(): CheckPlanView {
  return {
    source: "declared",
    defaultProfile: "default",
    profile: "default",
    profiles: ["default", "full"],
    changedRef: "main",
    changedPaths: ["src/ui-app/src/views/ChecksView.vue"],
    warnings: [`Step ${LONG_TOKEN} has no timeout; the default applies.`],
    errors: [],
    steps: [
      {
        name: "tests",
        kind: "command",
        command: `bun run test --changed main --reporter=verbose ${"--flag ".repeat(20)}`,
        timeoutMs: 600_000,
        required: true,
        profiles: ["default", "full"],
        whenChanged: ["src/**"],
        dependsOn: ["build"],
        requires: ["bun", "playwright"],
        crossCutting: false,
        selected: true,
        missing: [{ tool: "playwright", hint: "Install with bunx playwright install webkit" }],
      },
      {
        name: LONG_TOKEN,
        kind: "command",
        command: `echo ${"x".repeat(220)}`,
        cwd: `/Users/example/${"nested-directory/".repeat(8)}`,
        timeoutMs: 1000,
        required: false,
        profiles: ["full"],
        whenChanged: [],
        dependsOn: [],
        requires: [`tool-${"name-".repeat(12)}`],
        crossCutting: true,
        selected: false,
        skip: { reason: "profile", detail: `Not in profile "default". ${"Detail ".repeat(30)}` },
        missing: [],
      },
    ],
    lastRun: {
      profile: "default",
      source: "declared",
      changedRef: "main",
      startedAt: iso(5),
      finishedAt: iso(4),
      durationMs: 65_000,
      passed: false,
      outcome: "failed",
      results: [
        {
          name: "tests",
          status: "failed",
          durationMs: 61_000,
          required: true,
          output: `${"FAIL src/some/very/long/path/to/a/test-file.test.ts > a long test name\n".repeat(30)}`,
        },
      ],
    },
  } as unknown as CheckPlanView;
}

function runningCheck(): TaskCheckRun {
  return {
    id: "run-1",
    taskId: "1262",
    kind: "handoff-finalize",
    startedAt: iso(3),
    finishedAt: null,
    durationMs: null,
    running: true,
    passed: null,
    code: null,
    output: "",
    scope: "changed:main",
    machine: LONG_HOST,
    stepsDone: 3,
    stepsTotal: 7,
  } as unknown as TaskCheckRun;
}

function historyRuns() {
  return [
    {
      id: 1,
      taskId: "1262",
      phase: "close-out",
      worktree: null,
      machine: LONG_HOST,
      remote: true,
      scope: `changed:${LONG_TOKEN}`,
      startedAt: iso(20),
      durationMs: 75_000,
      outcome: "fail",
      failedStep: "tests",
      skippedSteps: ["rendered-contrast"],
      failedTests: [`src/ui-app/tests/${"very-long-file-name-".repeat(6)}.test.ts > a test`],
      detail: null,
      steps: [],
    },
    {
      id: 2,
      taskId: null,
      phase: "cli",
      worktree: null,
      machine: null,
      remote: false,
      scope: "full",
      startedAt: iso(90),
      durationMs: null,
      outcome: "pass",
      failedStep: null,
      skippedSteps: [],
      failedTests: [],
      detail: null,
      steps: [],
    },
  ];
}

/** Routes the page's API calls to fixtures. A value of `"fail"` answers 500. */
function fetchFixtures(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    "/api/check-plan": { ok: true, checkPlan: longPlan() },
    "/api/check-runs?limit=300": { ok: true, runs: historyRuns() },
    "/api/check-runs?limit=1": { activeRuns: [runningCheck()] },
    "/api/local-check-slots": {
      holders: [
        {
          slot: 1,
          pid: 4242,
          ageMs: 90_000,
          heartbeatAgeMs: 45_000,
          wedged: true,
          dead: false,
          meta: { taskId: "1262" },
        },
      ],
      queue: [{ taskId: "1300", position: 1, since: iso(2) }],
    },
    "/api/remote-validation/status": idleRemote(),
  };
  const routes = { ...defaults, ...overrides };
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return respond({});
    const body = routes[key];
    return body === "fail"
      ? respond({ error: "The server could not answer." }, 500)
      : respond(body);
  });
}

async function mountChecks(tab: "now" | "runs" | "plan", overrides: Record<string, unknown> = {}) {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", fetchFixtures(overrides));
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/checks", name: "checks", component: ChecksView }],
  });
  await router.push({ path: "/checks", query: { tab } });
  await router.isReady();
  const wrapper = mount(ChecksView, { global: { plugins: [pinia, router] } });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  invalidatePageDataPrefix("check-plan:");
  invalidatePageDataPrefix("check-runs:");
  document.body.innerHTML = "";
});

describe("Checks page QA at 375/768/1280 (WebKit, fixtures)", () => {
  let browser: Browser;
  let globalCss: string;

  beforeAll(async () => {
    browser = await webkit.launch();
    const assetDir = resolve(uiRoot, "../../dist/ui/assets");
    const cssAsset = (await readdir(assetDir)).find((name) => /^index-.*\.css$/.test(name));
    if (!cssAsset) throw new Error("Built global UI stylesheet was not found");
    globalCss = await readFile(resolve(assetDir, cssAsset), "utf8");
  });
  afterAll(async () => {
    await browser?.close();
  });

  /** Compiled scoped CSS for one component. `attr` is the exact opening of the
   *  component's root element in the markup, which carries its scope ID. */
  function scopedCss(markup: string, attr: string, component: string): string {
    const source = readFileSync(resolve(uiRoot, `src/${component}`), "utf8");
    const style = parse(source, { filename: component }).descriptor.styles[0]?.content ?? "";
    const marker = markup.indexOf(attr);
    if (marker < 0) throw new Error(`${component} markup is missing ${attr}`);
    const tag = markup.slice(markup.lastIndexOf("<", marker), markup.indexOf(">", marker));
    const scopeId = tag.match(/data-v-[a-f0-9]+/)?.[0];
    if (!scopeId) throw new Error(`${component} scope ID was not present on ${attr}`);
    const compiled = compileStyle({ filename: component, id: scopeId, source: style });
    if (compiled.errors.length) throw compiled.errors[0]!;
    return compiled.code;
  }

  /** Scoped CSS for every child panel the page renders at this tab. */
  function scopedStyles(markup: string): string {
    const parts = [scopedCss(markup, 'class="ck-page', "views/ChecksView.vue")];
    const panels: Array<[string, string]> = [
      ['class="rr-panel"', "components/RemoteRunnersPanel.vue"],
      ['class="ips"', "components/IntegrationPipelineSummary.vue"],
      ['class="cr-panel"', "components/CheckRunsPanel.vue"],
    ];
    for (const [attr, component] of panels) {
      if (markup.includes(attr)) parts.push(scopedCss(markup, attr, component));
    }
    return parts.join("\n");
  }

  async function openFixturePage(
    label: string,
    markup: string,
    scoped: string,
    width: number,
  ): Promise<Page> {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
        `<style>${globalCss}</style><style>${scoped}</style>` +
        `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
        `<div class="app-shell"><div class="body"><aside class="sidebar"><nav>Navigation</nav></aside><div class="main">${markup}</div></div></div>`,
    );
    const shots = process.env.QA_SHOTS;
    if (shots) {
      mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: resolve(shots, `${label}-${width}.png`), fullPage: true });
    }
    return page;
  }

  /** Every visible element must sit inside the viewport, except content a
   *  horizontal scroller legitimately clips or a closed <details> hides. */
  async function audit(page: Page): Promise<{ documentWidth: number; overflowers: string[] }> {
    return page.evaluate(() => {
      const vw = window.innerWidth;
      const inHorizontalScroller = (start: Element | null): boolean => {
        for (let el: HTMLElement | null = start as HTMLElement; el; el = el.parentElement) {
          const s = getComputedStyle(el);
          if (
            (s.overflowX === "auto" || s.overflowX === "scroll") &&
            el.scrollWidth > el.clientWidth + 1
          )
            return true;
        }
        return false;
      };
      const inClosedDetails = (el: Element): boolean => {
        const details = el.closest("details");
        return details !== null && !details.open;
      };
      const overflowers: string[] = [];
      for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (inClosedDetails(el)) continue;
        if (!el.offsetParent && style.position !== "fixed") continue;
        if (inHorizontalScroller(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > vw + 1 || rect.left < -1) {
          overflowers.push(
            `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").join(".")}` : ""} at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
          );
        }
      }
      return { documentWidth: document.documentElement.scrollWidth, overflowers };
    });
  }

  async function expectFits(page: Page, what: string, width: number): Promise<void> {
    const result = await audit(page);
    expect(result.overflowers, `${what} at ${width}px has off-viewport elements`).toEqual([]);
    expect(result.documentWidth, `${what} at ${width}px widens the document`).toBeLessThanOrEqual(
      width + 1,
    );
  }

  /** Renders a mounted tab at one width and audits it. */
  async function auditTab(
    label: string,
    tab: "now" | "runs" | "plan",
    width: number,
    overrides: Record<string, unknown> = {},
  ): Promise<void> {
    const wrapper = await mountChecks(tab, overrides);
    const markup = wrapper.html();
    const page = await openFixturePage(label, markup, scopedStyles(markup), width);
    await expectFits(page, `${label} (${tab})`, width);
    await page.close();
    wrapper.unmount();
  }

  /* ── 1. Check plan: long names, missing prerequisite, skip, failed run ─── */

  it.each(VIEWPORTS)("check plan fits at %spx with long step data", async (width) => {
    await auditTab("plan-long-data", "plan", width);
  });

  /* ── 2. Now: running check, wedged slot with a long machine, queue ─────── */

  it.each(VIEWPORTS)("now tab fits at %spx with a wedged slot and live run", async (width) => {
    await auditTab("now-live", "now", width);
  });

  /* ── 3. Runs (history): long machine, failure with long test names ─────── */

  it.each(VIEWPORTS)("run history fits at %spx with long failure details", async (width) => {
    await auditTab("runs-history", "runs", width);
  });

  /* ── 4. Empty and error states must say what happened ──────────────────── */

  it("a failed plan load says so, with a retry, and never a blank plan", async () => {
    const wrapper = await mountChecks("plan", { "/api/check-plan": "fail" });
    expect(wrapper.find('[role="alert"]').text()).toContain("The server could not answer.");
    expect(wrapper.find(".ck-steps").exists()).toBe(false);
    const retry = wrapper.findAll("button").find((b) => b.text() === "Try again");
    expect(retry, "failed plan load offers a retry").toBeDefined();
    wrapper.unmount();
  });

  it("a failed slot load is not reported as 'no slots in use'", async () => {
    const wrapper = await mountChecks("now", { "/api/local-check-slots": "fail" });
    const text = wrapper.text();
    expect(text).toContain("Could not load local check slots");
    expect(text).not.toContain("No local check slots are currently in use");
    wrapper.unmount();
  });

  it("a failed history load with no runs does not claim there are no runs", async () => {
    const wrapper = await mountChecks("runs", { "/api/check-runs?limit=300": "fail" });
    const text = wrapper.text();
    expect(text).toContain("The server could not answer.");
    expect(text).not.toContain("No recorded runs yet");
    wrapper.unmount();
  });

  it("an empty history says so, with the way to get a run", async () => {
    const wrapper = await mountChecks("runs", {
      "/api/check-runs?limit=300": { ok: true, runs: [] },
    });
    expect(wrapper.text()).toContain("No recorded runs yet");
    wrapper.unmount();
  });

  /* ── 5. Status colours survive the panel's paragraph rule ──────────────── */

  it.each(VIEWPORTS)(
    "slot errors and notices keep red and green at %spx (computed style)",
    async (width) => {
      const wrapper = await mountChecks("now", { "/api/local-check-slots": "fail" });
      const markup = wrapper.html();
      const page = await openFixturePage("now-slot-error", markup, scopedStyles(markup), width);
      // Compare against resolved token swatches, not hex literals, so a theme
      // change cannot make the assertion lie. Probes copy the component's scope
      // attribute so the scoped rules apply to them as they do in the page.
      const colours = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>(".ck-local-slots")!;
        const alert = panel.querySelector<HTMLElement>('[role="alert"]')!;
        const token = (value: string) => {
          const swatch = document.createElement("span");
          swatch.style.color = `var(${value})`;
          document.body.append(swatch);
          const resolved = getComputedStyle(swatch).color;
          swatch.remove();
          return resolved;
        };
        const notice = document.createElement("p");
        notice.className = "ck-slot-notice";
        for (const attr of alert.getAttributeNames()) {
          if (attr.startsWith("data-v-")) notice.setAttribute(attr, "");
        }
        panel.append(notice);
        const noticeColour = getComputedStyle(notice).color;
        notice.remove();
        return {
          alert: getComputedStyle(alert).color,
          red: token("--red"),
          notice: noticeColour,
          green: token("--green"),
        };
      });
      expect(colours.alert, `slot load error is not red at ${width}px`).toBe(colours.red);
      expect(colours.notice, `slot notice is not green at ${width}px`).toBe(colours.green);
      await page.close();
      wrapper.unmount();
    },
  );
});
