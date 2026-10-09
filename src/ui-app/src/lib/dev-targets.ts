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
import { parseDevTargets } from "../../../core/dev-targets.js";

/** One target as the Settings form holds it (health check flattened). */
export interface DevTargetDraft {
  name: string;
  kind: "server" | "artifact";
  command: string;
  url: string;
  artifactPath: string;
  label: string;
  healthCheckUrl: string;
  healthCheckFile: string;
}

/** A target as `safeConfigForBrowser` serializes it (`dev.targets`). */
export interface DevTargetPayload {
  name: string;
  kind: "server" | "artifact";
  command: string;
  url?: string;
  artifactPath?: string;
  label?: string;
  healthCheck?: { url?: string; file?: string };
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
  };
}

/** Serialize a draft back to the wire row the config PATCH accepts. */
export function targetFromDraft(d: DevTargetDraft): Record<string, unknown> {
  return {
    name: d.name,
    kind: d.kind,
    command: d.command,
    url: d.url,
    artifactPath: d.artifactPath,
    label: d.label,
    healthCheckUrl: d.healthCheckUrl,
    healthCheckFile: d.healthCheckFile,
  };
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
  const parsed = parseDevTargets({ "dev.targets": [targetFromDraft(draft)] });
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
