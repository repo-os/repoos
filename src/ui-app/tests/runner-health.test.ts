/**
 * #0901 — remote runner memory health.
 *
 * All samples are injected transcripts, never the real machine or a real host:
 * the point is that the numbers come from the right OS (Linux host, the Linux
 * VM behind Docker-on-macOS, or the native Mac), and that a pressured sample
 * carries the exact human fix.
 */
import { describe, expect, it } from "vitest";
import { pressureThresholds } from "../../core/pressure-guard.js";
import {
  formatRunnerHealthLine,
  hostPressureProbeCommand,
  parseHostPressureSample,
  evaluateRunnerHealth,
  runnerHealthNotice,
  HOST_HEALTH_PROBE_TOKEN,
} from "../../core/runner-health.js";

const thresholds = pressureThresholds();

const LINUX_HEADER = `__UNAME__\nLinux`;
const HEALTHY_LINUX = `${HOST_HEALTH_PROBE_TOKEN}
${LINUX_HEADER}
__MEMINFO__
MemTotal:       16777216 kB
MemAvailable:    8388608 kB
SwapTotal:       4194304 kB
SwapFree:        3670016 kB
__PSI__
some avg10=0.00 avg60=0.00 avg300=0.00 total=0
__SWAP__
__VMSTAT__
__MEMSIZE__
`;

/** 73% swap used — the 2026-10-21 incident signature. */
const PRESSURED_LINUX = `${HOST_HEALTH_PROBE_TOKEN}
${LINUX_HEADER}
__MEMINFO__
MemTotal:       16777216 kB
MemAvailable:    1048576 kB
SwapTotal:       4194304 kB
SwapFree:        1048576 kB
__PSI__
some avg10=0.00 avg60=0.00 avg300=0.00 total=0
__SWAP__
__VMSTAT__
__MEMSIZE__
`;

describe("hostPressureProbeCommand", () => {
  it("reads /proc/meminfo directly on a Linux host", () => {
    const cmd = hostPressureProbeCommand({ host: "bee", os: "linux" });
    expect(cmd).toContain(HOST_HEALTH_PROBE_TOKEN);
    expect(cmd).toContain("cat /proc/meminfo");
    expect(cmd).toContain("cat /proc/pressure/memory");
    // Docker is only used inside the Darwin branch; a Linux host's own
    // /proc/meminfo is what its containers see.
    expect(cmd).toContain("$(uname -s 2>/dev/null)");
  });

  it("reads inside a probe container for Docker on macOS, never the Mac's swap", () => {
    const cmd = hostPressureProbeCommand({ host: "mac1", os: "macos" }, "repoos-ci");
    expect(cmd).toContain("docker run --rm --network none 'repoos-ci' cat /proc/meminfo");
    expect(cmd).toContain("docker run --rm --network none 'repoos-ci' cat /proc/pressure/memory");
  });

  it("reads the host itself for a native macOS runner", () => {
    const cmd = hostPressureProbeCommand({ host: "mac1", os: "macos", runner: "native" });
    expect(cmd).not.toContain("docker run");
    expect(cmd).toContain("vm.swapusage");
  });
});

