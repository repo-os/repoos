/**
 * #0727 — General Settings must render editable controls for approval policy
 * array fields (not label/description only).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { getConfigSchema } from "../../core/config.js";
import * as apiMod from "../src/api";
import { useConfigStore } from "../src/stores/config";
import SettingsView from "../src/views/SettingsView.vue";

const api = vi.spyOn(apiMod, "api");

const routeState = reactive<{ query: Record<string, string | string[]> }>({ query: {} });

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const APPROVAL_KEYS = [
  "approval.enabled",
  "approval.autoApprove.areas",
  "approval.autoApprove.types",
  "approval.autoApprove.machineryPaths",
  "approval.autoApprove.allowP0",
  "automation.paused",
] as const;

function approvalSchema() {
  const schema = getConfigSchema();
  return APPROVAL_KEYS.map((key) => schema.find((f) => f.key === key)).filter(Boolean);
}

function settingsConfigResponse(overrides?: {
  machineryPaths?: string[];
  allowP0?: boolean;
  paused?: boolean;
}) {
  const machineryPaths = overrides?.machineryPaths ?? ["src/server/"];
  return {
    config: {
      maxActiveTasks: 3,
      approval: {
        enabled: false,
        autoApprove: {
          areas: [],
          types: [],
          machineryPaths,
          allowP0: overrides?.allowP0 ?? false,
        },
      },
      automation: { paused: overrides?.paused ?? false },
    },
    schema: [getConfigSchema().find((f) => f.key === "maxActiveTasks")!, ...approvalSchema()],
  };
}

async function loadSettingsConfig(
  overrides?: Parameters<typeof settingsConfigResponse>[0],
): Promise<void> {
  api.mockResolvedValue(settingsConfigResponse(overrides));
  await useConfigStore().load();
}

async function mountSettings(tab: "general" = "general") {
  routeState.query = { tab };
  const wrapper = mount(SettingsView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

function rowInput(key: string): HTMLInputElement | null {
  const row = document.getElementById(`setting-${key}`);
  return row?.querySelector("input[type='text']") ?? null;
}

function rowSwitch(key: string): HTMLElement | null {
  const row = document.getElementById(`setting-${key}`);
  return row?.querySelector("button[role='switch']") ?? null;
}

beforeEach(() => {
  setActivePinia(createPinia());
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
  document.body.innerHTML = "";
});

describe("SettingsView approval policy controls (#0727)", () => {
  it("renders an editable machineryPaths array input on General", async () => {
    await loadSettingsConfig();
    const wrapper = await mountSettings();
    const input = rowInput("approval.autoApprove.machineryPaths");
    expect(input).not.toBeNull();
    expect(input!.value).toBe("src/server/");
    expect(
      document.querySelector('[data-config-key="approval.autoApprove.machineryPaths"] input'),
    ).toBe(input);
    wrapper.unmount();
  });

  it("auto-save serializes machineryPaths as a string list", async () => {
    await loadSettingsConfig({ machineryPaths: [] });
    const config = useConfigStore();
    const saveSpy = vi.spyOn(config, "save").mockResolvedValue(undefined);
    const wrapper = await mountSettings();
    const input = rowInput("approval.autoApprove.machineryPaths");
    expect(input).not.toBeNull();
    await new DOMWrapper(input!).setValue("vendor/, docs/adr/");
    await flushPromises();
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 3000 });

    const body = saveSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body["approval.autoApprove.machineryPaths"]).toEqual(["vendor/", "docs/adr/"]);
    saveSpy.mockRestore();
    wrapper.unmount();
  });

  it("keeps automation.paused and allowP0 switches on General", async () => {
    await loadSettingsConfig({ allowP0: true, paused: true });
    const wrapper = await mountSettings();
    expect(rowSwitch("approval.autoApprove.allowP0")).not.toBeNull();
    expect(rowSwitch("automation.paused")).not.toBeNull();
    expect(document.getElementById("setting-approval.autoApprove.allowP0")).not.toBeNull();
    expect(document.getElementById("setting-automation.paused")).not.toBeNull();
    wrapper.unmount();
  });
});
