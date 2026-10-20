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
import type { DevServiceConfig, DevTargetConfig } from "./types.js";
import { parseTomlInlineStringTable } from "./toml-line.js";

/**
 * Parse the flat TOML parser's leftover inline-table string for `healthCheck`
 * (`'{ url = "..." }'` — `parseFlatToml` has no inline-table support, so the
 * whole table stays a string). Returns the url/file fields, or null when the
 * string is not a `{ … }` table at all, so the caller can report the right
 * error. Quoted string values only, which is all a URL or a file path needs.
 */
function parseInlineHealthCheck(raw: string): { url?: string; file?: string } | null {
  const parsed = parseTomlInlineStringTable(raw);
  if (!parsed?.ok) return null;
  const out: { url?: string; file?: string } = {};
  const url = parsed.value.url?.trim();
  const file = parsed.value.file?.trim();
  if (url) out.url = url;
  if (file) out.file = file;
  return out;
}

/**
 * The `{port}` token a dev target's templated fields may carry (#0802). Kept
 * as a literal here so this node-free module never imports the server.
 */
const DEV_PORT_TOKEN = "{port}";

/** Read a flat string list (the flat TOML parser's shape for a string array). */
function stringList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  const items = Array.isArray(v) ? v : [v];
  return items.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

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
    const cwd = typeof r.cwd === "string" ? r.cwd.trim() : "";
    if (cwd) target.cwd = cwd;
    if (r.env !== undefined) {
      let env: Record<string, string> | undefined;
      if (typeof r.env === "string") {
        const parsedEnv = parseTomlInlineStringTable(r.env);
        if (!parsedEnv?.ok) {
          errors.push(`[dev.targets] ${name}: env must be a table of string values`);
          continue;
        }
        env = parsedEnv.value;
      } else if (typeof r.env === "object" && r.env !== null && !Array.isArray(r.env)) {
        env = Object.fromEntries(
          Object.entries(r.env as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        );
      }
      if (!env) {
        errors.push(`[dev.targets] ${name}: env must be a table of string values`);
        continue;
      }
      target.env = env;
    }
    const targetDottedEnv = Object.fromEntries(
      Object.entries(r)
        .filter(([key, value]) => key.startsWith("env.") && typeof value === "string")
        .map(([key, value]) => [key.slice("env.".length).trim(), (value as string).trim()])
        .filter(([key]) => Boolean(key)),
    );
    if (Object.keys(targetDottedEnv).length)
      target.env = { ...(target.env ?? {}), ...targetDottedEnv };

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

    // #0843: the companion services this target boots before its own command,
    // by name. Names are cross-validated against `[[dev.services]]` by
    // `devTargetServiceErrors` (the loader runs it for both lists together).
    const targetServices = stringList(r.services);
    if (targetServices.length) target.services = targetServices;

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

/**
 * Turn a service name into a placeholder/env token: lowercase, runs of
 * non-alphanumerics collapsed to `_`, edges trimmed. Shared with the preview
 * supervisor so `[[preview.services]]` and `[[dev.services]]` substitute
 * identically (#0681, #0843).
 */
export function servicePortToken(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Validate one service's port field; shared with the target parser's shape. */
function parsePortField(
  raw: unknown,
  message: (problem: string) => string,
): { port?: number; error?: string } {
  if (raw === undefined || raw === "") return {};
  const port =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: message("port must be a whole number between 1 and 65535") };
  }
  return { port };
}

/**
 * Parse the `[[dev.services]]` array of tables — companion processes a dev
 * target boots before its main command, each on its own port (#0843). Same
 * contract as `parseDevTargets`: bad rows are loud validation errors, never
 * silent drops, so a typo is visible on the Dev page instead of a half-booted
 * stack.
 */
