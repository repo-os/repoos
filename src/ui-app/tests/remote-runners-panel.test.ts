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

    expect(wrapper.text()).toContain("then to the host that has run least recently (LRU)");
    expect(wrapper.text()).toContain("Config order is the final tie-break");
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

  it("shows a loud, actionable banner for a runner under memory pressure (#0901)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const path = String(url);
        if (path.startsWith("/api/remote-validation/status")) {
          return jsonResponse({
            enabled: true,
            running: true,
            provider: "tailscale",
            pressureCheck: true,
            tailscaleHosts: ["thinkpad", "mini"],
            tailscaleHost: "",
            tailscaleHostPinsTop: false,
            hostPoolEditable: true,
            hosts: [
              {
                host: "thinkpad",
                user: "nick",
                os: "linux",
                labels: [],
                maxConcurrent: 1,
                inFlight: 0,
                queued: 0,
                probed: true,
                healthy: true,
                pressureCheckEnabled: true,
                pressureThresholds: {
                  maxLoadPerCpu: 4,
                  minAvailableMemRatio: 0.08,
                  maxSwapUsedRatio: 0.5,
                  maxCompressorRatio: 0.35,
                },
                pressure: {
                  state: "pressured",
                  level: "critical",
                  source: "linux",
                  swapUsedBytes: 3_221_225_472,
                  swapTotalBytes: 4_294_967_296,
                  swapUsedRatio: 0.75,
                  availableMemRatio: 0.03,
                  totalMemBytes: 17_179_869_184,
                  compressorBytes: null,
                  reason: "swap is nearly full (3.0 GB of 4.0 GB swap, 75%)",
                  fix: "run `sudo swapoff -a && sudo swapon -a` on the runner",
                  recheckCommand: "repoos runners --probe",
                },
              },
              {
                host: "mini",
                user: "nick",
                os: "macos",
                labels: [],
                maxConcurrent: 1,
                inFlight: 0,
                queued: 0,
                probed: true,
                healthy: true,
                pressureCheckEnabled: true,
                pressure: {
                  state: "healthy",
                  level: "normal",
                  source: "macos-host",
                  swapUsedBytes: 0,
                  swapTotalBytes: 2_147_483_648,
                  swapUsedRatio: 0,
                  availableMemRatio: 0.4,
                  totalMemBytes: 17_179_869_184,
                  compressorBytes: 0,
                  reason: null,
                  fix: null,
                  recheckCommand: "repoos runners --probe",
                },
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
    const banner = wrapper.get(".rr-pressure-banner");
    expect(banner.text()).toContain("Runner memory pressure");
    expect(banner.text()).toContain("1 of 2 hosts");
    expect(banner.text()).toContain("swap 75% used");
    expect(banner.text()).toContain("sudo swapoff -a && sudo swapon -a");
    expect(banner.text()).toContain("repoos runners --probe");
    expect(wrapper.find('[data-test-id="runner-pressure-badge"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Memory health");
    wrapper.unmount();
  });
});
