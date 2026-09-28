/**
 * PM chat layout (#0563): tool/diagnostic cards inside a constrained `.ai-chat-log`
 * must not collapse to a ~2px horizontal rule when the log is full.
 *
 * Full `style.css` is not loaded in vitest (Tailwind @import), so this file
 * injects the chat-log flex rules under test. `ai-chat-standard.test.ts` asserts
 * they stay in the real stylesheet.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PmChatSurface from "../src/components/PmChatSurface.vue";
import type { AgentOutputEntry } from "../src/types";

let wrapper: VueWrapper | null = null;

beforeAll(() => {
  const style = document.createElement("style");
  style.id = "pm-chat-layout-fixture";
  style.textContent = `
    .ai-chat-log {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .ai-chat-log > * {
      flex-shrink: 0;
    }
    .agent-tool {
      border: 1px solid #888;
      overflow: hidden;
      background: #111;
    }
    .agent-tool summary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      list-style: none;
    }
    .agent-tool summary::-webkit-details-marker {
      display: none;
    }
  `;
  document.head.appendChild(style);
});

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe("PmChatSurface layout", () => {
  it("does not flex-shrink tool-call rows inside a constrained log", () => {
    const lines: AgentOutputEntry[] = [
      { type: "text", text: "Planning the change.", at: "2026-09-28T00:00:01.000Z" },
      {
        type: "tool",
        tool: "bash",
        state: "completed",
        at: "2026-09-28T00:00:02.000Z",
        input: "repoos list",
        output: "ok",
      },
      { type: "text", text: "Done.", at: "2026-09-28T00:00:03.000Z" },
    ];

    wrapper = mount(PmChatSurface, {
      attachTo: document.body,
      props: {
        chatId: "pm-layout-test",
        lines,
        busy: false,
        welcomeTitle: "PM",
        welcomeBody: "Ask anything.",
        logLabel: "PM chat",
      },
    });

    const log = wrapper.find(".ai-chat-log").element as HTMLElement;
    log.style.height = "160px";
    log.style.overflow = "auto";

    const toolRow = wrapper.find('[data-testid="chat-tool-row"]').element as HTMLElement;
    expect(getComputedStyle(toolRow).flexShrink).toBe("0");
  });
});
