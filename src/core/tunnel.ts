/**
 * Cloudflare Tunnel publishing state — pure logic, zero I/O beyond the
 * `[tunnel]` section of `repoos.toml`.
 *
 * RepoOS's own config is the source of truth. `cloudflared`'s ingress YAML and
 * Cloudflare Access policies are DERIVED from this state on every mutation —
 * they are never hand-maintained separately.
 *
 * One machine runs ONE Cloudflare Tunnel with many hostname → local service
 * ingress routes (never one tunnel per app), and every app is protected by an
 * Access policy restricted to its explicit email allowlist.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** A single published app: hostname → local service, guarded by an email allowlist. */
export interface TunnelApp {
  /** Public hostname, e.g. `dashboard.repoos.org`. */
  hostname: string;
  /** Local origin, e.g. `http://localhost:3000`. */
  service: string;
  /** Email allowlist enforced by a Cloudflare Access policy in front of the app. Always empty when noAccess is true. */
  access: string[];
  /**
   * Created with `--no-access`: no Cloudflare Access policy exists for this
   * app at all — it's fully public at Cloudflare's edge, relying solely on
   * RepoOS's own native auth. Only ever set at creation time.
   */
  noAccess?: boolean;
}

/** The persisted `[tunnel]` state. Non-secret — never holds tokens or tunnel secrets. */
export interface TunnelConfig {
  provider: "cloudflare";
  /** UI opt-in only; disabling never deletes configuration or stops cloudflared. */
  enabled: boolean;
  /** Machine-local tunnel name (one tunnel per machine). */
  name: string;
  /** Base domain used to infer hostnames, e.g. `repoos.org`. */
  domain: string;
  /** The cloudflared tunnel UUID. */
  tunnelId: string;
  /** App name → app routing. */
  apps: Record<string, TunnelApp>;
}

export const DEFAULT_TUNNEL_NAME = "repoos-local";
/** Name of the single Access policy RepoOS manages per app. */
export const ACCESS_POLICY_NAME = "repoos allowlist";

export function emptyTunnelConfig(): TunnelConfig {
  return {
    provider: "cloudflare",
    enabled: false,
    name: DEFAULT_TUNNEL_NAME,
    domain: "",
    tunnelId: "",
    apps: {},
  };
}

// ── Minimal nested-TOML reader ──────────────────────────────────────────────
// Understands exactly the shape RepoOS writes: `[section]`, `[a.b.c]`
// subsections, and flat `key = value` lines with strings / numbers / booleans /
// inline arrays. Other constructs are ignored rather than mis-parsed, so a
// hand-edited file with unknown sections survives the round-trip untouched.

function parseTomlValue(s: string): unknown {
  if (s.startsWith("[") && s.endsWith("]")) {
    return s
      .slice(1, -1)
      .split(",")
      .map((x) =>
        x
          .trim()
          .replace(/^["']|["']$/g, "")
          .replace(/\\"/g, '"'),
      )
      .filter(Boolean);
  }
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s === "true") return true;
  if (s === "false") return false;
  return s.replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
}

function parseToml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let section: string[] = [];
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const arrSec = line.match(/^\[\[([^\]]+)\]\]$/);
    if (arrSec) {
      section = [];
      continue;
    }
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1].split(".");
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const path = [...section, kv[1]];
    let node = out;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      const cur = (node[key] ?? {}) as Record<string, unknown>;
      if (typeof cur !== "object" || cur === null) break;
      node[key] = cur;
      node = cur;
    }
    node[path[path.length - 1]] = parseTomlValue(kv[2].trim());
  }
  return out;
}

/** Parse the `[tunnel]` block out of a full repoos.toml document. */
export function parseTunnelSection(text: string): TunnelConfig {
  const root = parseToml(text);
  const t = (root.tunnel ?? {}) as Record<string, unknown>;
  const rawApps = (t.apps ?? {}) as Record<string, Record<string, unknown>>;
  const apps: Record<string, TunnelApp> = {};
  for (const [name, a] of Object.entries(rawApps)) {
    if (typeof a !== "object" || a === null) continue;
    apps[name] = {
      hostname: String(a.hostname ?? ""),
      service: String(a.service ?? ""),
      access: Array.isArray(a.access) ? (a.access as unknown[]).map(String) : [],
      ...(a.noAccess === true ? { noAccess: true } : {}),
    };
  }
  const cfg = emptyTunnelConfig();
  if (typeof t.enabled === "boolean") cfg.enabled = t.enabled;
  if (typeof t.name === "string" && t.name) cfg.name = t.name;
  if (typeof t.domain === "string") cfg.domain = t.domain;
  if (typeof t.tunnel_id === "string") cfg.tunnelId = t.tunnel_id;
  cfg.apps = apps;
  return cfg;
}

function tomlQuote(s: string): string {
  return JSON.stringify(s);
}

/** Serialize a TunnelConfig back into a `[tunnel]` TOML block. */
export function serializeTunnelSection(cfg: TunnelConfig): string {
  const lines: string[] = [];
  lines.push("[tunnel]");
  lines.push(`provider = ${tomlQuote("cloudflare")}`);
  lines.push(`enabled = ${cfg.enabled ? "true" : "false"}`);
  lines.push(`name = ${tomlQuote(cfg.name)}`);
  if (cfg.domain) lines.push(`domain = ${tomlQuote(cfg.domain)}`);
  if (cfg.tunnelId) lines.push(`tunnel_id = ${tomlQuote(cfg.tunnelId)}`);
  for (const name of Object.keys(cfg.apps).sort()) {
    const app = cfg.apps[name];
    lines.push("");
    lines.push(`[tunnel.apps.${name}]`);
    lines.push(`hostname = ${tomlQuote(app.hostname)}`);
    lines.push(`service = ${tomlQuote(app.service)}`);
    lines.push(`access = [${app.access.map(tomlQuote).join(", ")}]`);
    if (app.noAccess) lines.push(`noAccess = true`);
  }
  return lines.join("\n");
}

