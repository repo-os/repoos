import { describe, expect, it } from "vitest";
import {
  copyTextForBubbleRow,
  copyTextForTaskDrawerRow,
  isCopyableBubbleRow,
  shouldCopyMessageOnClick,
} from "../src/lib/chat-message-copy";
import { toDisplayRows } from "../src/lib/chat-rows";
import type { AgentOutputEntry } from "../src/types";

function text(t: string): AgentOutputEntry {
  return { type: "text", text: t };
}

describe("copyTextForBubbleRow", () => {
  it("returns text for human and assistant bubbles only", () => {
    const human = toDisplayRows([{ type: "human", text: "hello" }])[0];
    const assistant = toDisplayRows([text("**md**")])[0];
    const status = toDisplayRows([{ type: "sys", d: "notice" }])[0];
    const tools = toDisplayRows([
      { type: "tool", tool: "bash", state: "completed", at: "2026-01-01T00:00:00Z" },
    ])[0];
    const stdout = toDisplayRows([{ s: "out", d: "legacy log line" }])[0];

    expect(copyTextForBubbleRow(human)).toBe("hello");
    expect(copyTextForBubbleRow(assistant)).toBe("**md**");
    expect(copyTextForBubbleRow(status)).toBeNull();
    expect(copyTextForBubbleRow(tools)).toBeNull();
    expect(copyTextForBubbleRow(stdout)).toBeNull();
    expect(isCopyableBubbleRow(stdout)).toBe(false);
    expect(isCopyableBubbleRow(human)).toBe(true);
    expect(isCopyableBubbleRow(status)).toBe(false);
  });
});

describe("copyTextForTaskDrawerRow", () => {
  it("returns text only for human and text kinds", () => {
    const human = toDisplayRows([{ type: "human", text: "hi" }])[0];
    const assistant = toDisplayRows([text("reply")])[0];
    const sys = toDisplayRows([{ type: "sys", d: "x" }])[0];

    expect(copyTextForTaskDrawerRow(human)).toBe("hi");
    expect(copyTextForTaskDrawerRow(assistant)).toBe("reply");
    expect(copyTextForTaskDrawerRow(sys)).toBeNull();
  });
});

describe("shouldCopyMessageOnClick", () => {
  function clickEvent(target: EventTarget | null): MouseEvent {
    return { target } as MouseEvent;
  }

  it("allows copy when there is no selection and target is plain content", () => {
    const span = document.createElement("span");
    span.textContent = "body";
    document.body.appendChild(span);
    window.getSelection()?.removeAllRanges();
    expect(shouldCopyMessageOnClick(clickEvent(span))).toBe(true);
    span.remove();
  });

  it("blocks copy when the user has selected text", () => {
    const div = document.createElement("div");
    div.textContent = "select me";
    document.body.appendChild(div);
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    expect(shouldCopyMessageOnClick(clickEvent(div))).toBe(false);
    sel.removeAllRanges();
    div.remove();
  });

  it("blocks copy when the click target is inside a link", () => {
    const a = document.createElement("a");
    a.href = "https://example.com";
    const inner = document.createElement("span");
    a.appendChild(inner);
    document.body.appendChild(a);
    window.getSelection()?.removeAllRanges();
    expect(shouldCopyMessageOnClick(clickEvent(inner))).toBe(false);
    a.remove();
  });
});
