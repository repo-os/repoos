import { describe, expect, it } from "vitest";
import { detectProviderUsageLimit } from "../../core/provider-usage-limit.js";
import { DEFAULT_CONFIG } from "../../core/config.js";
import { probeExhaustedUsageLimitPairs } from "../../server/provider-usage-limit-probe.js";

describe("detectProviderUsageLimit", () => {
  it.each([
    ["opencode", "Go usage limit exceeded (HTTP 429)"],
    ["codex", "OpenAI API returned 429 Too Many Requests: quota exceeded"],
    ["cursor", "Request failed with status code 429"],
    ["copilot", "You have exceeded your monthly usage limit"],
    ["claude", "429 rate limit reached; retry-after: 2026-10-22T09:30:00Z"],
  ])("recognizes %s quota output", (_cli, output) => {
    expect(detectProviderUsageLimit(output)).not.toBeNull();
  });

  it("parses a reset timestamp", () => {
    expect(
      detectProviderUsageLimit("usage limit exceeded, resets at 2026-10-22T09:30:00Z")?.retryAt,
    ).toBe("2026-10-22T09:30:00.000Z");
  });

  it("parses Retry-After seconds and ignores malformed reset values", () => {
    const now = Date.now;
    Date.now = () => Date.parse("2026-10-22T09:00:00.000Z");
    try {
      expect(detectProviderUsageLimit("HTTP 429, Retry-After: 120")?.retryAt).toBe(
        "2026-10-22T09:02:00.000Z",
      );
    } finally {
      Date.now = now;
    }
    expect(
      detectProviderUsageLimit("usage limit reached, resets at 2026-99-99T99:99Z")?.retryAt,
    ).toBeUndefined();
  });

  it.each([
    [
      "codex",
      "error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro) or try again at 9:07 PM.",
    ],
    [
      "antigravity",
      'AGY_ERROR: {"short_error":"RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 147h15m0s."}',
    ],
    ["antigravity plain", "error: Individual quota reached. Please upgrade your subscription."],
  ])("recognizes real %s limit output seen on 2026-10-27", (_cli, output) => {
    expect(detectProviderUsageLimit(output)).not.toBeNull();
  });

  it("parses 'Resets in 147h15m0s' and 'try again at 9:07 PM' reset times", () => {
    const now = Date.now;
    const base = new Date(2026, 9, 27, 18, 0, 0, 0).getTime();
    Date.now = () => base;
    try {
      expect(detectProviderUsageLimit("Individual quota reached. Resets in 2h30m0s")?.retryAt).toBe(
        new Date(base + 2.5 * 3600_000).toISOString(),
      );
      expect(
        detectProviderUsageLimit("You’ve hit your usage limit. Try again at 9:07 PM.")?.retryAt,
      ).toBe(new Date(2026, 9, 27, 21, 7, 0, 0).toISOString());
      // A clock time already passed today means tomorrow.
      expect(
        detectProviderUsageLimit("You’ve hit your usage limit. Try again at 3:38 PM.")?.retryAt,
      ).toBe(new Date(2026, 9, 28, 15, 38, 0, 0).toISOString());
    } finally {
      Date.now = now;
    }
  });

  it("does not classify ordinary failures", () => {
    expect(detectProviderUsageLimit("connection reset by peer")).toBeNull();
  });

  it("resumes an automatically exhausted pair after a successful cheap probe", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      root: process.cwd(),
      budget: {
        allowlist: [
          {
            cli: "opencode",
            models: ["go"],
            pausedModels: [{ model: "go", pausedReason: "out of usage since 10:30" }],
          },
        ],
      },
    };
    const resumed = await probeExhaustedUsageLimitPairs(
      config,
      async () => true,
      undefined,
      Date.parse("2026-10-22T10:35:00Z"),
    );
    expect(resumed).toEqual(["opencode + go"]);
    expect(config.budget.allowlist[0]?.pausedModels).toBeUndefined();
  });

  it("keeps an exhausted pair paused when its probe fails", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      root: process.cwd(),
      budget: {
        allowlist: [
          {
            cli: "opencode",
            models: ["go"],
            pausedModels: [{ model: "go", pausedReason: "out of usage since 10:30" }],
          },
        ],
      },
    };
    const resumed = await probeExhaustedUsageLimitPairs(config, async () => false);
    expect(resumed).toEqual([]);
    expect(config.budget.allowlist[0]?.pausedModels).toHaveLength(1);
  });
});
