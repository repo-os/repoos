import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProviderUsageLimit } from "../../core/provider-usage-limit.js";
import { DEFAULT_CONFIG } from "../../core/config.js";
import { RepoOSDb } from "../../core/db.js";
import type { AgentModelAllowRow, RepoOSConfig } from "../../core/types.js";
import {
  USAGE_PROBE_BACKOFF_START_MS,
  probeExhaustedUsageLimitPairs,
  type UsageProbeBackoff,
} from "../../server/provider-usage-limit-probe.js";

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

  const PAST = "2026-10-22T10:00:00.000Z";
  const NOW = Date.parse("2026-10-22T10:35:00.000Z");
  const FUTURE = "2026-10-28T10:00:00.000Z";
  const REASON = "out of usage since 10:30";

  function configWith(allowlist: AgentModelAllowRow[]): RepoOSConfig {
    return {
      ...DEFAULT_CONFIG,
      root: process.cwd(),
      budget: { allowlist },
    };
  }

  it("does not probe an agent-level or model-level pause before pausedUntil, or a pause with no date", async () => {
    const config = configWith([
      {
        cli: "antigravity",
        models: ["gemini"],
        paused: true,
        pausedUntil: FUTURE,
        pausedReason: REASON,
      },
      {
        cli: "opencode",
        models: ["go"],
        pausedModels: [{ model: "go", pausedUntil: FUTURE, pausedReason: REASON }],
      },
      {
        cli: "codex",
        models: ["gpt"],
        pausedModels: [{ model: "gpt", pausedReason: REASON }],
      },
    ]);
    let calls = 0;
    const resumed = await probeExhaustedUsageLimitPairs(
      config,
      async () => {
        calls += 1;
        return true;
      },
      undefined,
      NOW,
    );
    expect(calls).toBe(0);
    expect(resumed).toEqual([]);
    expect(config.budget?.allowlist?.[0]?.paused).toBe(true);
    expect(config.budget?.allowlist?.[1]?.pausedModels).toHaveLength(1);
    expect(config.budget?.allowlist?.[2]?.pausedModels).toHaveLength(1);
  });

  it("resumes an automatically exhausted pair after a successful probe once pausedUntil has passed", async () => {
    const config = configWith([
      {
        cli: "opencode",
        models: ["go"],
        pausedModels: [{ model: "go", pausedUntil: PAST, pausedReason: REASON }],
      },
    ]);
    const resumed = await probeExhaustedUsageLimitPairs(config, async () => true, undefined, NOW);
    expect(resumed).toEqual(["opencode + go"]);
    expect(config.budget?.allowlist?.[0]?.pausedModels).toBeUndefined();
  });

  it("probes a due pause at most once per doubling backoff interval", async () => {
    const config = configWith([
      {
        cli: "opencode",
        models: ["go"],
        pausedModels: [{ model: "go", pausedUntil: PAST, pausedReason: REASON }],
      },
    ]);
    const backoff: UsageProbeBackoff = new Map();
    let calls = 0;
    const probe = async () => {
      calls += 1;
      return false;
    };
    await probeExhaustedUsageLimitPairs(config, probe, undefined, NOW, backoff);
    await probeExhaustedUsageLimitPairs(config, probe, undefined, NOW + 60_000, backoff);
    expect(calls).toBe(1);
    await probeExhaustedUsageLimitPairs(
      config,
      probe,
      undefined,
      NOW + USAGE_PROBE_BACKOFF_START_MS,
      backoff,
    );
    expect(calls).toBe(2);
    const slot = backoff.get("opencode\0go");
    expect(slot?.intervalMs).toBe(USAGE_PROBE_BACKOFF_START_MS * 4);
    expect(config.budget?.allowlist?.[0]?.pausedModels).toHaveLength(1);
  });

  it("extends pausedUntil from the reset time in a still-limited probe", async () => {
    const config = configWith([
      {
        cli: "antigravity",
        models: ["gemini"],
        pausedModels: [{ model: "gemini", pausedUntil: PAST, pausedReason: REASON }],
      },
    ]);
    const backoff: UsageProbeBackoff = new Map();
    let calls = 0;
    const resumed = await probeExhaustedUsageLimitPairs(
      config,
      async () => {
        calls += 1;
        return {
          ok: false,
          output: "Individual quota reached. Resets at 2026-10-22T18:00:00Z",
        };
      },
      undefined,
      NOW,
      backoff,
    );
    expect(resumed).toEqual([]);
    expect(calls).toBe(1);
    expect(config.budget?.allowlist?.[0]?.pausedModels?.[0]?.pausedUntil).toBe(
      "2026-10-22T18:00:00.000Z",
    );
    expect(config.budget?.allowlist?.[0]?.pausedModels?.[0]?.pausedReason).toBe(REASON);
    await probeExhaustedUsageLimitPairs(
      config,
      async () => {
        calls += 1;
        return true;
      },
      undefined,
      NOW + USAGE_PROBE_BACKOFF_START_MS,
      backoff,
    );
    expect(calls).toBe(1);
  });

  it("stores a reset time found in an undated pause reason and does not probe", async () => {
    const config = configWith([
      {
        cli: "antigravity",
        models: ["gemini"],
        paused: true,
        pausedReason:
          "out of usage since 2026-10-22T10:00:00.000Z: Individual quota reached. Resets at 2026-10-28T10:00:00Z",
      },
    ]);
    let calls = 0;
    await probeExhaustedUsageLimitPairs(
      config,
      async () => {
        calls += 1;
        return true;
      },
      undefined,
      NOW,
    );
    expect(calls).toBe(0);
    expect(config.budget?.allowlist?.[0]?.pausedUntil).toBe("2026-10-28T10:00:00.000Z");
    expect(config.budget?.allowlist?.[0]?.paused).toBe(true);
  });
});

describe("recent failures omit usage-limit probe confirmations", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it("keeps a real error and drops a probe that only confirms quota", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-probe-failures-"));
    roots.push(root);
    const db = new RepoOSDb(root);
    const ended = "2026-10-22T10:35:00.000Z";
    const row = {
      taskId: null,
      agent: "antigravity-gemini",
      model: "gemini",
      codingAgent: "antigravity",
      startedAt: ended,
      endedAt: ended,
      elapsedMs: 10,
      costSource: "none",
      lastActivityAt: ended,
    };
    db.upsertSession({
      ...row,
      sessionId: "probe",
      sessionType: "usage-limit-probe",
      status: "errored",
      errorReason: "agy exited with code 3: Individual quota reached. Resets in 147h15m0s.",
    });
    db.upsertSession({
      ...row,
      sessionId: "real",
      sessionType: "engineer",
      status: "errored",
      errorReason: "connection reset by peer",
    });
    expect(db.getBoardStats().recentFailures.map((r) => r.sessionId)).toEqual(["real"]);
    db.close();
  });
});
