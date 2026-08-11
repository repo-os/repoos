/**
 * `repoos tunnel ...` — Cloudflare Tunnel + Zero Trust publishing.
 *
 * RepoOS orchestrates `cloudflared` (it never reimplements the tunnel
 * protocol) and reconciles Cloudflare Access policies from RepoOS's own
 * `[tunnel]` state in repoos.toml. One machine runs one tunnel with many
 * hostname → local service ingress routes; every published app is protected by
 * an Access policy restricted to its email allowlist.
 *
 * No Cloudflare credentials or tunnel secrets are ever written to the repo —
 * the API token lives in the OS keychain / secret storage (or
 * `CLOUDFLARE_API_TOKEN`), and the tunnel credential file stays in
 * `~/.cloudflared/` exactly as cloudflared already does.
 */
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { c } from "../cli/colors.js";
import { loadConfig } from "../core/config.js";
import { resolveBinary } from "../core/detect.js";
import {
  ACCESS_POLICY_NAME,
  DEFAULT_TUNNEL_NAME,
  addEmail,
  buildAccessAppBody,
  buildAccessPolicyBody,
  hostnameWarning,
  inferHostname,
  isValidAppName,
  isValidEmail,
  parseEmailList,
  readTunnelConfig,
  removeEmail,
  renderCloudflaredConfig,
  writeTunnelConfig,
  type TunnelConfig,
} from "../core/tunnel.js";

const CF_API = "https://api.cloudflare.com/client/v4";

// ── Small failure helper ─────────────────────────────────────────────────────
interface TunnelError extends Error {
  repoosTunnel?: boolean;
}

function fail(msg: string): never {
  console.error(c.red("  " + msg));
  const err = new Error(msg) as TunnelError;
  err.repoosTunnel = true;
  throw err;
}

// ── Arg parsing ──────────────────────────────────────────────────────────────
interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
      } else {
        flags.set(a.slice(2), args[++i]);
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

// ── Interactive input ────────────────────────────────────────────────────────
async function prompt(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(query)).trim();
  } finally {
    rl.close();
  }
}

