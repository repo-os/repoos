/**
 * Component tests for TelegramSettingsPanel.vue (#0538): connection status,
 * Connect Telegram (managed provisioning + Bring Your Own Bot Token), the
 * test-message control, and the bound-chats list with unbind. The hard
 * security invariant this file pins: no bot token — pasted, provisioned, or
 * server-echoed — ever appears in the rendered DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TelegramSettingsPanel from "../src/components/TelegramSettingsPanel.vue";
import Select from "../src/components/ui/select/root.vue";
import { useAuthStore } from "../src/stores/auth";

interface StubRoute {
  match: (url: string, opts?: RequestInit) => boolean;
  status?: number;
  body: unknown;
  calls?: { url: string; opts?: RequestInit }[];
}

function stubFetch(routes: StubRoute[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string, opts?: RequestInit) => {
    const hit = routes.find((r) => r.match(String(url), opts));
    if (!hit) throw new Error(`unexpected fetch ${String(url)} ${opts?.method ?? "GET"}`);
    hit.calls?.push({ url: String(url), opts });
    return {
      ok: (hit.status ?? 200) < 400,
      status: hit.status ?? 200,
      headers: { get: () => "application/json" },
      json: async () => hit.body,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const statusRoute = (body: unknown, status = 200): StubRoute => ({
  match: (url, opts) => url.includes("/api/telegram/status") && (opts?.method ?? "GET") === "GET",
  status,
  body,
});

const linksRoute = (links: unknown[]): StubRoute => ({
  match: (url, opts) =>
    url.includes("/api/auth/telegram/links") && (opts?.method ?? "GET") === "GET",
  body: { links },
});

const testMessageRoute = (
  body: unknown,
  status = 200,
  calls: StubRoute["calls"] = [],
): StubRoute => ({
  match: (url, opts) => url.includes("/api/telegram/test-message") && opts?.method === "POST",
  status,
  body,
  calls,
});

const disconnectedStatus = {
  enabled: true,
  connected: false,
  transport: { mode: "off" },
  managedProvisioning: { configured: false },
  lastError: null,
  updatedAt: null,
};

const connectedStatus = {
  enabled: true,
  connected: true,
  bot: {
    id: 1,
    username: "repoos_bot",
    displayName: "RepoOS Bot",
    canReadAllGroupMessages: false,
    source: "byo-token",
  },
  transport: { mode: "polling" },
  managedProvisioning: { configured: false },
  lastError: null,
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  setActivePinia(createPinia());
  // /api/auth/telegram/links (bound-chats list, test-message target picker)
  // requires an authenticated admin with no auth-disabled fallback — same
  // gate AuthSettingsPanel.vue uses. Force it on so these tests exercise the
  // list/test-message/unbind paths the way an admin session actually would.
  useAuthStore().authEnabled = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TelegramSettingsPanel — status", () => {
  it("renders 'Not connected' when disconnected", async () => {
    stubFetch([statusRoute(disconnectedStatus), linksRoute([])]);
    const wrapper = mount(TelegramSettingsPanel, { props: { enabled: true } });
    await flushPromises();
    expect(wrapper.text()).toContain("Not connected");
    wrapper.unmount();
  });

  it("renders bot identity when connected, and never a token", async () => {
    stubFetch([statusRoute(connectedStatus), linksRoute([])]);
    const wrapper = mount(TelegramSettingsPanel, { props: { enabled: true } });
    await flushPromises();
    expect(wrapper.text()).toContain("RepoOS Bot");
    expect(wrapper.text()).toContain("@repoos_bot");
    expect(wrapper.html()).not.toMatch(/\d{6,}:[A-Za-z0-9_-]{20,}/);
    wrapper.unmount();
  });

  it("shows a notice instead of connect controls while the feature switch is off", async () => {
    stubFetch([statusRoute({ ...disconnectedStatus, enabled: false }), linksRoute([])]);
    const wrapper = mount(TelegramSettingsPanel, { props: { enabled: false } });
    await flushPromises();
    expect(wrapper.text()).toContain("Turn on the Telegram bot switch");
    expect(wrapper.find("#tgp-byo-token").exists()).toBe(false);
    wrapper.unmount();
  });

  it("skips the admin-only links call (never a console 401) when auth is disabled", async () => {
    // /api/telegram/status has an auth-disabled fallback (requireTelegramAdmin);
    // /api/auth/telegram/links does not, so the panel must not even attempt
    // it here — a bare fetch to a route that always 401s without a session.
    useAuthStore().authEnabled = false;
    const fn = stubFetch([statusRoute(connectedStatus)]);
    const wrapper = mount(TelegramSettingsPanel, { props: { enabled: true } });
    await flushPromises();
    expect(fn.mock.calls.some(([url]) => String(url).includes("/api/auth/telegram/links"))).toBe(
      false,
    );
    wrapper.unmount();
  });
});

describe("TelegramSettingsPanel — Bring Your Own Bot Token", () => {
  it("posts the token, never renders it, and refreshes status on success", async () => {
    const connectCalls: StubRoute["calls"] = [];
    let connected = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes("/api/telegram/connect") && opts?.method === "POST") {
          connectCalls.push({ url: u, opts });
          connected = true;
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({ ok: true, bot: connectedStatus.bot, warnings: [] }),
          } as unknown as Response;
        }
        if (u.includes("/api/telegram/status")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => (connected ? connectedStatus : disconnectedStatus),
          } as unknown as Response;
        }
        if (u.includes("/api/auth/telegram/links")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({ links: [] }),
          } as unknown as Response;
        }
        throw new Error(`unexpected fetch ${u}`);
      }),
    );

    const wrapper = mount(TelegramSettingsPanel, { props: { enabled: true } });
    await flushPromises();

    await wrapper.find("#tgp-byo-token").setValue("123456789:fake-token-value-not-real");
    const connectButtons = wrapper.findAll("button").filter((b) => b.text() === "Connect");
    expect(connectButtons.length).toBe(1);
    await connectButtons[0].trigger("click");
    await flushPromises();

    expect(connectCalls.length).toBe(1);
    const payload = JSON.parse(String(connectCalls[0]?.opts?.body ?? "{}"));
    expect(payload.token).toBe("123456789:fake-token-value-not-real");
    expect(wrapper.html()).not.toContain("123456789:fake-token-value-not-real");
    expect(wrapper.text()).toContain("RepoOS Bot");
    wrapper.unmount();
  });
});

describe("TelegramSettingsPanel — test message", () => {
  const boundLink = {
    telegramUserId: 555111,
    email: "member@repoos.org",
    telegramUsername: "boundchat",
    role: "member",
    allowlisted: true,
  };

  it("lists bound chats and sends a test message to the selected one", async () => {
    const testCalls: StubRoute["calls"] = [];
    stubFetch([
      statusRoute(connectedStatus),
      linksRoute([boundLink]),
      testMessageRoute({ ok: true, messageId: 7 }, 200, testCalls),
    ]);
    const wrapper = mount(TelegramSettingsPanel, { props: { enabled: true } });
    await flushPromises();

    expect(wrapper.text()).toContain("@boundchat");
    expect(wrapper.text()).toContain("member@repoos.org");

    // Drive the shared Select's update event directly (the same pattern used
    // for other custom dropdowns in this codebase), rather than clicking
    // through Radix internals.
    const select = wrapper.findComponent(Select);
    expect(select.exists()).toBe(true);
    select.vm.$emit("update:modelValue", String(boundLink.telegramUserId));
    await flushPromises();

    const sendButton = wrapper.findAll("button").find((b) => b.text().includes("Send test"));
    expect(sendButton).toBeTruthy();
    await sendButton!.trigger("click");
    await flushPromises();

    expect(testCalls?.length).toBe(1);
    const payload = JSON.parse(String(testCalls?.[0]?.opts?.body ?? "{}"));
    expect(payload.chatId).toBe(boundLink.telegramUserId);
    expect(wrapper.text()).toContain("Sent — check the chat in Telegram.");
    wrapper.unmount();
  });

  it("surfaces the server's own failure text", async () => {
    stubFetch([
      statusRoute(connectedStatus),
      linksRoute([boundLink]),
      testMessageRoute({ error: "Forbidden: bot was blocked by the user" }, 403),
    ]);
    const wrapper = mount(TelegramSettingsPanel, { props: { enabled: true } });
    await flushPromises();
    const select = wrapper.findComponent(Select);
    select.vm.$emit("update:modelValue", String(boundLink.telegramUserId));
    await flushPromises();
    const sendButton = wrapper.findAll("button").find((b) => b.text().includes("Send test"));
    await sendButton!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Forbidden: bot was blocked by the user");
    wrapper.unmount();
  });
});

describe("TelegramSettingsPanel — unbind", () => {
  it("confirms then deletes the link and reloads the list", async () => {
    const boundLink = {
      telegramUserId: 555111,
      email: "member@repoos.org",
      telegramUsername: "boundchat",
      role: "member",
      allowlisted: true,
    };
    const deleteCalls: StubRoute["calls"] = [];
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    let linksState = [boundLink];
    const fn = vi.fn(async (url: string, opts?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/telegram/status")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => connectedStatus,
        } as unknown as Response;
      }
      if (u.includes("/api/auth/telegram/links/") && opts?.method === "DELETE") {
        deleteCalls.push({ url: u, opts });
        linksState = [];
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({ ok: true }),
        } as unknown as Response;
      }
      if (u.includes("/api/auth/telegram/links")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({ links: linksState }),
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    vi.stubGlobal("fetch", fn);

    const wrapper = mount(TelegramSettingsPanel, { props: { enabled: true } });
    await flushPromises();
    expect(wrapper.text()).toContain("@boundchat");

    const unbindButton = wrapper.findAll("button").find((b) => b.text() === "Unbind");
    expect(unbindButton).toBeTruthy();
    await unbindButton!.trigger("click");
    await flushPromises();

    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0]?.url).toContain(`/api/auth/telegram/links/${boundLink.telegramUserId}`);
    expect(wrapper.text()).toContain("No chats bound yet.");
    wrapper.unmount();
  });
});
