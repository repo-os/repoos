/**
 * Component tests for ModelProvidersPanel.vue (0327): the four provider rows
 * must render with the right affordances — dashboard link-outs for the two
 * no-API providers, an inline key form for live providers without a saved
 * key, and live figures for the ones with — and the key save/clear flow must
 * hit the right endpoints and never put key material into the DOM.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ModelProvidersPanel from "../src/components/ModelProvidersPanel.vue";
import type { ModelProvidersResponse } from "../src/types";

function providersFixture(over: Partial<ModelProvidersResponse["providers"][number]>[] = []) {
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
      kind: "link",
      dashboardUrl: "https://deepinfra.com/dash/billing",
      note: "No public billing/usage API.",
      hasKey: false,
    },
  ];
  for (const [i, o] of over.entries()) base[i] = { ...base[i], ...o };
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
  it("renders all four rows; link rows get a dashboard link and no key form", async () => {
    stubFetch([providersRoute(providersFixture())]);
    const wrapper = mount(ModelProvidersPanel);
    await flushPromises();
    await nextTick();

    const rows = wrapper.findAll(".mp-row");
    expect(rows).toHaveLength(4);
    expect(rows[0].find(".agent-name").text()).toBe("OpenRouter");
    expect(rows[0].find(".pill-live").exists()).toBe(true);

    for (const i of [2, 3]) {
      const link = rows[i].find(".mp-dash-link");
      expect(link.exists()).toBe(true);
      expect(link.attributes("href")).toMatch(/^https:\/\//);
      expect(link.attributes("rel")).toContain("noopener");
      expect((rows[i].element as HTMLElement).textContent).toContain("Open dashboard ↗");
      expect(rows[i].find(".mp-key-form").exists()).toBe(false);
      expect(rows[i].find(".pill-link").text()).toBe("dashboard only");
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
