/**
 * Config shot fixtures must reach the Settings auto-save form (#0828).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { applyShotPreviewConfigFixture } from "../src/lib/shot-preview-fixtures";
import { useConfigStore } from "../src/stores/config";
import type { ConfigField } from "../src/types";
import SettingsView from "../src/views/SettingsView.vue";
import ActivityIndicator from "../src/components/ActivityIndicator.vue";
import {
  ACTIVITY_ANIMATION_STYLES,
  ACTIVITY_ANIMATION_STYLE_LABELS,
} from "../../core/activity-animation.js";

const api = vi.spyOn(apiMod, "api");

const routeState = reactive<{ query: Record<string, string | string[]> }>({ query: {} });
const replaceSpy = vi.fn(
  async (to?: { query?: Record<string, string | string[]>; name?: string }) => {
    if (to?.query !== undefined) routeState.query = { ...to.query };
  },
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
    default: extra.default ?? "",
    description: "",
    options: extra.options ?? [],
    ...extra,
  } as ConfigField;
}

let pinia: ReturnType<typeof createPinia>;

beforeEach(async () => {
  pinia = createPinia();
  setActivePinia(pinia);
  routeState.query = {
    tab: "general",
    section: "activity-animation",
    shotState: "settings:birdQuickTrail",
  };
  replaceSpy.mockReset();
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
  api.mockResolvedValue({
    config: { activityAnimationStyle: "arcade-hopper" },
    schema: [
      schemaField("activityAnimationStyle", "select", {
        default: "arcade-hopper",
        options: ACTIVITY_ANIMATION_STYLES.map((value) => ({
          value,
          label: ACTIVITY_ANIMATION_STYLE_LABELS[value],
        })),
      }),
    ],
  });
  const config = useConfigStore();
  await config.load();
  applyShotPreviewConfigFixture(config, "settings:birdQuickTrail");
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = "";
});

function stylePreviews(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAllComponents(ActivityIndicator);
}

describe("settings:birdQuickTrail shot fixture (#0828)", () => {
  it("seeds the selector and preview after load", async () => {
    const wrapper = mount(SettingsView, {
      attachTo: document.body,
      global: { plugins: [pinia] },
    });
    await flushPromises();

    const trigger = wrapper.get("#setting-activityAnimationStyle [role='combobox']");
    expect(trigger.text()).toContain("Bird quick trail");
    for (const indicator of stylePreviews(wrapper)) {
      expect(indicator.find(".ai-style-bird-quick-trail").exists()).toBe(true);
    }
    wrapper.unmount();
  });

  it("keeps bird quick trail after a section= navigation re-applies the fixture", async () => {
    const config = useConfigStore();
    const wrapper = mount(SettingsView, {
      attachTo: document.body,
      global: { plugins: [pinia] },
    });
    await flushPromises();

    routeState.query = {
      tab: "general",
      section: "themes",
      shotState: "settings:birdQuickTrail",
    };
    await flushPromises();
    applyShotPreviewConfigFixture(config, "settings:birdQuickTrail");
    await flushPromises();

    routeState.query = {
      tab: "general",
      section: "activity-animation",
      shotState: "settings:birdQuickTrail",
    };
    await flushPromises();
    applyShotPreviewConfigFixture(config, "settings:birdQuickTrail");
    await flushPromises();

    const trigger = wrapper.get("#setting-activityAnimationStyle [role='combobox']");
    expect(trigger.text()).toContain("Bird quick trail");
    for (const indicator of stylePreviews(wrapper)) {
      expect(indicator.find(".ai-style-bird-quick-trail").exists()).toBe(true);
    }
    wrapper.unmount();
  });
});

describe("settings:rgbKeystorm shot fixture (#0833)", () => {
  it("seeds the selector and a square artwork preview", async () => {
    const config = useConfigStore();
    routeState.query = {
      tab: "general",
      section: "activity-animation",
      shotState: "settings:rgbKeystorm",
    };
    applyShotPreviewConfigFixture(config, "settings:rgbKeystorm");

    const wrapper = mount(SettingsView, {
      attachTo: document.body,
      global: { plugins: [pinia] },
    });
    await flushPromises();

    const trigger = wrapper.get("#setting-activityAnimationStyle [role='combobox']");
    expect(trigger.text()).toContain("RGB keystorm");
    for (const indicator of stylePreviews(wrapper)) {
      expect(indicator.find(".ai-style-rgb-keystorm").exists()).toBe(true);
      expect(indicator.find("svg.ai-art-svg").exists()).toBe(true);
    }
    wrapper.unmount();
  });
});