export function parseDevServices(parsed: Record<string, unknown>): {
  services: DevServiceConfig[];
  errors: string[];
} {
  const raw = parsed["dev.services"];
  const services: DevServiceConfig[] = [];
  const errors: string[] = [];
  if (raw === undefined) return { services, errors };
  if (!Array.isArray(raw)) {
    errors.push("[dev.services] must be an array of tables");
    return { services, errors };
  }
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      errors.push("[dev.services] ignoring a non-table row");
      continue;
    }
    const r = entry as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) {
      errors.push("[dev.services] a service is missing a name");
      continue;
    }
    if (seen.has(name)) {
      errors.push(`[dev.services] duplicate service name "${name}"`);
      continue;
    }
    const command = typeof r.command === "string" ? r.command.trim() : "";
    if (!command) {
      errors.push(`[dev.services] ${name}: a command is required`);
      continue;
    }
    const service: DevServiceConfig = { name, command };

    const cwd = typeof r.cwd === "string" ? r.cwd.trim() : "";
    if (cwd) service.cwd = cwd;
    const dependsOn = stringList(r.dependsOn ?? r.depends_on);
    if (dependsOn.length) service.dependsOn = dependsOn;

    // Same per-service port handling as a target's (#0802): auto-pick defaults
    // on (the configured `port` is only a preference); auto-pick off pins it.
    const autoPortRaw = r.autoPort;
    if (autoPortRaw !== undefined && typeof autoPortRaw !== "boolean") {
      errors.push(`[dev.services] ${name}: autoPort must be true or false`);
      continue;
    }
    if (typeof autoPortRaw === "boolean") service.autoPort = autoPortRaw;
    const port = parsePortField(r.port, (problem) => `[dev.services] ${name}: ${problem}`);
    if (port.error) {
      errors.push(port.error);
      continue;
    }
    if (port.port !== undefined) service.port = port.port;
    // #0843 review round 1: a pinned service needs a port to pin — reject it
    // at config time rather than only when Start is clicked.
    if (service.autoPort === false && service.port === undefined) {
      errors.push(
        `[dev.services] ${name}: auto-pick is off but no port is set — set a port or turn auto-pick back on`,
      );
      continue;
    }

    // healthCheck arrives in the same three shapes a target's does (an object,
    // the raw inline-table string, or dotted keys) — one shared reader keeps
    // the two parsers honest.
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
          errors.push(`[dev.services] ${name}: healthCheck must be a table with url or file`);
          continue;
        }
        hcUrl = hcUrl || parsedHc.url || "";
        hcFile = hcFile || parsedHc.file || "";
      } else if (typeof hcRaw === "object" && hcRaw !== null && !Array.isArray(hcRaw)) {
        const hc = hcRaw as Record<string, unknown>;
        hcUrl = hcUrl || (typeof hc.url === "string" ? hc.url.trim() : "");
        hcFile = hcFile || (typeof hc.file === "string" ? hc.file.trim() : "");
      } else {
        errors.push(`[dev.services] ${name}: healthCheck must be a table with url or file`);
        continue;
      }
    }
    if (hcUrl || hcFile) {
      service.healthCheck = {
        ...(hcUrl ? { url: hcUrl } : {}),
        ...(hcFile ? { file: hcFile } : {}),
      };
    } else if (hcRaw !== undefined || hasInlineKeys) {
      errors.push(`[dev.services] ${name}: healthCheck needs a url or a file`);
      continue;
    }

    // env arrives in the same three shapes: an object (a real parser or a
    // test), the inline-table string the flat parser leaves, or dotted
    // `env.KEY` keys on the row.
    const envRaw = r.env;
    let env: Record<string, string> | undefined;
    if (envRaw !== undefined) {
      if (typeof envRaw === "string") {
        const parsedEnv = parseTomlInlineStringTable(envRaw);
        if (!parsedEnv?.ok) {
          if (parsedEnv && !parsedEnv.ok) {
            errors.push(`[dev.services] ${name}: env ${parsedEnv.error}`);
            continue;
          }
          errors.push(
            `[dev.services] ${name}: env must be a table with at least one KEY = "value"`,
          );
          continue;
        }
        if (!Object.keys(parsedEnv.value).length) {
          errors.push(
            `[dev.services] ${name}: env must be a table with at least one KEY = "value"`,
          );
          continue;
        }
        env = parsedEnv.value;
      } else if (typeof envRaw === "object" && envRaw !== null && !Array.isArray(envRaw)) {
        const e = envRaw as Record<string, unknown>;
        for (const [k, v] of Object.entries(e)) {
          if (typeof v !== "string") continue;
          env = { ...(env ?? {}), [k]: v };
        }
        if (!env || !Object.keys(env).length) {
          errors.push(
            `[dev.services] ${name}: env must be a table with at least one KEY = "value"`,
          );
          continue;
        }
      } else {
        errors.push(`[dev.services] ${name}: env must be a table with at least one KEY = "value"`);
        continue;
      }
    }
    const dottedEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      if (!k.startsWith("env.")) continue;
      const key = k.slice("env.".length).trim();
      if (key && typeof v === "string") dottedEnv[key] = v.trim();
    }
    if (Object.keys(dottedEnv).length) env = { ...(env ?? {}), ...dottedEnv };
    if (env) service.env = env;

    seen.add(name);
    services.push(service);
  }
  return { services, errors };
}

/**
 * Cross-validate a target's `services` name list against the declared
 * `[[dev.services]]` rows (#0843): an unknown name or a repeated entry is a
 * config error, never a silently partial boot. Returns one message per
 * problem; empty when everything resolves.
 */
