/**
 * Memory-pressure guard (#0871, #0918): paging activity and reclaimable memory
 * block starts; swap/compressor occupancy is advisory. Every test uses injected
 * samples — never the real machine.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activityRatesBetween,
  parseDarwinMemoryPressureLevel,
  parseLinuxPsiMemoryAvg10,
  parseLinuxVmstatCounters,
  parseVmStatCounters,
  readPlatformMemoryActivity,
  resetDefaultActivityTracker,
  RollingMemoryActivityTracker,
  type MemoryActivitySample,
} from "../../core/memory-activity.js";
import {
  parseLinuxSwap,
  parseMemoryPressureFreePercent,
  parseSwapUsage,
  parseVmStatCompressor,
  type MemoryPressureProbe,
  type MemoryReadings,
} from "../../core/memory-pressure.js";
import {
  evaluatePressure,
  pressureReason,
  pressureSnapshotForDisplay,
  pressureThresholds,
  waitForPressureRelief,
} from "../../core/pressure-guard.js";
import type { RepoOSConfig } from "../../core/types.js";

const GB = 1024 ** 3;

function config(overrides: NonNullable<RepoOSConfig["pressureGuard"]> = {}): RepoOSConfig {
  return {
    root: "/tmp/repo",
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    pressureGuard: {
      enabled: true,
      maxLoadPerCpu: 4,
      minAvailableMemRatio: 0.08,
      maxSwapUsedRatio: 0.5,
      maxCompressorRatio: 0.35,
      activityWindowSec: 30,
      maxSwapIoBytesPerSec: 1024 * 1024,
      maxPageoutBytesPerSec: 256 * 1024,
      minMemoryFreePercent: 10,
      maxPsiMemoryAvg10: 25,
      ...overrides,
    },
  };
}

function readings(overrides: Partial<MemoryReadings> = {}): MemoryReadings {
  return {
    loadPerCpu: 0.2,
    availableMemRatio: 0.4,
    totalMemBytes: 16 * GB,
    swapUsedBytes: 0,
    swapTotalBytes: 4 * GB,
    compressorBytes: 0,
    memoryFreePercent: 70,
    memoryStatsAvailable: true,
    swapIoBytesPerSec: 0,
    pageoutBytesPerSec: 0,
    activityWindowSec: 30,
    ...overrides,
  };
}

function probe(...sequence: MemoryReadings[]): MemoryPressureProbe {
  let i = 0;
  return {
    read() {
      const next = sequence[Math.min(i, sequence.length - 1)];
      i += 1;
      return next;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  resetDefaultActivityTracker();
});

describe("platform pressure parsers", () => {
  it("parses vm.swapusage totals and used", () => {
    const parsed = parseSwapUsage(
      "total = 4096.00M  used = 3072.00M  free = 1024.00M  (encrypted)",
    );
    expect(parsed).toEqual({ totalBytes: 4096 * 1024 ** 2, usedBytes: 3072 * 1024 ** 2 });
  });

  it("parses the vm_stat compressor pool with the reported page size", () => {
    const out = [
      "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
      "Pages free:                               12345.",
      "Pages occupied by compressor:             65536.",
    ].join("\n");
    expect(parseVmStatCompressor(out)).toBe(65536 * 16384);
  });

  it("parses vm_stat paging counters", () => {
    const out = [
      "Mach Virtual Memory Statistics: (page size of 4096 bytes)",
      "Pageouts: 1000.",
      "Swapins: 200.",
      "Swapouts: 300.",
    ].join("\n");
    expect(parseVmStatCounters(out)).toEqual({
      pageSize: 4096,
      pageouts: 1000,
      swapins: 200,
      swapouts: 300,
    });
  });

  it("parses memory_pressure's free percentage", () => {
    expect(parseMemoryPressureFreePercent("System-wide memory free percentage: 43%\n")).toBe(43);
  });

  it("parses Linux swap from /proc/meminfo", () => {
    const out = "SwapTotal:       2097152 kB\nSwapFree:        1048576 kB\n";
    expect(parseLinuxSwap(out)).toEqual({
      totalBytes: 2097152 * 1024,
      usedBytes: 1048576 * 1024,
    });
  });

  it("parses Linux vmstat and PSI memory", () => {
    expect(parseLinuxVmstatCounters("pswpin 10\npswpout 20\n")).toEqual({
      pswpin: 10,
      pswpout: 20,
    });
    expect(parseLinuxPsiMemoryAvg10("some avg10=12.50 avg60=1.00 total=100\n")).toBe(12.5);
    expect(parseDarwinMemoryPressureLevel("4\n")).toBe("critical");
    expect(parseDarwinMemoryPressureLevel("2\n")).toBe("warn");
    expect(parseDarwinMemoryPressureLevel("1\n")).toBe("normal");
  });

  it("returns null when the probe text is missing", () => {
    expect(parseSwapUsage("no swap here")).toBeNull();
    expect(parseVmStatCompressor("no compressor line")).toBeNull();
    expect(parseMemoryPressureFreePercent("nothing")).toBeNull();
    expect(parseLinuxSwap("MemTotal: 1 kB")).toBeNull();
    expect(parseVmStatCounters("no counters")).toBeNull();
  });
});

describe("activity rate window", () => {
  it("computes swap and pageout bytes per second between samples", () => {
    const a: MemoryActivitySample = {
      atMs: 0,
      pageSize: 4096,
      pageouts: 100,
      swapins: 0,
      swapouts: 0,
    };
    const b: MemoryActivitySample = {
      atMs: 10_000,
      pageSize: 4096,
      pageouts: 200,
      swapins: 512,
      swapouts: 512,
    };
    const rates = activityRatesBetween(a, b);
    expect(rates.windowSec).toBe(10);
    expect(rates.pageoutBytesPerSec).toBeCloseTo((100 * 4096) / 10);
    expect(rates.swapIoBytesPerSec).toBeCloseTo((1024 * 4096) / 10);
  });

  it("uses the Linux page size for pswp counters", () => {
    const tracker = new RollingMemoryActivityTracker(10_000);
    const readings = readPlatformMemoryActivity(10, {
      platform: "linux",
      tracker,
      now: (() => {
        let n = 0;
        return () => (n += 10_000);
      })(),
      runCommand: (cmd) => (cmd === "getconf" ? "4096\n" : null),
      readFile: (path) =>
        path === "/proc/vmstat"
          ? "pswpin 100\npswpout 100\n"
          : path === "/proc/pressure/memory"
            ? "some avg10=0.00 avg60=0.00 avg300=0.00 total=0\n"
            : "",
    });
    expect(readings.swapIoBytesPerSec).toBeNull();
    const next = readPlatformMemoryActivity(10, {
      platform: "linux",
      tracker,
      now: () => 20_000,
      runCommand: (cmd) => (cmd === "getconf" ? "4096\n" : null),
      readFile: (path) =>
        path === "/proc/vmstat"
          ? "pswpin 110\npswpout 110\n"
          : path === "/proc/pressure/memory"
            ? "some avg10=0.00 avg60=0.00 avg300=0.00 total=0\n"
            : "",
    });
    expect(next.swapIoBytesPerSec).toBe(8192);
  });

  it("waits until the rolling window is half full before reporting rates", () => {
    const tracker = new RollingMemoryActivityTracker(30_000, () => 0);
    const sample = (atMs: number, swapins: number): MemoryActivitySample => ({
      atMs,
      pageSize: 4096,
      pageouts: 0,
      swapins,
      swapouts: 0,
    });
    expect(tracker.record(sample(0, 0)).swapIoBytesPerSec).toBeNull();
    expect(tracker.record(sample(10_000, 10_000)).swapIoBytesPerSec).toBeNull();
    const rates = tracker.record(sample(20_000, 20_000));
    expect(rates.swapIoBytesPerSec).not.toBeNull();
  });
});

describe("evaluatePressure", () => {
  it("holds on sustained swap I/O even when occupancy is moderate", () => {
    const snapshot = evaluatePressure(
      readings({
        swapUsedBytes: 2 * GB,
        swapTotalBytes: 4 * GB,
        swapIoBytesPerSec: 4.1 * 1024 * 1024,
        activityWindowSec: 30,
      }),
      pressureThresholds(config()),
    );
    expect(snapshot.level).toBe("critical");
    expect(snapshot.reason).toMatch(/swap in\/out/i);
    expect(snapshot.reason).toMatch(/30 s/i);
  });

  it("does not hold on high swap/compressor occupancy when activity is quiet (idle-but-full)", () => {
    const snapshot = evaluatePressure(
      readings({
        swapUsedBytes: Math.round(4 * GB * 0.82),
        swapTotalBytes: 4 * GB,
        compressorBytes: Math.round(16 * GB * 0.36),
        swapIoBytesPerSec: 50_000,
        pageoutBytesPerSec: 40_000,
        activityWindowSec: 30,
      }),
      pressureThresholds(config()),
    );
    expect(snapshot.level).toBe("warning");
    expect(snapshot.reason).toBeNull();
    expect(snapshot.warnings.join(" ")).toMatch(/compressor/i);
    expect(snapshot.warnings.join(" ")).toMatch(/swap use is high/i);
  });

  it("holds when reclaimable memory is below the floor", () => {
    const snapshot = evaluatePressure(
      readings({ availableMemRatio: 0.02 }),
      pressureThresholds(config()),
    );
    expect(snapshot.level).toBe("critical");
    expect(snapshot.reason).toMatch(/available memory is low/i);
  });

  it("holds on macOS memory_pressure warn and critical", () => {
    for (const level of ["warn", "critical"] as const) {
      const snapshot = evaluatePressure(
        readings({ memoryPressureLevel: level }),
        pressureThresholds(config()),
      );
      expect(snapshot.reason).toMatch(/memory_pressure reports/);
    }
  });

  it("holds on thrashing activity then clears when rates recover", () => {
    const thresholds = pressureThresholds(config());
    const thrashing = evaluatePressure(
      readings({
        swapIoBytesPerSec: 2 * 1024 * 1024,
        pageoutBytesPerSec: 300 * 1024,
        activityWindowSec: 30,
      }),
      thresholds,
    );
    expect(thrashing.level).toBe("critical");

    const recovering = evaluatePressure(
      readings({ swapIoBytesPerSec: 0, pageoutBytesPerSec: 0, activityWindowSec: 30 }),
      thresholds,
    );
    expect(recovering.level).toBe("normal");
    expect(recovering.reason).toBeNull();
  });

  it("treats high load as a warning when memory stats are available", () => {
    const snapshot = evaluatePressure(
      readings({ loadPerCpu: 99, swapUsedBytes: 0, compressorBytes: 0 }),
      pressureThresholds(config()),
    );
    expect(snapshot.level).toBe("warning");
    expect(snapshot.reason).toBeNull();
    expect(snapshot.warnings.join(" ")).toMatch(/load is high/i);
  });

  it("falls back to load as a hold when memory stats are unavailable", () => {
    const snapshot = evaluatePressure(
      {
        loadPerCpu: 9,
        availableMemRatio: 1,
        totalMemBytes: 16 * GB,
        swapUsedBytes: null,
        swapTotalBytes: null,
        compressorBytes: null,
        memoryFreePercent: null,
        memoryStatsAvailable: false,
      },
      pressureThresholds(config()),
    );
    expect(snapshot.level).toBe("critical");
    expect(snapshot.source).toBe("load");
    expect(snapshot.reason).toMatch(/load is high/i);
  });

  it("uses PSI as a memory signal on a swap-less Linux host", () => {
    const snapshot = evaluatePressure(
      {
        loadPerCpu: 9,
        availableMemRatio: 0.5,
        totalMemBytes: 16 * GB,
        swapUsedBytes: null,
        swapTotalBytes: null,
        compressorBytes: null,
        memoryFreePercent: null,
        memoryStatsAvailable: false,
        psiMemoryAvg10: 40,
      },
      pressureThresholds(config()),
    );
    expect(snapshot.source).toBe("memory");
    expect(snapshot.level).toBe("critical");
    expect(snapshot.reason).toMatch(/PSI memory pressure avg10/i);
    expect(snapshot.warnings.join(" ")).toMatch(/load is high/i);
  });

  it("respects configured swap I/O threshold", () => {
    const strict = config({ maxSwapIoBytesPerSec: 100_000 });
    expect(
      pressureReason(strict, readings({ swapIoBytesPerSec: 200_000, activityWindowSec: 30 })),
    ).toMatch(/swap in\/out/i);
    const relaxed = config({ maxSwapIoBytesPerSec: 10_000_000 });
    expect(
      pressureReason(relaxed, readings({ swapIoBytesPerSec: 200_000, activityWindowSec: 30 })),
    ).toBeNull();
  });

  it("is normal when nothing is near a limit", () => {
    const snapshot = evaluatePressure(readings(), pressureThresholds(config()));
    expect(snapshot.level).toBe("normal");
    expect(snapshot.reason).toBeNull();
  });

  it("does not hold when the guard is disabled", () => {
    const disabled = config({ enabled: false });
    const display = pressureSnapshotForDisplay(
      disabled,
      probe(
        readings({
          swapUsedBytes: 4 * GB,
          swapTotalBytes: 4 * GB,
          swapIoBytesPerSec: 5 * 1024 * 1024,
        }),
      ),
    );
    expect(display.level).toBe("normal");
    expect(display.reason).toBeNull();
    expect(
      pressureReason(
        disabled,
        readings({ swapIoBytesPerSec: 5 * 1024 * 1024, activityWindowSec: 30 }),
      ),
    ).toBeNull();
  });
});

describe("waitForPressureRelief", () => {
  it("returns immediately when the guard is disabled", async () => {
    const waiting: string[] = [];
    const fake = probe(readings({ swapIoBytesPerSec: 5 * 1024 * 1024, activityWindowSec: 30 }));
    await waitForPressureRelief(config({ enabled: false }), {
      probe: fake,
      pollMs: 1,
      onWaiting: (reason) => waiting.push(reason),
    });
    expect(waiting).toHaveLength(0);
  });

  it("waits until a fake probe reports relief, then proceeds", async () => {
    const waiting: string[] = [];
    const fake = probe(
      readings({ swapIoBytesPerSec: 5 * 1024 * 1024, activityWindowSec: 30 }),
      readings({ swapIoBytesPerSec: 0, activityWindowSec: 30 }),
    );
    await waitForPressureRelief(config(), {
      probe: fake,
      pollMs: 1,
      onWaiting: (reason) => waiting.push(reason),
    });
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatch(/swap in\/out/i);
  });

  it("includes informational occupancy warnings in the hold message", async () => {
    const waiting: string[] = [];
    const fake = probe(
      readings({
        swapUsedBytes: 3 * GB,
        swapTotalBytes: 4 * GB,
        swapIoBytesPerSec: 5 * 1024 * 1024,
        activityWindowSec: 30,
      }),
    );
    await waitForPressureRelief(config(), {
      probe: fake,
      pollMs: 1,
      deadlineAt: Date.now(),
      onWaiting: (message) => waiting.push(message),
    }).catch(() => undefined);
    expect(waiting[0]).toMatch(/swap in\/out/i);
    expect(waiting[0]).toMatch(/swap use is high/i);
  });

  it("times out with an actionable message while pressure stays critical", async () => {
    const fake = probe(readings({ swapIoBytesPerSec: 5 * 1024 * 1024, activityWindowSec: 30 }));
    await expect(
      waitForPressureRelief(config(), {
        probe: fake,
        pollMs: 1,
        deadlineAt: Date.now(),
      }),
    ).rejects.toThrow(/timed out waiting for relief/i);
  });
});
