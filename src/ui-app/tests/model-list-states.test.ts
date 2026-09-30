/**
 * #0593: per-CLI model loading in the config store. One independent request
 * per CLI so a slow or failing adapter only affects its own dropdown; visible
 * loading/failed states carrying the server's reason (never the static
 * fallback silently posing as the live list); the last good list per CLI
 * persisted and shown immediately, kept with a "couldn't refresh" note when
 * revalidation fails; and `?refresh=1` bypassing both caches.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useConfigStore } from "../src/stores/config";
import type { ModelSourceResult } from "../src/types";
import AgentModelModal from "../src/components/AgentModelModal.vue";

const CACHE_KEY = "repoos.models.byCli";
const CLIS = ["opencode", "codex"];

type StubResponse = { ok: true; body: unknown } | { ok: false; status: number; body: unknown };

function source(models: string[], extra?: Partial<ModelSourceResult>): ModelSourceResult {
  return { supported: true, models, refreshable: true, ...extra };
}

function ok(byCli: Record<string, ModelSourceResult>): StubResponse {
  return { ok: true, body: { byCli, at: "2026-09-30T00:00:00Z" } };
}

/** Stub global fetch with a per-URL response (sync or async). */
function stubFetch(handler: (url: string) => StubResponse | Promise<StubResponse>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const r = await handler(url);
      return {
        ok: r.ok,
        status: r.ok ? 200 : r.status,
        statusText: r.ok ? "OK" : "Error",
        json: async () => r.body,
      };
    }),
  );
}

/** Create the store (first use runs setup → hydrates the persisted cache). */
function makeStore(clis: string[] = CLIS) {
  const config = useConfigStore();
  config.agentsMeta = {
    clis,
    models: ["default", "big pickle", "deepseek v4"],
    defaults: [],
    skills: [],
  };
  return config;
}

function seedCache(entry: Record<string, { models: string[]; at: number }>): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
}

function readCache(): Record<string, { models: string[]; at: number }> {
  return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<
    string,
    { models: string[]; at: number }
  >;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("per-CLI loading states", () => {
  it("fills each CLI independently and records a failure with its reason", async () => {
    stubFetch((url) => {
      if (url.includes("cli=opencode")) return ok({ opencode: source(["default", "opencode/x"]) });
      if (url.includes("cli=codex"))
        return { ok: false, status: 504, body: { error: "codex timed out after 15s" } };
      throw new Error(`unexpected fetch: ${url}`);
    });
    const config = makeStore();
    await config.loadModels();

    // The healthy CLI filled in; the failing one only affected itself.
    expect(config.liveModelsByCli.opencode).toEqual(["default", "opencode/x"]);
    expect(config.modelStatesByCli.opencode).toEqual({ status: "loaded" });
    expect(config.modelStatesByCli.codex).toEqual({
      status: "failed",
      error: "codex timed out after 15s",
      stale: false,
    });
    expect(config.modelNoticeFor("opencode")).toBeNull();

    // The failing CLI shows the reason — not a silent fallback.
    const notice = config.modelNoticeFor("codex");
    expect(notice?.kind).toBe("failed");
    expect(notice?.text).toContain("Couldn't load models");
    expect(notice?.text).toContain("codex timed out after 15s");
    expect(notice?.stale).toBe(false);

    // Its dropdown still works (static fallback), visibly attached to the notice.
    expect(config.modelsFor("codex").map((o) => o.value)).toContain("big pickle");
    expect(config.modelsLoading).toBe(false);
  });

  it("shows a loading notice while a CLI's request is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubFetch(async (url) => {
      await gate;
      return ok({ opencode: source(["default", "live/model"]) });
    });
    const config = makeStore(["opencode"]);

    const pending = config.loadModels();
    expect(config.modelStatesByCli.opencode.status).toBe("loading");
    expect(config.modelNoticeFor("opencode")).toEqual({
      kind: "loading",
      text: "Loading models…",
      stale: false,
    });
    expect(config.modelsLoading).toBe(true);

    release();
    await pending;
    expect(config.modelNoticeFor("opencode")).toBeNull();
    expect(config.liveModelsByCli.opencode).toEqual(["default", "live/model"]);
  });

  it("settles a CLI with no adapter as loaded instead of loading forever", async () => {
    stubFetch(() => ok({}));
    const config = makeStore(["gemini"]);
    await config.loadModels();
    expect(config.modelStatesByCli.gemini).toEqual({ status: "loaded" });
    expect(config.modelNoticeFor("gemini")).toBeNull();
  });

  it("carries a server-reported probe reason (binary missing) as a failure", async () => {
    stubFetch(() => ok({ codex: source(["default"], { error: "codex not found on PATH" }) }));
    const config = makeStore(["codex"]);
    await config.loadModels();
    expect(config.modelStatesByCli.codex.status).toBe("failed");
    expect(config.modelNoticeFor("codex")?.text).toContain("codex not found on PATH");
  });
});

