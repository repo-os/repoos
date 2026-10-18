/**
 * Queued sends in every AI chat (#0821).
 *
 * A message sent while an agent is busy is queued and read when the turn ends;
 * the composer stays usable and every chat shows the same "queued" note. These
 * tests are the machine-readable half of that contract:
 *
 *  - `ChatQueuedNotice` shows the shared wording only while a message waits.
 *  - `useQueuedSend` latches on a queued send and clears when the turn ends.
 *  - every chat surface renders the shared notice, and its send control is no
 *    longer disabled merely because the agent is busy.
 */
import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ChatQueuedNotice from "../src/components/ChatQueuedNotice.vue";
import { useQueuedSend } from "../src/composables/useQueuedSend";

const COMPONENTS_DIR = resolve(__dirname, "../src/components");

function readSurface(file: string): string {
  return readFileSync(resolve(COMPONENTS_DIR, file), "utf8");
}

const QUEUED_CHATS = [
  "PmChatSurface.vue",
  "DebuggerChat.vue",
  "TaskDebuggerChat.vue",
  "CTOPanel.vue",
  "RepoGuideChat.vue",
] as const;

describe("chat queued state", () => {
  it("shows the shared queued wording while a message waits", () => {
    const active = mount(ChatQueuedNotice, { props: { active: true } });
    expect(active.text()).toContain("Queued — will be read when the current turn ends.");
    expect(active.find('[data-test-id="chat-queued-note"]').exists()).toBe(true);

    const idle = mount(ChatQueuedNotice, { props: { active: false } });
    expect(idle.text()).toBe("");
    expect(idle.find('[data-test-id="chat-queued-note"]').exists()).toBe(false);
  });

  it("latches on a queued send and clears when the turn ends", async () => {
    const busy = ref(true);
    const { queued, markQueued } = useQueuedSend(() => busy.value);
    expect(queued.value).toBe(false);

    markQueued();
    expect(queued.value).toBe(true);

    // The turn the message waited on ends — the note clears.
    busy.value = false;
    await nextTick();
    expect(queued.value).toBe(false);
  });

  for (const file of QUEUED_CHATS) {
    it(`${file} renders the shared queued notice`, () => {
      expect(readSurface(file)).toContain("ChatQueuedNotice");
    });

    it(`${file} keeps send enabled while the agent is busy`, () => {
      const source = readSurface(file);
      const sendTag = source.match(/<ChatSendButton[^>]*>/)?.[0] ?? "";
      expect(sendTag, `${file} must render <ChatSendButton>`).not.toBe("");
      expect(
        sendTag,
        `${file} disables send while busy — a queued send must stay possible`,
      ).not.toMatch(/\bbusy\b/);
    });
  }
});
