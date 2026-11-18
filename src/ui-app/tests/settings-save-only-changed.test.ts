/**
 * Settings view sends only changed fields on save (#0797).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useConfigStore } from "../src/stores/config";
import type { ConfigField } from "../src/types";
import SettingsView from "../src/views/SettingsView.vue";
import Select from "../src/components/ui/select/root.vue";
import { ACTIVITY_ANIMATION_STYLES } from "../../core/activity-animation.js";

const api = vi.spyOn(apiMod, "api");

const routeState = reactive<{ query: Record<string, string | string[]> }>({ query: {} });
const replaceSpy = vi.fn(
  async (_to?: { query?: Record<string, string | string[]>; name?: string }) => {},
);

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: replaceSpy, push: vi.fn() }),
}));

function schemaField(
  key: string,
  type: ConfigField["type"],
  extra: Partial<ConfigField> = {},
): ConfigField {
  return {
    key,
    label: key,
    type,
    tier: "live",
    restartRequired: false,
    default: extra.default ?? (type === "number" ? 0 : ""),
    description: "",
    options: extra.options ?? [],
    ...extra,
  } as ConfigField;
}

function settingsConfigResponse(): {
  config: Record<string, unknown>;
  schema: ConfigField[];
} {
  return {
    config: {
      maxActiveTasks: 3,
      activityAnimationStyle: "orbital-pixel",
      attention: { slowRunMultiplier: 1.5, spendAlertUsd: 0 },
      remoteValidation: { command: "", requiredTools: [] },
    },
    schema: [
      schemaField("maxActiveTasks", "number", { default: 3 }),
      schemaField("activityAnimationStyle", "select", {
        default: "orbital-pixel",
        options: ACTIVITY_ANIMATION_STYLES.map((value) => ({ value, label: value })),
      }),
      schemaField("attention.slowRunMultiplier", "number", {
        default: 1.5,
        min: 0.1,
        step: 0.1,
      }),
      schemaField("attention.spendAlertUsd", "number", { default: 0, min: 0, step: 1 }),
      schemaField("remoteValidation.command", "string", {
        default: "",
        tier: "restart",
        restartRequired: true,
      }),
      schemaField("remoteValidation.requiredTools", "array", {
        default: [],
        tier: "restart",
        restartRequired: true,
      }),
    ],
  };
}

async function loadSettingsConfig(): Promise<void> {
  api.mockResolvedValue(settingsConfigResponse());
  await useConfigStore().load();
}

let pinia: ReturnType<typeof createPinia>;

async function mountSettings(): Promise<ReturnType<typeof mount>> {
  routeState.query = { tab: "general" };
  const wrapper = mount(SettingsView, {
    attachTo: document.body,
    global: { plugins: [pinia] },
  });
  await flushPromises();
  return wrapper;
}

function activityAnimationSelect(wrapper: ReturnType<typeof mount>) {
  const row = document.getElementById("setting-activityAnimationStyle");
  expect(row).not.toBeNull();
  const match = wrapper.findAllComponents(Select).find((c) => row?.contains(c.element as Node));
  expect(match).toBeDefined();
  return match!;
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  routeState.query = {};
  replaceSpy.mockReset();
  replaceSpy.mockImplementation(async (to?: { query?: Record<string, string | string[]> }) => {
    if (to?.query !== undefined) {
      routeState.query = { ...to.query };
    }
  });
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("SettingsView save sends only changed fields (#0797)", () => {
  it("shows spend alert validation and saves only whole nonnegative dollar amounts", async () => {
    await loadSettingsConfig();
    const config = useConfigStore();
    const saveSpy = vi.spyOn(config, "save").mockResolvedValue(undefined);
    const wrapper = await mountSettings();
    await wrapper.findAll('[role="tab"]')[1]!.trigger("click");

    const input = document
      .getElementById("setting-attention.spendAlertUsd")
      ?.querySelector("input");
    expect(input).not.toBeNull();

    await wrapper.find("#setting-attention\\.spendAlertUsd input").setValue("-1");
    expect(wrapper.find("#spend-alert-error").text()).toContain("zero or more");
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(saveSpy).not.toHaveBeenCalled();

    await wrapper.find("#setting-attention\\.spendAlertUsd input").setValue("12.5");
    expect(wrapper.find("#spend-alert-error").text()).toContain("whole dollar");
    expect(saveSpy).not.toHaveBeenCalled();

    await wrapper.find("#setting-attention\\.spendAlertUsd input").setValue("12");
    expect(wrapper.find("#spend-alert-error").exists()).toBe(false);
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 3000 });
    expect(saveSpy.mock.calls.at(-1)?.[0]).toEqual({ "attention.spendAlertUsd": "12" });

    wrapper.unmount();
  });

  it("uses the mobile section navigation below 720px and keeps save errors visible", async () => {
    let onChange: ((event: MediaQueryListEvent) => void) | undefined;
    const media = {
      matches: true,
      addEventListener: vi.fn((_event: string, callback: (event: MediaQueryListEvent) => void) => {
        onChange = callback;
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media),
    );
    await loadSettingsConfig();
    const config = useConfigStore();
    vi.spyOn(config, "save").mockImplementation(async () => {
      config.error = "Settings could not be saved";
      throw new Error(config.error);
    });

    const wrapper = await mountSettings();
    await flushPromises();
    expect(wrapper.find(".settings-mobile-nav").exists()).toBe(true);
    expect(wrapper.find(".settings-tabs").exists()).toBe(true);
    expect(wrapper.findAll(".settings-mobile-nav-btn")).toHaveLength(7);
    expect(document.getElementById("setting-maxActiveTasks")).not.toBeNull();

    await wrapper.findAll(".settings-mobile-nav-btn")[1]!.trigger("click");
    expect(routeState.query.tab).toBe("notifications");
    expect(wrapper.find(".settings-mobile-nav-btn.active").text()).toBe("Notifications");
    await wrapper.findAll(".settings-mobile-nav-btn")[0]!.trigger("click");
    await activityAnimationSelect(wrapper).setValue("cursor-scan-pulse");
    await vi.waitFor(() => expect(config.error).toBe("Settings could not be saved"), {
      timeout: 3000,
    });
    expect(wrapper.find(".save-msg.err").text()).toContain("Settings could not be saved");

    wrapper.unmount();
    expect(media.removeEventListener).toHaveBeenCalled();
  });

  it("keeps the desktop tab strip at and above 720px", async () => {
    await loadSettingsConfig();
    const wrapper = await mountSettings();
    expect(wrapper.find(".settings-mobile-nav").exists()).toBe(false);
    expect(wrapper.find('[role="tablist"] .settings-tab-btn').exists()).toBe(true);
    wrapper.unmount();
  });

  it("auto-save omits unchanged number fields when only activity animation changes", async () => {
    await loadSettingsConfig();
    const config = useConfigStore();
    const saveSpy = vi.spyOn(config, "save").mockResolvedValue(undefined);

    const wrapper = await mountSettings();
    await activityAnimationSelect(wrapper).setValue("cursor-scan-pulse");
    await flushPromises();
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 3000 });

    const body = saveSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body.activityAnimationStyle).toBe("cursor-scan-pulse");
    expect("attention.slowRunMultiplier" in body).toBe(false);
    expect("maxActiveTasks" in body).toBe(false);

    saveSpy.mockRestore();
    wrapper.unmount();
  });

  it("renders and saves a project command and its required runner tools", async () => {
    await loadSettingsConfig();
    const config = useConfigStore();
    const saveSpy = vi.spyOn(config, "save").mockResolvedValue(undefined);

    const wrapper = await mountSettings();
    const commandRow = document.getElementById("setting-remoteValidation.command");
    const toolsRow = document.getElementById("setting-remoteValidation.requiredTools");
    expect(commandRow).not.toBeNull();
    expect(toolsRow).not.toBeNull();
    expect(commandRow?.querySelector("input")).not.toBeNull();
    expect(toolsRow?.querySelector("input")).not.toBeNull();

    await wrapper
      .find('[data-config-key="remoteValidation.command"] input')
      .setValue("./scripts/ci-remote.sh");
    await wrapper
      .find('[data-config-key="remoteValidation.requiredTools"] input')
      .setValue("java, gradle, node");
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 3000 });

    const body = saveSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body["remoteValidation.command"]).toBe("./scripts/ci-remote.sh");
    expect(body["remoteValidation.requiredTools"]).toEqual(["java", "gradle", "node"]);

    saveSpy.mockRestore();
    wrapper.unmount();
  });
});
