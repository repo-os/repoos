/**
 * Settings size control for the activity animation (#0813).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useConfigStore } from "../src/stores/config";
import type { ConfigField } from "../src/types";
import SettingsView from "../src/views/SettingsView.vue";
import ActivityIndicator from "../src/components/ActivityIndicator.vue";
import {
  ACTIVITY_ANIMATION_SIZES,
  ACTIVITY_ANIMATION_SIZE_LABELS,
  ACTIVITY_ANIMATION_SIZE_MAX_PX,
  ACTIVITY_ANIMATION_SIZE_MIN_PX,
  ACTIVITY_ANIMATION_SIZE_STEP_PX,
  ACTIVITY_ANIMATION_STYLES,
  ACTIVITY_ANIMATION_STYLE_LABELS,
  DEFAULT_ACTIVITY_ANIMATION_SIZE,
} from "../../core/activity-animation.js";

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
    default: extra.default ?? "",
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
      activityAnimationStyle: "orbital-pixel",
      activityAnimationSize: DEFAULT_ACTIVITY_ANIMATION_SIZE,
    },
    schema: [
      schemaField("activityAnimationStyle", "select", {
        default: "orbital-pixel",
        options: ACTIVITY_ANIMATION_STYLES.map((value) => ({
          value,
          label: ACTIVITY_ANIMATION_STYLE_LABELS[value],
        })),
      }),
      schemaField("activityAnimationSize", "select", {
        default: DEFAULT_ACTIVITY_ANIMATION_SIZE,
        options: ACTIVITY_ANIMATION_SIZES.map((value) => ({
          value,
          label: ACTIVITY_ANIMATION_SIZE_LABELS[value],
        })),
      }),
    ],
  };
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

function preview(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAllComponents(ActivityIndicator);
}

beforeEach(async () => {
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
  api.mockResolvedValue(settingsConfigResponse());
  await useConfigStore().load();
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("Settings activity animation size (#0813, pixels #0816)", () => {
  it("offers a pixel slider with no Auto toggle and a default tick", async () => {
    const config = useConfigStore();
    const saveSpy = vi.spyOn(config, "save").mockResolvedValue(undefined);

    const wrapper = await mountSettings();
    const range = wrapper.get("#setting-activityAnimationSize-range");
    expect(range.attributes("min")).toBe(String(ACTIVITY_ANIMATION_SIZE_MIN_PX));
    expect(range.attributes("max")).toBe(String(ACTIVITY_ANIMATION_SIZE_MAX_PX));
    expect(range.attributes("step")).toBe(String(ACTIVITY_ANIMATION_SIZE_STEP_PX));
    expect((range.element as HTMLInputElement).disabled).toBe(false);
    expect((range.element as HTMLInputElement).value).toBe(DEFAULT_ACTIVITY_ANIMATION_SIZE);

    // No Auto toggle anywhere in the control.
    expect(wrapper.find("#setting-activityAnimationSize [role='switch']").exists()).toBe(false);

    // The default (the middle step) is marked with a tick.
    const tick = wrapper.get(
      "#setting-activityAnimationSize [data-test-id='activity-size-default-tick']",
    );
    expect(tick.attributes("style")).toContain("left: 50%");

    expect(wrapper.get("#setting-activityAnimationSize .activity-size-value").text()).toBe(
      `${DEFAULT_ACTIVITY_ANIMATION_SIZE} px`,
    );

    await range.setValue("20");
    await flushPromises();

    expect(wrapper.get("#setting-activityAnimationSize .activity-size-value").text()).toBe("20 px");
    for (const indicator of preview(wrapper)) {
      expect(indicator.classes()).toContain("ai-sized");
      expect(indicator.element.getAttribute("style")).toContain("--ai-size-px: 20px");
    }

    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 3000 });
    const body = saveSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body.activityAnimationSize).toBe("20");
    saveSpy.mockRestore();
    wrapper.unmount();
  });

  it("starts at the saved size and maps a legacy character-width value", async () => {
    const config = useConfigStore();
    config.form.activityAnimationSize = "24";
    const wrapper = await mountSettings();
    expect(
      (wrapper.get("#setting-activityAnimationSize-range").element as HTMLInputElement).value,
    ).toBe("24");
    expect(wrapper.get("#setting-activityAnimationSize .activity-size-value").text()).toBe("24 px");
    wrapper.unmount();

    // A value saved before the unit change still selects a size, by ordinal.
    config.form.activityAnimationSize = "2";
    const legacy = await mountSettings();
    expect(
      (legacy.get("#setting-activityAnimationSize-range").element as HTMLInputElement).value,
    ).toBe("16");
    for (const indicator of preview(legacy)) {
      expect(indicator.element.getAttribute("style")).toContain("--ai-size-px: 16px");
    }
    legacy.unmount();
  });
});
