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

const emptyFeedInput = () => ({
  config: { ...DEFAULT_CONFIG, root: "/tmp/repoos-attention-test" },
  tasks: [] as Task[],
  closeOutOutcomes: [],
  releaseRun: null,
  releaseNotesRun: null,
  recordedEvents: [],
  totalSpendUsd: null,
  recentProviderFailures: [],
  silentRuns: [],
  previewTargetAreas: [] as string[],
});

describe("buildAttentionFeed", () => {
  it("includes releaseNotesReady when the notes draft succeeded", () => {
    const feed = buildAttentionFeed({
      ...emptyFeedInput(),
      releaseNotesRun: {
        state: "succeeded",
        startedAt: "2026-01-03T12:00:00.000Z",
        updatedAt: "2026-01-03T12:01:00.000Z",
        stale: false,
      },
    });
    expect(feed.items.some((i) => i.kind === "releaseNotesReady")).toBe(true);
  });

  it("includes provider failures, spend threshold, silent runs, and remote fallback", () => {
    const feed = buildAttentionFeed({
      config: configWithAttention(5),
      tasks: [task({ id: "0042", status: "review", area: "ui", title: "Map page" })],
      closeOutOutcomes: [],
      releaseRun: null,
      releaseNotesRun: null,
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

describe("buildAttentionFeed CTO silent (#0728)", () => {
  it("raises ctoSilent when actionable work exists and the heartbeat is stale", () => {
    const old = "2026-10-07T08:00:00.000Z";
    const feed = buildAttentionFeed({
      ...emptyFeedInput(),
      tasks: [task({ id: "0001", status: "review", title: "Awaiting sign-off" })],
      ctoHeartbeatAt: old,
      ctoSilentThresholdMs: 60_000,
    });
    expect(feed.items.some((i) => i.kind === "ctoSilent")).toBe(true);
  });

  it("clears ctoSilent after a fresh heartbeat", () => {
    const fresh = new Date().toISOString();
    const feed = buildAttentionFeed({
      ...emptyFeedInput(),
      tasks: [task({ id: "0001", status: "review", title: "Awaiting sign-off" })],
      ctoHeartbeatAt: fresh,
      ctoSilentThresholdMs: 60_000,
    });
    expect(feed.items.some((i) => i.kind === "ctoSilent")).toBe(false);
  });
});

describe("buildAttentionFeed close-out and release kinds", () => {
  it("maps a close-out outcome and a release run", () => {
    const feed = buildAttentionFeed({
      ...emptyFeedInput(),
      closeOutOutcomes: [
        {
          taskId: "1",
          outcome: "succeeded",
          finishedAt: "2026-01-01T00:00:00.000Z",
          reason: "",
        },
      ],
      releaseRun: {
        state: "failed",
        message: "v1.0.0 cut failed",
        startedAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:01:00.000Z",
      },
    });
    expect(feed.items.some((i) => i.kind === "closeOutSucceeded")).toBe(true);
    expect(feed.items.some((i) => i.kind === "releaseFailed")).toBe(true);
  });
});
