/**
 * Tailnet discovery shared by `repoos servers --tailscale` and the authenticated
 * `GET /api/servers/tailnet` endpoint the mobile Hub calls.
 *
 * Discovery runs entirely on the machine that owns the trust relationship: the
 * Tailscale CLI lists online peers, and each peer is queried over HTTPS before
 * falling back to SSH for older installations. The phone never scans — it asks one
 * server it already trusts. Keeping this in `src/core` means the CLI and the
 * server cannot drift into two slightly different discovery implementations.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { remoteHostUser } from "./remote-hosts.js";
import type { RemoteValidationConfig, RemoteValidationHost } from "./types.js";

const execFileAsync = promisify(execFile);

/** Per-command budget for one remote host. */
export const HOST_TIMEOUT_MS = 4_000;
/** Whole-request budget for one discovery pass; slow hosts become `unreachable`. */
export const DISCOVERY_DEADLINE_MS = 20_000;
/** `tailscale status --json` is local and cheap; never let it hold a request. */
const TAILSCALE_STATUS_TIMEOUT_MS = 2_000;
/** URL enrichment is a nicety; a slow `serve status` must not hide servers. */
const SERVE_STATUS_TIMEOUT_MS = 1_500;

export interface ListedServer {
  host: string;
  /** Readable Tailscale HostName when it differs from the SSH/MagicDNS host. */
  displayName?: string;
  port?: number;
  pid?: number;
  root?: string;
  projectName?: string;
  valid?: boolean;
  uptimeSeconds?: number | null;
  activeEngineers?: number;
  staleReason?: string | null;
  unreachable?: boolean;
  reason?: string;
  /** URL a tailnet client can open (set when discovery annotates URLs). */
  url?: string;
  /** Whether `url` is HTTPS. Hub only offers HTTPS URLs for saving. */
  https?: boolean;
  [key: string]: unknown;
}

interface TailnetStatusPeer {
  HostName?: string;
  DNSName?: string;
  Online?: boolean;
  OS?: string;
  Tags?: string[];
}

interface TailnetStatus {
  Self?: TailnetStatusPeer;
  Peer?: Record<string, TailnetStatusPeer>;
}

export interface TailnetPeer {
  /**
   * Stable MagicDNS label (`bee`, `thinkpad`, `mini`) used for SSH and
   * de-duplication. This is deliberately not Tailscale's `HostName`: a peer
   * can report a human display name with spaces/punctuation, and two peers can
   * share the same `HostName` while having distinct MagicDNS names.
   */
  host: string;
  /** MagicDNS name without the trailing dot, when Tailscale reports one. */
  dnsName?: string;
  /** Tailscale's readable `HostName`, when it differs from the MagicDNS label. */
  displayName?: string;
}

export interface TailnetInfo {
  /** This machine, as Tailscale knows it. Absent when status is unreadable. */
  self?: TailnetPeer;
  peers: TailnetPeer[];
}

/** A single DNS label that is safe to hand to SSH as a host. */
const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * Mobile peers cannot run a RepoOS server. Probing them over SSH only produces
 * a misleading "unreachable" row (phones do not accept SSH from the tailnet),
 * so discovery leaves them out entirely.
 */
const UNSUPPORTED_MOBILE_OS = new Set(["android", "ios", "ipados", "tvos", "watchos"]);

function isUnsupportedMobilePeer(peer: TailnetStatusPeer): boolean {
  const os = (peer.OS ?? "").trim().toLowerCase();
  const name = (peer.HostName ?? "").trim().toLowerCase();
  const tags = peer.Tags ?? [];
  return UNSUPPORTED_MOBILE_OS.has(os) ||
    /\b(?:phone|iphone|ipad|tablet|pixel|nothing phone|galaxy tab)\b/.test(name) ||
    tags.some((tag) => /(?:mobile|phone|tablet)/i.test(tag));
}

/** Normalize a MagicDNS name and reject anything that is not DNS-safe. */
function normalizeDnsName(value: string | undefined): string | undefined {
  const name = (value ?? "").trim().replace(/\.$/, "");
  if (!name) return undefined;
  const labels = name.split(".");
  if (!labels.every((label) => DNS_LABEL_RE.test(label))) return undefined;
  return name.toLowerCase();
}

/** Stable identity used for de-duplication: MagicDNS name when present. */
function peerIdentity(peer: TailnetPeer): string {
  return (peer.dnsName ?? peer.host).toLowerCase();
}

