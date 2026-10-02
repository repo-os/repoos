/**
 * Core parsers + fetchers for the Model providers tab (0327).
 *
 * The parsers are pinned against the documented upstream shapes — OpenRouter
 * `GET /credits` + `GET /key` (openrouter.ai/docs/api-reference), and the
 * opencode Go `GET /zen/go/v1/usage` endpoint, which has NO published schema,
 * so the parser is pinned against the plausible window shapes it accepts and
 * — critically — against shapes it must NOT mistake for windows (a bare
 * `{ cost }` object must not become a row).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MODEL_PROVIDERS,
  copilotUsagePath,
  fetchCopilotUsage,
  fetchDeepInfraSpend,
  fetchOpenCodeGoUsage,
  fetchOpenRouterSpend,
  modelProviderById,
  parseCopilotScope,
  parseCopilotUsage,
  parseDeepInfraChecklist,
  parseDeepInfraUsage,
  parseOpenCodeGoUsage,
  parseOpenRouterCredits,
  parseOpenRouterKey,
} from "../../core/providers/spend";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MODEL_PROVIDERS registry", () => {
  it("lists live providers followed by dashboard-only providers", () => {
    expect(MODEL_PROVIDERS.map((p) => p.id)).toEqual([
      "openrouter",
      "opencode-go",
      "cursor",
      "opencode-zen",
      "deepinfra",
      "claude-code",
      "qwen-code",
      "codex",
      "github-copilot",
      "antigravity",
      "kiro",
    ]);
  });

  it("marks the four supported providers live with env vars; the rest as link-outs", () => {
    const openrouter = modelProviderById("openrouter")!;
    expect(openrouter.kind).toBe("live");
    expect(openrouter.envVar).toBe("REPOOS_OPENROUTER_API_KEY");
    const go = modelProviderById("opencode-go")!;
    expect(go.kind).toBe("live");
    expect(go.envVar).toBe("REPOOS_OPENCODE_GO_API_KEY");
    const deepinfra = modelProviderById("deepinfra")!;
    expect(deepinfra.kind).toBe("live");
    expect(deepinfra.envVar).toBe("REPOOS_DEEPINFRA_API_KEY");
    const copilot = modelProviderById("github-copilot")!;
    expect(copilot.kind).toBe("live");
    expect(copilot.envVar).toBe("REPOOS_GITHUB_COPILOT_TOKEN");
    expect(copilot.scopeEnvVar).toBe("REPOOS_GITHUB_COPILOT_SCOPE");
    for (const id of [
      "cursor",
      "opencode-zen",
      "claude-code",
      "qwen-code",
      "codex",
      "antigravity",
      "kiro",
    ]) {
      const row = modelProviderById(id)!;
      expect(row.kind).toBe("link");
      expect(row.envVar).toBeNull();
      expect(row.dashboardUrl).toMatch(/^https:\/\//);
    }
  });
});

describe("parseDeepInfraChecklist", () => {
  it("flips the sign: a negative stripe_balance is credit ready to spend", () => {
    const parsed = parseDeepInfraChecklist({
      stripe_balance: -12.34,
      recent: 3.2,
      limit: 50,
      suspended: false,
    });
    expect(parsed.availableUsd).toBe(12.34);
    expect(parsed.owedUsd).toBeNull();
    expect(parsed.recentUsd).toBe(3.2);
    expect(parsed.limitUsd).toBe(50);
  });

  it("treats a positive stripe_balance as money owed, never as balance", () => {
    const parsed = parseDeepInfraChecklist({
      stripe_balance: 7.5,
      recent: 0,
      limit: null,
      suspended: false,
    });
    expect(parsed.availableUsd).toBeNull();
    expect(parsed.owedUsd).toBe(7.5);
  });

  it("converts scoped credits from cents to dollars and passes the suspend reason", () => {
    const parsed = parseDeepInfraChecklist({
      stripe_balance: 0,
      recent: 0,
      limit: null,
      suspended: true,
      suspend_reason: "balance",
      scoped_credits: [
        { name: "Llama launch", granted_cents: 1000, remaining_cents: 250, expired: false },
        { name: "Old promo", granted_cents: 500, remaining_cents: 500, expired: true },
      ],
    });
    expect(parsed.suspendReason).toBe("balance");
    expect(parsed.scopedCredits).toHaveLength(2);
    expect(parsed.scopedCredits[0]).toEqual({
      name: "Llama launch",
      grantedUsd: 10,
      remainingUsd: 2.5,
      expired: false,
    });
    expect(parsed.scopedCredits[1].expired).toBe(true);
  });
});

describe("parseDeepInfraUsage", () => {
  it("converts total_cost from cents to dollars and keeps the period", () => {
    const parsed = parseDeepInfraUsage({
      months: [
        { period: "2026.10", total_cost: 1250 },
        { period: "2026.09", total_cost: 400 },
      ],
    });
    expect(parsed.unrecognized).toBe(false);
    expect(parsed.months).toEqual([
      { period: "2026.10", totalUsd: 12.5 },
      { period: "2026.09", totalUsd: 4 },
    ]);
  });

  it("reports unrecognized when months is missing, and tolerates null costs", () => {
    expect(parseDeepInfraUsage({ months: "nope" })).toEqual({ months: [], unrecognized: true });
    const parsed = parseDeepInfraUsage({ months: [{ period: "2026.10" }] });
    expect(parsed.months).toEqual([{ period: "2026.10", totalUsd: null }]);
  });
});

describe("fetchDeepInfraSpend", () => {
  function stubFetch(
    routes: Record<string, { status?: number; body: unknown }>,
  ): ReturnType<typeof vi.fn> {
    const fn = vi.fn(async (url: string) => {
      const path = String(url).replace("https://api.deepinfra.com/v1", "").split("?")[0];
      const hit = routes[path];
      if (!hit) throw new Error(`unexpected URL ${url}`);
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

  it("fetches checklist and a two-month usage range with the bearer key", async () => {
    const fn = stubFetch({
      "/payment/checklist": { body: { stripe_balance: -20, recent: 5, limit: 100 } },
      "/payment/usage": {
        body: { months: [{ period: "2026.10", total_cost: 500 }], initial_month: "2025.01" },
      },
    });
    const spend = await fetchDeepInfraSpend("di-key");
    expect(spend.checklist?.availableUsd).toBe(20);
    expect(spend.usage?.[0].totalUsd).toBe(5);
    const calls = fn.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(2);
    expect(calls[1][0]).toMatch(
      /^https:\/\/api\.deepinfra\.com\/v1\/payment\/usage\?from=\d{4}\.\d{2}&to=\d{4}\.\d{2}$/,
    );
    for (const [, opts] of calls) {
      expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer di-key");
    }
  });

  it("isolates a checklist refusal: usage still renders", async () => {
    stubFetch({
      "/payment/checklist": { status: 401, body: { detail: "Unauthorized" } },
      "/payment/usage": { body: { months: [{ period: "2026.10", total_cost: 100 }] } },
    });
    const spend = await fetchDeepInfraSpend("di-key");
    expect(spend.checklist).toBeNull();
    expect(spend.checklistError).toBeTruthy();
    expect(spend.usage?.[0].totalUsd).toBe(1);
    expect(spend.usageError).toBeNull();
  });
});

describe("parseCopilotScope", () => {
  it("parses empty/personal and the two centrally billed prefixes", () => {
    expect(parseCopilotScope("")).toEqual({ kind: "personal", slug: null });
    expect(parseCopilotScope("  ")).toEqual({ kind: "personal", slug: null });
    expect(parseCopilotScope("org:acme")).toEqual({ kind: "org", slug: "acme" });
    expect(parseCopilotScope("ENTERPRISE:Big.Co_1")).toEqual({
      kind: "enterprise",
      slug: "Big.Co_1",
    });
  });

  it("falls back to personal for anything else", () => {
    expect(parseCopilotScope("acme")).toEqual({ kind: "personal", slug: null });
    expect(parseCopilotScope("org:")).toEqual({ kind: "personal", slug: null });
  });
});

describe("parseCopilotUsage", () => {
  const scope = { kind: "personal", slug: null } as const;

  it("aggregates the AI-credit usage shape with included vs billed split", () => {
    const parsed = parseCopilotUsage(
      {
        timePeriod: { year: 2026, month: 10 },
        user: "monalisa",
        usageItems: [
          {
            product: "Copilot AI Credits",
            sku: "AI Credit",
            model: "GPT-5",
            unitType: "ai-credits",
            pricePerUnit: 0.01,
            grossQuantity: 100,
            grossAmount: 1.0,
            discountQuantity: 40,
            discountAmount: 0.4,
            netQuantity: 60,
            netAmount: 0.6,
          },
        ],
      },
      scope,
    );
    expect(parsed.unrecognized).toBe(false);
    expect(parsed.periodLabel).toBe("October 2026");
    expect(parsed.user).toBe("monalisa");
    expect(parsed.rows[0]).toEqual({
      product: "Copilot AI Credits",
      sku: "AI Credit",
      model: "GPT-5",
      unitType: "ai-credits",
      includedQuantity: 40,
      billedQuantity: 60,
      discountAmount: 0.4,
      netAmount: 0.6,
    });
  });

  it("handles the enterprise usage-report shape (single quantity, no model)", () => {
    const parsed = parseCopilotUsage(
      {
        timePeriod: { year: 2026 },
        usageItems: [
          {
            date: "2026-10-01",
            product: "copilot",
            sku: "Copilot Premium Request",
            quantity: 250,
            unitType: "requests",
            pricePerUnit: 0.04,
            grossAmount: 10,
            discountAmount: 2,
            netAmount: 8,
            organizationName: "acme",
          },
        ],
      },
      { kind: "enterprise", slug: "big-co" },
    );
    expect(parsed.unrecognized).toBe(false);
    expect(parsed.periodLabel).toBe("2026");
    expect(parsed.rows[0].billedQuantity).toBe(250);
    expect(parsed.rows[0].includedQuantity).toBeNull();
    expect(parsed.rows[0].netAmount).toBe(8);
  });

  it("reports unrecognized when usageItems is missing", () => {
    expect(parseCopilotUsage({ foo: 1 }, scope).unrecognized).toBe(true);
    expect(parseCopilotUsage(null, scope).unrecognized).toBe(true);
  });
});

describe("fetchCopilotUsage", () => {
  function stubFetch(
    routes: Record<string, { status?: number; body: unknown }>,
  ): ReturnType<typeof vi.fn> {
    const fn = vi.fn(async (url: string, opts?: RequestInit) => {
      const path = String(url).replace("https://api.github.com", "").split("?")[0];
      const hit = routes[path];
      if (!hit) throw new Error(`unexpected URL ${url}`);
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

  it("resolves the token's login first, then fetches the personal AI-credit report", async () => {
    const fn = stubFetch({
      "/user": { body: { login: "monalisa" } },
      "/users/monalisa/settings/billing/ai_credit/usage": {
        body: {
          timePeriod: { year: 2026, month: 10 },
          user: "monalisa",
          usageItems: [
            {
              product: "Copilot AI Credits",
              sku: "AI Credit",
              model: "GPT-5",
              unitType: "ai-credits",
              pricePerUnit: 0.01,
              grossQuantity: 10,
              grossAmount: 0.1,
              discountQuantity: 10,
              discountAmount: 0.1,
              netQuantity: 0,
              netAmount: 0,
            },
          ],
        },
      },
    });
    const usage = await fetchCopilotUsage("ghp_test", "");
    expect(usage.scope.kind).toBe("personal");
    expect(usage.user).toBe("monalisa");
    expect(usage.rows[0].netAmount).toBe(0);
    const calls = fn.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe("https://api.github.com/user");
    expect(calls[1][0]).toContain("/users/monalisa/settings/billing/ai_credit/usage?year=");
    for (const [, opts] of calls) {
      expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer ghp_test");
      expect((opts.headers as Record<string, string>).Accept).toBe("application/vnd.github+json");
    }
  });

  it("goes straight to the org endpoint for an org scope", async () => {
    stubFetch({
      "/organizations/acme/settings/billing/ai_credit/usage": {
        body: { timePeriod: { year: 2026, month: 10 }, usageItems: [] },
      },
    });
    const usage = await fetchCopilotUsage("ghp_test", "org:acme");
    expect(usage.scope).toEqual({ kind: "org", slug: "acme" });
    expect(usage.rows).toEqual([]);
  });

  it("uses the enterprise usage report for an enterprise scope", async () => {
    stubFetch({
      "/enterprises/big-co/settings/billing/usage": {
        body: { timePeriod: { year: 2026 }, usageItems: [] },
      },
    });
    const usage = await fetchCopilotUsage("ghp_test", "enterprise:big-co");
    expect(usage.scope.kind).toBe("enterprise");
  });

  it("turns a 403 into the classic-PAT guidance", async () => {
    stubFetch({
      "/user": { body: { login: "monalisa" } },
      "/users/monalisa/settings/billing/ai_credit/usage": {
        status: 403,
        body: { message: "Resource not accessible by integration" },
      },
    });
    await expect(fetchCopilotUsage("ghp_fg", "")).rejects.toThrow(
      /403.*classic personal access token/,
    );
  });

  it("turns a 401 into a token rejection with GitHub's message", async () => {
    stubFetch({ "/user": { status: 401, body: { message: "Bad credentials" } } });
    await expect(fetchCopilotUsage("expired", "")).rejects.toThrow(
      "GitHub rejected the token (401): Bad credentials",
    );
  });

  it("maps network failure to a clear message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))),
    );
    await expect(fetchCopilotUsage("k", "")).rejects.toThrow("Could not reach the GitHub API.");
  });

  it("builds the documented paths for every scope", () => {
    expect(copilotUsagePath("", "mona")).toContain("/users/mona/settings/billing/ai_credit/usage");
    expect(copilotUsagePath("org:a", "")).toContain(
      "/organizations/a/settings/billing/ai_credit/usage",
    );
    expect(copilotUsagePath("enterprise:e", "")).toContain("/enterprises/e/settings/billing/usage");
  });
});

describe("parseOpenRouterCredits", () => {
  it("parses the documented shape and computes remaining", () => {
    expect(parseOpenRouterCredits({ data: { total_credits: 100.5, total_usage: 25.75 } })).toEqual({
      totalCredits: 100.5,
      totalUsage: 25.75,
      remaining: 74.75,
    });
  });

  it("yields nulls (not NaN) for missing or malformed fields", () => {
    expect(parseOpenRouterCredits({ data: {} })).toEqual({
      totalCredits: null,
      totalUsage: null,
      remaining: null,
    });
    expect(parseOpenRouterCredits({ data: { total_credits: "12", total_usage: null } })).toEqual({
      totalCredits: null,
      totalUsage: null,
      remaining: null,
    });
    expect(parseOpenRouterCredits(null)).toEqual({
      totalCredits: null,
      totalUsage: null,
      remaining: null,
    });
  });
});

describe("parseOpenRouterKey", () => {
  it("parses the documented key-info shape", () => {
    const info = parseOpenRouterKey({
      data: {
        label: "sk-or-v1-au7...890",
        usage: 25.5,
        usage_daily: 25.5,
        usage_weekly: 25.5,
        usage_monthly: 25.5,
        limit: 100,
        limit_remaining: 74.5,
        limit_reset: "monthly",
        rate_limit: { requests: 1000, interval: "1h" },
      },
    });
    expect(info.label).toBe("sk-or-v1-au7...890");
    expect(info.usageDaily).toBe(25.5);
    expect(info.usageWeekly).toBe(25.5);
    expect(info.usageMonthly).toBe(25.5);
    expect(info.limit).toBe(100);
    expect(info.limitRemaining).toBe(74.5);
    expect(info.rateLimit).toEqual({ requests: 1000, interval: "1h" });
  });

  it("tolerates a missing rate_limit and a null (unset) spend limit", () => {
    const info = parseOpenRouterKey({ data: { usage_daily: 1.25, limit: null } });
    expect(info.rateLimit).toBeNull();
    expect(info.limit).toBeNull();
    expect(info.usageDaily).toBe(1.25);
  });
});

describe("parseOpenCodeGoUsage", () => {
  it("parses a top-level windows array with dollar used/limit", () => {
    const parsed = parseOpenCodeGoUsage({
      windows: [
        { id: "five_hour", used: 3.2, limit: 12, resets_at: "2026-09-05T12:00:00Z" },
        { id: "weekly", used: 8, limit: 30 },
        { id: "monthly", used: 10, limit: 60 },
      ],
    });
    expect(parsed.unrecognized).toBe(false);
    expect(parsed.windows).toHaveLength(3);
    expect(parsed.windows[0].label).toBe("5-hour window");
    expect(parsed.windows[0].usedPct).toBeCloseTo(26.6667, 3);
    expect(parsed.windows[0].usedUsd).toBe(3.2);
    expect(parsed.windows[0].limitUsd).toBe(12);
    expect(parsed.windows[0].resetsAt).toBe("2026-09-05T12:00:00.000Z");
    expect(parsed.windows[1].label).toBe("Weekly window");
    expect(parsed.windows[2].usedPct).toBeCloseTo(16.6667, 3);
  });

  it("parses windows nested under data and usage, with percent-style fields", () => {
    const parsed = parseOpenCodeGoUsage({
      data: {
        usage: {
          five_hour: { utilization: 0.27 },
          weekly: { used_percent: 45.5 },
          monthly: { percent: 12 },
        },
      },
    });
    expect(parsed.unrecognized).toBe(false);
    expect(parsed.windows.map((w) => [w.id, w.usedPct])).toEqual([
      ["five_hour", 27],
      ["weekly", 45.5],
      ["monthly", 12],
    ]);
  });

  it("parses a windows array nested under data", () => {
    const parsed = parseOpenCodeGoUsage({
      data: { windows: [{ type: "weekly", percent: 30, label: "This week" }] },
    });
    expect(parsed.unrecognized).toBe(false);
    expect(parsed.windows[0].label).toBe("This week");
    expect(parsed.windows[0].usedPct).toBe(30);
  });

  it("reports unrecognized for shapes with no window data", () => {
    expect(parseOpenCodeGoUsage({ foo: "bar" })).toEqual({ windows: [], unrecognized: true });
    expect(parseOpenCodeGoUsage(null)).toEqual({ windows: [], unrecognized: true });
  });

  it("does not mistake a bare cost/token object for a usage window", () => {
    const parsed = parseOpenCodeGoUsage({
      data: { usage: { cost: 0.05, input_tokens: 1000, output_tokens: 200 } },
    });
    expect(parsed.unrecognized).toBe(true);
    expect(parsed.windows).toEqual([]);
  });
});

describe("fetchOpenRouterSpend", () => {
  function stubFetch(
    routes: Record<string, { status?: number; body: unknown }>,
  ): ReturnType<typeof vi.fn> {
    const fn = vi.fn(async (url: string) => {
      const path = String(url).replace("https://openrouter.ai/api/v1", "");
      const hit = routes[path];
      if (!hit) throw new Error(`unexpected URL ${url}`);
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

  it("fetches both endpoints in parallel with the bearer key", async () => {
    const fn = stubFetch({
      "/credits": { body: { data: { total_credits: 100.5, total_usage: 25.75 } } },
      "/key": {
        body: {
          data: { label: "main key", usage_daily: 1, usage_weekly: 2, usage_monthly: 3 },
        },
      },
    });
    const spend = await fetchOpenRouterSpend("sk-or-v1-test");
    expect(spend.credits?.remaining).toBe(74.75);
    expect(spend.creditsError).toBeNull();
    expect(spend.key?.label).toBe("main key");
    expect(spend.keyError).toBeNull();
    const calls = fn.mock.calls as unknown as [string, RequestInit][];
    for (const [, opts] of calls) {
      expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-v1-test");
    }
  });

  it("isolates a per-endpoint failure: key data survives a credits refusal", async () => {
    stubFetch({
      "/credits": {
        status: 403,
        body: { error: { code: 403, message: "Only management keys can perform this operation" } },
      },
      "/key": { body: { data: { usage_daily: 1.5 } } },
    });
    const spend = await fetchOpenRouterSpend("sk-or-v1-test");
    expect(spend.credits).toBeNull();
    expect(spend.creditsError).toBe("Only management keys can perform this operation");
    expect(spend.key?.usageDaily).toBe(1.5);
    expect(spend.keyError).toBeNull();
  });

  it("surfaces the upstream message on a rejected key", async () => {
    stubFetch({
      "/credits": { status: 401, body: { error: { code: 401, message: "Invalid key" } } },
      "/key": { status: 401, body: { error: { code: 401, message: "Invalid key" } } },
    });
    const spend = await fetchOpenRouterSpend("bad-key");
    expect(spend.credits).toBeNull();
    expect(spend.key).toBeNull();
    expect(spend.creditsError).toBe("Invalid key");
    expect(spend.keyError).toBe("Invalid key");
  });
});

describe("fetchOpenCodeGoUsage", () => {
  function stubOnce(status: number, body: unknown, contentType = "application/json"): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: status < 400,
            status,
            headers: { get: () => contentType },
            json: async () => body,
          }) as unknown as Response,
      ),
    );
  }

  it("parses a windows response", async () => {
    stubOnce(200, {
      windows: [{ id: "monthly", used: 10, limit: 60 }],
    });
    const usage = await fetchOpenCodeGoUsage("zen-key");
    expect(usage.windows).toHaveLength(1);
    expect(usage.windows[0].id).toBe("monthly");
    expect(usage.unrecognized).toBe(false);
  });

  it("throws a clean message when the key is rejected", async () => {
    stubOnce(401, { type: "error", error: { type: "AuthError", message: "Missing API key." } });
    await expect(fetchOpenCodeGoUsage("bad")).rejects.toThrow("Missing API key.");
  });

  it("throws on upstream errors and non-JSON responses", async () => {
    // With no upstream message to surface, the generic fallback is used.
    stubOnce(500, { status: "error" });
    await expect(fetchOpenCodeGoUsage("k")).rejects.toThrow("opencode Go API returned 500");
    // A top-level `message` (GitHub's error shape) is surfaced as-is.
    stubOnce(500, { message: "boom" });
    await expect(fetchOpenCodeGoUsage("k")).rejects.toThrow("boom");
    stubOnce(200, "<html>blocked</html>", "text/html");
    await expect(fetchOpenCodeGoUsage("k")).rejects.toThrow(
      "opencode Go returned a non-JSON response",
    );
  });

  it("maps network failure to a clear message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))),
    );
    await expect(fetchOpenCodeGoUsage("k")).rejects.toThrow(
      "Could not reach the opencode Go usage API.",
    );
  });
});
