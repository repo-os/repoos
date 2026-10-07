import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import RemoteRunnersPanel from "../src/components/RemoteRunnersPanel.vue";
import { useRepoStore } from "../src/stores/repo";

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RemoteRunnersPanel", () => {
  it("shows tie-break guidance and saves keyboard-accessible host reordering", async () => {
    const calls: Array<{ path: string; method: string; body?: unknown }> = [];
    let hostSpecs = [
      { host: "mini", user: "peck" },
      { host: "bee", user: "nick" },
    ];
    const status = () => ({
      enabled: true,
      running: true,
      provider: "tailscale",
      tailscaleHosts: hostSpecs.map((host) => host.host),
      tailscaleHost: "peck@mini",
      tailscaleHostPinsTop: false,
      hostPoolEditable: true,
      hosts: hostSpecs.map((host) => ({
        ...host,
        labels: [],
        maxConcurrent: 1,
        inFlight: 0,
        queued: 0,
        probed: true,
        healthy: true,
        serverStats: {
          available: true,
          sampledAt: "2026-10-03T10:00:00.000Z",
          loadAverage: [0.1, 0.2, 0.3],
          cpuCount: 4,
          memoryUsedBytes: 1_073_741_824,
          memoryTotalBytes: 4_294_967_296,
          diskFreeBytes: 8_589_934_592,
        },
      })),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const path = String(url);
        const method = (init?.method ?? "GET").toUpperCase();
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        calls.push({ path, method, body });
        if (path.startsWith("/api/remote-validation/status")) return jsonResponse(status());
        if (path === "/api/config" && method === "PATCH") {
          const list = (body as Record<string, unknown>)["remoteValidation.tailscaleHosts"] as
            | string[]
            | undefined;
          if (list) {
            hostSpecs = list.map((entry) => {
              const [user, host] = entry.split("@");
              return { host: host ?? user!, user: host ? user! : "root" };
            });
          }
          return jsonResponse({ ok: true });
        }
        throw new Error(`Unexpected request ${method} ${path}`);
      }),
    );

    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(RemoteRunnersPanel, {
      global: { plugins: [pinia], stubs: { "router-link": true } },
    });
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Hosts with equal load are tried top to bottom, so the first host gets the work when all are idle.",
    );
    expect(wrapper.text()).toContain("Server stats");
    expect(wrapper.text()).toContain("Load average");
    expect(wrapper.find('button[aria-label="Move nick@bee up"]').exists()).toBe(true);

    await wrapper.get('button[aria-label="Move peck@mini down"]').trigger("click");
    await flushPromises();

    const save = calls.find((call) => call.path === "/api/config" && call.method === "PATCH");
    expect(save?.body).toEqual({
      "remoteValidation.tailscaleHosts": ["nick@bee", "peck@mini"],
    });
    expect(wrapper.findAll(".rr-host-name").map((name) => name.text())).toEqual([
      "nick@bee",
      "peck@mini",
    ]);
    expect(
      wrapper.get('button[aria-label="Move nick@bee up"]').attributes("disabled"),
    ).toBeDefined();
    wrapper.unmount();
  });

  it("manual refresh shows loading then a success toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const path = String(url);
        if (path.startsWith("/api/remote-validation/status")) {
          return jsonResponse({
            enabled: true,
            running: true,
            provider: "tailscale",
            tailscaleHosts: ["bee"],
            tailscaleHost: "",
            tailscaleHostPinsTop: false,
            hostPoolEditable: true,
            hosts: [
              {
                host: "bee",
                user: "nick",
                labels: [],
                maxConcurrent: 1,
                inFlight: 0,
                queued: 0,
                probed: true,
                healthy: true,
              },
            ],
          });
        }
        throw new Error(`Unexpected ${path}`);
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const wrapper = mount(RemoteRunnersPanel, {
      global: { plugins: [pinia], stubs: { "router-link": true } },
    });
    await flushPromises();
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(
      repo.toasts.some((t) => t.type === "success" && t.message === "Runner status updated"),
    ).toBe(true);
    expect(wrapper.text()).toContain("Updated");
    wrapper.unmount();
  });

  it("renders hung runs and in-flight hung badge from the status API (#0729)", async () => {
    const startedAt = new Date(Date.now() - 6 * 60_000).toISOString();
    const killedAt = new Date(Date.now() - 90_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const path = String(url);
        if (path.startsWith("/api/remote-validation/status")) {
          return jsonResponse({
            enabled: true,
            running: true,
            provider: "tailscale",
            tailscaleHosts: ["bee"],
            tailscaleHost: "",
            tailscaleHostPinsTop: false,
            hostPoolEditable: true,
            hosts: [
              {
                host: "bee",
                user: "nick",
                labels: [],
                maxConcurrent: 1,
                inFlight: 1,
                queued: 0,
                probed: true,
                healthy: true,
                activeRuns: [
                  { taskId: "0729", startedAt, phase: "test", label: "#0729", hung: true },
                ],
                hungRuns: [{ taskId: "0199", at: killedAt }],
              },
            ],
          });
        }
        throw new Error(`Unexpected ${path}`);
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(RemoteRunnersPanel, {
      global: { plugins: [pinia], stubs: { "router-link": true } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("Hung runs");
    expect(wrapper.text()).toContain("hung · killing");
    expect(wrapper.text()).toContain("#0199");
    expect(wrapper.text()).toContain("nick@bee");
    wrapper.unmount();
  });
});
