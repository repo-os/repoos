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
  ACTIVITY_ANIMATION_STYLES,
  ACTIVITY_ANIMATION_STYLE_LABELS,
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
      activityAnimationSize: "auto",
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
        default: "auto",
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

describe("Settings activity animation size (#0813)", () => {
  it("offers Auto plus a 1–3ch slider that previews and saves the explicit size", async () => {
    const config = useConfigStore();
    const saveSpy = vi.spyOn(config, "save").mockResolvedValue(undefined);

    const wrapper = await mountSettings();
    const range = wrapper.get("#setting-activityAnimationSize-range");
    expect(range.attributes("min")).toBe("1");
    expect(range.attributes("max")).toBe("3");
    expect(range.attributes("step")).toBe("0.5");
    expect((range.element as HTMLInputElement).disabled).toBe(true);

    const autoSwitch = wrapper.get("#setting-activityAnimationSize [role='switch']");
    expect(autoSwitch.attributes("aria-checked")).toBe("true");
    await autoSwitch.trigger("click");
    await flushPromises();
    expect((range.element as HTMLInputElement).disabled).toBe(false);

    await range.setValue("2.5");
    await flushPromises();

    for (const indicator of preview(wrapper)) {
      expect(indicator.classes()).toContain("ai-sized");
      expect(indicator.element.getAttribute("style")).toContain("--ai-size-ch: 2.5");
    }
    expect(wrapper.get("#setting-activityAnimationSize .activity-size-value").text()).toBe("2.5ch");

    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 3000 });
    const body = saveSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body.activityAnimationSize).toBe("2.5");
    saveSpy.mockRestore();
    wrapper.unmount();
  });

  it("returns to Auto, which clears the explicit size for persistence", async () => {
    const config = useConfigStore();
    config.form.activityAnimationSize = "3";
    const saveSpy = vi.spyOn(config, "save").mockResolvedValue(undefined);

    const wrapper = await mountSettings();
    const range = wrapper.get("#setting-activityAnimationSize-range");
    expect((range.element as HTMLInputElement).disabled).toBe(false);

    await wrapper.get("#setting-activityAnimationSize [role='switch']").trigger("click");
    await flushPromises();
    expect((range.element as HTMLInputElement).disabled).toBe(true);
    for (const indicator of preview(wrapper)) {
      expect(indicator.classes()).not.toContain("ai-sized");
      expect(indicator.element.getAttribute("style") ?? "").not.toContain("--ai-scale");
    }

    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 3000 });
    const body = saveSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body.activityAnimationSize).toBe("auto");
    saveSpy.mockRestore();
    wrapper.unmount();
  });
});