function peerFromStatus(peer: TailnetStatusPeer | undefined): TailnetPeer | null {
  if (!peer) return null;
  const dnsName = normalizeDnsName(peer.DNSName);
  const host = dnsName?.split(".")[0] ?? normalizeDnsName(peer.HostName)?.split(".")[0];
  if (!host) return null;
  const rawDisplay = (peer.HostName ?? "").trim();
  const displayName = rawDisplay && rawDisplay.toLowerCase() !== host ? rawDisplay : undefined;
  return { host, ...(dnsName ? { dnsName } : {}), ...(displayName ? { displayName } : {}) };
}

/**
 * Parse `tailscale status --json` into this machine plus its online peers.
 * Offline peers, unsupported mobile peers and this machine are excluded from
 * `peers`; peers are de-duplicated by MagicDNS identity, never by the readable
 * `HostName` (two machines can legitimately report the same display name).
 */
export function parseTailnetInfo(json: string): TailnetInfo {
  const status = JSON.parse(json) as TailnetStatus;
  const self = peerFromStatus(status.Self) ?? undefined;
  const selfIdentity = self ? peerIdentity(self) : undefined;
  const seen = new Set<string>();
  const peers: TailnetPeer[] = [];
  for (const raw of Object.values(status.Peer ?? {})) {
    if (raw.Online === false || isUnsupportedMobilePeer(raw)) continue;
    const peer = peerFromStatus(raw);
    if (!peer) continue;
    const identity = peerIdentity(peer);
    if (identity === selfIdentity || seen.has(identity)) continue;
    seen.add(identity);
    peers.push(peer);
  }
  return { ...(self ? { self } : {}), peers };
}

/** Backwards-compatible helper used by `repoos servers --tailscale`. */
export function parseTailnetPeers(json: string): string[] {
  return parseTailnetInfo(json).peers.map((peer) => peer.host);
}

/**
 * Map the local proxy ports in `tailscale serve status --json` to the HTTPS
 * MagicDNS URLs that terminate TLS for them. `repoos serve` creates these
 * mappings itself (see `src/core/tailscale.ts`), so this is how a discovered
 * remote server gets a URL the phone can actually open rather than a raw
 * `http://<host>:<port>` guess.
 */
export function parseTailscaleServeUrls(json: string): Record<number, string> {
  const out: Record<number, string> = {};
  let cfg: {
    Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> } | undefined>;
  };
  try {
    cfg = JSON.parse(json || "{}") as typeof cfg;
  } catch {
    return out;
  }
  for (const [hostPort, web] of Object.entries(cfg.Web ?? {})) {
    if (!web || typeof web !== "object") continue;
    // Keys look like "bee.tailnet.ts.net:8443" (or ":443" omitted only in
    // older docs; be defensive and default to 443).
    const match = /^(.*?)(?::(\d+))?$/.exec(hostPort);
    const tlsHost = match?.[1];
    const tlsPort = Number(match?.[2] ?? 443);
    if (!tlsHost || !Number.isFinite(tlsPort)) continue;
    const base = `https://${tlsHost}${tlsPort === 443 ? "" : `:${tlsPort}`}`;
    for (const [path, handler] of Object.entries(web.Handlers ?? {})) {
      const proxy = handler?.Proxy;
      if (typeof proxy !== "string") continue;
      const proxied = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)(?:\/.*)?$/.exec(proxy);
      const localPort = Number(proxied?.[1]);
      if (!Number.isFinite(localPort) || out[localPort]) continue;
      const suffix = path === "/" ? "" : path.replace(/\/$/, "");
      out[localPort] = `${base}${suffix}`;
    }
  }
  return out;
}

/** Build the URL a tailnet client can open for one discovered server. */
export function tailnetServerUrl(input: {
  host: string;
  dnsName?: string;
  port?: number;
  httpsByPort?: Record<number, string>;
}): { url?: string; https?: boolean } {
  if (!input.port) return {};
  const https = input.httpsByPort?.[input.port];
  if (https) return { url: https, https: true };
  const host = input.dnsName || input.host;
  if (!host || host === "local") return {};
  // Tailscale encrypts transport, but Hub's add flow requires an https origin.
  // Reporting the http URL (rather than inventing one) lets Hub show the server
  // as "needs HTTPS" instead of silently saving something it cannot open.
  return { url: `http://${host}:${input.port}`, https: false };
}