describe("persisted model cache", () => {
  it("shows the persisted list immediately, then revalidates it", async () => {
    seedCache({ opencode: { models: ["cached/model-a"], at: 1 } });
    const config = makeStore(["opencode"]);
    // Before any request: the saved list is already offered.
    expect(config.liveModelsByCli.opencode).toEqual(["cached/model-a"]);
    expect(config.modelsFor("opencode").map((o) => o.value)).toContain("cached/model-a");

    stubFetch(() => ok({ opencode: source(["default", "live/model-b"]) }));
    await config.loadModels();
    expect(config.liveModelsByCli.opencode).toEqual(["default", "live/model-b"]);
    expect(config.modelNoticeFor("opencode")).toBeNull();
    expect(readCache().opencode.models).toEqual(["default", "live/model-b"]);
  });

  it("keeps the persisted list with a 'couldn't refresh' note when revalidation fails", async () => {
    seedCache({ opencode: { models: ["cached/model-a"], at: 1 } });
    const config = makeStore(["opencode"]);
    stubFetch(() => ({ ok: false, status: 502, body: { error: "server exploded" } }));
    await config.loadModels();

    // The old list stays in place — it is not blanked by the failure.
    expect(config.liveModelsByCli.opencode).toEqual(["cached/model-a"]);
    expect(config.modelStatesByCli.opencode).toEqual({
      status: "failed",
      error: "server exploded",
      stale: true,
    });
    const notice = config.modelNoticeFor("opencode");
    expect(notice?.kind).toBe("failed");
    expect(notice?.stale).toBe(true);
    expect(notice?.text).toContain("Couldn't refresh models");
    expect(notice?.text).toContain("server exploded");
    expect(notice?.text).toContain("saved list");
    // Static fallback must not replace the kept list.
    expect(config.modelsFor("opencode").map((o) => o.value)).toContain("cached/model-a");
  });

  it("'Refresh models' sends ?refresh=1 and replaces the persisted list", async () => {
    seedCache({ opencode: { models: ["cached/model-a"], at: 1 } });
    const config = makeStore(["opencode"]);
    stubFetch((url) => {
      if (!url.includes("refresh=1")) throw new Error(`refresh not bypassing cache: ${url}`);
      return ok({ opencode: source(["default", "fresh/model-b"]) });
    });
    await config.loadModels(true);
    expect(config.liveModelsByCli.opencode).toEqual(["default", "fresh/model-b"]);
    expect(config.modelStatesByCli.opencode).toEqual({ status: "loaded" });
    expect(readCache().opencode.models).toEqual(["default", "fresh/model-b"]);
  });
});

// Render dialog primitive children in place; the real radix components only
// add portal/overlay behaviour the test doesn't exercise.
const Slot = {
  setup:
    (_props: unknown, { slots }: { slots: { default?: () => unknown } }) =>
    () =>
      slots.default?.(),
};
const dialogStubs = {
  teleport: true,
  Dialog: Slot,
  DialogContent: Slot,
  DialogOverlay: true,
  DialogTitle: Slot,
  DialogDescription: Slot,
  DialogClose: Slot,
};

function mountModal(config: ReturnType<typeof useConfigStore>, cli: string): VueWrapper {
  return mount(AgentModelModal, {
    props: {
      open: true,
      cliOptions: [cli],
      modelOptions: config.modelsFor(cli),
      cli,
      model: "default",
      memoryKey: "test:model-list",
    },
    global: { stubs: dialogStubs },
  });
}

describe("model picker notice", () => {
  it("shows the failure with a Retry that re-probes with refresh=1", async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      if (url.includes("refresh=1"))
        return ok({ opencode: source(["default", "recovered/model"]) });
      return { ok: false, status: 504, body: { error: "probe timed out" } };
    });
    const config = makeStore(["opencode"]);
    await config.loadModels();

    const wrapper = mountModal(config, "opencode");
    const notice = wrapper.find('[data-testid="am-model-list-notice"]');
    expect(notice.exists()).toBe(true);
    expect(notice.text()).toContain("Couldn't load models");
    expect(notice.text()).toContain("probe timed out");

    await wrapper.find('[data-testid="am-model-list-retry"]').trigger("click");
    await flushPromises();

    expect(seen.some((u) => u.includes("cli=opencode") && u.includes("refresh=1"))).toBe(true);
    expect(config.modelNoticeFor("opencode")).toBeNull();
    expect(wrapper.find('[data-testid="am-model-list-notice"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows the loading state in the picker while the probe runs", async () => {
    stubFetch(
      () =>
        new Promise(() => {
          /* never settles — the picker must still say what it's doing */
        }) as never,
    );
    const config = makeStore(["opencode"]);
    void config.loadModels();

    const wrapper = mountModal(config, "opencode");
    const notice = wrapper.find('[data-testid="am-model-list-notice"]');
    expect(notice.exists()).toBe(true);
    expect(notice.text()).toContain("Loading models…");
    expect(wrapper.find('[data-testid="am-model-list-retry"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
