/**
 * #0687 — durable provider-failure attention events.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAttentionEventStore } from "../../server/attention-events.js";
import {
  notifyAttentionAfterSession,
  clearAttentionAgentFailure,
  notifyAttentionAgentFailure,
  notifyAttentionProcessSignalFailure,
  notifyAttentionProviderUsageLimit,
  wireAttentionNotifications,
} from "../../server/attention-notify.js";
import { DEFAULT_CONFIG } from "../../core/config.js";

describe("notifyAttentionAfterSession", () => {
  it("records a durable provider failure and bumps attention", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-attn-notify-"));
    const store = createAttentionEventStore(root);
    let bumps = 0;
    wireAttentionNotifications(store, () => {
      bumps += 1;
    });
    notifyAttentionAfterSession(
      { ...DEFAULT_CONFIG, root, cacheDir: ".repoos", attention: { spendAlertUsd: 0 } },
      {
        sessionId: "eng:test",
        taskId: "0042",
        status: "errored",
        errorReason: "OpenRouter HTTP 402 insufficient credits",
        endedAt: "2026-01-01T00:00:00.000Z",
      },
    );
    expect(bumps).toBe(1);
    const listed = store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      kind: "providerFailure",
      id: "providerFailure:eng:test",
      taskId: "0042",
    });
  });
});

describe("notifyAttentionProviderUsageLimit", () => {
  it("records one stable bell item with the resume command and bumps the feed", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-usage-attention-"));
    const store = createAttentionEventStore(root);
    let bumps = 0;
    wireAttentionNotifications(store, () => {
      bumps += 1;
    });
    notifyAttentionProviderUsageLimit("opencode", "go", "2026-10-22T02:30:00.000Z");
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({
      id: "providerUsageLimit:opencode:go:2026-10-22T02:30:00.000Z",
      kind: "providerUsageLimit",
      message: expect.stringContaining("opencode-go out of usage since"),
      detail: expect.stringContaining("repoos agents resume opencode --model go"),
    });
    expect(bumps).toBe(1);
  });
});
describe("agent failure attention notices", () => {
  let root = "";
  afterEach(() => {
    wireAttentionNotifications(createAttentionEventStore(join(tmpdir(), "repoos-noop")), () => {});
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("dedupes by CLI and clears after a later successful run", () => {
    root = mkdtempSync(join(tmpdir(), "repoos-agent-notice-"));
    const store = createAttentionEventStore(root);
    let bumps = 0;
    wireAttentionNotifications(store, () => bumps++);

    notifyAttentionAgentFailure(
      "cursor",
      "Cannot use this model: composer-2.5",
      "2026-11-12T00:00:00Z",
    );
    notifyAttentionAgentFailure(
      "cursor",
      "Cannot use this model: composer-2.5",
      "2026-11-12T00:01:00Z",
    );
    expect(store.list().filter((event) => event.id === "agentFailure:cursor")).toHaveLength(1);
    expect(store.list()[0]?.detail).toContain("Choose another model");

    clearAttentionAgentFailure("cursor");
    expect(store.list().some((event) => event.id === "agentFailure:cursor")).toBe(false);
    expect(bumps).toBe(3);
  });

  it("does not create board notices for transient network errors or usage limits", () => {
    root = mkdtempSync(join(tmpdir(), "repoos-agent-notice-filter-"));
    const store = createAttentionEventStore(root);
    wireAttentionNotifications(store, () => {});
    notifyAttentionAgentFailure("cursor", "ENOTFOUND api.cursor.sh");
    notifyAttentionAgentFailure("claude code", "usage limit reached until 14:00");
    expect(store.list()).toHaveLength(0);
  });
});

describe("notifyAttentionProcessSignalFailure", () => {
  it("records a task-linked bell item and bumps attention", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-signal-attention-"));
    const store = createAttentionEventStore(root);
    let bumps = 0;
    wireAttentionNotifications(store, () => {
      bumps += 1;
    });

    notifyAttentionProcessSignalFailure({
      leaderPid: 43210,
      code: "EPERM",
      signal: "SIGTERM",
      taskId: "1079",
    });

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({
      kind: "processSignalFailure",
      taskId: "1079",
      message: expect.stringContaining("43210 for #1079"),
      detail: expect.stringContaining("EPERM while sending SIGTERM"),
    });
    expect(bumps).toBe(1);
  });
});