/**
 * Replace the `[tunnel]` block (including its `[tunnel.apps.*]` subsections)
 * in a full repoos.toml document, preserving every other line verbatim.
 * Appends the block when no `[tunnel]` section exists yet.
 */
export function upsertTunnelSection(text: string, cfg: TunnelConfig): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const isTunnelHeader = (s: string) =>
    s === "[tunnel]" || s.startsWith("[tunnel.") || s.startsWith("[tunnel[");

  const kept: string[] = [];
  let i = 0;
  let replaced = false;
  while (i < lines.length) {
    const stripped = lines[i].replace(/#.*$/, "").trim();
    if (!replaced && isTunnelHeader(stripped)) {
      i++;
      while (i < lines.length) {
        const s = lines[i].replace(/#.*$/, "").trim();
        const isHeader = /^\[\[?[^\]]+\]\]?$/.test(s);
        if (isHeader && !isTunnelHeader(s)) break;
        i++;
      }
      if (kept.length && kept[kept.length - 1].trim() !== "") kept.push("");
      kept.push(serializeTunnelSection(cfg));
      if (i < lines.length && lines[i].trim() !== "") kept.push("");
      replaced = true;
      continue;
    }
    kept.push(lines[i]);
    i++;
  }
  if (!replaced) {
    if (kept.length && kept[kept.length - 1].trim() !== "") kept.push("");
    kept.push(serializeTunnelSection(cfg));
  }
  return (
    kept
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

/** Read the `[tunnel]` state out of this repo's repoos.toml. */
export function readTunnelConfig(root: string): TunnelConfig {
  const path = join(root, "repoos.toml");
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  return parseTunnelSection(text);
}

/** Persist the `[tunnel]` state to this repo's repoos.toml (line-preserving). */
export function writeTunnelConfig(root: string, cfg: TunnelConfig): void {
  const path = join(root, "repoos.toml");
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  writeFileSync(path, upsertTunnelSection(text, cfg), "utf8");
}

/** Infer `<name>.<base-domain>` when `--domain` is omitted. */
export function inferHostname(name: string, domain: string): string {
  return `${name}.${domain}`;
}

/**
 * A hostname "deeper than one label under the base domain" (e.g.
 * `dashboard.app.repoos.org` under `repoos.org`) routes fine, but the zone's
 * SSL/certificate coverage must include it. Returns a warning or null.
 */
export function hostnameWarning(hostname: string, baseDomain: string): string | null {
  if (!baseDomain) return null;
  const h = hostname.split(".").filter(Boolean);
  const d = baseDomain.split(".").filter(Boolean);
  if (h.length > d.length + 1) {
    return (
      `${hostname} is deeper than one label under ${baseDomain} — make sure your ` +
      `Cloudflare SSL/TLS certificate configuration covers it (the CNAME only routes DNS).`
    );
  }
  return null;
}

/** App names become `[tunnel.apps.<name>]` TOML keys — keep them filesystem-safe. */
export function isValidAppName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name);
}

/** Basic email shape check for `--allow` / `allow` / `deny` args. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Split a comma-separated email list, trim, dedupe, preserve order. */
export function parseEmailList(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const email = part.trim();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** Add an email to an allowlist (no-ops when already present). */
export function addEmail(access: string[], email: string): string[] {
  if (access.includes(email)) return access;
  return [...access, email];
}

/** Remove an email from an allowlist (no-ops when absent). */
export function removeEmail(access: string[], email: string): string[] {
  return access.filter((e) => e !== email);
}

/**
 * The `cloudflared` ingress config derived from RepoOS state: one rule per
 * configured app plus a trailing `http_status:404` catch-all. cloudflared
 * requires the catch-all as the final rule.
 */
export function renderCloudflaredConfig(cfg: TunnelConfig, credentialsFile: string): string {
  const lines: string[] = [];
  lines.push("# Generated by repoos tunnel — repoos.toml [tunnel] is the source of truth.");
  lines.push(`tunnel: ${cfg.tunnelId}`);
  lines.push(`credentials-file: ${credentialsFile}`);
  lines.push("");
  lines.push("ingress:");
  const apps = Object.values(cfg.apps).sort((a, b) => a.hostname.localeCompare(b.hostname));
  for (const app of apps) {
    lines.push(`  - hostname: ${app.hostname}`);
    lines.push(`    service: ${app.service}`);
  }
  lines.push("  - service: http_status:404");
  return lines.join("\n") + "\n";
}

/**
 * The Access application payload for a published hostname. RepoOS only manages
 * self-hosted (origin-proxied) applications for this MVP.
 */
export function buildAccessAppBody(hostname: string): Record<string, unknown> {
  return {
    name: hostname,
    domain: hostname,
    type: "self_hosted",
    session_duration: "24h",
    auto_redirect_to_identity: true,
  };
}

/**
 * The single Access policy body for an app's allowlist: an `allow` policy whose
 * Include list is exactly the configured emails (OR'd). An empty list matches
 * nothing → everyone is denied, which is the safe default — there is no way to
 * end up with a publicly reachable app through the normal `create` flow.
 */
export function buildAccessPolicyBody(emails: string[]): Record<string, unknown> {
  return {
    name: ACCESS_POLICY_NAME,
    decision: "allow",
    precedence: 10000,
    session_duration: "24h",
    include: emails.map((email) => ({ email: { email } })),
    exclude: [],
    require: [],
  };
}
