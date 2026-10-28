import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { printSystemSummary } from "../../commands/control-api.js";
import { acquireCrossProcessSlot, localCheckLockRoot } from "../../core/cross-process-slots.js";
import type { RepoOSConfig } from "../../core/types.js";
import { sampleSystem } from "../../server/system.js";
import SystemResourcePanel from "../src/components/SystemResourcePanel.vue";
import { useRepoStore } from "../src/stores/repo.js";
import type { SystemStats } from "../src/types.js";

const GB = 1024 ** 3;
const holdReason = "memory compressor is holding 10.0 GB — holding new work";
const dirs: string[] = [];

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
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
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

  it("prints in-flight git jobs with queue wait vs run time (#0974)", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printSystemSummary({
      gitJobs: [
        {
          label: "git-worker build-index",
          lane: "bulk",
          state: "running",
          queueWaitMs: 2000,
          runMs: 45_000,
        },
        {
          label: "git-command status",
          lane: "fast",
          state: "queued",
          queueWaitMs: 500,
          runMs: 0,
        },
      ],
    });
    const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("git jobs (2)");
    expect(output).toContain("build-index");
    expect(output).toContain("2s queue");
    expect(output).toContain("45s run");
    expect(output).toContain("fast");
  });

  it("samples heavy jobs from another checkout through the shared host pool", async () => {
    const rootA = mkdtempSync(join(tmpdir(), "repoos-heavy-report-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "repoos-heavy-report-b-"));
    dirs.push(rootA, rootB);
    const config: RepoOSConfig = {
      root: rootB,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
      pressureGuard: { enabled: false },
    };
    const lockRoot = localCheckLockRoot(rootA, ".repoos");
    expect(localCheckLockRoot(rootB, ".repoos")).toBe(lockRoot);
    const release = await acquireCrossProcessSlot({ slots: 1, lockRoot, waitTimeoutMs: 100 });
    let releaseQueued: (() => void) | undefined;
    const queued = acquireCrossProcessSlot({ slots: 1, lockRoot, waitTimeoutMs: 5_000 }).then(
      (releaseNext) => {
        releaseQueued = releaseNext;
      },
    );
    try {
      const stats = await sampleSystem({
        serverPid: process.pid,
        cacheDir: rootB,
        runningAgents: [],
        root: rootB,
        config,
      });
      expect(stats.heavyJobs).toEqual({ running: 1, queued: 1 });
    } finally {
      release();
      await queued;
      releaseQueued?.();
    }
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
