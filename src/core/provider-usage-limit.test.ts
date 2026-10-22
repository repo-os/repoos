import { describe, expect, it } from "vitest";
import { detectProviderUsageLimit } from "./provider-usage-limit.js";

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
});
