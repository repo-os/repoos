import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { printSystemSummary } from "../../commands/control-api.js";
import SystemResourcePanel from "../src/components/SystemResourcePanel.vue";
import { useRepoStore } from "../src/stores/repo.js";
import type { SystemStats } from "../src/types.js";

const GB = 1024 ** 3;
const holdReason = "memory compressor is holding 10.0 GB — holding new work";

function incidentStats(): SystemStats {
  return {
    machine: {
      cpuCount: 10,
      totalMem: 24 * GB,
      freeMem: GB,
      availableMem: 6 * GB,
      loadavg: [40, 35, 30],
      platform: "darwin",
    },
    totals: { cpuPercent: 20, memBytes: 2 * GB, memPercent: 8.3 },
    processes: [],
    serve: null,
    pressure: {
      level: "critical",
      availableMemRatio: 0.25,
      loadPerCpu: 4,
      swapUsedBytes: 0,
      swapTotalBytes: 4 * GB,
      swapUsedRatio: 0,
      compressorBytes: 10 * GB,
      compressorRatio: 10 / 24,
      memoryFreePercent: 20,
      totalMemBytes: 24 * GB,
      swapIoBytesPerSec: 0,
      pageoutBytesPerSec: 0,
      activityWindowSec: 30,
      psiMemoryAvg10: null,
      cpuIdlePercent: 0,
      source: "memory",
      reasons: [holdReason],
      warnings: [],
      reason: holdReason,
    },
    heavyJobs: { running: 2, queued: 3 },
    serverPid: 123,
    at: new Date().toISOString(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("heavy-job and pressure reporting (#0961)", () => {
  it("prints the hold reason and heavy-job counts in repoos stats", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printSystemSummary({
      pressure: {
        level: "critical",
        reason: holdReason,
        availableMemRatio: 0.25,
        loadPerCpu: 4,
        source: "memory",
      },
      heavyJobs: { running: 2, queued: 3 },
    });
    const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain(holdReason);
    expect(output).toContain("heavy jobs: 2 running, 3 queued");
  });

  it("shows the same reason and counts in the dashboard pressure banner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.systemStats = incidentStats();
    const wrapper = mount(SystemResourcePanel, {
      attachTo: document.body,
      global: { plugins: [pinia] },
    });
    await flushPromises();

    const heavyLines = wrapper.findAll("[data-heavy-jobs]");
    expect(heavyLines).toHaveLength(2);
    expect(heavyLines[0].text()).toBe("2 heavy jobs running, 3 queued");
    const banner = wrapper.get(".pressure-alert");
    expect(banner.text()).toContain("Pressure critical — holding new work");
    expect(banner.text()).toContain("2 heavy jobs running, 3 queued");
    expect(banner.text()).toContain(holdReason);
    wrapper.unmount();
  });
});
