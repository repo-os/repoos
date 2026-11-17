/**
 * Attention kinds must be registered everywhere the UI consumes them (#1126
 * review). A kind the server records but the UI does not list is silently
 * dropped: `ingestAttentionItem` returns null and `notify()` short-circuits,
 * so the human is never told in-app. Table-driven over the canonical set.
 */
import { describe, expect, it } from "vitest";
import {
  ATTENTION_NOTICE_KINDS,
  NOTICE_KIND_COLOR,
  NOTICE_KIND_LABELS,
} from "../src/stores/notices";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_DESCRIPTIONS,
  NOTIFICATION_TYPE_LABELS,
} from "../src/stores/notifications";
import type { AttentionKind } from "../../core/attention.js";

describe("attention kind UI registries", () => {
  it("registers every bell-surfaced attention kind in all four registries", () => {
    expect(ATTENTION_NOTICE_KINDS.size).toBeGreaterThan(0);
    for (const kind of ATTENTION_NOTICE_KINDS) {
      expect(NOTICE_KIND_LABELS[kind], `label for ${kind}`).toBeTruthy();
      expect(NOTICE_KIND_COLOR[kind], `color for ${kind}`).toBeTruthy();
      expect(NOTIFICATION_TYPES, `notification type ${kind}`).toContain(kind);
      expect(NOTIFICATION_TYPE_LABELS[kind], `notification label for ${kind}`).toBeTruthy();
      expect(
        NOTIFICATION_TYPE_DESCRIPTIONS[kind],
        `notification description for ${kind}`,
      ).toBeTruthy();
    }
  });

  it("surfaces the release failure kinds as bell notices (#1126)", () => {
    expect(ATTENTION_NOTICE_KINDS.has("releaseNotesFailed")).toBe(true);
    expect(ATTENTION_NOTICE_KINDS.has("releaseAutoPublishFailed")).toBe(true);
  });

  it("keeps every bell kind a valid server AttentionKind", () => {
    // Compile-time: every UI notice kind must be assignable to the server's
    // attention union, so a UI-only spelling cannot drift from the feed.
    for (const kind of ATTENTION_NOTICE_KINDS) {
      const asCore: AttentionKind = kind;
      expect(asCore).toBe(kind);
    }
  });
});
