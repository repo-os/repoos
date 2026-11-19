/**
 * Settings under a failed config load (#1226).
 *
 * When `/api/config` fails (offline, 500, slow-to-timeout), `config.loaded`
 * never turns true. The page used to keep rendering the loading skeleton
 * forever with the error only in the page description — an endless spinner,
 * exactly what the slow-network QA pass says pages must never do. The fix
 * mirrors AgentsView: a plain-English error panel with a Retry button, and
 * the skeleton suppressed once the failure is known.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { reactive } from "vue";
import * as apiMod from "../src/api";
import { useConfigStore } from "../src/stores/config";
import SettingsView from "../src/views/SettingsView.vue";

const api = vi.spyOn(apiMod, "api");

const routeState = reactive<{ query: Record<string, string | string[]> }>({ query: {} });
const replaceSpy = vi.fn(
  async (_to?: { query?: Record<string, string | string[]>; name?: string }) => {},
);

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: replaceSpy, push: vi.fn() }),
}));

function stubViewport(narrow: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: narrow,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

let pinia: ReturnType<typeof createPinia>;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  routeState.query = { tab: "general" };
  replaceSpy.mockReset();
  replaceSpy.mockImplementation(async () => {});
  stubViewport(false);
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
  api.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SettingsView failed config load (#1226)", () => {
  it("replaces the endless skeleton with an actionable error and Retry", async () => {
    api.mockRejectedValue(new Error("Can't reach the RepoOS server."));
    const config = useConfigStore();
    await config.load();
    expect(config.loaded).toBe(false);
    expect(config.error).toContain("Can't reach the RepoOS server.");

    const wrapper = mount(SettingsView, {
      attachTo: document.body,
      global: { plugins: [pinia] },
    });
    await flushPromises();

    const error = wrapper.get(".page-load-error");
    expect(error.attributes("role")).toBe("alert");
    expect(error.text()).toContain("Couldn’t load settings");
    expect(error.text()).toContain("Check your connection to the RepoOS server, then try again.");
    expect(error.text()).toContain("Retry");
    // The endless skeleton must be gone.
    expect(wrapper.find(".page-skeleton").exists()).toBe(false);

    // Retry calls the config load again; let it succeed this time.
    api.mockResolvedValue({
      config: {},
      schema: [],
    } as never);
    api.mockClear();
    await error.get("button").trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalled();

    wrapper.unmount();
  });

  it("keeps the skeleton while the request is merely in flight (no error yet)", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    const config = useConfigStore();
    void config.load();
    const wrapper = mount(SettingsView, {
      attachTo: document.body,
      global: { plugins: [pinia] },
    });
    await flushPromises();
    // PageSkeleton defers its first paint by 180ms to avoid a loading flash.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(wrapper.find(".page-load-error").exists()).toBe(false);
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);

    wrapper.unmount();
    api.mockClear();
  });
});
