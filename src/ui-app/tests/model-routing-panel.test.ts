/**
 * #0792 — Model routing Agents tab: config round-trip, credential display, probe API.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import ModelRoutingPanel from "../src/components/ModelRoutingPanel.vue";
import AgentsView from "../src/views/AgentsView.vue";
import { useConfigStore } from "../src/stores/config";
import { safeConfigForBrowser } from "../../server/routes/config.js";
import { loadConfig } from "../../core/config.js";
import type { RepoOSConfig } from "../../core/types.js";
import { startServer, type ServerHandle } from "../../server/server.js";
import { buildRoutingProvider, modelRoutingStatus } from "../../core/model-routing/runtime.js";
import { resolveEffectiveRouting } from "../../core/model-routing/config.js";
import * as providerKeys from "../../core/providers/provider-keys.js";

const tmpRoots: string[] = [];

afterEach(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.REPOOS_OPENROUTER_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-mr-"));
  tmpRoots.push(dir);
  return dir;
}

function seedConfig(data: Record<string, unknown> | null): ReturnType<typeof useConfigStore> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const config = useConfigStore();
  config.agentsMeta = { clis: [], models: [], defaults: [], skills: [] };
  config.data = data;
  config.loaded = true;
  return config;
}

/** A Response-like stub the `api` wrapper accepts (it only needs ok + json). */
function jsonResponse(body: unknown): { ok: boolean; json: () => Promise<unknown> } {
  return { ok: true, json: async () => body };
}

/** Mount the panel with a real router so `router-link` resolves to an href. */
async function mountPanel() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/agents", component: { template: "<div />" } },
    ],
  });
  await router.push("/");
  await router.isReady();
  return mount(ModelRoutingPanel, {
    global: {
      plugins: [router],
      stubs: { teleport: true, Select: true, SelectContent: true },
    },
  });
}

describe("safeConfigForBrowser model_routing flattening", () => {
  it("exposes flat model_routing keys for the Agents panel", () => {
    const flat = safeConfigForBrowser({
      modelRouting: {
        mode: "shadow",
        provider: "openrouter",
        roles: ["engineer"],
        timeoutMs: 4000,
      },
    } as Record<string, unknown>);
    expect(flat["model_routing.mode"]).toBe("shadow");
    expect(flat["model_routing.provider"]).toBe("openrouter");
    expect(flat["model_routing.roles"]).toEqual(["engineer"]);
    expect(flat["model_routing.timeoutMs"]).toBe(4000);
    expect(flat.modelRouting).toBeUndefined();
  });
});

describe("buildRoutingProvider", () => {
  it("returns null without throwing when the API key is unset", () => {
    delete process.env.TYPESAFE_API_KEY;
    const eff = resolveEffectiveRouting({ mode: "shadow", provider: "jev", roles: ["engineer"] });
    expect(buildRoutingProvider(eff)).toBeNull();
  });

  it("constructs a Jev provider when the key is present", () => {
    process.env.TYPESAFE_API_KEY = "test-key";
    const eff = resolveEffectiveRouting({ mode: "shadow", provider: "jev", roles: ["engineer"] });
    expect(buildRoutingProvider(eff)?.id).toBe("jev");
  });
});

