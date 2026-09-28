import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import PmChatSurface from "../src/components/PmChatSurface.vue";
import * as clipboard from "../src/lib/clipboard";
import { useRepoStore } from "../src/stores/repo";

describe("PmChatSurface message copy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies human and assistant bubbles on click", async () => {
    setActivePinia(createPinia());
    const repo = useRepoStore();
    const copySpy = vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(true);

    const wrapper = mount(PmChatSurface, {
      props: {
        chatId: "pm:test",
        lines: [
          { type: "human", text: "from human" },
          { type: "text", text: "from assistant" },
        ],
        busy: false,
        welcomeTitle: "Welcome",
        welcomeBody: "Say hi",
        logLabel: "PM chat",
      },
      attachTo: document.body,
    });

    const bubbles = wrapper.findAll(".pm-bubble");
    expect(bubbles).toHaveLength(2);

    await bubbles[0].trigger("click");
    expect(copySpy).toHaveBeenLastCalledWith("from human");
    expect(repo.toasts.at(-1)?.message).toBe("Message copied");

    await bubbles[1].trigger("click");
    expect(copySpy).toHaveBeenLastCalledWith("from assistant");

    await bubbles[0].trigger("click");
    await bubbles[1].trigger("click");
    expect(repo.toasts.filter((t) => t.message === "Message copied").length).toBeGreaterThanOrEqual(
      2,
    );

    wrapper.unmount();
  });
});