/**
 * Execute a command on a tailnet peer over SSH. `command` defaults to
 * `repoos servers --json`; discovery asks for `tailscale serve status --json`
 * through the same seam so tests can fake both calls.
 */
export type RemoteExec = (
  host: string,
  user: string,
  timeoutMs: number,
  command?: string,
) => Promise<string>;

/**
 * Install locations a `repoos` launcher and its Bun/Node runtime commonly use.
 * A non-interactive SSH command inherits a minimal PATH (`/usr/bin:/bin:…`) and
 * does not read the user's interactive shell startup files, so `repoos` is not
 * found even though the same login works in a terminal. Prepending these known
 * locations makes lookup predictable without a login shell or a TTY.
 */
export const REMOTE_PATH_PREFIX = [
  "$HOME/.local/bin",
  "$HOME/.bun/bin",
  "$HOME/.npm-global/bin",
  "/opt/homebrew/bin",
  "/usr/local/bin",
].join(":");

/** POSIX-quote one argument for `sh` (single quotes, embedded quotes escaped). */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The remote script: a deterministic PATH followed by the command. `command`
 * is a trusted internal constant (`repoos servers --json`, `tailscale serve
 * status --json`), never user input; host and user travel as separate SSH argv.
 */
export function remoteShellScript(command: string): string {
  return `PATH="${REMOTE_PATH_PREFIX}:$PATH"; export PATH; ${command}`;
}

/**
 * Wrap the remote work in `sh -c '<script>'`. OpenSSH already runs the user's
 * login shell non-interactively, which may be bash, zsh or a POSIX sh; passing
 * one quoted argument keeps the payload valid for all of them and avoids
 * relying on interactive rc files for PATH.
 */
export function remoteShellCommand(command = "repoos servers --json"): string {
  return `sh -c ${shellQuote(remoteShellScript(command))}`;
}

