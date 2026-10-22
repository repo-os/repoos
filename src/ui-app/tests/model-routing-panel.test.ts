/**
 * #0792 — Model routing Agents tab: config round-trip, credential display, probe API.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import ModelRoutingPanel from "../src/components/ModelRoutingPanel.vue";
import AgentsView from "../src/views/AgentsView.vue";
import { useConfigStore } from "../src/stores/config";
import { safeConfigForBrowser } from "../../server/routes/config.js";
import { loadConfig } from "../../core/config.js";
import type { RepoOSConfig } from "../../core/types.js";
import type { RoutingDecisionView } from "../src/types.js";
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

/** A complete decision view fixture; override any field for a scenario. */
function decisionView(over: Partial<RoutingDecisionView> = {}): RoutingDecisionView {
  return {
    id: "d1",
    at: new Date().toISOString(),
    taskId: "0811",
    role: "engineer",
    mode: "automatic",
    kind: "selected",
    applied: true,
    selection: { cli: "codex", model: "gpt-5", reasoning: null },
    recommendation: { cli: "codex", model: "gpt-5", reasoning: null },
    actual: { cli: "codex", model: "gpt-5", reasoning: null },
    fallbackReason: null,
    blockReason: null,
    message: null,
    provider: "jev",
    providerModel: "jev-latest",
    providerUsage: { inputTokens: 120, outputTokens: 40 },
    selectionProbability: 0.92,
    evidence: { topProbability: 0.92, threshold: 0.5, confidence: 0.9 },
    brief: "Role: engineer\nTask #0811: clear test results",
    answers: {
      suitability: {
        id: "suitability",
        type: "choice",
        choice: "codex\u0000gpt-5\u0000",
        confidence: 0.9,
        probabilities: { "codex\u0000gpt-5\u0000": 0.92, "claude code\u0000default\u0000": 0.08 },
      },
    },
    durationMs: 1234,
    ...over,
  };
}

