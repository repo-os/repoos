/**
 * Dev-target form helpers (#0749).
 *
 * The Settings control edits the `[[dev.targets]]` list. Validation is NOT
 * re-implemented here: the composed row is run through `parseDevTargets` — the
 * exact function `loadConfig` uses — so the form can never accept a row the
 * server would reject. The server re-validates the same way regardless.
 *
 * The wire form flattens the optional health check to `healthCheckUrl` /
 * `healthCheckFile` (the config PATCH route understands these), which keeps the
 * row a flat object the form can bind to without nested reactive surgery.
 */
import { DEV_TARGET_PASSTHROUGH_FIELDS, parseDevTargets } from "../../../core/dev-targets.js";

/** One target as the Settings form holds it (health check flattened). */
export interface DevTargetDraft {
  name: string;
  kind: "server" | "artifact" | "process";
  command: string;
  url: string;
  artifactPath: string;
  label: string;
  healthCheckUrl: string;
  healthCheckFile: string;
  /** Auto-pick a free port for `{port}` (#0802); default on. */
  autoPort: boolean;
  /** Fixed/preferred port as typed; validated by the parser ("" = unset). */
  port: string;
  /**
   * Names of `[[dev.services]]` rows booted before this target (#0843),
   * comma-separated in the form. The service DEFINITIONS stay TOML-only;
   * this list only references them by name.
   */
  services: string;
  /** TOML-only fields the form never edits; carried so a save keeps them. */
  cwd?: string;
  env?: Record<string, string>;
}

/** A target as `safeConfigForBrowser` serializes it (`dev.targets`). */
export interface DevTargetPayload {
  name: string;
  kind: "server" | "artifact" | "process";
  command: string;
  url?: string;
  artifactPath?: string;
  label?: string;
  healthCheck?: { url?: string; file?: string };
  /** Auto-pick off when explicitly `false` (#0802); omitted means on. */
  autoPort?: boolean;
  /** Preferred/fixed port for `{port}` (#0802). */
  port?: number;
  /** Companion `[[dev.services]]` names, booted before the target (#0843). */
  services?: string[];
  /** TOML-only; round-tripped untouched through the form (#0843). */
  cwd?: string;
  env?: Record<string, string>;
}

/** Copy the TOML-only passthrough fields (set ones only) between row shapes. */
function passthrough(src: { cwd?: string; env?: Record<string, string> }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of DEV_TARGET_PASSTHROUGH_FIELDS) {
    if (src[field] !== undefined) out[field] = src[field];
  }
  return out;
}

/** A blank draft for the "Add target" dialog. */
export function emptyDevTargetDraft(): DevTargetDraft {
  return {
    name: "",
    kind: "server",
    command: "",
    url: "",
    artifactPath: "",
    label: "",
    healthCheckUrl: "",
    healthCheckFile: "",
    autoPort: true,
    port: "",
    services: "",
  };
}

/** Turn a config payload row into a bindable draft. */
export function draftFromTarget(t: DevTargetPayload): DevTargetDraft {
  return {
    name: t.name,
    kind: t.kind,
    command: t.command,
    url: t.url ?? "",
    artifactPath: t.artifactPath ?? "",
    label: t.label ?? "",
    healthCheckUrl: t.healthCheck?.url ?? "",
    healthCheckFile: t.healthCheck?.file ?? "",
    autoPort: t.autoPort !== false,
    port: t.port !== undefined ? String(t.port) : "",
    services: (t.services ?? []).join(", "),
    ...passthrough(t),
  };
}

/** The draft's `services` text as a clean name list ("" = none). */
function servicesFromDraft(d: DevTargetDraft): string[] {
  return (d.services ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Serialize a draft back to the wire row the config PATCH accepts. */
export function targetFromDraft(d: DevTargetDraft): Record<string, unknown> {
  const services = servicesFromDraft(d);
  return {
    name: d.name,
    kind: d.kind,
    command: d.command,
    url: d.url,
    artifactPath: d.artifactPath,
    label: d.label,
    healthCheckUrl: d.healthCheckUrl,
    healthCheckFile: d.healthCheckFile,
    autoPort: d.autoPort,
    port: d.port.trim(),
    ...(services.length ? { services } : {}),
    ...passthrough(d),
  };
}

/**
 * The same draft as the shape `parseDevTargets` reads — the health check as the
 * dotted `healthCheck.url` / `healthCheck.file` keys the flat parser yields.
 * `targetFromDraft` flattens those for the config PATCH; the parser has to see
 * them dotted, so validation uses this instead and can never accept a row the
 * server would reject.
 */
function parseRowFromDraft(d: DevTargetDraft): Record<string, unknown> {
  const services = servicesFromDraft(d);
  const row: Record<string, unknown> = {
    name: d.name,
    kind: d.kind,
    command: d.command,
    url: d.url,
    artifactPath: d.artifactPath,
    label: d.label,
    autoPort: d.autoPort,
    ...passthrough(d),
  };
  if (d.port.trim()) row.port = d.port.trim();
  if (services.length) row.services = services;
  if (d.healthCheckUrl.trim()) row["healthCheck.url"] = d.healthCheckUrl.trim();
  if (d.healthCheckFile.trim()) row["healthCheck.file"] = d.healthCheckFile.trim();
  return row;
}

/**
 * Validate one composed row, returning the parser's first error message or
 * null. `duplicateName` is the name already used by another row, so editing
 * cannot collide with a sibling.
 */
export function devTargetError(
  draft: DevTargetDraft,
  options: { takenNames?: readonly string[]; selfName?: string } = {},
): string | null {
  const parsed = parseDevTargets({ "dev.targets": [parseRowFromDraft(draft)] });
  if (parsed.errors.length) return parsed.errors[0]!;
  const name = draft.name.trim();
  const taken = (options.takenNames ?? []).filter(
    (n) => n.toLowerCase() !== (options.selfName ?? "").toLowerCase(),
  );
  if (taken.some((n) => n.toLowerCase() === name.toLowerCase())) {
    return `[dev.targets] duplicate target name "${name}"`;
  }
  return null;
}

/**
 * Validate a whole list (order preserved), returning one message per problem.
 * Used before a save so an inline error never reaches the API as a rejected
 * save. Duplicate names across rows are reported here because `parseDevTargets`
 * only sees each row in isolation once the list is composed.
 */
export function devTargetsErrors(drafts: readonly DevTargetDraft[]): string[] {
  const errors: string[] = [];
  const names = new Set<string>();
  drafts.forEach((d, i) => {
    const err = devTargetError(d);
    if (err) errors.push(`Target ${i + 1}: ${err}`);
    const lower = d.name.trim().toLowerCase();
    if (lower && names.has(lower)) errors.push(`Target ${i + 1}: duplicate name "${d.name}"`);
    names.add(lower);
  });
  return errors;
}