describe("ModelRoutingPanel", () => {
  it("shows credential as not set when the env var is missing", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) {
          return {
            ok: true,
            json: async () => ({
              ...modelRoutingStatus({
                root: "/tmp",
                modelRouting: { mode: "shadow", provider: "jev" },
              } as RepoOSConfig),
            }),
          };
        }
        throw new Error(url);
      }),
    );
    const wrapper = mount(ModelRoutingPanel, {
      global: { stubs: { teleport: true, Select: true, SelectContent: true } },
    });
    await flushPromises();
    expect(wrapper.find("[data-testid='routing-credential-status']").text()).toContain("Not set");
    expect(wrapper.find("[data-testid='routing-credential-env']").exists()).toBe(false);
    wrapper.unmount();
  });

  it("persists mode changes through setConfigValues", async () => {
    const config = seedConfig({ "model_routing.mode": "off" });
    const patched: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        if (url.includes("/api/model-routing/status")) {
          return {
            ok: true,
            json: async () => ({
              ...modelRoutingStatus({
                root: "/tmp",
                modelRouting: { mode: "shadow", provider: "jev" },
              } as RepoOSConfig),
            }),
          };
        }
        if (url.includes("/api/config") && init?.method === "PATCH") {
          patched.push(JSON.parse(init.body ?? "{}"));
          return { ok: true, json: async () => ({ ok: true }) };
        }
        throw new Error(url);
      }),
    );
    const wrapper = mount(ModelRoutingPanel, {
      global: { stubs: { teleport: true, Select: true, SelectContent: true } },
    });
    await flushPromises();
    await config.setConfigValues({ "model_routing.mode": "shadow" });
    expect(patched.some((p) => p["model_routing.mode"] === "shadow")).toBe(true);
    wrapper.unmount();
  });

  // #0809 — Clef-Flash must not appear anywhere on the routing page.
  it("shows no Clef-Flash option, server URL, or token text", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) {
          return jsonResponse(
            modelRoutingStatus({
              root: "/tmp",
              modelRouting: { mode: "shadow", provider: "jev" },
            } as RepoOSConfig),
          );
        }
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    expect(wrapper.text()).not.toMatch(/clef/i);
    expect(wrapper.find("[data-testid='routing-base-url']").exists()).toBe(false);
    wrapper.unmount();
  });

  // #0809 — routing and Model providers must agree. A key saved there is a key
  // routing sees, and the credential + provider-ready pills move together.
  it("agrees with Model providers: a saved OpenRouter key reads as set and Ready", async () => {
    process.env.REPOOS_OPENROUTER_API_KEY = "sk-or-test-value";
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "openrouter" });
    const status = modelRoutingStatus({
      root: "/tmp",
      modelRouting: { mode: "shadow", provider: "openrouter" },
    } as RepoOSConfig);
    expect(status.credentialPresent).toBe(true);
    expect(status.providerReady).toBe(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(status);
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    expect(wrapper.find("[data-testid='routing-credential-status']").text()).toContain("Saved");
    expect(wrapper.find("[data-testid='routing-provider-ready']").text()).toContain("Ready");
    expect(
      wrapper.find("[data-testid='routing-credential-status'] .mr-pill").classes(),
    ).toContain("mr-pill-ok");
    // OpenRouter never asks for a key on this page.
    expect(wrapper.find("[data-testid='routing-key-toggle']").exists()).toBe(false);
    wrapper.unmount();
  });

  it("reports not set and not ready, and links to Model providers, with no OpenRouter key", async () => {
    delete process.env.REPOOS_OPENROUTER_API_KEY;
    // A dev machine's harness auth store may hold an OpenRouter key; pin the
    // lookup to empty so "no key saved" is deterministic here.
    vi.spyOn(providerKeys, "readProviderKey").mockReturnValue("");
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "openrouter" });
    const status = modelRoutingStatus({
      root: "/tmp",
      modelRouting: { mode: "shadow", provider: "openrouter" },
    } as RepoOSConfig);
    expect(status.credentialPresent).toBe(false);
    expect(status.providerReady).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(status);
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    expect(wrapper.find("[data-testid='routing-credential-status']").text()).toContain("Not set");
    expect(wrapper.find("[data-testid='routing-provider-ready']").text()).toContain("Not ready");
    expect(
      wrapper.find("[data-testid='routing-credential-status'] .mr-pill").classes(),
    ).toContain("mr-pill-warn");
    const link = wrapper.find("[data-testid='routing-openrouter-link']");
    expect(link.exists()).toBe(true);
    expect(link.attributes("href")).toBe("/agents?tab=model-providers");
    // No key field for OpenRouter.
    expect(wrapper.find("[data-testid='routing-key-toggle']").exists()).toBe(false);
    wrapper.unmount();
  });

  // #0809 — Jev keeps a masked key field, saved only on Save.
  it("Jev keeps a masked key field that saves only on Save", async () => {
    delete process.env.TYPESAFE_API_KEY;
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    const status = modelRoutingStatus({
      root: "/tmp",
      modelRouting: { mode: "shadow", provider: "jev" },
    } as RepoOSConfig);
    const posts: { url: string; body: { key?: string } }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(status);
        if (url.includes("/api/model-providers/jev/key") && init?.method === "POST") {
          posts.push({ url, body: JSON.parse(init.body ?? "{}") });
          return jsonResponse({ ok: true, hasKey: true });
        }
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    // Closed until the toggle is used.
    expect(wrapper.find("[data-testid='routing-key-input']").exists()).toBe(false);
    await wrapper.find("[data-testid='routing-key-toggle']").trigger("click");
    const input = wrapper.find("[data-testid='routing-key-input']");
    expect(input.attributes("type")).toBe("password");
    expect(input.attributes("placeholder")).toContain("stored in .env only");
    await input.setValue("ts-fake-key");
    // Typing alone saves nothing.
    expect(posts).toHaveLength(0);
    await wrapper.find("[data-testid='routing-key-save']").trigger("click");
    await flushPromises();
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ key: "ts-fake-key" });
    wrapper.unmount();
  });
});

