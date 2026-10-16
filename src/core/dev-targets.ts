/**
 * `[[dev.targets]]` parsing (#0747, extracted node-free in #0749).
 *
 * The user-declared runnable dev targets are parsed here rather than in
 * `core/config.ts` so the SAME validator runs in the browser bundle: the
 * Settings control composes a row and validates it through `parseDevTargets`,
 * exactly as the server re-validates the submitted list. `core/config.ts` has
 * node imports (`node:fs`, `node:os`, `node:path`) and cannot be pulled into the
 * Vite browser build, so this pure function lives on its own.
 *
 * Unlike `[preview]`, which resolves cleanly to "nothing" and drops bad rows, a
 * dev target is something the user asked the server to run, so an unusable row
 * is a loud validation error rather than a silent drop: a target with a missing
 * name/command/kind or a conflicting field is reported with a clear message.
 */
import type { DevTargetConfig } from "./types.js";

/**
 * Parse the flat TOML parser's leftover inline-table string for `healthCheck`
 * (`'{ url = "..." }'` — `parseFlatToml` has no inline-table support, so the
 * whole table stays a string). Returns the url/file fields, or null when the
 * string is not a `{ … }` table at all, so the caller can report the right
 * error. Quoted string values only, which is all a URL or a file path needs.
 */
