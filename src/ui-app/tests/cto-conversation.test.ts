/**
 * CTO board-conversation display helpers (#0732).
 *
 * The panel must show each monitoring run's report exactly once: the saved
 * latest report is a fallback for when the transcript is missing it, never an
 * extra copy of text already streamed into the conversation.
 */
import { describe, expect, it } from "vitest";
import { reportAlreadyInConversation, withSavedReport } from "../src/lib/cto-conversation";
import type { AgentOutputEntry } from "../src/types";

const REPORT = "## Board health\n\n- 2 stuck tasks\n- 1 stale review\n- nothing to do";

describe("reportAlreadyInConversation", () => {
  it("is false when the transcript is empty", () => {
    expect(reportAlreadyInConversation([], REPORT)).toBe(false);
  });

  it("matches an exact streamed assistant text entry", () => {
    const lines: AgentOutputEntry[] = [{ type: "text", text: REPORT, at: "2026-08-07T12:00:00Z" }];
    expect(reportAlreadyInConversation(lines, REPORT)).toBe(true);
  });

  it("matches when the saved report appends a quarantine note", () => {
    const saved = `${REPORT}\n\n> Quarantined 1 stray file(s) this run created`;
    const lines: AgentOutputEntry[] = [{ type: "text", text: REPORT, at: "2026-08-07T12:00:00Z" }];
    expect(reportAlreadyInConversation(lines, saved)).toBe(true);
  });

  it("matches when the saved report was length-capped", () => {
    const lines: AgentOutputEntry[] = [
      {
        type: "text",
        text: `${REPORT}\n\nand a long tail that was cut`,
        at: "2026-08-07T12:00:00Z",
      },
    ];
    expect(reportAlreadyInConversation(lines, REPORT)).toBe(true);
  });

  it("ignores non-text entries that happen to carry the text", () => {
    const lines: AgentOutputEntry[] = [
      { s: "sys", d: REPORT },
      { type: "tool", tool: "bash" },
    ];
    expect(reportAlreadyInConversation(lines, REPORT)).toBe(false);
  });

  it("does not treat a short narration line as the report", () => {
    const lines: AgentOutputEntry[] = [{ type: "text", text: "OK", at: "2026-08-07T12:00:00Z" }];
    expect(reportAlreadyInConversation(lines, "OK, let me check the board in more detail")).toBe(
      false,
    );
  });

  it("is false for an empty report", () => {
    const lines: AgentOutputEntry[] = [{ type: "text", text: REPORT, at: "2026-08-07T12:00:00Z" }];
    expect(reportAlreadyInConversation(lines, "   ")).toBe(false);
  });
});

describe("withSavedReport", () => {
  it("appends the saved report when the transcript is missing it", () => {
    const lines: AgentOutputEntry[] = [
      { type: "human", text: "status?", at: "2026-08-07T11:59:00Z" },
    ];
    const out = withSavedReport(lines, { markdown: REPORT, at: "2026-08-07T12:00:00Z" });
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({
      type: "text",
      text: REPORT,
      at: "2026-08-07T12:00:00Z",
    });
  });

  it("shows a legacy saved-report-only panel as one entry", () => {
    const out = withSavedReport([], { markdown: REPORT, at: "2026-08-07T12:00:00Z" });
    expect(out).toEqual([{ type: "text", text: REPORT, at: "2026-08-07T12:00:00Z" }]);
  });

  it("adds nothing when the report is already in the transcript", () => {
    const lines: AgentOutputEntry[] = [{ type: "text", text: REPORT, at: "2026-08-07T12:00:00Z" }];
    const out = withSavedReport(lines, { markdown: REPORT, at: "2026-08-07T12:00:00Z" });
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(lines[0]);
  });

  it("adds nothing for a missing or empty report", () => {
    const lines: AgentOutputEntry[] = [{ type: "text", text: "hi", at: "2026-08-07T12:00:00Z" }];
    expect(withSavedReport(lines, null)).toHaveLength(1);
    expect(withSavedReport(lines, { markdown: "  ", at: "2026-08-07T12:00:00Z" })).toHaveLength(1);
  });

  it("never mutates the caller's array", () => {
    const lines: AgentOutputEntry[] = [{ type: "text", text: "hi", at: "2026-08-07T12:00:00Z" }];
    const out = withSavedReport(lines, { markdown: REPORT, at: "2026-08-07T12:00:00Z" });
    expect(lines).toHaveLength(1);
    expect(out).not.toBe(lines);
  });
});
