/**
 * Tailnet host pool for remote validation (#0521): parsing the `tailscaleHost`
 * shorthand and the `tailscaleHosts` pool out of the flat TOML map, resolving
 * per-host defaults, and matching a job's required capabilities against what
 * each host provides.
 *
 * Pure (no fs, no subprocess) so all of it is unit-testable directly. Three
 * authoring forms fold into one list, in this order:
 *
 *   1. `tailscaleHost = "bee"`          — the single-host shorthand (#0520)
 *   2. `tailscaleHosts = ["a", "b"]`    — flat list (what Settings edits)
 *   3. `[[remoteValidation.tailscaleHosts]]` rows — `host` plus optional
 *      `user` / `os` / `labels` / `maxConcurrent` per host
 *
 * Duplicate hosts merge (first occurrence keeps its position; a later entry's
 * defined fields win), so a rich row can add attributes to a host already
 * listed flat without it appearing twice.
 */
import type { RemoteValidationConfig, RemoteValidationHost } from "./types.js";

/** A job's host requirements: the host must provide EVERY capability. */
export type RemoteCapabilities = readonly string[];

/** Positive-integer limit with a fallback — shared by the pool and the gate. */
export function positiveLimit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : fallback;
}

function asStringList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Normalise one `[[remoteValidation.tailscaleHosts]]` row; null when unusable. */
function hostRow(raw: unknown): RemoteValidationHost | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const host = typeof r.host === "string" ? r.host.trim() : "";
  if (!host) {
    console.warn("[remoteValidation] tailscaleHosts row without a `host` — row ignored");
    return null;
  }
  const out: RemoteValidationHost = { host };
  if (typeof r.user === "string" && r.user.trim()) out.user = r.user.trim();
  if (typeof r.os === "string" && r.os.trim()) out.os = r.os.trim();
  const labels = asStringList(r.labels);
  if (labels.length) out.labels = labels;
  const max = r.maxConcurrent;
  if (typeof max === "number" && Number.isInteger(max) && max >= 1) out.maxConcurrent = max;
  return out;
}

/**
 * Parse `tailscaleHost` + `tailscaleHosts` from the flat TOML map into the
 * normalised pool. Returns undefined when no host is configured at all (the
 * runner then reports the missing-config error as before).
 */
export function parseTailscaleHosts(
  parsed: Record<string, unknown>,
): RemoteValidationHost[] | undefined {
  const shorthand =
    typeof parsed["remoteValidation.tailscaleHost"] === "string"
      ? (parsed["remoteValidation.tailscaleHost"] as string).trim()
      : "";
  const raw = parsed["remoteValidation.tailscaleHosts"];
  const entries: unknown[] = [];
  if (Array.isArray(raw)) entries.push(...raw);
  else if (typeof raw === "string" && raw.trim()) entries.push(raw);

  const pool: RemoteValidationHost[] = [];
  if (shorthand) pool.push({ host: shorthand });
  for (const entry of entries) {
    const host = typeof entry === "string" ? entry.trim() : "";
    const row = host ? { host } : hostRow(entry);
    if (!row) continue;
    const existing = pool.find((h) => h.host === row.host);
    if (existing) {
      // Later defined fields win; a bare string contributes none, so a row can
      // enrich a host already listed (in any order) without duplicating it.
      Object.assign(
        existing,
        Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)),
      );
      continue;
    }
    pool.push(row);
  }
  return pool.length ? pool : undefined;
}

/**
 * The effective pool for a config — tolerant of raw shapes so hand-built test
 * configs (a lone `tailscaleHost`, or string entries) behave exactly like
 * `loadConfig` output. Idempotent: folding an already-normalised list plus the
 * shorthand changes nothing.
 */
export function resolveRemoteHosts(rv: RemoteValidationConfig | undefined): RemoteValidationHost[] {
  if (!rv) return [];
  return (
    parseTailscaleHosts({
      "remoteValidation.tailscaleHost": rv.tailscaleHost,
      "remoteValidation.tailscaleHosts": rv.tailscaleHosts,
    }) ?? []
  );
}

/** SSH user for a host: per-host → `tailscaleUser` → "root". */
export function remoteHostUser(rv: RemoteValidationConfig, host: RemoteValidationHost): string {
  return host.user?.trim() || rv.tailscaleUser?.trim() || "root";
}

/** In-flight cap for a host: per-host → `maxConcurrent` → 1. */
export function remoteHostLimit(rv: RemoteValidationConfig, host: RemoteValidationHost): number {
  return positiveLimit(host.maxConcurrent, positiveLimit(rv.maxConcurrent, 1));
}

/** Every capability a host provides: its `os` plus its `labels`, lowercased. */
export function hostCapabilities(host: RemoteValidationHost): string[] {
  const caps = new Set<string>();
  if (host.os?.trim()) caps.add(host.os.trim().toLowerCase());
  for (const label of host.labels ?? []) if (label.trim()) caps.add(label.trim().toLowerCase());
  return [...caps];
}

/** Whether a host provides one capability (case-insensitive). */
export function hostProvides(host: RemoteValidationHost, capability: string): boolean {
  const want = capability.trim().toLowerCase();
  return !!want && hostCapabilities(host).includes(want);
}

/** Whether a host satisfies EVERY capability a job requires. */
export function hostSatisfies(
  host: RemoteValidationHost,
  capabilities: RemoteCapabilities,
): boolean {
  return capabilities.every((cap) => hostProvides(host, cap));
}

/** `macos + swift` / `(any host)` — for queue log lines and error detail. */
export function describeCapabilities(capabilities: RemoteCapabilities): string {
  return capabilities.length ? capabilities.join(" + ") : "any host";
}
