import { cpus, loadavg, totalmem } from "node:os";
import { availableMemBytes } from "./sysmem.js";
import type { RepoOSConfig } from "./types.js";
import {
  pressureGuardEnabled,
  pressureMaxLoadPerCpu,
  pressureMinAvailableMemRatio,
} from "./resource-limits.js";

export interface PressureSnapshot {
  loadPerCpu: number;
  availableMemRatio: number;
  reason: string | null;
}

export function samplePressure(): Omit<PressureSnapshot, "reason"> {
  const cpuCount = Math.max(1, cpus().length);
  const load = loadavg()[0] ?? 0;
  const total = totalmem();
  const available = Math.max(availableMemBytes(), 0);
  return {
    loadPerCpu: load / cpuCount,
    availableMemRatio: total > 0 ? available / total : 1,
  };
}

export function pressureReason(
  config: RepoOSConfig,
  sample?: Omit<PressureSnapshot, "reason">,
): string | null {
  if (!pressureGuardEnabled(config)) return null;
  const s = sample ?? samplePressure();
  const maxLoad = pressureMaxLoadPerCpu(config);
  const minAvail = pressureMinAvailableMemRatio(config);
  if (s.loadPerCpu > maxLoad) {
    return (
      `system load is high (${s.loadPerCpu.toFixed(1)}× per CPU, limit ${maxLoad}×) — ` +
      "waiting for headroom before starting more checks"
    );
  }
  if (s.availableMemRatio < minAvail) {
    return (
      `available memory is low (${Math.round(s.availableMemRatio * 100)}% of RAM, ` +
      `need at least ${Math.round(minAvail * 100)}%) — waiting before starting more checks`
    );
  }
  return null;
}

export async function waitForPressureRelief(
  config: RepoOSConfig,
  opts: {
    onWaiting?: (reason: string) => void;
    pollMs?: number;
    deadlineAt?: number;
  } = {},
): Promise<void> {
  const poll = Math.max(500, opts.pollMs ?? 2000);
  while (true) {
    const sample = samplePressure();
    const reason = pressureReason(config, sample);
    if (!reason) return;
    opts.onWaiting?.(reason);
    if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) {
      throw new Error(
        `${reason} — timed out waiting for relief. Lower load, free memory, or raise pressureGuard limits in Settings.`,
      );
    }
    await new Promise((r) => setTimeout(r, poll));
  }
}