export function devTargetServiceErrors(
  targets: readonly DevTargetConfig[],
  services: readonly DevServiceConfig[] | undefined,
): string[] {
  const errors: string[] = [];
  const known = new Set((services ?? []).map((s) => s.name));
  const serviceByName = new Map((services ?? []).map((service) => [service.name, service]));
  const serviceNamesByToken = new Map<string, string[]>();
  for (const service of services ?? []) {
    const token = servicePortToken(service.name);
    serviceNamesByToken.set(token, [...(serviceNamesByToken.get(token) ?? []), service.name]);
    for (const dependency of service.dependsOn ?? []) {
      if (!known.has(dependency)) {
        errors.push(
          `[dev.services] ${service.name}: dependsOn references unknown service "${dependency}"`,
        );
      }
    }
  }

  // Detect actual cycles in the declared dependency graph, independently of
  // TOML row order or the target's service list order.
  const visited = new Set<string>();
  const visiting: string[] = [];
  const reportedCycles = new Set<string>();
  const visit = (name: string): void => {
    const cycleStart = visiting.indexOf(name);
    if (cycleStart >= 0) {
      const cycle = [...visiting.slice(cycleStart), name];
      const key = [...new Set(cycle.slice(0, -1))].sort().join("|");
      if (!reportedCycles.has(key)) {
        reportedCycles.add(key);
        errors.push(`[dev.services] dependency cycle: ${cycle.join(" -> ")}`);
      }
      return;
    }
    if (visited.has(name)) return;
    const service = serviceByName.get(name);
    if (!service) return;
    visiting.push(name);
    for (const dependency of service.dependsOn ?? []) if (known.has(dependency)) visit(dependency);
    visiting.pop();
    visited.add(name);
  };
  for (const service of services ?? []) visit(service.name);

  const refsIn = (text: string | undefined): string[] => {
    if (!text) return [];
    return [...text.matchAll(/\{([a-zA-Z0-9_-]+)\.(?:port|url)\}/g)].map((match) => match[1]!);
  };
  const envRefs = (env: Record<string, string> | undefined): string[] =>
    Object.values(env ?? {}).flatMap((value) => refsIn(value));
  for (const t of targets) {
    const listed = new Set<string>();
    const tokenNames = new Map<string, string>();
    for (const name of t.services ?? []) {
      if (!known.has(name)) {
        errors.push(
          `[dev.targets] ${t.name}: references unknown service "${name}" — declare it as a [[dev.services]] block in repoos.toml`,
        );
        continue;
      }
      if (listed.has(name)) {
        errors.push(`[dev.targets] ${t.name}: service "${name}" is listed more than once`);
        continue;
      }
      listed.add(name);
      // Two distinct names can normalize to the same placeholder token
      // (`api-v1` / `api_v1`); the documented `{<name>.port}` reference would
      // then be ambiguous, so reject it as a config error rather than silently
      // disambiguating it with an undocumented suffix (#0843 review).
      const token = servicePortToken(name) || "service";
      const clash = tokenNames.get(token);
      if (clash) {
        errors.push(
          `[dev.targets] ${t.name}: services "${clash}" and "${name}" both map to the placeholder "{${token}.port}" — rename one so each has a distinct token`,
        );
        continue;
      }
      tokenNames.set(token, name);
    }

    // Dependencies are implicitly part of the started service set, so refs in
    // their fields can resolve. A self-reference is valid and resolves to the
    // service's own allocated port.
    const available = new Set<string>();
    const include = (name: string): void => {
      if (available.has(name)) return;
      const service = serviceByName.get(name);
      if (!service) return;
      available.add(name);
      for (const dependency of service.dependsOn ?? []) include(dependency);
    };
    for (const name of listed) include(name);
    const validateRefs = (owner: string, refs: string[], allowSelf?: string): void => {
      for (const token of refs) {
        const matches = serviceNamesByToken.get(servicePortToken(token)) ?? [];
        const valid = matches.find((name) => name === allowSelf || available.has(name));
        if (valid) continue;
        const knownService = matches[0];
        errors.push(
          knownService
            ? `[${owner}]: references service "${knownService}" outside the target's services/dependencies`
            : `[${owner}]: references unknown service placeholder "${token}"`,
        );
      }
    };
    const targetRefs = [
      ...[t.command, t.cwd, t.url, t.healthCheck?.url].flatMap(refsIn),
      ...envRefs(t.env),
    ];
    validateRefs(`dev.targets ${t.name}`, targetRefs);
    for (const name of available) {
      const service = serviceByName.get(name)!;
      validateRefs(
        `dev.services ${name}`,
        [
          ...[service.command, service.cwd, service.healthCheck?.url].flatMap(refsIn),
          ...envRefs(service.env),
        ],
        name,
      );
    }
  }
  return errors;
}

/** The dev services' placeholder host — the same one the preview supervisor uses. */
const SERVICE_URL_HOST = "127.0.0.1";

/**
 * Expand a dev-target template (#0843): `{port}` for the target's OWN port,
 * plus `{<token>.port}` / `{<token>.url}` for every companion service — the
 * same expansion rule the preview supervisor applies (#0681). Left untouched:
 * the own-port token when no port was resolved (a target that never started
 * keeps the value it declared), and any service token without a reserved port.
 */
export function expandServiceRefs(
  template: string,
  port: number | undefined,
  tokens: Record<string, number>,
): string {
  let out = port !== undefined ? template.replaceAll("{port}", String(port)) : template;
  for (const [token, servicePort] of Object.entries(tokens)) {
    out = out
      .replaceAll(`{${token}.port}`, String(servicePort))
      .replaceAll(`{${token}.url}`, `http://${SERVICE_URL_HOST}:${servicePort}`);
  }
  return out;
}