export function serversSshArgs(
  host: string,
  user: string,
  timeoutMs: number,
  command = "repoos servers --json",
): string[] {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${Math.ceil(timeoutMs / 1000)}`,
    `${user}@${host}`,
    remoteShellCommand(command),
  ];
}

function stringField(error: unknown, key: string): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as Record<string, unknown>)[key];
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8");
  return undefined;
}

function booleanField(error: unknown, key: string): boolean | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

function numericField(error: unknown, key: string): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/**
 * A local timeout (execFile killed the child, ETIMEDOUT, or an AbortSignal) is
 * the ONLY evidence that earns "timed out". Text matching is deliberately
 * avoided here: execFile's message repeats the whole SSH argv, including
 * `-o ConnectTimeout=4`, so a `/timeout/i` test wrongly labels every SSH
 * failure a timeout.
 */
export function isRemoteTimeout(error: unknown): boolean {
  if (stringField(error, "code") === "ETIMEDOUT") return true;
  // execFile's maxBuffer guard kills the child too, but that is an output
  // limit, not a network timeout (#1140 review).
  if (stringField(error, "code") === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return false;
  if (stringField(error, "name") === "TimeoutError") return true;
  if (booleanField(error, "killed") === true) return true;
  const signal = stringField(error, "signal");
  return typeof signal === "string" && signal.length > 0;
}

/** First meaningful line of stderr, bounded so a chatty host can't flood a row. */
function firstErrorLine(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  const value = line ?? text.trim();
  return value.length > 300 ? `${value.slice(0, 297)}…` : value;
}

function remoteBinaryFromCommandNotFound(text: string): string | null {
  const match =
    /command not found:\s*([\w.+-]+)/i.exec(text) ??
    /(?:^|[\s:])([\w.+-]+):\s*command not found/i.exec(text) ??
    /(?:^|[\s:])([\w.+-]+):\s*not found\b/i.exec(text);
  return match?.[1] ?? null;
}

/** `Permission denied (publickey).` — SSH's own shape, not remote output. */
const SSH_AUTH_FAILURE_RE =
  /Permission denied \((?:publickey|password|keyboard-interactive|hostbased|gssapi)[^)]*\)/i;
/** A remote shell refusing to execute a file (e.g. a non-executable launcher). */
const REMOTE_PERMISSION_RE =
  /\b(?:sh|bash|zsh|dash|ksh):[^\n]*permission denied|\bEACCES: permission denied/i;

export type RemoteFailureKind = "timeout" | "transport" | "remote-command" | "unknown";

export interface RemoteFailure {
  kind: RemoteFailureKind;
  reason: string;
}

/**
 * Keep only the lines SSH itself wrote. OpenSSH forwards the remote command's
 * stderr verbatim, so a remote `EACCES` or an app logging "timeout" shares the
 * channel with `Permission denied (publickey)` and `Connection refused`. Only
 * SSH-shaped lines may become a transport cause — a bare "permission denied"
 * or "timeout" from the remote program must not.
 */
function sshDiagnosticText(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      if (/^\s*ssh(?:-[\w-]+)?:\s/i.test(line)) return true;
      if (/^\s*(?:ssh_exchange_identification|kex_exchange_identification):/i.test(line))
        return true;
      if (SSH_AUTH_FAILURE_RE.test(line)) return true;
      if (/^\s*Host key verification failed\.?\s*$/i.test(line)) return true;
      if (/^\s*Could not resolve hostname\b/i.test(line)) return true;
      if (/^\s*Connection (?:closed|reset) by\b/i.test(line)) return true;
      if (/^\s*(?:Write failed:|Read from remote host)\b/i.test(line)) return true;
      return false;
    })
    .join("\n");
}

function classifySshDiagnostics(text: string): RemoteFailure {
  if (SSH_AUTH_FAILURE_RE.test(text)) {
    return { kind: "transport", reason: `SSH authentication failed: ${firstErrorLine(text)}` };
  }
  if (/host key verification failed/i.test(text)) {
    return {
      kind: "transport",
      reason: `SSH host key verification failed: ${firstErrorLine(text)}`,
    };
  }
  if (/could not resolve hostname|name or service not known|nodename nor servname/i.test(text)) {
    return { kind: "transport", reason: `host not found: ${firstErrorLine(text)}` };
  }
  if (/\bconnection refused\b/i.test(text)) {
    return { kind: "transport", reason: `connection refused: ${firstErrorLine(text)}` };
  }
  // Only SSH's own text can say this; remote output was filtered out above.
  if (/\btimed out\b|\btimeout\b/i.test(text)) return { kind: "timeout", reason: "timed out" };
  if (/\b(?:no route to host|network is unreachable)\b/i.test(text)) {
    return { kind: "transport", reason: `connection failed: ${firstErrorLine(text)}` };
  }
  return { kind: "transport", reason: firstErrorLine(text) };
}

/**
 * Classify an SSH/exec failure without confusing the remote program's stderr
 * with SSH's own transport diagnostics. A remote `repoos: command not found`
 * or `sh: …: Permission denied` stays a remote-command problem; only SSH-shaped
 * output can become an authentication/connection/timeout cause.
 */
export function classifyRemoteFailure(error: unknown): RemoteFailure {
  if (stringField(error, "code") === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return {
      kind: "remote-command",
      reason: "remote output exceeded the 2 MiB limit",
    };
  }
  if (isRemoteTimeout(error)) return { kind: "timeout", reason: "timed out" };

  const stderr = stringField(error, "stderr")?.trim() ?? "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = numericField(error, "code");
  const text = stderr || message;

  if (/command not found|: not found\b/i.test(text)) {
    const binary = remoteBinaryFromCommandNotFound(text);
    return {
      kind: "remote-command",
      reason: `command not found${binary ? `: ${binary}` : ""} on the remote PATH`,
    };
  }
  if (stderr && REMOTE_PERMISSION_RE.test(stderr)) {
    return {
      kind: "remote-command",
      reason: `remote command permission denied: ${firstErrorLine(stderr)}`,
    };
  }

  const diagnostics = sshDiagnosticText(stderr) || sshDiagnosticText(message);
  if (diagnostics) return classifySshDiagnostics(diagnostics);
  // Anything left is the remote program's output (or execFile's argv) — never
  // mine it for a transport cause. Exit 255 with no stderr is still transport.
  if (stderr) return { kind: "remote-command", reason: firstErrorLine(stderr) };
  if (code === 255) return { kind: "transport", reason: "ssh command failed" };

  // No stderr: the message may be an SSH/exec wrapper or a test seam's Error.
  if (/\btimed out\b|\btimeout\b/i.test(message)) return { kind: "timeout", reason: "timed out" };
  // Only fall back to the process message when it is not execFile's
  // "Command failed: <the whole ssh argv>" wrapper (which contains
  // ConnectTimeout even when the failure had nothing to do with time).
  if (/^command failed:/i.test(message)) return { kind: "unknown", reason: "ssh command failed" };
  return { kind: "unknown", reason: message || "remote command failed" };
}

/** User-facing reason shown by `repoos servers --tailscale`. */
export function remoteFailureReason(error: unknown): string {
  return classifyRemoteFailure(error).reason;
}

export const defaultRemoteExec: RemoteExec = async (host, user, timeoutMs, command) => {
  const { stdout } = await execFileAsync("ssh", serversSshArgs(host, user, timeoutMs, command), {
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.toString();
};

async function defaultTailscaleStatus(): Promise<string> {
  const { stdout } = await execFileAsync("tailscale", ["status", "--json"], {
    timeout: TAILSCALE_STATUS_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.toString();
}

async function defaultTailscaleServeStatus(): Promise<string> {
  const { stdout } = await execFileAsync("tailscale", ["serve", "status", "--json"], {
    timeout: TAILSCALE_STATUS_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.toString();
}

/** Resolve `promise`, or `fallback()` once `ms` elapses. Never rejects. */
async function within<T>(promise: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback()), Math.max(0, ms));
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface CollectTailnetOptions {
  /** Test seam: replace the local `tailscale status --json` call. */
  tailscaleStatus?: () => Promise<string>;
  /** Test seam: replace the local `tailscale serve status --json` call. */
  localServeStatus?: () => Promise<string>;
  configuredHosts?: string[];
  remoteHosts?: RemoteValidationHost[];
  remoteValidation?: RemoteValidationConfig;
  remoteExec?: RemoteExec;
  /** Test seam for peer HTTP discovery; default uses fetch with an abort timeout. */
  httpDiscovery?: (peer: TailnetPeer, timeoutMs: number) => Promise<string | null>;
  /** Per-remote-command budget. Defaults to {@link HOST_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Whole-pass budget. Defaults to {@link DISCOVERY_DEADLINE_MS}. */
  deadlineMs?: number;
  /** Add `url`/`https` to every row that has a serviceable URL. */
  annotateUrls?: boolean;
  /** Test seam for the deadline clock. */
  now?: () => number;
}

async function defaultHttpDiscovery(peer: TailnetPeer, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Tailscale Serve terminates HTTPS on the MagicDNS host and forwards this
    // path to the local RepoOS server. Keep the response deliberately small.
    const response = await fetch(`https://${peer.dnsName ?? peer.host}/api/servers/discovery`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface TailnetCollection {
  servers: ListedServer[];
  tailscaleUnavailable: boolean;
  /**
   * Where the peer list came from: the local Tailscale CLI, the configured
   * host pool when that CLI is absent, or nowhere but the local registry when
   * the CLI is absent and no configured hosts exist.
   */
  source: "tailscale" | "configured-hosts" | "local-only";
  /** This machine's Tailscale identity, when status parsed successfully. */
  self?: TailnetPeer;
}

