/**
 * Remote runner memory-health probe (#0901).
 *
 * Local checks use `pressure-guard` against this machine. A remote runner has
 * the same problem for a different reason: on 2026-10-21 a tailnet host sat at
 * 73% swap, the memory-pressure guard inside its gate containers held spawns,
 * and the branch's tests failed remotely with no visible cause. The fix was
 * `sudo swapoff -a && sudo swapon -a`, found by hand.
 *
 * So before leasing a host, RepoOS reads its pressure and skips hosts over the
 * `pressureGuard` thresholds. Paging activity and Linux PSI identify active
 * pressure; quiet swap occupancy is informational. The numbers come from the
 * right place:
 *
 * - Native Linux (and Docker on Linux): `/proc/meminfo` on the host. Containers
 *   there see the host's swap, so the host reading is the container reading.
 * - Docker on macOS (Colima / Docker Desktop): containers see the **Linux VM's**
 *   memory, not macOS swap. Read `/proc/meminfo` inside a probe container and
 *   evaluate the VM's numbers; host `vm.swapusage` would answer a different
 *   question.
 * - Native macOS: the gate runs on the host itself, so macOS swap and the
 *   compressor pool are the right signals.
 *
 * Everything here is pure and takes injectable output so tests never sample the
 * real machine or a real host.
 */
import type { RemoteValidationHost } from "./types.js";
import { hostRunner } from "./remote-hosts.js";
import {
  evaluatePressure,
  type PressureLevel,
  type PressureSnapshot,
  type PressureThresholds,
} from "./pressure-guard.js";
import { parseLinuxSwap, parseSwapUsage, parseVmStatCompressor } from "./memory-pressure.js";
import { parseLinuxPsiMemoryAvg10 } from "./memory-activity.js";

/** Printed first by the probe command so a fake/test can recognise it. */
export const HOST_HEALTH_PROBE_TOKEN = "__REPOOS_HOST_HEALTH__";

/** Where a sample's numbers came from. */
export type HostPressureSource = "linux" | "macos-vm" | "macos-host" | "unknown";

export interface HostPressureSample {
  source: HostPressureSource;
  swapUsedBytes: number | null;
  swapTotalBytes: number | null;
  /** Reclaimable memory as a fraction of the measured RAM. */
  availableMemRatio: number | null;
  totalMemBytes: number | null;
  compressorBytes?: number | null;
  /** Linux PSI memory `some avg10` (0–100). */
  psiMemoryAvg10?: number | null;
  sampledAt?: string;
}

export type RunnerHealthState = "healthy" | "pressured" | "unknown";

export interface RunnerHealth {
  state: RunnerHealthState;
  /** `pressure-guard`'s verdict for the same thresholds local work uses. */
  level: PressureLevel;
  source: HostPressureSource;
  swapUsedBytes: number | null;
  swapTotalBytes: number | null;
  swapUsedRatio: number | null;
  availableMemRatio: number | null;
  totalMemBytes: number | null;
  compressorBytes: number | null;
  /** Compressor share of RAM (0..1), when the host reports it. */
  compressorRatio?: number | null;
  /** Linux PSI memory avg10 (%), when the host reports it. */
  psiMemoryAvg10?: number | null;
  /** Non-empty when critical — the reason work is being held. */
  reason: string | null;
  /** The exact human fix for this host's OS, when pressured. */
  fix: string | null;
  /** Command a human can run to re-check. */
  recheckCommand: string;
  sampledAt?: string;
}

/** A skip/failure notice that can be attached to a run and shown on the task. */
export interface RunnerHealthNotice {
  host: string;
  /** "skipped" before leasing, or "failed" after a gate matched the signature. */
  action: "skipped" | "failed";
  reason: string;
  fix: string;
  recheckCommand: string;
  swapUsedRatio: number | null;
  availableMemRatio: number | null;
  /** One line suitable for a task activity entry or a drawer banner. */
  message: string;
}