async function confirm(query: string, defaultYes = true): Promise<boolean> {
  const suffix = defaultYes ? " [Y/n]" : " [y/N]";
  const answer = (await prompt(query + suffix)).toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

/** Run a command attached to the user's terminal (foreground, interactive). */
function runInteractive(bin: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

// ── cloudflared discovery ────────────────────────────────────────────────────
function cloudflaredHomeDir(): string {
  return join(homedir(), ".cloudflared");
}

function repoosConfigDir(): string {
  return join(homedir(), ".config", "repoos");
}

function cloudflaredBin(): string {
  const bin = resolveBinary("cloudflared", process.env.PATH ?? "");
  if (bin) return bin;
  return fail(
    "cloudflared is not installed or not on PATH.\n" +
      "    Install it (`brew install cloudflared` on macOS, or see\n" +
      "    https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)\n" +
      "    then run `repoos tunnel setup`.",
  );
}

interface TunnelRow {
  id: string;
  name: string;
  accountTag?: string;
}

/** `cloudflared tunnel list`, tolerant of JSON and legacy text output. */
function cloudflaredList(bin: string): TunnelRow[] {
  try {
    const out = execFileSync(bin, ["tunnel", "list", "--output", "json"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    const data = JSON.parse(out);
    if (Array.isArray(data)) {
      return data.map((t) => ({
        id: String(t.id ?? ""),
        name: String(t.name ?? ""),
        accountTag: t.account_tag ? String(t.account_tag) : undefined,
      }));
    }
  } catch {
    // fall through to legacy text parsing
  }
  try {
    const out = execFileSync(bin, ["tunnel", "list"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    const rows: TunnelRow[] = [];
    for (const line of out.split("\n")) {
      const m = line.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\s+(\S+)/);
      if (m) rows.push({ id: m[1], name: m[2] });
    }
    return rows;
  } catch {
    return [];
  }
}

function tunnelCredentialsPath(tunnelId: string): string {
  return join(cloudflaredHomeDir(), `${tunnelId}.json`);
}

/**
 * Regenerate cloudflared's ingress YAML from RepoOS state into a RepoOS-owned
 * location (`~/.config/repoos/cloudflared.yml`) used by `repoos tunnel start`.
 */
function writeDerivedConfig(tunnel: TunnelConfig): string {
  const path = join(repoosConfigDir(), "cloudflared.yml");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderCloudflaredConfig(tunnel, tunnelCredentialsPath(tunnel.tunnelId)), {
    encoding: "utf8",
    mode: 0o600,
  });
  return path;
}

/**
 * Write the derived config to `~/.cloudflared/config.yml` — where
 * `cloudflared service install` expects it. An existing hand-maintained file
 * that isn't RepoOS-generated is backed up once before being replaced.
 */
function writeUserCloudflaredConfig(tunnel: TunnelConfig): string {
  const dir = cloudflaredHomeDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "config.yml");
  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8");
    if (!existing.includes("repoos.toml [tunnel]")) {
      const backup = `${path}.repoos-backup`;
      if (!existsSync(backup)) renameSync(path, backup);
    }
  }
  writeFileSync(path, renderCloudflaredConfig(tunnel, tunnelCredentialsPath(tunnel.tunnelId)), {
    encoding: "utf8",
    mode: 0o600,
  });
  return path;
}

async function installCloudflared(): Promise<boolean> {
  if (process.platform === "darwin") {
    console.log(c.dim("  · installing cloudflared via Homebrew …"));
    try {
      return (await runInteractive("brew", ["install", "cloudflared"])) === 0;
    } catch {
      return false;
    }
  }
  if (process.platform === "linux") {
    const arch = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "amd64" : null;
    if (!arch) return false;
    const dir = join(homedir(), ".local", "bin");
    mkdirSync(dir, { recursive: true });
    const target = join(dir, "cloudflared");
    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
    console.log(c.dim("  · downloading cloudflared (GitHub releases) …"));
    try {
      execFileSync("curl", ["-fsSL", url, "-o", target], { stdio: "inherit", timeout: 120_000 });
      chmodSync(target, 0o755);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// ── Cloudflare API token (keychain / secret storage — never in the repo) ────
function tokenStoreCmds(): { get: string[]; set: (token: string) => string[] } | null {
  if (process.platform === "darwin") {
    return {
      get: ["security", "find-generic-password", "-a", "repoos", "-s", "repoos:cloudflare-token", "-w"],
      set: (token) =>
        ["security", "add-generic-password", "-U", "-a", "repoos", "-s", "repoos:cloudflare-token", "-w", token],
    };
  }
  if (process.platform === "linux") {
    return {
      get: ["secret-tool", "lookup", "service", "repoos:cloudflare-token", "user", "repoos"],
      set: () =>
        ["secret-tool", "store", "--label=RepoOS Cloudflare API token", "service", "repoos:cloudflare-token", "user", "repoos"],
    };
  }
  return null;
}

function getStoredToken(): string | null {
  const cmds = tokenStoreCmds();
  if (!cmds) return null;
  try {
    const out = execFileSync(cmds.get[0], cmds.get.slice(1), { encoding: "utf8", timeout: 10_000 });
    return out.trim() || null;
  } catch {
    return null;
  }
}

function storeToken(token: string): boolean {
  const cmds = tokenStoreCmds();
  if (!cmds) return false;
  try {
    execFileSync(cmds.set(token)[0], cmds.set(token).slice(1), { input: token, encoding: "utf8", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function resolveApiToken(): Promise<string | null> {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const stored = getStoredToken();
  if (stored) return stored;
  const entered = await prompt(
    "  Cloudflare API token (needs `Access: Apps and Policies` + `DNS` + `Cloudflare Tunnel` edit permissions, blank to skip): ",
  );
  if (entered) storeToken(entered);
  return entered || null;
}

// ── Cloudflare API ───────────────────────────────────────────────────────────
async function cfFetch(
  token: string,
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(CF_API + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new Error("Cloudflare API unreachable: " + (e as Error).message);
  }
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    json = { success: false, errors: [{ message: `HTTP ${res.status}: ${text.slice(0, 160)}` }] };
  }
  if (json.success !== true) {
    const errors = Array.isArray(json.errors) ? json.errors : [];
    const detail = errors
      .map((e: { message?: string }) => e.message ?? "")
      .filter(Boolean)
      .join("; ");
    throw new Error(`Cloudflare API error (${res.status}): ${detail || "request failed"}`);
  }
  return json;
}

async function resolveAccountId(token: string, bin: string | null): Promise<string | null> {
  if (bin) {
    for (const row of cloudflaredList(bin)) {
      if (row.accountTag) return row.accountTag;
    }
  }
  try {
    const json = await cfFetch(token, "/accounts?per_page=50", "GET");
    const result = json.result;
    if (Array.isArray(result) && result.length) {
      return String((result[0] as { id?: string }).id ?? "");
    }
  } catch {
    // token may not have account:read — caller can prompt for the account id
  }
  return null;
}

async function findAccessApp(token: string, accountId: string, hostname: string) {
  const json = await cfFetch(token, `/accounts/${accountId}/access/apps?per_page=100`, "GET");
  const apps = Array.isArray(json.result) ? (json.result as { id?: string; domain?: string }[]) : [];
  return apps.find((a) => a.domain === hostname) ?? null;
}

async function findAccessPolicy(token: string, accountId: string, appId: string) {
  const json = await cfFetch(token, `/accounts/${accountId}/access/apps/${appId}/policies?per_page=100`, "GET");
  const policies = Array.isArray(json.result)
    ? (json.result as { id?: string; name?: string }[])
    : [];
  return policies.find((p) => p.name === ACCESS_POLICY_NAME) ?? null;
}

/**
 * Reconcile the Cloudflare Access application + allowlist policy for a
 * hostname: create or reuse the self-hosted app, then create or update the
 * single "repoos allowlist" policy with exactly the configured emails.
 */
async function reconcileAccessPolicy(
  token: string,
  accountId: string,
  hostname: string,
  emails: string[],
): Promise<void> {
  let app = await findAccessApp(token, accountId, hostname);
  if (!app) {
    const created = await cfFetch(token, `/accounts/${accountId}/access/apps`, "POST", buildAccessAppBody(hostname));
    app = created.result as { id?: string; domain?: string };
  }
  const appId = String(app.id ?? "");
  if (!appId) throw new Error("created Access app has no id");
  const body = buildAccessPolicyBody(emails);
  const existing = await findAccessPolicy(token, accountId, appId);
  if (existing && existing.id) {
    await cfFetch(token, `/accounts/${accountId}/access/apps/${appId}/policies/${existing.id}`, "PUT", body);
  } else {
    await cfFetch(token, `/accounts/${accountId}/access/apps/${appId}/policies`, "POST", body);
  }
}

/** Resolve the API token + account id required to manage Access for an app. */
async function accessClient(): Promise<{ token: string; accountId: string }> {
  const token = await resolveApiToken();
  if (!token) {
    fail(
      "No Cloudflare API token found. Set CLOUDFLARE_API_TOKEN or store one via `repoos tunnel setup` — it is required to create the Access policy that protects your app from public access.",
    );
  }
  let bin: string | null = null;
  try {
    bin = cloudflaredBin();
  } catch {
    bin = null;
  }
  let accountId = await resolveAccountId(token, bin);
  if (!accountId) {
    const entered = await prompt("  Cloudflare account ID (not auto-detectable with this token): ");
    if (entered) accountId = entered;
  }
  if (!accountId) fail("Could not determine your Cloudflare account ID — check the API token permissions.");
  return { token, accountId };
}

// ── Subcommands ──────────────────────────────────────────────────────────────

async function cmdTunnelSetup(_args: string[]): Promise<void> {
  let bin = resolveBinary("cloudflared", process.env.PATH ?? "");
  if (!bin) {
    console.log(c.bold(c.cyan("\n  RepoOS Tunnel · cloudflared is not installed")));
    if (await confirm("  Install cloudflared now?")) {
      const ok = await installCloudflared();
      if (!ok) {
        fail(
          "cloudflared install failed — install it manually (see the downloads page) and re-run `repoos tunnel setup`.",
        );
      }
      bin = resolveBinary("cloudflared", process.env.PATH ?? "");
    } else {
      console.log(c.dim("  Install it yourself, then re-run `repoos tunnel setup`."));
      return;
    }
    if (!bin) {
      fail("cloudflared is not on PATH yet — open a new shell and re-run `repoos tunnel setup`.");
    }
  }

  const cfg = loadConfig();

  // 1. Authenticate cloudflared (idempotent — cert.pem persists).
  const certPem = join(cloudflaredHomeDir(), "cert.pem");
  if (existsSync(certPem)) {
    console.log(c.dim("  ✔ cloudflared is already logged in") + c.dim(` (${certPem})`));
  } else {
    console.log(c.bold("\n  Sign in to Cloudflare: ") + c.dim("a browser window will open — authorize the account and zones you want to publish under."));
    let code: number;
    try {
      code = await runInteractive(bin, ["tunnel", "login"]);
    } catch (e) {
      fail("failed to launch `cloudflared tunnel login`: " + (e as Error).message);
    }
    if (code !== 0) fail("`cloudflared tunnel login` did not complete — re-run `repoos tunnel setup`.");
  }

  // 2. Cloudflare API token (for Access + DNS reconciliation) — stored in the
  //    OS keychain / secret storage, never in the repo.
  const existingToken = await resolveApiToken();
  if (existingToken) {
    console.log(c.dim("  ✔ Cloudflare API token " + (process.env.CLOUDFLARE_API_TOKEN ? "(from CLOUDFLARE_API_TOKEN)" : "(stored in keychain)")));
  }

  // 3. Create or reuse one tunnel per machine.
  const tunnel = readTunnelConfig(cfg.root);
  const tunnels = cloudflaredList(bin);
  let tunnelId = tunnel.tunnelId;
  const byName = tunnels.find((t) => t.name === tunnel.name);
  const byId = tunnelId ? tunnels.some((t) => t.id === tunnelId) : false;
  if (byName) {
    tunnelId = byName.id;
    console.log(c.dim("  ✔ reusing existing tunnel ") + c.cyan(tunnel.name) + c.dim(` (${byName.id})`));
  } else if (byId) {
    console.log(c.dim("  ✔ tunnel already registered ") + c.cyan(tunnel.name) + c.dim(` (${tunnelId})`));
  } else {
    console.log(c.bold(`\n  Creating tunnel `) + c.cyan(tunnel.name) + c.dim(" …"));
    let code: number;
    try {
      code = await runInteractive(bin, ["tunnel", "create", tunnel.name]);
    } catch (e) {
      fail("failed to run `cloudflared tunnel create`: " + (e as Error).message);
    }
    if (code !== 0) fail("`cloudflared tunnel create` failed.");
    const created = cloudflaredList(bin).find((t) => t.name === tunnel.name);
    if (!created) fail("Tunnel created but not found in `cloudflared tunnel list`.");
    tunnelId = created.id;
  }

  // 4. Base domain for hostname inference.
  let domain = tunnel.domain;
  if (!domain) {
    const entered = await prompt("  Base domain for publishing (e.g. repoos.org, blank to skip): ");
    domain = entered;
  }

  tunnel.name = tunnel.name || DEFAULT_TUNNEL_NAME;
  tunnel.domain = domain;
  tunnel.tunnelId = tunnelId;
  writeTunnelConfig(cfg.root, tunnel);

  console.log("\n  " + c.green("✔ Tunnel configured."));
  console.log(c.dim("  tunnel:  ") + c.cyan(tunnel.name) + c.dim(`  (${tunnelId})`));
  if (tunnel.domain) console.log(c.dim("  domain:  ") + c.cyan(tunnel.domain));
  console.log(c.dim("  publish: ") + c.cyan("repoos tunnel create <name> --port <port> --allow alice@example.com"));
}

async function cmdTunnelCreate(args: string[]): Promise<void> {
  const { positionals, flags } = parseArgs(args);
  const name = positionals[0];
  if (!name) fail("Usage: repoos tunnel create <name> --port <port> [--domain <hostname>] [--allow <emails>]");
  if (!isValidAppName(name)) fail(`Invalid app name "${name}" — use letters, digits, hyphens and underscores only.`);

  const cfg = loadConfig();
  const tunnel = readTunnelConfig(cfg.root);
  if (!tunnel.tunnelId) fail("Tunnel not set up yet — run `repoos tunnel setup` first.");
  if (tunnel.apps[name]) {
    fail(`App "${name}" already exists — use \`repoos tunnel allow/deny\` to manage its allowlist.`);
  }

  const port = flags.get("port");
  if (!port || !/^\d+$/.test(port)) fail("--port is required and must be a number.");
  const portNum = Number(port);
  if (portNum < 1 || portNum > 65535) fail("--port must be between 1 and 65535.");

  let hostname = flags.get("domain") ?? "";
  if (!hostname) {
    if (!tunnel.domain) {
      fail("No base domain configured and no --domain given — run `repoos tunnel setup` or pass --domain.");
    }
    hostname = inferHostname(name, tunnel.domain);
  }
  if (hostname.includes("://") || hostname.includes("/")) fail(`Invalid hostname "${hostname}".`);

  const emails = parseEmailList(flags.get("allow"));
  for (const email of emails) {
    if (!isValidEmail(email)) fail(`Invalid email address "${email}".`);
  }
  const warn = hostnameWarning(hostname, tunnel.domain);
  if (warn) console.log(c.yellow("  ⚠ " + warn));

  const bin = cloudflaredBin();
  const creds = tunnelCredentialsPath(tunnel.tunnelId);
  if (!existsSync(creds)) {
    const known = cloudflaredList(bin).some((t) => t.id === tunnel.tunnelId);
    if (!known) fail(`Tunnel ${tunnel.name} is not in this Cloudflare account — re-run \`repoos tunnel setup\`.`);
  }

  // Resolve Access credentials BEFORE mutating config so a missing token can't
  // leave a half-configured (unprotected) app behind.
  const { token, accountId } = await accessClient();

  tunnel.apps[name] = { hostname, service: `http://localhost:${portNum}`, access: emails };
  writeTunnelConfig(cfg.root, tunnel);
  console.log(c.green("  ✔ configured ") + c.cyan(name) + c.dim(` → `) + hostname + c.dim(` → http://localhost:${portNum}`));

  try {
    console.log(c.dim("  · routing DNS ") + hostname + c.dim(" …"));
    execFileSync(bin, ["tunnel", "route", "dns", "--overwrite-dns", tunnel.name, hostname], {
      stdio: "inherit",
      timeout: 60_000,
    });
  } catch {
    console.log(c.yellow("  ⚠ DNS routing failed — authorize the zone in `cloudflared tunnel login`, then re-run `repoos tunnel route dns <name> <hostname>` manually."));
  }

  const derived = writeDerivedConfig(tunnel);
  console.log(c.dim("  · wrote ingress config → ") + derived);

  await reconcileAccessPolicy(token, accountId, hostname, emails);
  console.log(c.green("  ✔ Access policy updated — ") + (emails.length ? emails.join(", ") : "deny all (no emails yet)"));

  console.log("\n  " + c.green("✔ App published."));
  console.log(c.dim("  URL:     ") + c.cyan("https://" + hostname));
  if (!emails.length) {
    console.log(c.dim("  allow:   ") + c.yellow("nobody yet — `repoos tunnel allow " + name + " <email>`") + c.dim(" to let someone in"));
  } else {
    console.log(c.dim("  allow:   ") + emails.join(", "));
  }
  console.log(c.dim("  run:     ") + c.cyan("repoos tunnel start") + c.dim("  ·  server: ") + c.cyan("repoos tunnel install"));
}

async function cmdTunnelAllow(args: string[]): Promise<void> {
  await mutateAllowlist("allow", args);
}

async function cmdTunnelDeny(args: string[]): Promise<void> {
  await mutateAllowlist("deny", args);
}

async function mutateAllowlist(op: "allow" | "deny", args: string[]): Promise<void> {
  const [name, email] = args;
  if (!name || !email) fail(`Usage: repoos tunnel ${op} <name> <email>`);
  if (!isValidEmail(email)) fail(`Invalid email address "${email}".`);

  const cfg = loadConfig();
  const tunnel = readTunnelConfig(cfg.root);
  const app = tunnel.apps[name];
  if (!app) fail(`No app named "${name}" — see \`repoos tunnel list\`.`);

  const next = op === "allow" ? addEmail(app.access, email) : removeEmail(app.access, email);
  if (next.length === app.access.length) {
    console.log(c.dim(`  ${email} is already ${op === "allow" ? "allowed" : "not on the allowlist"} for ${name} — no change.`));
    return;
  }

  app.access = next;
  writeTunnelConfig(cfg.root, tunnel);
  console.log(c.green(`  ✔ ${op === "allow" ? "allowed" : "denied"} `) + c.cyan(email) + c.dim(` on ${name} (${next.length} on allowlist)`));

  const { token, accountId } = await accessClient();
  await reconcileAccessPolicy(token, accountId, app.hostname, app.access);
  console.log(c.green("  ✔ Access policy reconciled for ") + c.cyan(app.hostname));
}

async function cmdTunnelStart(_args: string[]): Promise<void> {
  const cfg = loadConfig();
  const tunnel = readTunnelConfig(cfg.root);
  if (!tunnel.tunnelId) fail("Tunnel not set up yet — run `repoos tunnel setup` first.");
  if (Object.keys(tunnel.apps).length === 0) {
    console.log(c.yellow("  ⚠ no apps configured — the tunnel will serve 404s until you `repoos tunnel create` one."));
  }
  const bin = cloudflaredBin();
  const configPath = writeDerivedConfig(tunnel);
  console.log(c.dim("  · running cloudflared in the foreground (Ctrl-C to stop)…\n"));
  let code: number;
  try {
    code = await runInteractive(bin, ["tunnel", "--config", configPath, "run", tunnel.tunnelId]);
  } catch (e) {
    fail("failed to start cloudflared: " + (e as Error).message);
  }
  process.exitCode = code;
}

async function cmdTunnelInstall(_args: string[]): Promise<void> {
  const cfg = loadConfig();
  const tunnel = readTunnelConfig(cfg.root);
  if (!tunnel.tunnelId) fail("Tunnel not set up yet — run `repoos tunnel setup` first.");
  if (Object.keys(tunnel.apps).length === 0) {
    console.log(c.yellow("  ⚠ no apps configured yet — the service will start but serve 404s. `repoos tunnel create` one first."));
  }
  const bin = cloudflaredBin();
  writeDerivedConfig(tunnel);
  const userConfig = writeUserCloudflaredConfig(tunnel);

  if (process.platform === "darwin") {
    let code: number;
    try {
      code = await runInteractive(bin, ["service", "install"]);
    } catch (e) {
      fail("failed to run `cloudflared service install`: " + (e as Error).message);
    }
    if (code !== 0) fail("`cloudflared service install` failed — see output above.");
    try {
      execFileSync("launchctl", ["start", "com.cloudflare.cloudflared"], { stdio: "inherit", timeout: 15_000 });
    } catch {
      // already started by the installer
    }
    console.log(c.green("  ✔ installed as a launch agent — the tunnel starts when you log in."));
  } else if (process.platform === "linux") {
    const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
    const cmd = isRoot ? bin : "sudo";
    const args = isRoot
      ? ["--config", userConfig, "service", "install"]
      : [bin, "--config", userConfig, "service", "install"];
    console.log(c.dim("  · installing cloudflared as a systemd service (may prompt for your password)…"));
    let code: number;
    try {
      code = await runInteractive(cmd, args);
    } catch (e) {
      fail("failed to run cloudflared service install: " + (e as Error).message);
    }
    if (code !== 0) {
      fail(`\`cloudflared service install\` failed. Try it manually:\n    sudo cloudflared --config ${userConfig} service install`);
    }
    try {
      execFileSync("systemctl", ["start", "cloudflared"], { stdio: "inherit", timeout: 15_000 });
    } catch {
      // installer already started it
    }
    console.log(c.green("  ✔ installed as a systemd service — the tunnel survives reboots."));
  } else {
    fail("Persistent service install is only supported on macOS and Linux.");
  }
}

async function cmdTunnelStop(_args: string[]): Promise<void> {
  const bin = resolveBinary("cloudflared", process.env.PATH ?? "");
  let stoppedService = false;
  if (process.platform === "darwin") {
    try {
      execFileSync("launchctl", ["stop", "com.cloudflare.cloudflared"], { stdio: "inherit", timeout: 15_000 });
      stoppedService = true;
    } catch {
      console.log(c.yellow("  ⚠ launchctl stop failed — try `sudo launchctl stop com.cloudflare.cloudflared`"));
    }
  } else if (process.platform === "linux") {
    try {
      execFileSync("systemctl", ["stop", "cloudflared"], { stdio: "inherit", timeout: 15_000 });
      stoppedService = true;
    } catch {
      console.log(c.yellow("  ⚠ systemctl stop failed — try `sudo systemctl stop cloudflared`"));
    }
  }
  if (bin) {
    try {
      execFileSync("pkill", ["-f", "cloudflared.*tunnel.*run"], { timeout: 5_000 });
      stoppedService = true;
    } catch {
      // no foreground process was running
    }
  }
  console.log(stoppedService ? c.green("  ✔ tunnel stopped.") : c.dim("  No running tunnel process to stop."));
}

function cmdTunnelList(_args: string[]): void {
  const cfg = loadConfig();
  const tunnel = readTunnelConfig(cfg.root);
  if (!tunnel.tunnelId) {
    console.log(c.dim("  No tunnel configured yet — run `repoos tunnel setup`."));
    return;
  }
  console.log(c.bold("\n  " + c.cyan(tunnel.name)) + c.dim(`  (${tunnel.tunnelId})`));
  if (tunnel.domain) console.log(c.dim("  base domain:  ") + tunnel.domain);
  const names = Object.keys(tunnel.apps).sort();
  if (!names.length) {
    console.log(c.dim("  No apps published yet — `repoos tunnel create <name> --port 3000 --allow alice@example.com`\n"));
    return;
  }
  for (const name of names) {
    const app = tunnel.apps[name];
    console.log("\n  " + c.cyan(name));
    console.log("    " + c.dim("hostname: ") + app.hostname);
    console.log("    " + c.dim("service:  ") + app.service);
    console.log(
      "    " +
        c.dim("allow:    ") +
        (app.access.length ? app.access.join(", ") : c.yellow("(none — deny all)")),
    );
  }
  console.log("");
}

async function cmdTunnelStatus(_args: string[]): Promise<void> {
  const cfg = loadConfig();
  const tunnel = readTunnelConfig(cfg.root);
  const bin = resolveBinary("cloudflared", process.env.PATH ?? "");

  const rows: [string, string][] = [];
  rows.push(["cloudflared", bin ? c.green("installed") : c.red("not installed")]);

  if (!tunnel.tunnelId) {
    rows.push(["tunnel", c.yellow("not configured — run `repoos tunnel setup`")]);
  } else {
    rows.push(["tunnel", c.cyan(tunnel.name) + c.dim(` (${tunnel.tunnelId})`)]);

    let serviceInstalled = false;
    let serviceActive = false;
    if (process.platform === "darwin") {
      try {
        const out = execFileSync("launchctl", ["list"], { encoding: "utf8", timeout: 10_000 });
        const line = out.split("\n").find((l) => l.includes("com.cloudflare.cloudflared"));
        if (line) {
          serviceInstalled = true;
          serviceActive = /^\s*\d+\s+/.test(line); // PID column is a number when running
        }
      } catch {
        // launchctl unavailable
      }
    } else if (process.platform === "linux") {
      try {
        const out = execFileSync("systemctl", ["is-active", "cloudflared"], {
          encoding: "utf8",
          timeout: 10_000,
        }).trim();
        serviceInstalled = out !== "inactive" && out !== "unknown" && out !== "";
        serviceActive = out === "active";
      } catch {
        // systemd unavailable
      }
    }

    let devRunning = false;
    try {
      const out = execFileSync("pgrep", ["-f", "cloudflared.*tunnel.*run"], {
        encoding: "utf8",
        timeout: 10_000,
      });
      devRunning = out.trim() !== "";
    } catch {
      // no dev process
    }

    rows.push(["service", serviceInstalled ? (serviceActive ? "installed + running" : "installed (stopped)") : "not installed"]);
    rows.push(["running", devRunning || serviceActive ? c.green("yes") : c.red("no")]);

    const names = Object.keys(tunnel.apps).sort();
    if (names.length) {
      console.log(c.dim("  per-app health"));
      for (const name of names) {
        const app = tunnel.apps[name];
        rows.push(["  " + name, `${app.hostname} → ` + (await probeApp(app.hostname))]);
      }
    }
  }

  const width = Math.max(...rows.map(([k]) => k.length));
  console.log("\n  " + c.bold("Tunnel status"));
  for (const [k, v] of rows) {
    console.log("  " + c.dim(k.padEnd(width)) + "  " + v);
  }
  console.log("");
}

async function probeApp(hostname: string): Promise<string> {
  try {
    const res = await fetch("https://" + hostname, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 301 || res.status === 302 || res.status === 303) return c.yellow(`reachable (redirects to Access)`);
    if (res.status >= 200 && res.status < 400) return c.green(`healthy (${res.status})`);
    if ([502, 504, 522, 523].includes(res.status)) return c.red(`origin down (${res.status})`);
    return c.yellow(`responds ${res.status}`);
  } catch {
    return c.red("unreachable");
  }
}

function tunnelHelp(): void {
  console.log(`
  ${c.bold(c.cyan("repoos tunnel"))} — publish local apps behind Cloudflare Tunnel + Zero Trust

  ${c.bold("USAGE")}
    repoos tunnel <subcommand> [args]

  ${c.bold("SUBCOMMANDS")}
    ${c.cyan("setup")}                 One-time machine setup: install/check cloudflared, log in, create the tunnel, store the API token
    ${c.cyan("create")} <name>         Publish a local app  ${c.dim('flags: --port N --domain H --allow "a@x,b@y"')}
    ${c.cyan("allow")} <name> <email>  Add an email to an app's allowlist
    ${c.cyan("deny")} <name> <email>   Remove an email from an app's allowlist
    ${c.cyan("start")}                 Run cloudflared in the foreground (dev)
    ${c.cyan("install")}               Install cloudflared as a persistent service (launchd/systemd)
    ${c.cyan("stop")}                  Stop the running tunnel (service or dev process)
    ${c.cyan("list")}                  Show configured apps, hostnames, services and allowlists
    ${c.cyan("status")}                Tunnel install/running state + per-app health

  ${c.bold("EXAMPLES")}
    ${c.dim("$")} repoos tunnel setup
    ${c.dim("$")} repoos tunnel create dashboard --port 3000 --allow alice@example.com,bob@example.com
    ${c.dim("$")} repoos tunnel allow dashboard carol@example.com
    ${c.dim("$")} repoos tunnel start
`);
}

// ── Dispatch ────────────────────────────────────────────────────────────────
export async function cmdTunnel(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  const handlers: Record<string, (a: string[]) => Promise<void> | void> = {
    setup: cmdTunnelSetup,
    create: cmdTunnelCreate,
    allow: cmdTunnelAllow,
    deny: cmdTunnelDeny,
    start: cmdTunnelStart,
    install: cmdTunnelInstall,
    stop: cmdTunnelStop,
    list: cmdTunnelList,
    status: cmdTunnelStatus,
  };
  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    tunnelHelp();
    return;
  }
  const fn = handlers[sub];
  if (!fn) {
    console.error(c.red(`  Unknown tunnel subcommand: ${sub}`));
    tunnelHelp();
    process.exitCode = 1;
    return;
  }
  try {
    await fn(rest);
  } catch (e) {
    const err = e as TunnelError;
    if (!err.repoosTunnel) console.error(c.red("  " + err.message));
    process.exitCode = 1;
  }
}
