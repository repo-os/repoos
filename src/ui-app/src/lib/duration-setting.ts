/** Settings duration fields are stored in milliseconds and edited in a larger unit. */

export type DurationUnit = "s" | "min";

const FACTOR: Record<DurationUnit, number> = { s: 1000, min: 60_000 };

/**
 * Minutes when the stored default is a whole number of minutes (phantom detect
 * 3 min, crash failover 30 min, nudge cooldown 60 min, check/Playwright queues
 * 45 min). Seconds otherwise (heartbeat 75s, reclaim grace 150s, routing 8s,
 * nudge minimums that are sub-minute). Sub-second tuning stays in seconds so
 * a 500 ms floor is still editable. `closeOut.timeoutMs` is a labelled select,
 * not this control. `watchdog.stalenessMs` is parsed but not a Settings field.
 * Storage stays milliseconds.
 */
export function durationUnitFor(key: string, defaultMs: number): DurationUnit | null {
  if (!key.endsWith("Ms")) return null;
  if (defaultMs >= 60_000 && defaultMs % 60_000 === 0) return "min";
  return "s";
}

export function durationUnitLabel(unit: DurationUnit): string {
  return unit === "min" ? "minutes" : "seconds";
}

export const DURATION_HELP =
  "Saved in milliseconds. Opening Settings without editing does not change the stored value.";

/** Display string for a stored millisecond value. Fractions are kept. */
export function formatDurationMs(ms: number, unit: DurationUnit): string {
  const n = ms / FACTOR[unit];
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded);
}

/** Parse an edited display value back to integer milliseconds. */
export function parseDurationMs(text: string, unit: DurationUnit): number {
  const n = Number(text);
  if (!Number.isFinite(n)) return Number.NaN;
  return Math.round(n * FACTOR[unit]);
}

export function durationBound(ms: number | undefined, unit: DurationUnit): number | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return undefined;
  return ms / FACTOR[unit];
}
