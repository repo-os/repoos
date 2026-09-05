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
  fetchOpenCodeGoUsage,
  fetchOpenRouterSpend,
  modelProviderById,
  parseOpenCodeGoUsage,
  parseOpenRouterCredits,
  parseOpenRouterKey,
} from "../../core/providers/spend";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MODEL_PROVIDERS registry", () => {
  it("scopes to exactly the four v1 providers", () => {
    expect(MODEL_PROVIDERS.map((p) => p.id)).toEqual([
      "openrouter",
      "opencode-go",
      "opencode-zen",
      "deepinfra",
    ]);
  });

  it("marks OpenRouter and opencode Go live with env vars; Zen/DeepInfra as link-outs", () => {
    const openrouter = modelProviderById("openrouter")!;
    expect(openrouter.kind).toBe("live");
    expect(openrouter.envVar).toBe("REPOOS_OPENROUTER_API_KEY");
    const go = modelProviderById("opencode-go")!;
    expect(go.kind).toBe("live");
    expect(go.envVar).toBe("REPOOS_OPENCODE_GO_API_KEY");
    for (const id of ["opencode-zen", "deepinfra"]) {
      const row = modelProviderById(id)!;
      expect(row.kind).toBe("link");
      expect(row.envVar).toBeNull();
      expect(row.dashboardUrl).toMatch(/^https:\/\//);
    }
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
    stubOnce(500, { message: "boom" });
    await expect(fetchOpenCodeGoUsage("k")).rejects.toThrow("opencode Go API returned 500");
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
