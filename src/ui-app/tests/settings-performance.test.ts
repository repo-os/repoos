import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { getConfigSchema } from "../../core/config.js";
import * as apiMod from "../src/api";
import {
  generalSectionForKey,
  isGeneralSchemaFieldKey,
  resolveSettingLocation,
} from "../src/settings-location.js";
import { useConfigStore } from "../src/stores/config";
import type { ConfigField } from "../src/types";
import SettingsView from "../src/views/SettingsView.vue";

const api = vi.spyOn(apiMod, "api");

const routeState = reactive<{ query: Record<string, string | string[]> }>({ query: {} });

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

describe("Settings — performance controls (#0836)", () => {
  const keys = [
    "localChecks.maxConcurrent",
    "localChecks.queueTimeoutMs",
    "playwright.maxConcurrent",
    "playwright.queueTimeoutMs",
    "pressureGuard.enabled",
    "pressureGuard.maxLoadPerCpu",
    "pressureGuard.minAvailableMemRatio",
    "pressureGuard.maxSwapUsedRatio",
    "pressureGuard.maxCompressorRatio",
    "pressureGuard.activityWindowSec",
    "pressureGuard.maxSwapIoBytesPerSec",
    "pressureGuard.maxPageoutBytesPerSec",
    "pressureGuard.minMemoryFreePercent",
    "pressureGuard.maxPsiMemoryAvg10",
  ];

  it("exposes schema rows for every new performance key", () => {
    const schema = getConfigSchema();
    for (const key of keys) {
      expect(schema.some((f) => f.key === key)).toBe(true);
    }
  });

  it("maps local caps to the Performance section", () => {
    expect(generalSectionForKey("localChecks.maxConcurrent")).toBe("performance");
    expect(generalSectionForKey("playwright.maxConcurrent")).toBe("performance");
    expect(generalSectionForKey("pressureGuard.enabled")).toBe("performance");
    expect(generalSectionForKey("pressureGuard.maxLoadPerCpu")).toBe("performance");
    expect(isGeneralSchemaFieldKey("localChecks.maxConcurrent")).toBe(true);
  });

  it("maps remote offload/fallback controls to Remote validation", () => {
    expect(generalSectionForKey("remoteValidation.offloadBrowserSteps")).toBe("remote-validation");
    expect(generalSectionForKey("remoteValidation.localFallback")).toBe("remote-validation");
    expect(isGeneralSchemaFieldKey("remoteValidation.offloadBrowserSteps")).toBe(true);
    expect(isGeneralSchemaFieldKey("remoteValidation.localFallback")).toBe(true);
    expect(
      resolveSettingLocation(
        "remoteValidation.offloadBrowserSteps",
        { tier: "restart" },
        {
          inspectorAvailable: true,
        },
      )?.hasUiRow,
    ).toBe(true);
  });
});

describe("Settings — remote validation offload rows (#0836)", () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    routeState.query = { tab: "general", section: "remote-validation" };
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );
    (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
    const schema = getConfigSchema() as ConfigField[];
    api.mockResolvedValue({
      config: {
        remoteValidation: { offloadBrowserSteps: false, localFallback: "serialize" },
      },
      schema,
    });
  });

  afterEach(() => {
    api.mockReset();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("renders offload browser steps and local fallback in the remote-validation section", async () => {
    const config = useConfigStore();
    await config.load();
    const wrapper = mount(SettingsView, {
      attachTo: document.body,
      global: { plugins: [pinia] },
    });
    await flushPromises();

    const section = wrapper.get('[data-settings-section="remote-validation"]');
    expect(section.find('[id="setting-remoteValidation.offloadBrowserSteps"]').exists()).toBe(true);
    expect(section.find('[id="setting-remoteValidation.localFallback"]').exists()).toBe(true);
    expect(
      section.find('[id="setting-remoteValidation.localFallback"] [role="combobox"]').text(),
    ).toContain("Serialize");
    wrapper.unmount();
  });
});
