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

  it("does not classify ordinary failures", () => {
    expect(detectProviderUsageLimit("connection reset by peer")).toBeNull();
  });

  it("resumes an automatically exhausted pair after a successful cheap probe", async () => {
    const config = {
      ...DEFAULT_CONFIG,
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