const jevStatus = () =>
  modelRoutingStatus({
    root: "/tmp",
    modelRouting: { mode: "shadow", provider: "jev" },
  } as RepoOSConfig);

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

  // #0819 item 5 — the checkbox names mixed AI/human steps and the split, and
  // the help says a yes means a split with the keyword check as the fallback.
  it("labels the human-step check as mixed AI and human steps that should be split", async () => {
    seedConfig({ "model_routing.mode": "shadow" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(jevStatus());
        if (url.includes("/api/model-routing/decisions")) return jsonResponse({ decisions: [] });
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    const label = wrapper.find("[data-testid='routing-human-step-check']").element.closest("label");
    expect(label?.textContent).toContain(
      "Check for mixed AI and human steps, and suggest splitting the task",
    );
    expect(wrapper.text()).toContain("whether verification truly requires a human");
    expect(wrapper.text()).toContain("keyword check runs instead");
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
    expect(wrapper.find("[data-testid='routing-credential-status'] .mr-pill").classes()).toContain(
      "mr-pill-ok",
    );
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
    expect(wrapper.find("[data-testid='routing-credential-status'] .mr-pill").classes()).toContain(
      "mr-pill-warn",
    );
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

  // ── #0811: clear live test results ────────────────────────────────────
  it("shows a live card collapsed to the summary, expanding to the full detail", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    const status = jevStatus();
    const live = {
      ok: true,
      message: "Live decision call succeeded.",
      model: "jev-latest",
      durationMs: 842,
      usage: { inputTokens: 428, outputTokens: 73 },
      prompt: "RepoOS routing connection test.",
      answers: [
        {
          id: "suitability",
          type: "choice" as const,
          question: "Which coding-agent configuration is best suited to this work?",
          chosen: "probe / connection",
          confidence: 0.9,
          options: [
            { key: "probe\u0000connection\u0000", label: "probe / connection", probability: 1 },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(status);
        if (url.includes("/api/model-routing/decisions")) return jsonResponse({ decisions: [] });
        if (url.includes("/api/model-routing/probe")) return jsonResponse({ ...status, live });
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    await wrapper.find("[data-testid='routing-probe-live']").trigger("click");
    await flushPromises();

    const card = wrapper.find("[data-testid='routing-live-card']");
    expect(card.exists()).toBe(true);
    expect(card.classes()).toContain("mr-live-card-ok");
    expect(card.find("[data-testid='routing-live-status']").text()).toContain("Success");
    expect(card.find("[data-testid='routing-live-model']").text()).toBe("jev-latest");
    expect(card.find("[data-testid='routing-live-usage']").text()).toContain("428 in");
    expect(card.find("[data-testid='routing-live-usage']").text()).toContain("73 out");
    // The summary carries the chosen candidate with its probability.
    expect(card.find("[data-testid='routing-live-chosen']").text()).toContain("probe / connection");
    expect(card.find("[data-testid='routing-live-chosen']").text()).toContain("100%");
    // Collapsed by default: the question and answer are one click away.
    expect(card.find("[data-testid='routing-live-details']").exists()).toBe(false);
    expect(card.find("[data-testid='routing-live-toggle']").attributes("aria-expanded")).toBe(
      "false",
    );
    await card.find("[data-testid='routing-live-toggle']").trigger("click");
    const details = card.find("[data-testid='routing-live-details']");
    expect(details.exists()).toBe(true);
    expect(details.find("[data-testid='routing-live-time']").text()).toMatch(/842 ms/);
    expect(details.find("[data-testid='routing-live-prompt']").text()).toContain(
      "routing connection test",
    );
    const answer = details.find("[data-testid='routing-live-answer']");
    expect(answer.text()).toContain("probe / connection");
    expect(answer.text()).toContain("100%");
    wrapper.unmount();
  });

  it("re-collapses the live card after a new test", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    const status = jevStatus();
    const live = {
      ok: true,
      message: "Live decision call succeeded.",
      model: "jev-latest",
      durationMs: 12,
      prompt: "RepoOS routing connection test.",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(status);
        if (url.includes("/api/model-routing/decisions")) return jsonResponse({ decisions: [] });
        if (url.includes("/api/model-routing/probe")) return jsonResponse({ ...status, live });
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    await wrapper.find("[data-testid='routing-probe-live']").trigger("click");
    await flushPromises();
    await wrapper.find("[data-testid='routing-live-toggle']").trigger("click");
    expect(wrapper.find("[data-testid='routing-live-details']").exists()).toBe(true);

    await wrapper.find("[data-testid='routing-probe-live']").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-testid='routing-live-details']").exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows a red live card with the plain reason and what to check on failure", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    const status = jevStatus();
    const live = {
      ok: false,
      message: "decision provider rejected credentials (HTTP 401)",
      hint: "Check the API key is saved and still valid for the selected provider.",
      durationMs: 12,
      prompt: "RepoOS routing connection test.",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(status);
        if (url.includes("/api/model-routing/decisions")) return jsonResponse({ decisions: [] });
        if (url.includes("/api/model-routing/probe")) return jsonResponse({ ...status, live });
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    await wrapper.find("[data-testid='routing-probe-live']").trigger("click");
    await flushPromises();

    const card = wrapper.find("[data-testid='routing-live-card']");
    expect(card.classes()).toContain("mr-live-card-fail");
    expect(card.find("[data-testid='routing-live-status']").text()).toContain("Failed");
    expect(card.find("[data-testid='routing-live-reason']").text()).toMatch(/credentials/);
    expect(card.find("[data-testid='routing-live-hint']").text()).toMatch(/API key/);
    wrapper.unmount();
  });

  it("shows a waiting state with a spinner while the live call runs", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    const status = jevStatus();
    let resolveProbe: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(status);
        if (url.includes("/api/model-routing/decisions")) return jsonResponse({ decisions: [] });
        if (url.includes("/api/model-routing/probe")) {
          return await new Promise((res) => {
            resolveProbe = res;
          });
        }
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    await wrapper.find("[data-testid='routing-probe-live']").trigger("click");
    await wrapper.vm.$nextTick();
    const waiting = wrapper.find("[data-testid='routing-live-waiting']");
    expect(waiting.exists()).toBe(true);
    expect(waiting.find(".mr-spinner").exists()).toBe(true);

    resolveProbe(jsonResponse({ ...status, live: { ok: true, message: "ok", durationMs: 5 } }));
    await flushPromises();
    expect(wrapper.find("[data-testid='routing-live-waiting']").exists()).toBe(false);
    wrapper.unmount();
  });

  it("stops the waiting animation under reduced motion", () => {
    const src = readFileSync(resolve(__dirname, "../src/components/ModelRoutingPanel.vue"), "utf8");
    const reduced = src.slice(src.indexOf("prefers-reduced-motion"));
    expect(src).toContain("@media (prefers-reduced-motion: reduce)");
    expect(reduced).toContain("animation: none");
  });

  // ── #0811: readable decision cards ────────────────────────────────────
  it("shows response time, usage and confidence, hiding details until expanded", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(jevStatus());
        if (url.includes("/api/model-routing/decisions"))
          return jsonResponse({ decisions: [decisionView()] });
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();

    const card = wrapper.find("[data-testid='routing-decisions'] .mr-decision");
    expect(card.exists()).toBe(true);
    expect(card.find("[data-testid='routing-decision-time']").text()).toMatch(/1\.23 s/);
    expect(card.find("[data-testid='routing-decision-usage']").text()).toContain("120 in");
    expect(card.find("[data-testid='routing-decision-confidence']").text()).toContain("92%");

    // Collapsed by default.
    expect(card.find("[data-testid='routing-decision-details']").exists()).toBe(false);
    await card.find("[data-testid='routing-decision-details-toggle']").trigger("click");
    const details = card.find("[data-testid='routing-decision-details']");
    expect(details.exists()).toBe(true);
    expect(details.text()).toContain("Question sent");
    expect(details.text()).toContain("Task #0811");
    expect(details.text()).toContain("Answer received");
    expect(details.text()).toContain("codex · gpt-5");
    expect(details.text()).toContain("92%");
    wrapper.unmount();
  });

  it("shows a relative decision timestamp with the exact time in the tooltip", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    const at = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    const decision = decisionView({ at });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(jevStatus());
        if (url.includes("/api/model-routing/decisions"))
          return jsonResponse({ decisions: [decision] });
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();

    const time = wrapper.find("[data-testid='routing-decisions'] .mr-dec-time");
    expect(time.text()).toBe("13 hours ago");
    // The exact local timestamp is the styled tooltip, on hover or keyboard focus.
    expect(time.attributes("data-tip")).toBe(new Date(at).toLocaleString());
    expect(time.attributes("tabindex")).toBe("0");
    expect(time.attributes("datetime")).toBe(at);
    wrapper.unmount();
  });

  it("explains an insufficient-evidence fallback in plain words, not as an error", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    const fallback = decisionView({
      kind: "fallback",
      applied: false,
      fallbackReason: "insufficient-evidence",
      selection: { cli: "claude code", model: "default", reasoning: null },
      recommendation: { cli: "claude code", model: "default", reasoning: null },
      actual: { cli: "claude code", model: "default", reasoning: null },
      selectionProbability: 0.4,
      evidence: { topProbability: 0.4, threshold: 0.5, confidence: 0.9 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(jevStatus());
        if (url.includes("/api/model-routing/decisions"))
          return jsonResponse({ decisions: [fallback] });
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();

    const note = wrapper.find("[data-testid='routing-decision-fallback']");
    expect(note.text()).toContain("not confident enough");
    expect(note.text()).toContain("Top probability 40%");
    expect(note.text()).toContain("needs at least 50%");
    // A fallback reads as information, not an error: the muted pill, never blocked/amber.
    const pill = wrapper.find(".mr-dec-pill");
    expect(pill.classes()).toContain("mr-dec-fallback");
    expect(pill.classes()).not.toContain("mr-dec-blocked");
    wrapper.unmount();
  });

  it("shows the recommended configuration on a shadow decision", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    const shadow = decisionView({
      mode: "shadow",
      applied: false,
      selection: { cli: "codex", model: "gpt-5", reasoning: null },
      recommendation: { cli: "codex", model: "gpt-5", reasoning: null },
      actual: { cli: "claude code", model: "default", reasoning: null },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(jevStatus());
        if (url.includes("/api/model-routing/decisions"))
          return jsonResponse({ decisions: [shadow] });
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    const body = wrapper.find("[data-testid='routing-decisions'] .mr-decision-body");
    expect(body.text()).toContain("Chosen");
    expect(body.text()).toContain("Recommended");
    expect(body.text()).toContain("codex · gpt-5");
    wrapper.unmount();
  });

  it("shows a provider-reported dollar cost as Cost on a decision card", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    const decision = decisionView({
      providerUsage: { inputTokens: 120, outputTokens: 40, costUsd: 0.002 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(jevStatus());
        if (url.includes("/api/model-routing/decisions"))
          return jsonResponse({ decisions: [decision] });
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    const body = wrapper.find("[data-testid='routing-decisions'] .mr-decision-body");
    expect(body.text()).toContain("Cost");
    expect(wrapper.find("[data-testid='routing-decision-usage']").text()).toContain("$0.0020");
    wrapper.unmount();
  });

  it("shows a provider-reported dollar cost as Cost on the live card", async () => {
    seedConfig({ "model_routing.mode": "shadow", "model_routing.provider": "jev" });
    const status = jevStatus();
    const live = {
      ok: true,
      message: "Live decision call succeeded.",
      model: "jev-latest",
      durationMs: 100,
      usage: { inputTokens: 10, outputTokens: 2, costUsd: 0.0004 },
      prompt: "RepoOS routing connection test.",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/model-routing/status")) return jsonResponse(status);
        if (url.includes("/api/model-routing/decisions")) return jsonResponse({ decisions: [] });
        if (url.includes("/api/model-routing/probe")) return jsonResponse({ ...status, live });
        throw new Error(url);
      }),
    );
    const wrapper = await mountPanel();
    await flushPromises();
    await wrapper.find("[data-testid='routing-probe-live']").trigger("click");
    await flushPromises();
    const card = wrapper.find("[data-testid='routing-live-card']");
    expect(card.text()).toContain("Cost");
    expect(card.find("[data-testid='routing-live-usage']").text()).toContain("$0.0004");
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
