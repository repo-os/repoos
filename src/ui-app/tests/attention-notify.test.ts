/**
 * #0687 — durable provider-failure attention events.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAttentionEventStore } from "../../server/attention-events.js";
import {
  notifyAttentionAfterSession,
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
