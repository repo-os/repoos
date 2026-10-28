/** Compact, output-free step history and statistics (#0970). */
import type { StepStatus } from "./check-runner.js";

export interface CheckStepTiming {
  name: string;
  status: StepStatus;
  durationMs: number;
}

export interface CheckStepStats {
  name: string;
  samples: number;
  skipped: number;
  failures: number;
  medianMs: number | null;
  p90Ms: number | null;
}

/** Validate disk/wire data; old runs without timings remain unknown, never zero. */
export function readStepTimings(value: unknown): CheckStepTiming[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (s): s is CheckStepTiming =>
        s != null &&
        typeof s.name === "string" &&
        s.name.length > 0 &&
        ["passed", "failed", "timeout", "missing-prereq", "skipped"].includes(s.status) &&
        typeof s.durationMs === "number" &&
        Number.isFinite(s.durationMs) &&
        s.durationMs >= 0,
    )
    .map(({ name, status, durationMs }) => ({ name, status, durationMs }));
}

export const STEP_TIMING_MARKER = "::repoos-check-step::";

/** Structured records survive remote streaming without parsing rounded display text. */
export function stepTimingsFromOutput(output: string): CheckStepTiming[] {
  const steps = new Map<string, CheckStepTiming>();
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith(STEP_TIMING_MARKER)) continue;
    try {
      const [step] = readStepTimings([JSON.parse(line.slice(STEP_TIMING_MARKER.length))]);
      // A later browser-only invocation emits skips for install/build/tests.
      // Preserve the measured step from the earlier runner phase.
      if (step && (step.status !== "skipped" || !steps.has(step.name))) {
        steps.set(step.name, step);
      }
    } catch {
      /* incomplete stream record */
    }
  }
  return [...steps.values()];
}

/** Last N runs are selected by the caller; skips do not dilute durations/failure rates. */
export function summarizeStepTimings(runs: { steps?: CheckStepTiming[] }[]): CheckStepStats[] {
  const byName = new Map<string, CheckStepTiming[]>();
  for (const run of runs) {
    for (const step of run.steps ?? []) {
      const list = byName.get(step.name) ?? [];
      list.push(step);
      byName.set(step.name, list);
    }
  }
  return [...byName]
    .map(([name, steps]) => {
      const measured = steps.filter((s) => s.status !== "skipped");
      const durations = measured.map((s) => s.durationMs).sort((a, b) => a - b);
      const n = durations.length;
      return {
        name,
        samples: n,
        skipped: steps.length - n,
        failures: measured.filter((s) => s.status !== "passed").length,
        medianMs: n
          ? (durations[Math.floor((n - 1) / 2)]! + durations[Math.floor(n / 2)]!) / 2
          : null,
        p90Ms: n ? durations[Math.ceil(n * 0.9) - 1]! : null,
      };
    })
    .sort((a, b) => (b.p90Ms ?? -1) - (a.p90Ms ?? -1) || a.name.localeCompare(b.name));
}