function parseInlineHealthCheck(raw: string): { url?: string; file?: string } | null {
  const s = raw.trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return null;
  const out: { url?: string; file?: string } = {};
  for (const m of s.slice(1, -1).matchAll(/([A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const value = (m[2] ?? m[3] ?? "").trim();
    if (!value) continue;
    if (m[1] === "url") out.url = value;
    else if (m[1] === "file") out.file = value;
  }
  return out;
}

/**
 * The `{port}` token a dev target's templated fields may carry (#0802). Kept
 * as a literal here so this node-free module never imports the server.
 */
const DEV_PORT_TOKEN = "{port}";

/** Whether any of a target's fields use the `{port}` placeholder. */
function usesPortPlaceholder(t: DevTargetConfig): boolean {
  return (
    t.command.includes(DEV_PORT_TOKEN) ||
    (t.url?.includes(DEV_PORT_TOKEN) ?? false) ||
    (t.healthCheck?.url?.includes(DEV_PORT_TOKEN) ?? false)
  );
}

/**
 * Parse the `[[dev.targets]]` array of tables — the user-declared runnable dev
 * targets. Returns `{ targets, errors }`; `loadConfig` records the errors on
 * the config so the API/UI can surface them.
 */
export function parseDevTargets(parsed: Record<string, unknown>): {
  targets: DevTargetConfig[];
  errors: string[];
} {
  const raw = parsed["dev.targets"];
  const targets: DevTargetConfig[] = [];
  const errors: string[] = [];
  if (raw === undefined) return { targets, errors };
  if (!Array.isArray(raw)) {
    errors.push("[dev.targets] must be an array of tables");
    return { targets, errors };
  }
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      errors.push("[dev.targets] ignoring a non-table row");
      continue;
    }
    const r = entry as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) {
      errors.push("[dev.targets] a target is missing a name");
      continue;
    }
    if (seen.has(name)) {
      errors.push(`[dev.targets] duplicate target name "${name}"`);
      continue;
    }
    const kindRaw = typeof r.kind === "string" ? r.kind.trim() : "";
    if (kindRaw !== "server" && kindRaw !== "artifact" && kindRaw !== "process") {
      errors.push(
        `[dev.targets] ${name}: kind must be "server", "artifact" or "process"${kindRaw ? ` (got "${kindRaw}")` : ""}`,
      );
      continue;
    }
    const command = typeof r.command === "string" ? r.command.trim() : "";
    if (!command) {
      errors.push(`[dev.targets] ${name}: a command is required`);
      continue;
    }
    const target: DevTargetConfig = { name, kind: kindRaw, command };

    const url = typeof r.url === "string" ? r.url.trim() : "";
    const artifactPath = typeof r.artifactPath === "string" ? r.artifactPath.trim() : "";
    if (kindRaw === "server" && !url) {
      // A long-lived target with no URL is a `process`, not a `server` — point
      // the user at the right kind rather than leaving them stuck.
      errors.push(
        `[dev.targets] ${name}: a "server" target needs a url (use kind = "process" for a long-lived target with no URL)`,
      );
      continue;
    }
    if (kindRaw === "artifact" && !artifactPath) {
      errors.push(`[dev.targets] ${name}: an "artifact" target needs an artifactPath`);
      continue;
    }
    if (kindRaw === "server" && artifactPath) {
      errors.push(`[dev.targets] ${name}: a "server" target cannot have an artifactPath`);
      continue;
    }
    if (kindRaw === "artifact" && url) {
      errors.push(`[dev.targets] ${name}: an "artifact" target cannot have a url`);
      continue;
    }
    // A process has neither a URL nor a build artifact — it is healthy while it
    // is alive, which is its health check. Reject the conflicting fields so a
    // typo can never silently change what the target means.
    if (kindRaw === "process" && url) {
      errors.push(`[dev.targets] ${name}: a "process" target cannot have a url`);
      continue;
    }
    if (kindRaw === "process" && artifactPath) {
      errors.push(`[dev.targets] ${name}: a "process" target cannot have an artifactPath`);
      continue;
    }
    if (url) target.url = url;
    if (artifactPath) target.artifactPath = artifactPath;

    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (label) target.label = label;

    // #0802: per-target port handling. `autoPort` defaults to on; an explicit
    // `false` opts into a fixed `port`. The value is accepted for any kind — a
    // process's command may still use `{port}` — but only `server` targets get
    // the control in the Settings dialog.
    const autoPortRaw = r.autoPort;
    if (autoPortRaw !== undefined && typeof autoPortRaw !== "boolean") {
      errors.push(`[dev.targets] ${name}: autoPort must be true or false`);
      continue;
    }
    if (typeof autoPortRaw === "boolean") target.autoPort = autoPortRaw;
    const portRaw = r.port;
    if (portRaw !== undefined && portRaw !== "") {
      const port =
        typeof portRaw === "number"
          ? portRaw
          : typeof portRaw === "string"
            ? Number(portRaw.trim())
            : Number.NaN;
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push(`[dev.targets] ${name}: port must be a whole number between 1 and 65535`);
        continue;
      }
      target.port = port;
    }

    // healthCheck arrives in one of three shapes, all accepted here so the
    // documented `healthCheck = { url = "..." }` actually works:
    //   - an object, from a real TOML parser (or a test passing rows directly);
    //   - the raw inline-table string the flat line parser leaves behind
    //     (`'{ url = "..." }'`, since it has no inline-table support);
    //   - dotted keys `healthCheck.url` / `healthCheck.file`, which the flat
    //     parser keeps as literal keys on the row.
    const hcRaw = r.healthCheck;
    let hcUrl =
      typeof r["healthCheck.url"] === "string" ? (r["healthCheck.url"] as string).trim() : "";
    let hcFile =
      typeof r["healthCheck.file"] === "string" ? (r["healthCheck.file"] as string).trim() : "";
    const hasInlineKeys = r["healthCheck.url"] !== undefined || r["healthCheck.file"] !== undefined;
    if (hcRaw !== undefined) {
      if (typeof hcRaw === "string") {
        const parsedHc = parseInlineHealthCheck(hcRaw);
        if (!parsedHc) {
          errors.push(`[dev.targets] ${name}: healthCheck must be a table with url or file`);
          continue;
        }
        hcUrl = hcUrl || parsedHc.url || "";
        hcFile = hcFile || parsedHc.file || "";
      } else if (typeof hcRaw === "object" && hcRaw !== null && !Array.isArray(hcRaw)) {
        const hc = hcRaw as Record<string, unknown>;
        hcUrl = hcUrl || (typeof hc.url === "string" ? hc.url.trim() : "");
        hcFile = hcFile || (typeof hc.file === "string" ? hc.file.trim() : "");
      } else {
        errors.push(`[dev.targets] ${name}: healthCheck must be a table with url or file`);
        continue;
      }
    }
    if (hcUrl || hcFile) {
      target.healthCheck = {
        ...(hcUrl ? { url: hcUrl } : {}),
        ...(hcFile ? { file: hcFile } : {}),
      };
    } else if (hcRaw !== undefined || hasInlineKeys) {
      errors.push(`[dev.targets] ${name}: healthCheck needs a url or a file`);
      continue;
    }
    // A process is healthy while its process is alive; a readiness check would
    // only muddy that. Reject one rather than silently ignore it.
    if (kindRaw === "process" && target.healthCheck) {
      errors.push(
        `[dev.targets] ${name}: a "process" target cannot have a healthCheck (it is running while its process is alive)`,
      );
      continue;
    }
    // #0802: auto-pick off pins the target to a fixed port. A `{port}` target
    // with no port to pin it to would otherwise leak a literal `{port}` into
    // the shell — reject it rather than run something nonsensical.
    if (target.autoPort === false && usesPortPlaceholder(target) && target.port === undefined) {
      errors.push(
        `[dev.targets] ${name}: auto-pick is off but no port is set — set a port or turn auto-pick back on`,
      );
      continue;
    }
    seen.add(name);
    targets.push(target);
  }
  return { targets, errors };
}
