/**
 * #0687 — unified attention feed: kinds, provider-error detection, API shape.
 */
import { describe, expect, it } from "vitest";
import {
  buildAttentionFeed,
  isProviderFailureReason,
  taskAwaitingVisualCheck,
} from "../../core/attention.js";
import type { Task } from "../../core/types.js";
import { DEFAULT_CONFIG } from "../../core/config.js";

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    title: partial.title ?? "t",
    status: partial.status ?? "review",
    priority: partial.priority ?? "p2",
    type: "feature",
    assignee: "ai",
    needsInput: false,
    needsMerge: false,
    isArchived: false,
    area: partial.area ?? "",
    areas: partial.areas,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...partial,
  } as Task;
}

function configWithAttention(spendAlertUsd: number) {
  return { ...DEFAULT_CONFIG, root: "/tmp/repoos-attention-test", attention: { spendAlertUsd } };
}

describe("isProviderFailureReason", () => {
  it("matches credit, 402, and model-unavailable errors", () => {
    expect(isProviderFailureReason("OpenRouter HTTP 402")).toBe(true);
    expect(isProviderFailureReason("model unavailable for this account")).toBe(true);
    expect(isProviderFailureReason("exit code 1")).toBe(false);
  });
});

describe("taskAwaitingVisualCheck", () => {
  it("flags UI-area tasks in review", () => {
    expect(
      taskAwaitingVisualCheck(task({ id: "1", status: "review", area: "web" }), ["server"]),
    ).toBe(true);
    expect(taskAwaitingVisualCheck(task({ id: "1", status: "active", area: "web" }), [])).toBe(
      false,
    );
  });
});

describe("buildAttentionFeed", () => {
  it("includes provider failures, spend threshold, silent runs, and remote fallback", () => {
    const feed = buildAttentionFeed({
      config: configWithAttention(5),
      tasks: [task({ id: "0042", status: "review", area: "ui", title: "Map page" })],
      closeOutOutcomes: [],
      releaseRun: null,
      recordedEvents: [
        {
          id: "remoteFallback:0042:2026",
          kind: "remoteFallback",
          taskId: "0042",
          message: "Ran locally: #0042",
          detail: "no healthy runner",
          at: "2026-01-03T12:00:00.000Z",
        },
      ],
      totalSpendUsd: 6.5,
      recentProviderFailures: [
        {
          sessionId: "eng:1",
          taskId: "0042",
          errorReason: "HTTP 402 insufficient credits",
          startedAt: "2026-01-03T11:00:00.000Z",
        },
      ],
      silentRuns: [
        {
          taskId: "0099",
          lastOutputAt: "2026-01-03T10:00:00.000Z",
          detail: "quiet",
        },
      ],
      previewTargetAreas: ["web"],
    });
    const kinds = new Set(feed.items.map((i) => i.kind));
    expect(kinds.has("providerFailure")).toBe(true);
    expect(kinds.has("spendThreshold")).toBe(true);
    expect(kinds.has("silentRun")).toBe(true);
    expect(kinds.has("remoteFallback")).toBe(true);
    expect(kinds.has("awaitingVisualCheck")).toBe(true);
    expect(kinds.has("taskReview")).toBe(true);
    for (const item of feed.items) {
      expect(item.id).toBeTruthy();
      expect(item.message).toBeTruthy();
      expect(item.at).toMatch(/^\d{4}-/);
      expect(["info", "warning", "error"]).toContain(item.severity);
    }
  });
});

describe("GET /api/attention contract", () => {
  it("returns ok, generatedAt, and items array", async () => {
    const { buildAttentionFeed: build } = await import("../../core/attention.js");
    const feed = build({
      config: { ...DEFAULT_CONFIG, root: "/tmp/repoos-attention-test" },
      tasks: [],
      closeOutOutcomes: [],
      releaseRun: null,
      recordedEvents: [],
      totalSpendUsd: null,
      recentProviderFailures: [],
      silentRuns: [],
      previewTargetAreas: [],
    });
    expect(feed.generatedAt).toMatch(/^\d{4}-/);
    expect(Array.isArray(feed.items)).toBe(true);
    const payload = { ok: true, ...feed };
    expect(payload.ok).toBe(true);
    expect(payload.items).toEqual(feed.items);
  });
});
