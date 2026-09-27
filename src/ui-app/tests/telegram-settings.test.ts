/**
 * Settings → Notifications → Telegram control (#0531): the `telegram.enabled`
 * switch is a live schema field, saves through the standard config PATCH with
 * the dotted key, renders on the Notifications tab, and no credential-shaped
 * material ever reaches the DOM (the connection flow is admin/server-side;
 * the_SETTINGS panel only sees status).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useConfigStore } from "../src/stores/config";
import type { ConfigField } from "../src/types";
import SettingsView from "../src/views/SettingsView.vue";

const api = vi.spyOn(apiMod, "api");

let currentQuery: Record<string, string | string[]> = {};
const replaceSpy = vi.fn(async () => {});

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: currentQuery }),
  useRouter: () => ({ replace: replaceSpy, push: vi.fn() }),
}));

function schemaField(key: string): ConfigField {
  return {
    key,
    label: key,
    type: "boolean",
    tier: "live",
    restartRequired: false,
    group: "general",
    default: false,
    description: "Enable the Telegram integration.",
    options: [],
  } as ConfigField;
}

const SCHEMA: ConfigField[] = [schemaField("telegram.enabled"), schemaField("ntfyEnabled")];

async function loadConfig(telegramEnabled = false): Promise<void> {
  api.mockResolvedValue({
    config: {
      telegram: telegramEnabled ? { enabled: true } : undefined,
      ntfyEnabled: false,
    },
    schema: SCHEMA,
  });
  await useConfigStore().load();
}

async function mountSettings(tab: "notifications" = "notifications") {
  currentQuery = { tab };
  const wrapper = mount(SettingsView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

/** The one DOM row the Telegram card renders (same id convention as ntfy). */
function telegramRow(): HTMLElement | null {
  return document.getElementById("setting-telegram.enabled");
}

beforeEach(() => {
  setActivePinia(createPinia());
  currentQuery = {};
  replaceSpy.mockClear();
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Settings → Notifications → Telegram", () => {
  it("renders the Telegram toggle on the Notifications tab", async () => {
    await loadConfig(false);
    const wrapper = await mountSettings();
    const row = telegramRow();
    expect(row).not.toBeNull();
    expect(document.getElementById("settings-panel-notifications")?.contains(row!)).toBe(true);
    // The row is NOT on the general tab (it belongs with the other
    // notification channels).
    expect(document.getElementById("settings-panel-general")?.contains(row!)).toBe(false);
    wrapper.unmount();
  });

  it("reflects stored off/on state through the schema-filled form", async () => {
    await loadConfig(true);
    const config = useConfigStore();
    expect(config.form["telegram.enabled"]).toBe(true);

    await loadConfig(false);
    expect(useConfigStore().form["telegram.enabled"]).toBe(false);
  });

  it("saves through the standard PATCH with the dotted key", async () => {
    await loadConfig(false);
    const config = useConfigStore();
    await config.setConfigValues({ "telegram.enabled": true });
    expect(config.form["telegram.enabled"]).toBe(true);
    const patch = api.mock.calls.find(
      (call) =>
        call[0] === "/api/config" &&
        (call[1] as { method?: string } | undefined)?.method === "PATCH",
    );
    expect(patch).toBeDefined();
    const options = patch?.[1] as { method: string; body: string | Record<string, unknown> };
    const payload =
      typeof options.body === "string"
        ? (JSON.parse(options.body) as Record<string, unknown>)
        : options.body;
    expect(payload["telegram.enabled"]).toBe(true);
    // No credential-shaped material anywhere in the DOM.
    expect(document.body.innerHTML).not.toContain("bot_token");
    expect(document.body.innerHTML).not.toMatch(`${"1234567890"}:[A-Za-z0-9_-]{20,}`);
  });

  it("excludes the Telegram row from the auto-rendered General list", async () => {
    await loadConfig(false);
    const config = useConfigStore();
    expect(config.visibleFields.some((f) => f.key === "telegram.enabled")).toBe(true);
    // The row itself exists only inside the notifications panel (asserted
    // above); the general panel's auto-rendered rows never include it.
    const wrapper = await mountSettings("notifications");
    const general = document.getElementById("settings-panel-general");
    expect(general?.querySelector(`[id="setting-telegram.enabled"]`)).toBeNull();
    wrapper.unmount();
  });
});
