/**
 * Component tests for ModelProvidersPanel.vue (0327): provider rows must
 * render with the right affordances — dashboard link-outs for providers with
 * no public individual usage API, and
 * no-API providers, an inline key form for live providers without a saved
 * key, and live figures for the ones with — and the key save/clear flow must
 * hit the right endpoints and never put key material into the DOM.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ModelProvidersPanel from "../src/components/ModelProvidersPanel.vue";
import type { ModelProvidersResponse } from "../src/types";

function providersFixture(
  over: (Partial<ModelProvidersResponse["providers"][number]> | undefined)[] = [],
) {
  const base: ModelProvidersResponse["providers"] = [
    {
      id: "openrouter",
      label: "OpenRouter",
      kind: "live",
      dashboardUrl: "https://openrouter.ai/credits",
      note: "Credit balance, daily/weekly/monthly spend and rate limits.",
      hasKey: false,
    },
    {
      id: "opencode-go",
      label: "opencode Go",
      kind: "live",
      dashboardUrl: "https://opencode.ai/auth",
      note: "Rolling usage windows. No dollar balance exists.",
      hasKey: false,
    },
    {
      id: "cursor",
      label: "Cursor",
      kind: "link",
      dashboardUrl: "https://cursor.com/dashboard/spending",
      note: "Usage and allowance live in Cursor’s Spending dashboard.",
      hasKey: false,
    },
    {
      id: "opencode-zen",
      label: "opencode Zen",
      kind: "link",
      dashboardUrl: "https://opencode.ai/auth",
      note: "No public balance API yet.",
      hasKey: false,
    },
    {
      id: "deepinfra",
      label: "DeepInfra",
      kind: "live",
      dashboardUrl: "https://deepinfra.com/dash/billing",
      note: "Credit balance, spending limit and monthly spend.",
      hasKey: false,
    },
    {
      id: "claude-code",
      label: "Claude Code",
      kind: "link",
      dashboardUrl: "https://claude.ai/settings/usage",
      note: "Subscription usage lives in Claude.",
      hasKey: false,
    },
    {
      id: "qwen-code",
      label: "Qwen Code",
      kind: "link",
      dashboardUrl: "https://chat.qwen.ai/",
      note: "Account details live in Qwen.",
      hasKey: false,
    },
    {
      id: "codex",
      label: "Codex",
      kind: "link",
      dashboardUrl: "https://chatgpt.com/codex/settings",
      note: "Account details live in ChatGPT.",
      hasKey: false,
    },
    {
      id: "github-copilot",
      label: "GitHub Copilot",
      kind: "live",
      dashboardUrl: "https://github.com/settings/copilot",
      note: "AI-credit usage billed to the account this period.",
      hasKey: false,
      scope: "",
    },
    {
      id: "antigravity",
      label: "Antigravity",
      kind: "link",
      dashboardUrl: "https://antigravity.google/",
      note: "Account details live in Antigravity.",
      hasKey: false,
    },
    {
      id: "kiro",
      label: "Kiro",
      kind: "link",
      dashboardUrl: "https://app.kiro.dev/account",
      note: "Account details live in Kiro.",
      hasKey: false,
    },
  ];
  for (const [i, o] of over.entries()) {
    // Holes (sparse entries) leave the base row untouched.
    if (o) base[i] = { ...base[i], ...o };
  }
  return base;
}

interface StubRoute {
  match: (url: string, opts?: RequestInit) => boolean;
  status?: number;
  body: unknown;
  /** Record the request for assertions. */
  calls?: { url: string; opts?: RequestInit }[];
}

