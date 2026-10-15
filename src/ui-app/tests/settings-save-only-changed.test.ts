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
      attention: { slowRunMultiplier: 1.5 },
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
});
