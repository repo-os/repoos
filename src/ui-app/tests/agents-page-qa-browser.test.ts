// @vitest-environment jsdom
/**
 * #1223 — QA pass: Agents page at 375/768/1280px. Covers the agent list, the
 * Model providers tab (missing key, provider failure) and the Model routing
 * tab (missing key, provider failure, recent decisions) against fixtures
 * only: the real components are mounted in jsdom, their markup plus the real
 * built global stylesheet and compiled scoped styles are rendered in
 * headless WebKit, and every visible element must stay inside the viewport.
 * Key fields stay masked (`type="password"`; status pills read Saved / Not
 * set — never a key value).
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per fixture and width.
 */
import { resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import AgentsView from "../src/views/AgentsView.vue";
import ModelProvidersPanel from "../src/components/ModelProvidersPanel.vue";
import ModelRoutingPanel from "../src/components/ModelRoutingPanel.vue";
import { useConfigStore } from "../src/stores/config";
import { FakeEventSource, json } from "./component-test-helpers";
import type {
  ModelProvidersResponse,
  ModelRoutingStatusResponse,
  RoutingDecisionView,
} from "../src/types.js";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/* ── Shared WebKit harness ──────────────────────────────────────────────── */

describe("Agents page QA at 375/768/1280 (WebKit, fixtures)", () => {
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

  /** Compiled scoped CSS for one component, with the scope id its markup carries. */
  function scopedCss(markup: string, markerClass: string, component: string): string {
    const source = readFileSync(resolve(uiRoot, `src/components/${component}.vue`), "utf8");
    const parsed = parse(source, { filename: component });
    const style = parsed.descriptor.styles[0]?.content ?? "";
    const marker = markup.indexOf(markerClass);
    if (marker < 0) throw new Error(`${component} markup is missing .${markerClass}`);
    const tagStart = markup.lastIndexOf("<", marker);
    const tag = markup.slice(tagStart, markup.indexOf(">", marker));
    const scopeId = tag.match(/data-v-[a-f0-9]+/)?.[0];
    if (!scopeId) throw new Error(`${component} scope ID was not present on .${markerClass}`);
    const compiled = compileStyle({ filename: component, id: scopeId, source: style });
    if (compiled.errors.length) throw compiled.errors[0]!;
    return compiled.code;
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
      await page.screenshot({
        path: resolve(shots, `${label}-${width}.png`),
        fullPage: true,
      });
    }
    return page;
  }

  /** Every visible element must sit inside the viewport, except content that
   *  a horizontal scroller legitimately clips or a closed <details> hides. */
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

  /** First matching element's text (Playwright's expect matchers are not
   *  registered in this repo's vitest setup, so text assertions are manual). */
  async function textOf(page: Page, selector: string): Promise<string> {
    return (await page.locator(selector).first().textContent()) ?? "";
  }

  async function expectFits(page: Page, what: string, width: number): Promise<void> {
    const result = await audit(page);
    expect(result.overflowers, `${what} at ${width}px has off-viewport elements`).toEqual([]);
    expect(result.documentWidth, `${what} at ${width}px widens the document`).toBeLessThanOrEqual(
      width + 1,
    );
  }

  /* ── 1. Agent list (default tab) ───────────────────────────────────────── */

  it.each(VIEWPORTS)(
    "agent list fits at %spx and explains the last failed run in plain English",
    async (width) => {
      vi.stubGlobal("EventSource", FakeEventSource);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/agents/last-runs")) {
            return json({
              agents: [
                {
                  name: "engineer",
                  status: "failed",
                  at: iso(12),
                  taskId: "1201",
                  reason:
                    "Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry.",
                  codingAgent: "codex",
                  model: "gpt-5",
                },
                {
                  name: "reviewer",
                  status: "completed",
                  at: iso(38),
                  taskId: "1198",
                  reason: null,
                  codingAgent: "claude",
                  model: "default",
                },
              ],
            });
          }
          if (url.includes("/api/models")) {
            return json({
              byCli: { codex: { supported: true, models: ["gpt-5"], refreshable: false } },
            });
          }
          if (url.includes("/api/agents/detect")) return json({ agents: [], cachedAt: null });
          return json({});
        }),
      );
      const pinia = createPinia();
      setActivePinia(pinia);
      const config = useConfigStore();
      config.agents = [
        { name: "engineer", cli: "codex", model: "gpt-5", enabled: true },
        { name: "reviewer", cli: "codex", model: "gpt-5", enabled: true },
        { name: "pm", cli: "codex", model: "gpt-5", enabled: false },
      ];
      config.agentsMeta = {
        clis: ["codex"],
        models: ["gpt-5"],
        defaults: config.agents,
        skills: [],
      };
      config.loaded = true;
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: "/", component: { template: "<div />" } },
          { path: "/work", name: "work", component: { template: "<div />" } },
          { path: "/agents", component: { template: "<div />" } },
        ],
      });
      await router.push("/agents");
      await router.isReady();
      const wrapper = mount(AgentsView, {
        attachTo: document.body,
        global: {
          plugins: [pinia, router],
          stubs: {
            teleport: true,
            Transition: true,
            VoiceDictate: true,
            PageSkeleton: true,
            BudgetControlsPanel: true,
            ScheduledTasksPanel: true,
            RemindersPanel: true,
            BuiltInAgentCard: true,
          },
        },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 0));
      const markup = document.body.innerHTML;
      wrapper.unmount();
      document.body.innerHTML = "";

      const page = await openFixturePage("agents-list", markup, "", width);
      try {
        // Open both agents' run details: the plain-English failure text is
        // exactly what the QA pass must find readable at every width.
        for (const agent of ["engineer", "reviewer"]) {
          await page
            .locator(`[data-testid="agent-run-status"][data-agent="${agent}"] summary`)
            .first()
            .click();
        }
        await expectFits(page, "agent list with run details open", width);
        // The failed run is summarised in words next to the agent name.
        const runLabel = await textOf(
          page,
          '[data-testid="agent-run-status"][data-agent="engineer"] .agent-run-label',
        );
        expect(runLabel).toMatch(/failed/i);
        const runReason = await textOf(
          page,
          '[data-testid="agent-run-status"][data-agent="engineer"] .agent-run-reason',
        );
        expect(runReason).toMatch(/quota|rate limit/i);
        // The three role cards are on the default tab.
        expect(await page.locator(".agent-card").count()).toBe(3);
        // #1223: the 44px touch rule (#1139) must not destroy the switch's
        // pill shape — below 720px the root keeps its 44px hit area, with the
        // 40×22 track drawn inside it and the thumb travelling within the
        // track. Above that the pill is its natural size.
        const switches = await page.evaluate(() => {
          const roots = [...document.querySelectorAll<HTMLElement>('.agents-page [role="switch"]')];
          return roots.map((root) => {
            const rect = root.getBoundingClientRect();
            const thumb = (root.firstElementChild as HTMLElement).getBoundingClientRect();
            return {
              state: root.getAttribute("data-state"),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              trackWidth: getComputedStyle(root, "::before").width,
              thumbLeft: Math.round(thumb.left - rect.left),
              thumbRight: Math.round(thumb.right - rect.left),
            };
          });
        });
        expect(switches.length).toBeGreaterThan(0);
        for (const s of switches) {
          if (width < 720) {
            expect(s).toMatchObject({ width: 44, height: 44, trackWidth: "40px" });
          } else {
            expect(s).toMatchObject({ width: 40, height: 22 });
          }
          // The thumb stays inside the pill in both states (root-relative).
          expect(s.thumbLeft).toBeGreaterThanOrEqual(1);
          expect(s.thumbRight).toBeLessThanOrEqual(width < 720 ? 42 : 39);
        }
      } finally {
        await page.close();
      }
    },
  );

  /* ── 2. Model providers tab ────────────────────────────────────────────── */

  function providersFixture(): ModelProvidersResponse["providers"] {
    return [
      {
        id: "openrouter",
        label: "OpenRouter",
        kind: "live",
        dashboardUrl: "https://openrouter.ai/credits",
        note: "Credit balance, daily/weekly/monthly spend and rate limits, live from the OpenRouter API.",
        hasKey: false,
      },
      {
        id: "jev",
        label: "TypeSafe Jev",
        kind: "live",
        dashboardUrl: "https://typesafe.ai/",
        note: "Direct Jev API key for adaptive model routing (System One). No spend API.",
        hasKey: false,
      },
      {
        id: "opencode-go",
        label: "opencode Go",
        kind: "live",
        dashboardUrl: "https://opencode.ai/auth",
        note: "Rolling usage windows (5-hour / weekly / monthly), live from the Go usage API.",
        hasKey: true,
      },
      {
        id: "muse",
        label: "Muse",
        kind: "live",
        dashboardUrl: "https://muse.dev/",
        note: "Reads your muse login session on this machine.",
        hasKey: false,
        usesCliLogin: true,
      },
      {
        id: "deepinfra",
        label: "DeepInfra",
        kind: "live",
        dashboardUrl: "https://deepinfra.com/dash/billing",
        note: "Credit balance, spending limit and monthly spend, live from the DeepInfra billing API.",
        hasKey: true,
      },
      {
        id: "cursor",
        label: "Cursor",
        kind: "link",
        dashboardUrl: "https://cursor.com/dashboard/spending",
        note: "Usage, remaining allowance, reset date, and any on-demand charges live in Cursor's Spending dashboard.",
        hasKey: false,
      },
    ];
  }

  it.each(VIEWPORTS)(
    "model providers tab fits at %spx: missing key, provider failure and usage all readable",
    async (width) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (/\/api\/model-providers\/opencode-go\/usage/.test(url)) {
            return json({
              kind: "opencode-go",
              windows: [
                {
                  id: "five-hour",
                  label: "5-hour window",
                  usedPct: 42,
                  usedUsd: 8.4,
                  limitUsd: 20,
                  resetsAt: iso(-40),
                },
                {
                  id: "weekly",
                  label: "Weekly window",
                  usedPct: 12,
                  usedUsd: 24,
                  limitUsd: 200,
                  resetsAt: iso(-1400),
                },
              ],
              unrecognized: false,
              at: iso(2),
            });
          }
          if (/\/api\/model-providers\/muse\/usage/.test(url)) {
            // Expected empty-row state, not an HTTP failure: the UI must show
            // an actionable message plus Retry.
            return json({
              kind: "muse",
              tier: null,
              windows: [],
              unrecognized: false,
              message: "muse is not signed in on this machine — run `muse login` first.",
              hint: "muse is not signed in on this machine — run `muse login` first.",
              at: iso(1),
            });
          }
          if (/\/api\/model-providers\/deepinfra\/usage/.test(url)) {
            return {
              ok: false,
              status: 502,
              json: async () => ({ error: "DeepInfra request failed: network unreachable" }),
            };
          }
          if (url.includes("/api/model-providers")) {
            return json({ providers: providersFixture(), at: iso(0) });
          }
          return json({});
        }),
      );
      const pinia = createPinia();
      setActivePinia(pinia);
      const wrapper = mount(ModelProvidersPanel, {
        attachTo: document.body,
        global: { plugins: [pinia], stubs: { teleport: true, Transition: true } },
      });
      await flushPromises();
      const markup = document.body.innerHTML;
      const css = scopedCss(markup, "mp-panel", "ModelProvidersPanel");
      wrapper.unmount();
      document.body.innerHTML = "";

      const page = await openFixturePage("model-providers", markup, css, width);
      try {
        await expectFits(page, "model providers tab", width);

        // Missing key: an inline, masked key form — never a visible value.
        const openrouterForm = page.locator(
          '[data-provider-id="openrouter"] .mp-key-form input[type="password"]',
        );
        expect(await openrouterForm.count()).toBe(1);
        expect(await openrouterForm.getAttribute("placeholder")).toBe(
          "Paste your OpenRouter API key",
        );
        // Provider failure without data: the row explains itself and offers Retry.
        const deepinfraErrorText = await textOf(page, '[data-provider-id="deepinfra"] .mp-error');
        expect(deepinfraErrorText).toContain("DeepInfra request failed");
        expect(
          await page.locator('[data-provider-id="deepinfra"] .mp-error .mp-retry').count(),
        ).toBe(1);
        // Provider failure with a message payload (Muse CLI login) also has Retry.
        const museText = await textOf(page, '[data-provider-id="muse"] .mp-part-error');
        expect(museText).toContain("muse login");
        expect(
          await page.locator('[data-provider-id="muse"] .mp-part-error .mp-retry').count(),
        ).toBe(1);
        // A healthy keyed row shows its usage figures and a Refresh action.
        expect(await page.locator('[data-provider-id="opencode-go"] .mp-window').count()).toBe(2);
        const goActions = await textOf(page, '[data-provider-id="opencode-go"] .mp-actions button');
        expect(goActions).toContain("Refresh");
        // #1223: a row with usage data must not also claim "No usage reported
        // yet." — the fallback text is for rows without any windows.
        const goRowText = await page
          .locator('[data-provider-id="opencode-go"]')
          .first()
          .textContent();
        expect(goRowText).not.toContain("No usage reported yet.");
      } finally {
        await page.close();
      }
    },
  );

  /* ── 3–4. Model routing tab ────────────────────────────────────────────── */

  function routingStatus(
    over: Partial<ModelRoutingStatusResponse> = {},
  ): ModelRoutingStatusResponse {
    return {
      effective: {
        mode: "shadow",
        provider: "jev",
        model: "jev-latest",
        baseUrl: null,
        credentialEnv: "TYPESAFE_API_KEY",
        roles: ["engineer", "reviewer", "pm"],
        timeoutMs: 8000,
      },
      keyProviderId: "jev",
      credentialPresent: false,
      credentialLabel: "not_set",
      providerReady: false,
      // The exact wording `modelRoutingStatus` returns for a missing Jev key.
      issues: ["Save your TypeSafe Jev API key below (stored in .env only)."],
      ...over,
    };
  }

  function decisionView(over: Partial<RoutingDecisionView> = {}): RoutingDecisionView {
    return {
      id: "d1",
      at: iso(9),
      taskId: "1201",
      role: "engineer",
      mode: "automatic",
      kind: "selected",
      applied: true,
      selection: { cli: "codex", model: "gpt-5", reasoning: null },
      recommendation: { cli: "codex", model: "gpt-5", reasoning: null },
      actual: { cli: "codex", model: "gpt-5", reasoning: null },
      fallbackReason: null,
      blockReason: null,
      message: null,
      provider: "jev",
      providerModel: "jev-latest",
      providerUsage: { inputTokens: 120, outputTokens: 40 },
      selectionProbability: 0.92,
      evidence: { topProbability: 0.92, threshold: 0.5, confidence: 0.9 },
      brief: "Role: engineer\nTask #1201: rerun the failing checks",
      answers: {
        suitability: {
          id: "suitability",
          type: "choice",
          choice: "codex\u0000gpt-5\u0000",
          confidence: 0.9,
          probabilities: {
            "codex\u0000gpt-5\u0000": 0.92,
            "claude code\u0000default\u0000": 0.08,
          },
        },
      },
      durationMs: 1234,
      ...over,
    };
  }

  function decisionsFixture(): RoutingDecisionView[] {
    return [
      decisionView(),
      decisionView({
        id: "d2",
        at: iso(48),
        taskId: "1198",
        role: "reviewer",
        kind: "fallback",
        applied: false,
        fallbackReason: "provider-failure",
        recommendation: { cli: "codex", model: "gpt-5", reasoning: null },
        actual: { cli: "claude", model: "default", reasoning: null },
        selectionProbability: null,
        providerUsage: null,
        evidence: null,
        answers: {},
        brief: "",
        message: "TypeSafe Jev did not answer within 8000 ms.",
      }),
      decisionView({
        id: "d3",
        at: iso(90),
        taskId: "1196",
        role: "pm",
        kind: "blocked",
        applied: false,
        blockReason: "outside-budget-allowlist",
        message: "The chosen pair is outside the budget allowlist.",
        selectionProbability: null,
        providerUsage: null,
        answers: {},
        brief: "",
      }),
      decisionView({
        id: "d4",
        at: iso(180),
        taskId: null,
        role: "engineer",
        mode: "shadow",
        kind: "selected",
        applied: false,
        selectionProbability: 0.71,
        providerUsage: { inputTokens: 90, outputTokens: 30, costUsd: 0.0021 },
      }),
    ];
  }

  async function mountRoutingPanel(
    status: ModelRoutingStatusResponse,
    decisions: RoutingDecisionView[] | "load-failed",
    beforeCapture?: (wrapper: VueWrapper) => Promise<void>,
  ): Promise<{ markup: string; css: string }> {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/model-routing/status")) return json(status);
        if (url.includes("/api/model-routing/decisions")) {
          if (decisions === "load-failed") throw new TypeError("Failed to fetch");
          return json({ decisions });
        }
        if (url.includes("/api/model-routing/probe")) {
          return json({ ...status, ok: false, live: status.live });
        }
        return json({});
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const config = useConfigStore();
    config.agentsMeta = { clis: [], models: [], defaults: [], skills: [] };
    config.data = {
      "model_routing.mode": status.effective.mode,
      "model_routing.provider": status.effective.provider ?? "jev",
      "model_routing.model": status.effective.model ?? "jev-latest",
      "model_routing.roles": ["engineer", "reviewer", "pm"],
    };
    config.loaded = true;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div />" } },
        { path: "/agents", component: { template: "<div />" } },
      ],
    });
    await router.push("/");
    await router.isReady();
    const wrapper = mount(ModelRoutingPanel, {
      attachTo: document.body,
      global: {
        plugins: [router],
        stubs: { teleport: true },
      },
    });
    await flushPromises();
    if (beforeCapture) await beforeCapture(wrapper);
    const markup = document.body.innerHTML;
    const css = scopedCss(markup, "model-routing-panel", "ModelRoutingPanel");
    wrapper.unmount();
    document.body.innerHTML = "";
    return { markup, css };
  }

  it.each(VIEWPORTS)(
    "model routing tab fits at %spx in the missing-key state, with the key field masked",
    async (width) => {
      const { markup, css } = await mountRoutingPanel(routingStatus(), [], async (wrapper) => {
        // Open the key form: this is the state a user acts from.
        await wrapper.get('[data-testid="routing-key-toggle"]').trigger("click");
        await flushPromises();
      });
      const page = await openFixturePage("routing-missing-key", markup, css, width);
      try {
        await expectFits(page, "routing missing-key state", width);
        // The pill names the state without revealing anything.
        expect(await textOf(page, '[data-testid="routing-credential-status"]')).toContain(
          "Not set",
        );
        expect(await textOf(page, '[data-testid="routing-provider-ready"]')).toContain("Not ready");
        // The issue is explained in plain English, in a visible notice.
        expect(await textOf(page, ".mr-issues")).toContain("Save your TypeSafe Jev API key below");
        // The open key form is a masked password field with a real placeholder.
        const keyInput = page.locator('[data-testid="routing-key-input"]');
        expect(await keyInput.count()).toBe(1);
        expect(await keyInput.getAttribute("type")).toBe("password");
        expect(await keyInput.getAttribute("placeholder")).toBe(
          "Paste API key — stored in .env only",
        );
        // Empty recent decisions still explains itself.
        expect(await textOf(page, ".mr-decisions")).toContain("Nothing recorded yet");
        // #1223: the "Before a task starts" heading must sit above the first
        // checkbox chip, not run into it inline.
        const stacked = await page.evaluate(() => {
          const section = document.querySelectorAll<HTMLElement>(".mr-roles")[1];
          if (!section) return null;
          const label = section.querySelector<HTMLElement>(".field-label")!;
          const chip = section.querySelector<HTMLElement>(".mr-role-chip")!;
          return {
            labelBottom: label.getBoundingClientRect().bottom,
            chipTop: chip.getBoundingClientRect().top,
          };
        });
        expect(stacked && stacked.chipTop >= stacked.labelBottom - 0.5).toBe(true);
        // The four config fields stack their label above the control — the
        // narrow timeout input used to share its label's line.
        const stackedFields = await page.evaluate(() =>
          [...document.querySelectorAll(".mr-grid .field")].map((field) => {
            const label = field.querySelector<HTMLElement>(".field-label")!;
            const control = field.querySelector<HTMLElement>("button, input, [role='combobox']")!;
            return {
              labelBottom: Math.round(label.getBoundingClientRect().bottom),
              controlTop: Math.round(control.getBoundingClientRect().top),
            };
          }),
        );
        expect(stackedFields.length).toBe(4);
        for (const field of stackedFields) {
          expect(field.controlTop).toBeGreaterThanOrEqual(field.labelBottom);
        }
        // On a phone the pasted-key field keeps a whole row, so its
        // placeholder is not truncated beside the Save button.
        if (width <= 480) {
          const keyBox = await keyInput.boundingBox();
          const saveBox = await page.locator('[data-testid="routing-key-save"]').boundingBox();
          expect(keyBox && saveBox && saveBox.y >= keyBox.y + keyBox.height - 1).toBe(true);
        }
      } finally {
        await page.close();
      }
    },
  );

  it.each(VIEWPORTS)(
    "model routing tab fits at %spx: provider failure and recent decisions stay readable",
    async (width) => {
      const { markup, css } = await mountRoutingPanel(
        routingStatus({
          credentialPresent: true,
          credentialLabel: "saved",
          // A saved key clears the missing-key issue; the failure shows in the
          // live-probe card instead.
          issues: [],
          live: {
            ok: false,
            message: "TypeSafe Jev did not answer within 8000 ms.",
            hint: "Check the saved key on the Model providers tab, then run Test live connection again.",
            model: "jev-latest",
            durationMs: 8000,
          },
        }),
        decisionsFixture(),
        async (wrapper) => {
          // Run the live probe so the failure card is captured, then expand
          // the first decision's details.
          await wrapper.get('[data-testid="routing-probe-live"]').trigger("click");
          await flushPromises();
          await wrapper.get('[data-testid="routing-decision-details-toggle"]').trigger("click");
          await flushPromises();
        },
      );
      const page = await openFixturePage("routing-provider-failure", markup, css, width);
      try {
        await expectFits(page, "routing provider-failure state", width);
        // The live failure card speaks plainly and offers the next step.
        expect(await textOf(page, '[data-testid="routing-live-status"]')).toContain("Failed");
        expect(await textOf(page, '[data-testid="routing-live-reason"]')).toContain(
          "did not answer within 8000 ms",
        );
        expect(await textOf(page, '[data-testid="routing-live-hint"]')).toContain(
          "Model providers tab",
        );
        // The fallback decision reads as normal behaviour, not an error.
        expect(
          await page
            .locator('[data-testid="routing-decision-fallback"]')
            .filter({ hasText: "The decision model could not be reached" })
            .count(),
        ).toBe(1);
        // Recent decisions render with their chosen/recommended pairs.
        expect(await page.locator(".mr-decision").count()).toBe(4);
        expect(await textOf(page, ".mr-decision")).toContain("codex · gpt-5");
      } finally {
        await page.close();
      }
    },
  );

  it.each(VIEWPORTS)(
    "model routing tab fits at %spx when recent decisions fail to load, and does not claim none",
    async (width) => {
      const { markup, css } = await mountRoutingPanel(routingStatus(), "load-failed");
      const page = await openFixturePage("routing-decisions-load-failed", markup, css, width);
      try {
        await expectFits(page, "routing decisions load-failed state", width);
        const error = await textOf(page, '[data-testid="routing-decisions-error"]');
        expect(error).toContain("could not be loaded");
        expect(error).toContain("not the same as no decisions yet");
        expect(await page.locator('[data-testid="routing-decisions-retry"]').count()).toBe(1);
        // A failed load must not read as an empty history.
        expect(await textOf(page, ".mr-decisions")).not.toContain("Nothing recorded yet");
      } finally {
        await page.close();
      }
    },
  );
});
