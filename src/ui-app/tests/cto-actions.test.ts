/**
 * #0688 — CTO safe actions: allowlist, rate limits, audit feed.
 */
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ctoActionRateLimitExceeded,
  configuredCtoActions,
  isCtoActionAllowlisted,
} from "../../core/cto-actions.js";
import { createCtoActionRateStore } from "../../server/cto-action-rates.js";
import { createAttentionEventStore } from "../../server/attention-events.js";
import { runCtoSafeAction } from "../../server/cto-actions.js";
import { buildAttentionFeed } from "../../core/attention.js";
import { DEFAULT_CONFIG, loadConfig } from "../../core/config.js";
import { getConfigSchema, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { writeFileSync } from "node:fs";

describe("cto.actions config (#0688)", () => {
  it("parses allowlist from repoos.toml", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-cto-actions-"));
    writeFileSync(
      join(dir, "repoos.toml"),
      'cto.actions = ["restart-stalled-agent", "refresh-main-install"]\n',
      "utf8",
    );
    const cfg = loadConfig(dir);
    expect(configuredCtoActions(cfg)).toEqual([
      "restart-stalled-agent",
      "refresh-main-install",
    ]);
  });

  it("exposes Settings schema and supported TOML key", () => {
    expect(getConfigSchema().find((f) => f.key === "cto.actions")).toBeDefined();
    expect(SUPPORTED_TOML_KEYS).toContain("cto.actions");
  });
});

describe("CTO safe action gate", () => {
  it("rejects actions not on the allowlist", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cto-gate-"));
    const config = { ...DEFAULT_CONFIG, root, cto: { actions: [] } };
    const attentionEvents = createAttentionEventStore(root);
    const rates = createCtoActionRateStore(root);
    const result = await runCtoSafeAction(
      {
        config,
        index: { getTask: () => null, getTasks: () => [], applyFileChange: () => {}, refreshBranches: () => {} } as never,
        runner: {} as never,
        jobCoordinator: { allJobs: () => [], getJob: () => null, enqueue: () => null } as never,
        attentionEvents,
        rates,
        logger: { agent: vi.fn(), task: vi.fn() } as never,
        emitEvent: vi.fn(),
        triggerJobProcessing: vi.fn(),
        reportedStages: {},
      },
      "refresh-main-install",
      { actor: "human" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("not allowlisted");
    }
  });

  it("surfaces ctoAction rows in the attention feed", () => {
    const config = { ...DEFAULT_CONFIG, root: "/tmp" };
    const feed = buildAttentionFeed({
      config,
      tasks: [],
      closeOutOutcomes: [],
      releaseRun: null,
      releaseNotesRun: null,
      recordedEvents: [
        {
          id: "ctoAction:test",
          kind: "ctoAction",
          taskId: "0001",
          message: "CTO: Refresh install in main",
          detail: "Refreshed the primary checkout install.",
          at: "2026-10-06T00:00:00Z",
        },
      ],
      totalSpendUsd: null,
      recentProviderFailures: [],
      silentRuns: [],
      previewTargetAreas: [],
    });
    expect(feed.items.some((i) => i.kind === "ctoAction")).toBe(true);
  });
});

describe("CTO action rate limits", () => {
  it("enforces per-action hourly caps", () => {
    expect(ctoActionRateLimitExceeded("refresh-main-install", 3)).toBe(false);
    expect(ctoActionRateLimitExceeded("refresh-main-install", 4)).toBe(true);
  });

  it("persists timestamps in the rate store", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cto-rates-"));
    const store = createCtoActionRateStore(root);
    expect(store.countRecent("refresh-main-install", null)).toBe(0);
    store.record("refresh-main-install", null);
    expect(store.countRecent("refresh-main-install", null)).toBe(1);
  });

  it("allowlist helper respects config", () => {
    const cfg = { ...DEFAULT_CONFIG, root: "/tmp", cto: { actions: ["restart-stalled-agent"] } };
    expect(isCtoActionAllowlisted(cfg, "restart-stalled-agent")).toBe(true);
    expect(isCtoActionAllowlisted(cfg, "refresh-main-install")).toBe(false);
  });
});