function stubFetch(routes: StubRoute[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string, opts?: RequestInit) => {
    const hit = routes.find((r) => r.match(String(url), opts));
    if (!hit) throw new Error(`unexpected fetch ${String(url)}`);
    hit.calls?.push({ url: String(url), opts });
    return {
      ok: (hit.status ?? 200) < 400,
      status: hit.status ?? 200,
      headers: { get: () => "application/json" },
      json: async () => hit.body,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const providersRoute = (providers: ModelProvidersResponse["providers"]): StubRoute => ({
  match: (url) =>
    url.includes("/api/model-providers") && !url.includes("/usage") && !url.includes("/key"),
  body: { providers, at: new Date().toISOString() },
});

const openrouterUsageRoute = (body: unknown, status = 200): StubRoute => ({
  match: (url) => url.includes("/api/model-providers/openrouter/usage"),
  status,
  body,
  calls: [],
});

const goUsageRoute = (body: unknown): StubRoute => ({
  match: (url) => url.includes("/api/model-providers/opencode-go/usage"),
  body,
  calls: [],
});

const keyRoute = (status: number, body: unknown): StubRoute => ({
  match: (url) => url.includes("/key"),
  status,
  body,
  calls: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ModelProvidersPanel — row rendering", () => {
  it("renders all integrated provider rows; link rows get a dashboard link and no key form", async () => {
    stubFetch([providersRoute(providersFixture())]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const rows = wrapper.findAll(".mp-row");
    expect(rows).toHaveLength(11);
    expect(rows[0].find(".agent-name").text()).toBe("OpenRouter");
    expect(rows[0].find(".pill-live").exists()).toBe(true);
    for (const i of [1, 4, 8]) {
      expect(rows[i].find(".pill-live").exists()).toBe(true);
      expect(rows[i].find(".mp-key-form").exists()).toBe(true);
    }

    for (const i of [2, 3, 5, 6, 7, 9, 10]) {
      const link = rows[i].find(".mp-dash-link");
      expect(link.exists()).toBe(true);
      expect(link.attributes("href")).toMatch(/^https:\/\//);
      expect(link.attributes("rel")).toContain("noopener");
      expect((rows[i].element as HTMLElement).textContent).toContain("Open dashboard ↗");
      expect(rows[i].find(".mp-key-form").exists()).toBe(false);
      expect(rows[i].find(".pill-link").text()).toBe("no live data");
    }
  });

  it("live rows without a key show the inline paste form with a password input", async () => {
    stubFetch([providersRoute(providersFixture())]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const rows = wrapper.findAll(".mp-row");
    const form = rows[0].find(".mp-key-form");
    expect(form.exists()).toBe(true);
    expect(form.find("input[type=password]").exists()).toBe(true);
    expect(form.text()).toContain(".env");
    // And a live row WITH a key skips the form.
    wrapper.unmount();
    stubFetch([
      providersRoute(providersFixture([{ hasKey: true }, { hasKey: true }])),
      openrouterUsageRoute({
        kind: "openrouter",
        credits: { totalCredits: 100.5, totalUsage: 26.25, remaining: 74.25 },
        creditsError: null,
        key: {
          label: "k",
          usageDaily: 1,
          usageWeekly: 2,
          usageMonthly: 3,
          limit: null,
          limitRemaining: null,
          rateLimit: null,
        },
        keyError: null,
      }),
      goUsageRoute({ kind: "opencode-go", windows: [], unrecognized: true }),
    ]);
    const withKeys = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();
    expect(withKeys.findAll(".mp-row")[0].find(".mp-key-form").exists()).toBe(false);
  });
});

describe("ModelProvidersPanel — key flow", () => {
  it("saving a key posts it, updates the row state, and fetches usage", async () => {
    const key = keyRoute(200, { ok: true, hasKey: true });
    const usage = openrouterUsageRoute({
      kind: "openrouter",
      credits: { totalCredits: 10, totalUsage: 4, remaining: 6 },
      creditsError: null,
      key: null,
      keyError: null,
    });
    stubFetch([providersRoute(providersFixture()), key, usage]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const input = wrapper.findAll(".mp-row")[0].find(".mp-key-form input[type=password]");
    await input.setValue("sk-or-v1-pasted");
    await wrapper.findAll(".mp-row")[0].find(".mp-key-form button").trigger("click");
    await flushPromises();
    await nextTick();

    expect(key.calls).toHaveLength(1);
    const saved = JSON.parse(key.calls![0].opts!.body as string);
    expect(saved).toEqual({ key: "sk-or-v1-pasted" });
    expect(usage.calls).toHaveLength(1);
    expect(wrapper.findAll(".mp-row")[0].text()).toContain("$6.00");
    // The draft is cleared and the form is gone.
    expect(wrapper.findAll(".mp-row")[0].find(".mp-key-form").exists()).toBe(false);
  });

  it("a failed save shows the error and keeps the form open", async () => {
    const key = keyRoute(400, {
      error: "Could not save the key: Secret value must not contain newlines",
    });
    stubFetch([providersRoute(providersFixture()), key]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    await wrapper.findAll(".mp-row")[0].find(".mp-key-form input[type=password]").setValue("bad");
    await wrapper.findAll(".mp-row")[0].find(".mp-key-form button").trigger("click");
    await flushPromises();
    await nextTick();

    expect(key.calls).toHaveLength(1);
    expect(wrapper.findAll(".mp-row")[0].text()).toContain(
      "Secret value must not contain newlines",
    );
    expect(wrapper.findAll(".mp-row")[0].find(".mp-key-form").exists()).toBe(true);
  });

  it("clear posts an empty key and returns the row to the form state", async () => {
    const key = keyRoute(200, { ok: true, hasKey: false });
    stubFetch([
      providersRoute(providersFixture([{ hasKey: true }])),
      key,
      openrouterUsageRoute({
        kind: "openrouter",
        credits: null,
        creditsError: "Only management keys can perform this operation",
        key: {
          label: null,
          usageDaily: null,
          usageWeekly: null,
          usageMonthly: null,
          limit: null,
          limitRemaining: null,
          rateLimit: null,
        },
        keyError: null,
      }),
    ]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const row = wrapper.findAll(".mp-row")[0];
    const clearBtn = row.findAll("button").find((b) => b.text() === "Clear");
    expect(clearBtn).toBeTruthy();
    await clearBtn!.trigger("click");
    await flushPromises();
    await nextTick();

    const saved = JSON.parse(key.calls![0].opts!.body as string);
    expect(saved).toEqual({ key: "" });
    expect(wrapper.findAll(".mp-row")[0].find(".mp-key-form").exists()).toBe(true);
  });
});

describe("ModelProvidersPanel — live data rendering", () => {
  it("renders OpenRouter credits, spend stats and a per-part error when balance is refused", async () => {
    stubFetch([
      providersRoute(providersFixture([{ hasKey: true }])),
      openrouterUsageRoute({
        kind: "openrouter",
        credits: null,
        creditsError: "Only management keys can perform this operation",
        key: {
          label: "main",
          usageDaily: 0.5,
          usageWeekly: 3,
          usageMonthly: 9.5,
          limit: 20,
          limitRemaining: 10.5,
          rateLimit: { requests: 1000, interval: "1h" },
        },
        keyError: null,
      }),
      goUsageRoute({ kind: "opencode-go", windows: [], unrecognized: true }),
    ]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const row = wrapper.findAll(".mp-row")[0];
    expect(row.text()).toContain("Balance unavailable: Only management keys");
    expect(row.text()).toContain("$0.50");
    expect(row.text()).toContain("$3.00");
    expect(row.text()).toContain("$9.50");
    expect(row.text()).toContain("1000 req / 1h");
  });

  it("renders opencode Go usage windows with percent bars", async () => {
    stubFetch([
      providersRoute(providersFixture([undefined as never, { hasKey: true }])),
      openrouterUsageRoute({
        kind: "openrouter",
        credits: null,
        creditsError: null,
        key: null,
        keyError: null,
      }),
      goUsageRoute({
        kind: "opencode-go",
        windows: [
          {
            id: "five_hour",
            label: "5-hour window",
            usedPct: 26.7,
            usedUsd: 3.2,
            limitUsd: 12,
            resetsAt: null,
          },
          {
            id: "weekly",
            label: "Weekly window",
            usedPct: 55,
            usedUsd: 16.5,
            limitUsd: 30,
            resetsAt: null,
          },
        ],
        unrecognized: false,
      }),
    ]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const row = wrapper.findAll(".mp-row")[1];
    const bars = row.findAll(".mp-bar");
    expect(bars).toHaveLength(2);
    expect(bars[0].find(".mp-bar-fill").attributes("style")).toContain("26.7%");
    expect(row.text()).toContain("27% used");
    expect(row.text()).toContain("$3.20 of $12.00");
    expect(row.text()).toContain("$16.50 of $30.00");
  });

  it("shows a retryable error when the usage fetch fails", async () => {
    stubFetch([
      providersRoute(providersFixture([{ hasKey: true }])),
      openrouterUsageRoute({ error: "OpenRouter rejected the API key (401)" }, 502),
      goUsageRoute({ kind: "opencode-go", windows: [], unrecognized: true }),
    ]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const row = wrapper.findAll(".mp-row")[0];
    expect(row.text()).toContain("OpenRouter rejected the API key (401)");
    expect(row.find(".mp-retry").exists()).toBe(true);
  });
});

const deepinfraUsageRoute = (body: unknown): StubRoute => ({
  match: (url) => url.includes("/api/model-providers/deepinfra/usage"),
  body,
  calls: [],
});

const copilotUsageRoute = (body: unknown): StubRoute => ({
  match: (url) => url.includes("/api/model-providers/github-copilot/usage"),
  body,
  calls: [],
});

describe("ModelProvidersPanel — DeepInfra live data (#0625)", () => {
  it("renders the sign-corrected balance, owed amount, limit and monthly spend", async () => {
    stubFetch([
      providersRoute(providersFixture([{ hasKey: true }, , , , { hasKey: true }])),
      openrouterUsageRoute({
        kind: "openrouter",
        credits: null,
        creditsError: null,
        key: null,
        keyError: null,
      }),
      goUsageRoute({ kind: "opencode-go", windows: [], unrecognized: true }),
      deepinfraUsageRoute({
        kind: "deepinfra",
        checklist: {
          availableUsd: 12.5,
          owedUsd: null,
          recentUsd: 3.25,
          limitUsd: 100,
          suspended: false,
          suspendReason: null,
          scopedCredits: [
            { name: "Llama launch", grantedUsd: 10, remainingUsd: 2.5, expired: false },
          ],
        },
        checklistError: null,
        usage: [
          { period: "2026.10", totalUsd: 4.5 },
          { period: "2026.09", totalUsd: 12 },
        ],
        usageError: null,
      }),
    ]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const row = wrapper.findAll(".mp-row")[4];
    expect(row.text()).toContain("Available credit");
    expect(row.text()).toContain("$12.50");
    expect(row.text()).toContain("Since last invoice");
    expect(row.text()).toContain("$3.25");
    expect(row.text()).toContain("Spending limit");
    expect(row.text()).toContain("Oct 2026");
    expect(row.text()).toContain("$4.50");
    expect(row.text()).toContain("$12.00");
    expect(row.text()).toContain("Llama launch");
  });

  it("shows an owed amount instead of balance when stripe_balance is positive", async () => {
    stubFetch([
      providersRoute(providersFixture([{ hasKey: true }, , , , { hasKey: true }])),
      openrouterUsageRoute({
        kind: "openrouter",
        credits: null,
        creditsError: null,
        key: null,
        keyError: null,
      }),
      goUsageRoute({ kind: "opencode-go", windows: [], unrecognized: true }),
      deepinfraUsageRoute({
        kind: "deepinfra",
        checklist: {
          availableUsd: null,
          owedUsd: 7.5,
          recentUsd: 0,
          limitUsd: null,
          suspended: true,
          suspendReason: "balance",
          scopedCredits: [],
        },
        checklistError: null,
        usage: null,
        usageError: null,
      }),
    ]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const row = wrapper.findAll(".mp-row")[4];
    expect(row.text()).toContain("Account suspended (balance).");
    expect(row.text()).toContain("plus $7.50 owed");
  });

  it("keeps the usage half when the checklist is refused, with per-part errors", async () => {
    stubFetch([
      providersRoute(providersFixture([{ hasKey: true }, , , , { hasKey: true }])),
      openrouterUsageRoute({
        kind: "openrouter",
        credits: null,
        creditsError: null,
        key: null,
        keyError: null,
      }),
      goUsageRoute({ kind: "opencode-go", windows: [], unrecognized: true }),
      deepinfraUsageRoute({
        kind: "deepinfra",
        checklist: null,
        checklistError: "DeepInfra rejected the API key.",
        usage: null,
        usageError: "DeepInfra API returned 500",
      }),
    ]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const row = wrapper.findAll(".mp-row")[4];
    expect(row.text()).toContain("Balance unavailable: DeepInfra rejected the API key.");
    expect(row.text()).toContain("Usage unavailable: DeepInfra API returned 500");
  });
});

describe("ModelProvidersPanel — GitHub Copilot live data (#0625)", () => {
  it("renders billed usage with the scope label and the not-remaining-quota note", async () => {
    stubFetch([
      providersRoute(providersFixture([{ hasKey: true }, , , , , , , , { hasKey: true }])),
      openrouterUsageRoute({
        kind: "openrouter",
        credits: null,
        creditsError: null,
        key: null,
        keyError: null,
      }),
      goUsageRoute({ kind: "opencode-go", windows: [], unrecognized: true }),
      copilotUsageRoute({
        kind: "github-copilot",
        scope: { kind: "personal", slug: null },
        periodLabel: "October 2026",
        user: "monalisa",
        rows: [
          {
            product: "Copilot AI Credits",
            sku: "AI Credit",
            model: "GPT-5",
            unitType: "ai-credits",
            includedQuantity: 40,
            billedQuantity: 60,
            discountAmount: 0.4,
            netAmount: 0.6,
          },
        ],
        unrecognized: false,
      }),
    ]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const row = wrapper.findAll(".mp-row")[8];
    expect(row.text()).toContain("Billed October 2026 · personal plan");
    expect(row.text()).toContain("$0.60");
    expect(row.text()).toContain("not remaining quota");
    expect(row.text()).toContain("60 ai-credits billed");
    expect(row.text()).toContain("+ 40 included");
    expect(row.text()).toContain("AI Credit · GPT-5");
  });

  it("labels a centrally billed scope and the key form pre-fills the stored scope", async () => {
    stubFetch([
      providersRoute([
        ...providersFixture([{ hasKey: true }]).slice(0, 8),
        { ...providersFixture()[8], hasKey: true, scope: "org:acme" },
      ]),
      openrouterUsageRoute({
        kind: "openrouter",
        credits: null,
        creditsError: null,
        key: null,
        keyError: null,
      }),
      goUsageRoute({ kind: "opencode-go", windows: [], unrecognized: true }),
      copilotUsageRoute({
        kind: "github-copilot",
        scope: { kind: "org", slug: "acme" },
        periodLabel: "October 2026",
        user: null,
        rows: [],
        unrecognized: false,
      }),
    ]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const row = wrapper.findAll(".mp-row")[8];
    expect(row.text()).toContain("org acme");
    expect(row.text()).toContain("No Copilot usage billed to this account");
    // Replace key shows the form with the scope pre-filled from the row.
    const replace = row.findAll("button").find((b) => b.text() === "Replace key");
    await replace!.trigger("click");
    await nextTick();
    const scopeInput = row.findAll(".mp-key-form input[type=text]").at(-1)!;
    expect((scopeInput.element as HTMLInputElement).value).toBe("org:acme");
    expect(row.text()).toContain("classic");
  });

  it("sends the scope alongside the key when saving the Copilot row", async () => {
    const key = keyRoute(200, { ok: true, hasKey: true, scope: "org:acme" });
    stubFetch([
      providersRoute(providersFixture()),
      key,
      copilotUsageRoute({
        kind: "github-copilot",
        scope: { kind: "org", slug: "acme" },
        periodLabel: "October 2026",
        user: null,
        rows: [],
        unrecognized: false,
      }),
    ]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const row = wrapper.findAll(".mp-row")[8];
    await row.find(".mp-key-form input[type=password]").setValue("ghp-pasted");
    const scopeInput = row.findAll(".mp-key-form input[type=text]").at(-1)!;
    await scopeInput.setValue("org:acme");
    await row.find(".mp-key-form button").trigger("click");
    await flushPromises();
    await nextTick();

    expect(key.calls).toHaveLength(1);
    expect(JSON.parse(key.calls![0].opts!.body as string)).toEqual({
      key: "ghp-pasted",
      scope: "org:acme",
    });
    expect(wrapper.findAll(".mp-row")[8].find(".mp-key-form").exists()).toBe(false);
  });

  it("keeps the unrecognized-shape error pointing at the dashboard", async () => {
    stubFetch([
      providersRoute(providersFixture([{ hasKey: true }, , , , , , , , { hasKey: true }])),
      openrouterUsageRoute({
        kind: "openrouter",
        credits: null,
        creditsError: null,
        key: null,
        keyError: null,
      }),
      goUsageRoute({ kind: "opencode-go", windows: [], unrecognized: true }),
      copilotUsageRoute({
        kind: "github-copilot",
        scope: { kind: "personal", slug: null },
        periodLabel: "this period",
        user: null,
        rows: [],
        unrecognized: true,
      }),
    ]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const row = wrapper.findAll(".mp-row")[8];
    expect(row.text()).toContain("format this build doesn't recognize");
    expect(row.find(".mp-part-error a").attributes("href")).toBe(
      "https://github.com/settings/copilot",
    );
  });
});