const HOST_HEALTH_REMINDER = "repoos runners --probe";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * One SSH command that measures the host's effective memory pressure.
 *
 * The meminfo branch is chosen by the host's configured runner: Docker on macOS
 * reads a probe container (the VM), everything else reads `/proc/meminfo`
 * directly. macOS-native hosts additionally report `vm.swapusage` / `vm_stat`.
 */
export function hostPressureProbeCommand(
  host: RemoteValidationHost,
  containerImage = "repoos-ci",
): string {
  const docker = hostRunner(host) === "docker";
  const image = shellQuote(containerImage);
  const meminfo = docker
    ? `if [ "$(uname -s 2>/dev/null)" = "Darwin" ]; then ` +
      `docker run --rm --network none ${image} cat /proc/meminfo 2>/dev/null || true; ` +
      `else cat /proc/meminfo 2>/dev/null || true; fi`
    : "cat /proc/meminfo 2>/dev/null || true";
  const psi = docker
    ? `if [ "$(uname -s 2>/dev/null)" = "Darwin" ]; then ` +
      `docker run --rm --network none ${image} cat /proc/pressure/memory 2>/dev/null || true; ` +
      `else cat /proc/pressure/memory 2>/dev/null || true; fi`
    : "cat /proc/pressure/memory 2>/dev/null || true";
  return [
    `printf '${HOST_HEALTH_PROBE_TOKEN}\\n'`,
    "printf '__UNAME__\\n'; uname -s 2>/dev/null || true",
    `printf '\\n__MEMINFO__\\n'; ${meminfo}`,
    `printf '\\n__PSI__\\n'; ${psi}`,
    "printf '\\n__SWAP__\\n'; vm.swapusage 2>/dev/null || true",
    "printf '\\n__VMSTAT__\\n'; vm_stat 2>/dev/null || true",
    "printf '\\n__MEMSIZE__\\n'; sysctl -n hw.memsize 2>/dev/null || true",
  ].join("; ");
}

interface LabelledSections {
  get(name: string): string;
}

function splitLabelledSections(output: string): LabelledSections {
  const sections = new Map<string, string>();
  // Line-start lookbehind, not `(?:^|\n)`: an EMPTY section (`__MEMINFO__\n__PSI__\n`)
  // must not swallow the newline the next marker needs (#0918).
  const marker = /(?<![^\n])__([A-Z_]+)__\n/g;
  let current = "";
  let previous = 0;
  for (const match of output.matchAll(marker)) {
    if (current) sections.set(current, output.slice(previous, match.index).trim());
    current = match[1]!;
    previous = match.index! + match[0].length;
  }
  if (current) sections.set(current, output.slice(previous).trim());
  return { get: (name) => sections.get(name) ?? "" };
}

interface ParsedMeminfo {
  totalBytes: number | null;
  availableBytes: number | null;
  swapUsedBytes: number | null;
  swapTotalBytes: number | null;
}

/** Parse the `/proc/meminfo` counters a container or Linux host reports. */
export function parseRunnerMeminfo(meminfo: string): ParsedMeminfo {
  const kb = (key: string): number | null => {
    const raw = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, "m"))?.[1];
    return raw === undefined ? null : Number(raw) * 1024;
  };
  const swap = parseLinuxSwap(meminfo);
  return {
    totalBytes: kb("MemTotal"),
    availableBytes: kb("MemAvailable"),
    swapUsedBytes: swap?.usedBytes ?? null,
    swapTotalBytes: swap?.totalBytes ?? null,
  };
}

/** Available macOS pages: free + inactive + speculative, when vm_stat lists them. */
export function parseVmStatAvailableBytes(vmStat: string): number | null {
  const pageSize = Number(vmStat.match(/page size of (\d+) bytes/)?.[1]) || 4096;
  const pages = (label: string): number | null => {
    const raw = vmStat.match(new RegExp(`Pages ${label}:\\s+(\\d+)\\.`))?.[1];
    return raw === undefined ? null : Number(raw);
  };
  const free = pages("free");
  const inactive = pages("inactive");
  const speculative = pages("speculative");
  if (free === null && inactive === null && speculative === null) return null;
  return ((free ?? 0) + (inactive ?? 0) + (speculative ?? 0)) * pageSize;
}