describe("AgentsView model routing tab", () => {
  it("deep-links via ?tab=model-routing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) {
          return {
            ok: true,
            json: async () => ({
              ...modelRoutingStatus({ root: "/tmp", modelRouting: undefined } as RepoOSConfig),
            }),
          };
        }
        if (url.includes("/api/models")) {
          return {
            ok: true,
            json: async () => ({ byCli: {} }),
          };
        }
        throw new Error(url);
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const config = useConfigStore();
    config.agentsMeta = { clis: [], models: [], defaults: [], skills: [] };
    config.loaded = true;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    await router.push("/?tab=model-routing");
    const wrapper = mount(AgentsView, {
      global: {
        plugins: [pinia, router],
        stubs: { teleport: true, Transition: true, VoiceDictate: true },
      },
    });
    await flushPromises();
    const tab = wrapper
      .findAll(".agent-tabs .tab-btn")
      .find((b) => b.text().includes("Model routing"));
    expect(tab).toBeTruthy();
    expect(tab!.classes()).toContain("active");
    expect(wrapper.find("[data-testid='model-routing-panel']").exists()).toBe(true);
    wrapper.unmount();
  });
});

describe("modelRoutingStatus", () => {
  it("reports a Model providers message when OpenRouter routing has no key", () => {
    vi.spyOn(providerKeys, "readProviderKey").mockReturnValue("");
    const status = modelRoutingStatus({
      root: "/tmp",
      modelRouting: { mode: "shadow", provider: "openrouter" },
    } as RepoOSConfig);
    expect(status.credentialPresent).toBe(false);
    expect(status.issues[0]).toMatch(/Model providers/i);
  });
});

describe("GET /api/model-routing/status", () => {
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  it("never echoes a secret value", async () => {
    const root = tmpDir();
    writeFileSync(
      join(root, "repoos.toml"),
      '[model_routing]\nmode = "shadow"\nprovider = "jev"\n',
    );
    writeFileSync(join(root, ".env"), "TYPESAFE_API_KEY=super-secret-value\n");
    loadConfig(root);
    handle = await startServer({ root, host: "127.0.0.1", port: 0, disableAuth: true });
    const res = await fetch(`${handle.url}/api/model-routing/status`);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body.credentialPresent).toBe(true);
    expect(JSON.stringify(body)).not.toContain("super-secret");
  });

  // #0809 — the routing status must read the OpenRouter key through the same
  // path the Model providers tab saves to, so the two surfaces agree.
  it("reads a key saved on the Model providers tab as set and Ready", async () => {
    delete process.env.REPOOS_OPENROUTER_API_KEY;
    const root = tmpDir();
    writeFileSync(
      join(root, "repoos.toml"),
      '[model_routing]\nmode = "shadow"\nprovider = "openrouter"\n',
    );
    handle = await startServer({ root, host: "127.0.0.1", port: 0, disableAuth: true });

    // Save exactly the way the Model providers tab does.
    const saved = await fetch(`${handle.url}/api/model-providers/openrouter/key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "sk-or-fake-0809" }),
    });
    expect((await saved.json()).hasKey).toBe(true);

    const after = await (await fetch(`${handle.url}/api/model-routing/status`)).json();
    expect(after.credentialPresent).toBe(true);
    expect(after.credentialLabel).toBe("saved");
    expect(after.providerReady).toBe(true);

    // The Model providers tab reports the same key present.
    const providers = await (await fetch(`${handle.url}/api/model-providers`)).json();
    expect(providers.providers.find((p: { id: string }) => p.id === "openrouter").hasKey).toBe(
      true,
    );
  });

  it("POST /api/model-routing/probe succeeds without live when mode is off", async () => {
    const root = tmpDir();
    writeFileSync(join(root, "repoos.toml"), "");
    handle = await startServer({ root, host: "127.0.0.1", port: 0, disableAuth: true });
    const res = await fetch(`${handle.url}/api/model-routing/probe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ live: false }),
    });
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body.ok).toBe(true);
    expect(body.live).toBeUndefined();
  });
});