/**
 * List local plus tailnet servers. Partial results are the contract: a failed
 * or slow peer becomes `{ host, unreachable: true, reason }` and never blocks
 * the rest.
 */
export async function collectTailnetServers(
  local: ListedServer[],
  options: CollectTailnetOptions = {},
): Promise<TailnetCollection> {
  const timeoutMs = options.timeoutMs ?? HOST_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const deadlineAt = now() + (options.deadlineMs ?? DISCOVERY_DEADLINE_MS);

  let statusJson: string | undefined;
  let info: TailnetInfo | undefined;
  let tailscaleUnavailable = false;
  try {
    statusJson = await within(
      (options.tailscaleStatus ?? defaultTailscaleStatus)(),
      Math.min(timeoutMs, TAILSCALE_STATUS_TIMEOUT_MS),
      () => {
        throw new Error("tailscale status timed out");
      },
    );
  } catch {
    tailscaleUnavailable = true;
  }
  if (statusJson !== undefined) {
    try {
      info = parseTailnetInfo(statusJson);
    } catch {
      tailscaleUnavailable = true;
    }
  }

  // A parsed status is authoritative even when it names no peers. Only a
  // missing/unreadable Tailscale CLI falls back to configured hosts (the same
  // behaviour the CLI has always had).
  const peers: TailnetPeer[] = tailscaleUnavailable
    ? (options.configuredHosts ?? []).map((host) => ({ host }))
    : (info?.peers ?? []);

  // Local serve mappings are read once; failure just means no HTTPS URL for
  // this machine's own servers (the rows still come back).
  let localHttpsByPort: Record<number, string> = {};
  if (options.annotateUrls && info) {
    try {
      localHttpsByPort = parseTailscaleServeUrls(
        await within(
          (options.localServeStatus ?? defaultTailscaleServeStatus)(),
          Math.min(timeoutMs, SERVE_STATUS_TIMEOUT_MS),
          () => "",
        ),
      );
    } catch {
      localHttpsByPort = {};
    }
  }

  const localRows = options.annotateUrls
    ? local.map((row) => ({
        ...row,
        ...tailnetServerUrl({
          host: info?.self?.host ?? "local",
          dnsName: info?.self?.dnsName,
          port: row.port,
          httpsByPort: localHttpsByPort,
        }),
      }))
    : local;

  const remoteExec = options.remoteExec ?? defaultRemoteExec;
  const configuredByHost = new Map((options.remoteHosts ?? []).map((host) => [host.host, host]));
  const remotes = await Promise.all(
    peers.map(async (peer): Promise<ListedServer[]> => {
      // A configured row may name either the MagicDNS label (`bee`) or the
      // full name (`bee.tailc0c173.ts.net`); honour both.
      const hostConfig = configuredByHost.get(peer.host) ??
        (peer.dnsName ? configuredByHost.get(peer.dnsName) : undefined) ?? { host: peer.host };
      const displayFields = peer.displayName ? { displayName: peer.displayName } : {};
      const user = options.remoteValidation
        ? remoteHostUser(options.remoteValidation, hostConfig)
        : hostConfig.user?.trim() || "root";
      const work = async (): Promise<ListedServer[]> => {
        try {
          const discovered = await (options.httpDiscovery ?? defaultHttpDiscovery)(peer, Math.min(timeoutMs, 750));
          if (discovered) {
            const payload = JSON.parse(discovered) as { servers?: Record<string, unknown>[] };
            if (Array.isArray(payload.servers)) {
              return payload.servers.map((server) => ({
                ...server,
                host: peer.host,
                ...displayFields,
                ...(typeof server.url === "string" ? { https: server.url.startsWith("https://") } : {}),
              })) as ListedServer[];
            }
          }
          // The two reads are independent; running them together keeps a host
          // inside the per-host budget instead of spending it twice.
          const [serversJson, serveJson] = await Promise.all([
            remoteExec(peer.host, user, timeoutMs, "repoos servers --json"),
            options.annotateUrls
              ? within(
                  remoteExec(
                    peer.host,
                    user,
                    Math.min(timeoutMs, SERVE_STATUS_TIMEOUT_MS),
                    "tailscale serve status --json",
                  ).catch(() => ""),
                  SERVE_STATUS_TIMEOUT_MS,
                  () => "",
                )
              : Promise.resolve(""),
          ]);
          const payload = JSON.parse(serversJson) as { servers?: Record<string, unknown>[] };
          if (!Array.isArray(payload.servers))
            throw new Error("remote response has no servers list");
          const httpsByPort = options.annotateUrls ? parseTailscaleServeUrls(serveJson) : {};
          return payload.servers.map(
            (server) =>
              ({
                ...server,
                host: peer.host,
                ...displayFields,
                ...(options.annotateUrls
                  ? tailnetServerUrl({
                      host: peer.host,
                      dnsName: peer.dnsName,
                      port: typeof server.port === "number" ? server.port : undefined,
                      httpsByPort,
                    })
                  : {}),
              }) as ListedServer,
          );
        } catch (error) {
          return [
            {
              host: peer.host,
              ...displayFields,
              unreachable: true,
              reason: remoteFailureReason(error),
            },
          ];
        }
      };
      return within(work(), deadlineAt - now(), () => [
        { host: peer.host, ...displayFields, unreachable: true, reason: "timed out" },
      ]);
    }),
  );
  return {
    servers: [...localRows, ...remotes.flat()],
    tailscaleUnavailable,
    source: tailscaleUnavailable
      ? (options.configuredHosts ?? []).length > 0
        ? "configured-hosts"
        : "local-only"
      : "tailscale",
    ...(info?.self ? { self: info.self } : {}),
  };
}