/**
 * Parse the labelled probe transcript. `runner` and `declaredOs` come from the
 * host config; the transcript's `uname` is used when present so a host whose OS
 * was declared loosely still reads the right numbers.
 */
export function parseHostPressureSample(
  output: string,
  opts: {
    runner: "docker" | "native";
    declaredOs?: string;
    sampledAt?: string;
  },
): HostPressureSample {
  const sections = splitLabelledSections(output);
  const uname = sections.get("UNAME").trim().toLowerCase();
  const isDarwin = uname === "darwin" || (!uname && opts.declaredOs?.toLowerCase() === "macos");
  const psiMemoryAvg10 = parseLinuxPsiMemoryAvg10(sections.get("PSI"));
  const meminfo = parseRunnerMeminfo(sections.get("MEMINFO"));

  if (meminfo.totalBytes !== null) {
    const source: HostPressureSource = isDarwin && opts.runner === "docker" ? "macos-vm" : "linux";
    return {
      source,
      swapUsedBytes: meminfo.swapUsedBytes,
      swapTotalBytes: meminfo.swapTotalBytes,
      availableMemRatio:
        meminfo.totalBytes > 0 && meminfo.availableBytes !== null
          ? meminfo.availableBytes / meminfo.totalBytes
          : null,
      totalMemBytes: meminfo.totalBytes,
      compressorBytes: null,
      psiMemoryAvg10,
      sampledAt: opts.sampledAt,
    };
  }

  if (isDarwin && opts.runner === "native") {
    const swap = parseSwapUsage(sections.get("SWAP")) ?? null;
    const compressorBytes = parseVmStatCompressor(sections.get("VMSTAT"));
    const totalMemBytes = Number(sections.get("MEMSIZE").match(/\d+/)?.[0] ?? NaN);
    const available = parseVmStatAvailableBytes(sections.get("VMSTAT"));
    return {
      source: "macos-host",
      swapUsedBytes: swap?.usedBytes ?? null,
      swapTotalBytes: swap?.totalBytes ?? null,
      availableMemRatio:
        Number.isFinite(totalMemBytes) && totalMemBytes > 0 && available !== null
          ? available / totalMemBytes
          : null,
      totalMemBytes: Number.isFinite(totalMemBytes) && totalMemBytes > 0 ? totalMemBytes : null,
      compressorBytes,
      psiMemoryAvg10: null,
      sampledAt: opts.sampledAt,
    };
  }

  if (isDarwin && opts.runner === "docker") {
    return {
      source: "macos-vm",
      swapUsedBytes: null,
      swapTotalBytes: null,
      availableMemRatio: null,
      totalMemBytes: null,
      compressorBytes: null,
      psiMemoryAvg10,
      sampledAt: opts.sampledAt,
    };
  }

  if (!isDarwin && (uname === "linux" || opts.declaredOs?.toLowerCase() === "linux")) {
    return {
      source: "linux",
      swapUsedBytes: null,
      swapTotalBytes: null,
      availableMemRatio: null,
      totalMemBytes: null,
      compressorBytes: null,
      psiMemoryAvg10,
      sampledAt: opts.sampledAt,
    };
  }

  return {
    source: "unknown",
    swapUsedBytes: null,
    swapTotalBytes: null,
    availableMemRatio: null,
    totalMemBytes: null,
    compressorBytes: null,
    psiMemoryAvg10: null,
    sampledAt: opts.sampledAt,
  };
}

/** The exact human fix for the OS whose memory the runner actually uses. */
export function runnerPressureFix(
  source: HostPressureSource,
  reason?: string | null,
): string | null {
  switch (source) {
    case "linux":
      if (reason?.includes("PSI memory pressure")) {
        return "free memory or move work off this host; inspect `cat /proc/pressure/memory` and `vmstat 1`";
      }
      return (
        "run `sudo swapoff -a && sudo swapon -a` on the runner " +
        "(it needs enough free RAM to hold the swapped pages — reboot instead if it does not)"
      );
    case "macos-vm":
      return (
        "the container sees the Linux VM's memory, not macOS swap — clear swap in the Docker VM " +
        "(Colima: `colima ssh -- sudo swapoff -a && colima ssh -- sudo swapon -a`, needs free RAM), " +
        "or restart Docker Desktop/Colima and quit memory-heavy apps on the Mac"
      );
    case "macos-host":
      return "quit memory-heavy apps on the Mac or reboot it to release swap and compressed memory";
    default:
      return null;
  }
}

