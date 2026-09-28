import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useConfigStore } from "../src/stores/config";
import TelegramChatNotificationsSettings from "../src/components/TelegramChatNotificationsSettings.vue";

const api = vi.spyOn(apiMod, "api");

beforeEach(() => {
  setActivePinia(createPinia());
  api.mockResolvedValue({
    chats: [
      {
        telegramChatId: 42,
        chatType: "private",
        title: "Ops",
        notificationsEnabled: true,
      },
    ],
  });
});

afterEach(() => {
  api.mockReset();
});

describe("TelegramChatNotificationsSettings", () => {
  it("renders a per-chat notification toggle for bound chats", async () => {
    const config = useConfigStore();
    config.form["telegram.enabled"] = true;
    config.loaded = true;

    mount(TelegramChatNotificationsSettings, { attachTo: document.body });
    await flushPromises();

    expect(document.getElementById("setting-telegram.chat.42.notifications")).not.toBeNull();
  });
});