describe("parseHostPressureSample + evaluateRunnerHealth", () => {
  it("marks a healthy Linux host healthy with its swap ratio", () => {
    const sample = parseHostPressureSample(HEALTHY_LINUX, { runner: "docker" });
    expect(sample.source).toBe("linux");
    const health = evaluateRunnerHealth(sample, thresholds);
    expect(health.state).toBe("healthy");
    expect(health.swapUsedRatio).toBeCloseTo(0.125, 3);
    expect(health.availableMemRatio).toBeCloseTo(0.5, 3);
    expect(health.fix).toBeNull();
    expect(formatRunnerHealthLine(health)).toContain("swap 13%");
  });

  it("marks a host at 73% swap pressured and names the Linux fix", () => {
    const sample = parseHostPressureSample(PRESSURED_LINUX, { runner: "docker" });
    const health = evaluateRunnerHealth(sample, thresholds);
    expect(health.state).toBe("pressured");
    expect(health.level).toBe("critical");
    expect(health.reason).toMatch(/available memory is low/i);
    expect(health.fix).toContain("sudo swapoff -a && sudo swapon -a");
    expect(health.recheckCommand).toContain("repoos runners");
  });

  it("evaluates the Colima Linux VM's numbers, not macOS swap (macOS + Docker)", () => {
    // macOS looks idle; the container's VM is nearly out of swap. The gate runs
    // in the VM, so the VM's numbers must win.
    const output = `${HOST_HEALTH_PROBE_TOKEN}
__UNAME__
Darwin
__MEMINFO__
MemTotal:        2097152 kB
MemAvailable:     102400 kB
SwapTotal:       1048576 kB
SwapFree:         102400 kB
__PSI__
some avg10=0.00 avg60=0.00 avg300=0.00 total=0
__SWAP__
total = 0.00M  used = 0.00M  free = 8192.00M  (encrypted)
__VMSTAT__
__MEMSIZE__
34359738368
`;
    const sample = parseHostPressureSample(output, { runner: "docker", declaredOs: "macos" });
    expect(sample.source).toBe("macos-vm");
    const health = evaluateRunnerHealth(sample, thresholds);
    expect(health.state).toBe("pressured");
    expect(health.swapUsedRatio).toBeGreaterThan(0.8);
    expect(health.fix).toContain("Docker VM");
    expect(health.fix).toContain("colima ssh");
  });

  it("uses macOS swap and the compressor for a native macOS runner", () => {
    const output = `${HOST_HEALTH_PROBE_TOKEN}
__UNAME__
Darwin
__MEMINFO__
__SWAP__
total = 2048.00M  used = 1536.00M  free = 512.00M  (encrypted)
__VMSTAT__
Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                          100.
Pages inactive:                      200.
Pages speculative:                   100.
Pages occupied by compressor:    1200000.
__MEMSIZE__
34359738368
`;
    const sample = parseHostPressureSample(output, { runner: "native", declaredOs: "macos" });
    expect(sample.source).toBe("macos-host");
    expect(sample.psiMemoryAvg10).toBeNull();
    const health = evaluateRunnerHealth(sample, thresholds);
    expect(health.state).toBe("pressured");
    expect(health.fix).toContain("quit memory-heavy apps");
    expect(health.compressorBytes).toBeGreaterThan(0);
  });

  it("returns unknown (never pressured) when the probe produced no memory signals", () => {
    const sample = parseHostPressureSample(`${HOST_HEALTH_PROBE_TOKEN}\n__UNAME__\n\n`, {
      runner: "docker",
    });
    const health = evaluateRunnerHealth(sample, thresholds);
    expect(health.state).toBe("unknown");
    expect(health.reason).toBeNull();
  });

  it("skips a Linux runner under PSI pressure even when swap and available RAM are healthy", () => {
    const output = `${HOST_HEALTH_PROBE_TOKEN}
${LINUX_HEADER}
__MEMINFO__
MemTotal:       16777216 kB
MemAvailable:    8388608 kB
SwapTotal:             0 kB
SwapFree:              0 kB
__PSI__
some avg10=40.00 avg60=35.00 avg300=20.00 total=1000000
__SWAP__
__VMSTAT__
__MEMSIZE__
`;
    const sample = parseHostPressureSample(output, { runner: "native" });
    const health = evaluateRunnerHealth(sample, thresholds);
    expect(sample.psiMemoryAvg10).toBe(40);
    expect(health.state).toBe("pressured");
    expect(health.reason).toMatch(/PSI memory pressure avg10/i);
    expect(health.fix).toMatch(/cat \/proc\/pressure\/memory/);
    // #0918 review: the DTO must carry the PSI reading to the Runners tab.
    expect(health.psiMemoryAvg10).toBe(40);
  });

  it("carries the compressor share of RAM on the runner health DTO", () => {
    const health = evaluateRunnerHealth(
      {
        source: "macos-host",
        swapUsedBytes: 0,
        swapTotalBytes: 4 * 1024 ** 3,
        availableMemRatio: 0.5,
        totalMemBytes: 16 * 1024 ** 3,
        compressorBytes: 4 * 1024 ** 3,
        psiMemoryAvg10: null,
        sampledAt: "2026-10-22T00:00:00.000Z",
      },
      thresholds,
    );
    expect(health.compressorRatio).toBeCloseTo(0.25, 5);
  });

  it("still recognizes PSI if a Linux runner has no readable meminfo", () => {
    const sample = parseHostPressureSample(
      `${HOST_HEALTH_PROBE_TOKEN}\n${LINUX_HEADER}\n__MEMINFO__\n__PSI__\nsome avg10=40.00 avg60=35.00 avg300=20.00 total=1000000\n`,
      { runner: "native" },
    );
    expect(sample.source).toBe("linux");
    expect(evaluateRunnerHealth(sample, thresholds).state).toBe("pressured");
  });

  it("builds a one-line notice naming the host, numbers and fix", () => {
    const health = evaluateRunnerHealth(
      parseHostPressureSample(PRESSURED_LINUX, { runner: "docker" }),
      thresholds,
    );
    const notice = runnerHealthNotice("thinkpad", health, "skipped")!;
    expect(notice.host).toBe("thinkpad");
    expect(notice.message).toContain("thinkpad skipped");
    expect(notice.message).toContain("swapoff -a");
    expect(notice.message).toContain("repoos runners");
    expect(
      runnerHealthNotice(
        "idle",
        evaluateRunnerHealth(
          parseHostPressureSample(HEALTHY_LINUX, { runner: "docker" }),
          thresholds,
        ),
        "skipped",
      ),
    ).toBeNull();
  });
});
