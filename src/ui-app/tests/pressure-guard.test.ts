/**
 * Memory-pressure guard (#0871): swap/compressor readings are the primary
 * signal, load average is the fallback. Every test uses a fake probe.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("returns null when the probe text is missing", () => {
    expect(parseSwapUsage("no swap here")).toBeNull();
    expect(parseVmStatCompressor("no compressor line")).toBeNull();
    expect(parseMemoryPressureFreePercent("nothing")).toBeNull();
    expect(parseLinuxSwap("MemTotal: 1 kB")).toBeNull();
  });
});

describe("evaluatePressure", () => {
  it("holds on swap use even when load is low", () => {
    const snapshot = evaluatePressure(
      readings({ loadPerCpu: 0.1, swapUsedBytes: 3 * GB, swapTotalBytes: 4 * GB }),
      pressureThresholds(config()),
    );
    expect(snapshot.level).toBe("critical");
    expect(snapshot.source).toBe("memory");
    expect(snapshot.reason).toMatch(/swap is nearly full/i);
  });

  it("holds on the compressor pool even when swap is fine", () => {
    const snapshot = evaluatePressure(
      readings({ compressorBytes: 6 * GB }),
      pressureThresholds(config()),
    );
    expect(snapshot.level).toBe("critical");
    expect(snapshot.reason).toMatch(/compressor/i);
  });

  it("holds when reclaimable memory is below the floor", () => {
    const snapshot = evaluatePressure(
      readings({ availableMemRatio: 0.02 }),
      pressureThresholds(config()),
    );
    expect(snapshot.level).toBe("critical");
    expect(snapshot.reason).toMatch(/available memory is low/i);
  });

  it("blocks at 73% swap / 40% compressor, then clears when the host recovers", () => {
    const totalMemBytes = 16 * GB;
    const swapTotalBytes = 4 * GB;
    const blocked = evaluatePressure(
      readings({
        swapTotalBytes,
        swapUsedBytes: Math.round(swapTotalBytes * 0.73),
        compressorBytes: Math.round(totalMemBytes * 0.4),
      }),
      pressureThresholds(config()),
    );
    expect(blocked.level).toBe("critical");
    expect(blocked.reasons.join(" ")).toMatch(/swap is nearly full/i);
    expect(blocked.reasons.join(" ")).toMatch(/compressor/i);

    const relieved = evaluatePressure(
      readings({ swapUsedBytes: 0, compressorBytes: 0 }),
      pressureThresholds(config()),
    );
    expect(relieved.level).toBe("normal");
    expect(relieved.reason).toBeNull();
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

  it("respects configured thresholds", () => {
    const strict = config({ maxSwapUsedRatio: 0.1 });
    expect(
      pressureReason(strict, readings({ swapUsedBytes: 1 * GB, swapTotalBytes: 4 * GB })),
    ).toMatch(/swap/i);
    const relaxed = config({ maxSwapUsedRatio: 0.9 });
    expect(
      pressureReason(relaxed, readings({ swapUsedBytes: 1 * GB, swapTotalBytes: 4 * GB })),
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
      probe(readings({ swapUsedBytes: 4 * GB, swapTotalBytes: 4 * GB })),
    );
    expect(display.level).toBe("normal");
    expect(display.reason).toBeNull();
    expect(pressureReason(disabled, readings({ swapUsedBytes: 4 * GB }))).toBeNull();
  });
});

describe("waitForPressureRelief", () => {
  it("waits until a fake probe reports relief, then proceeds", async () => {
    const waiting: string[] = [];
    const fake = probe(
      readings({ swapUsedBytes: 4 * GB, swapTotalBytes: 4 * GB }),
      readings({ swapUsedBytes: 0 }),
    );
    await waitForPressureRelief(config(), {
      probe: fake,
      pollMs: 1,
      onWaiting: (reason) => waiting.push(reason),
    });
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatch(/swap/i);
  });

  it("times out with an actionable message while pressure stays critical", async () => {
    const fake = probe(readings({ compressorBytes: 12 * GB }));
    await expect(
      waitForPressureRelief(config(), {
        probe: fake,
        pollMs: 1,
        deadlineAt: Date.now(),
      }),
    ).rejects.toThrow(/timed out waiting for relief/i);
  });
});