/** Pure verdict from one host sample, using the local pressure thresholds. */
export function evaluateRunnerHealth(
  sample: HostPressureSample,
  thresholds: PressureThresholds,
): RunnerHealth {
  const base: RunnerHealth = {
    state: "unknown",
    level: "normal",
    source: sample.source,
    swapUsedBytes: sample.swapUsedBytes,
    swapTotalBytes: sample.swapTotalBytes,
    swapUsedRatio:
      sample.swapUsedBytes !== null && sample.swapTotalBytes !== null && sample.swapTotalBytes > 0
        ? Math.max(0, Math.min(1, sample.swapUsedBytes / sample.swapTotalBytes))
        : null,
    availableMemRatio: sample.availableMemRatio,
    totalMemBytes: sample.totalMemBytes,
    compressorBytes: sample.compressorBytes ?? null,
    compressorRatio:
      sample.compressorBytes != null && sample.totalMemBytes != null && sample.totalMemBytes > 0
        ? sample.compressorBytes / sample.totalMemBytes
        : null,
    psiMemoryAvg10: sample.psiMemoryAvg10 ?? null,
    reason: null,
    fix: null,
    recheckCommand: HOST_HEALTH_REMINDER,
    sampledAt: sample.sampledAt,
  };
  if (sample.source === "unknown") return base;

  const snapshot: PressureSnapshot = evaluatePressure(
    {
      availableMemRatio: sample.availableMemRatio ?? 1,
      totalMemBytes: sample.totalMemBytes ?? 0,
      swapUsedBytes: sample.swapUsedBytes,
      swapTotalBytes: sample.swapTotalBytes,
      compressorBytes: sample.compressorBytes ?? null,
      psiMemoryAvg10: sample.psiMemoryAvg10 ?? null,
      loadPerCpu: 0,
    },
    thresholds,
  );
  const pressured = snapshot.level === "critical";
  return {
    ...base,
    state: pressured ? "pressured" : "healthy",
    level: snapshot.level,
    swapUsedRatio: snapshot.swapUsedRatio ?? base.swapUsedRatio,
    reason: pressured ? snapshot.reason : null,
    fix: pressured ? runnerPressureFix(sample.source, snapshot.reason) : null,
  };
}

/** Build the notice a task/UI shows when a host is skipped or blamed for a failure. */
export function runnerHealthNotice(
  host: string,
  health: RunnerHealth,
  action: "skipped" | "failed",
): RunnerHealthNotice | null {
  if (health.state !== "pressured" || !health.reason) return null;
  const fix = health.fix ?? runnerPressureFix(health.source) ?? "free memory on the runner";
  const lead =
    action === "skipped"
      ? `runner ${host} skipped: it is under memory pressure`
      : `runner ${host} failed under memory pressure — not counted as a branch test failure`;
  return {
    host,
    action,
    reason: health.reason,
    fix,
    recheckCommand: health.recheckCommand,
    swapUsedRatio: health.swapUsedRatio,
    availableMemRatio: health.availableMemRatio,
    message: `${lead} — ${health.reason}. Fix: ${fix}. Re-check: ${health.recheckCommand}`,
  };
}

/** Compact one-line form for log lines and queue notices. */
export function formatRunnerHealthLine(health: RunnerHealth): string {
  const swap =
    health.swapUsedRatio === null
      ? "swap unavailable"
      : `swap ${Math.round(health.swapUsedRatio * 100)}%`;
  const mem =
    health.availableMemRatio === null
      ? "free memory unavailable"
      : `${Math.round(health.availableMemRatio * 100)}% memory available`;
  return `${swap}, ${mem}`;
}
