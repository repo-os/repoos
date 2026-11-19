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

describe("TelegramChatNotificationsSettings — states and copy", () => {
  function enableTelegram(): void {
    const config = useConfigStore();
    config.form["telegram.enabled"] = true;
    config.loaded = true;
  }

  it("says a failed chat-list load is an error, never 'no chats connected'", async () => {
    enableTelegram();
    api.mockRejectedValueOnce(new Error("Can't reach the RepoOS server"));

    const wrapper = mount(TelegramChatNotificationsSettings);
    await flushPromises();

    expect(wrapper.text()).toContain("Couldn't load your Telegram chats.");
    expect(wrapper.text()).not.toContain("No Telegram chats are connected yet");
    wrapper.unmount();
  });

  it("explains how to connect a chat in plain English, without 'admin API' as the only step", async () => {
    enableTelegram();
    api.mockResolvedValueOnce({ chats: [] });

    const wrapper = mount(TelegramChatNotificationsSettings);
    await flushPromises();

    expect(wrapper.text()).toContain("No Telegram chats are connected yet.");
    expect(wrapper.text()).toContain("/bind");
    expect(wrapper.text()).not.toContain("bound");
    wrapper.unmount();
  });

  it("sends the toggle as a JSON PATCH the server can parse", async () => {
    enableTelegram();
    const wrapper = mount(TelegramChatNotificationsSettings);
    await flushPromises();
    api.mockClear();
    api.mockResolvedValue({ ok: true });

    await wrapper.find('[role="switch"]').trigger("click");
    await flushPromises();

    const [path, init] = api.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/auth/telegram/chats/42");
    expect(init.method).toBe("PATCH");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ notificationsEnabled: false });
    wrapper.unmount();
  });

  it("names the chat and offers a retry when a toggle fails", async () => {
    enableTelegram();
    const wrapper = mount(TelegramChatNotificationsSettings);
    await flushPromises();
    api.mockRejectedValueOnce(new Error("Chat binding not found"));

    await wrapper.find('[role="switch"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Couldn't turn notifications off for Ops. Try again.");
    wrapper.unmount();
  });
});

describe("TelegramChatNotificationsSettings — review fixes", () => {
  it("names Telegram chat types in plain English, never the raw type", async () => {
    const config = useConfigStore();
    config.form["telegram.enabled"] = true;
    config.loaded = true;
    api.mockResolvedValueOnce({
      chats: [{ telegramChatId: 7, chatType: "supergroup", title: "Team", notificationsEnabled: true }],
    });

    const wrapper = mount(TelegramChatNotificationsSettings);
    await flushPromises();

    expect(wrapper.text()).toContain("Group · id 7");
    expect(wrapper.text()).not.toContain("supergroup");
    wrapper.unmount();
  });

  it("clears a stale toggle error when the feature is switched off", async () => {
    const config = useConfigStore();
    config.form["telegram.enabled"] = true;
    config.loaded = true;
    const wrapper = mount(TelegramChatNotificationsSettings);
    await flushPromises();
    api.mockRejectedValueOnce(new Error("Chat binding not found"));
    await wrapper.find('[role="switch"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Couldn't turn notifications off for Ops");

    config.form["telegram.enabled"] = false;
    await flushPromises();

    expect(wrapper.text()).not.toContain("Couldn't turn notifications");
    wrapper.unmount();
  });
});
