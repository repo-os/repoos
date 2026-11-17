/**
 * Server-assisted tailnet discovery for the native shell.
 *
 * The phone cannot run the Tailscale CLI, and it must not scan the network. So
 * "Find servers on my tailnet" makes exactly one request to a server the user
 * already saved (`GET /api/servers/tailnet`). The server probes peers over its
 * tailnet discovery listener, with SSH fallback for older servers, and returns
 * rows with ready-to-open URLs. Everything in this module is
 * pure except `fetchTailnetServers`, which is injectable for tests.
 */
import { serverUrlOf } from "./reachability";
import type { ServerEntry } from "./types";

/** One row as returned by the server endpoint. */
export interface TailnetServer {
  host: string;
  /** Readable Tailscale machine name when it differs from the MagicDNS host. */
  displayName?: string;
  dnsName?: string;
  allowlistGroup?: string;
  port?: number;
  projectName?: string;
  root?: string;
  url?: string;
  /** Whether `url` terminates TLS. Hub can only save HTTPS servers. */
  https?: boolean;
  unreachable?: boolean;
  reason?: string;
  valid?: boolean;
  staleReason?: string | null;
}

export interface TailnetPayload {
  ok?: boolean;
  servers?: TailnetServer[];
  tailscaleUnavailable?: boolean;
  /** `configured-hosts` means the host pool replaced an absent Tailscale CLI; `local-only` means there was no pool either. */
  discoverySource?: "tailscale" | "configured-hosts" | "local-only";
  disabled?: boolean;
  reason?: string;
}

/** A discovery row merged with what is already saved on this device. */
export interface DiscoveredServer {
  /** Stable key for selection: normalized URL including Serve path, or failure identity. */
  key: string;
  url: string;
  name: string;
  host: string;
  port?: number;
  https: boolean;
  saved: boolean;
  selectable: boolean;
  /** Why a row cannot be selected (already saved, needs HTTPS, unreachable). */
  note?: string;
}

export type TailnetFetchResult =
  | {
      kind: "ok";
      servers: TailnetServer[];
      tailscaleUnavailable: boolean;
      message?: string;
    }
  | { kind: "outdated" | "disabled" | "auth" | "error"; message: string };

export function tailnetDiscoveryMessage(
  results: DiscoveredServer[],
  selectableCount: number,
  serverMessage?: string,
): string {
  if (serverMessage) return serverMessage;
  if (results.length === 0) return "No RepoOS servers were found on the tailnet from this server.";
  const hasProjects = results.some((result) => !result.note?.startsWith("Unreachable"));
  if (selectableCount === 0 && hasProjects)
    return "Every server found is already saved or can't be added yet.";
  return "";
}

/**
 * A 404 or a non-JSON reply means the trusted server predates
 * `GET /api/servers/tailnet` (or something else answered in its place). Say so
 * plainly instead of leaking "unexpected reply".
 */
function outdatedMessage(label: string): string {
  return (
    `${label} is running an older RepoOS that can't list tailnet servers yet. ` +
    "Update RepoOS on that machine, or add servers by URL."
  );
}

/** Normalize a discovered URL for display, allowing `http://` rows so Hub can
 * explain that they need HTTPS. Only `https:` origins are ever selectable. */
function displayUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function nameFor(row: TailnetServer): string {
  const project = row.projectName?.trim();
  if (project) return project;
  const display = row.displayName?.trim();
  if (display) return display;
  if (row.host && row.port) return `${row.host}:${row.port}`;
  return row.host || "RepoOS server";
}

function noteFor(row: TailnetServer, https: boolean, saved: boolean): string | undefined {
  if (row.unreachable) return `Unreachable${row.reason ? ` — ${row.reason}` : ""}`;
  if (!row.url) return "No URL advertised";
  if (!https) return "Needs HTTPS";
  if (saved) return "Already saved";
  if (row.valid === false) return row.staleReason ? `Stale (${row.staleReason})` : "Stale";
  return undefined;
}

/**
 * Merge endpoint rows with the saved list:
 *  - dedupe by normalized base URL (including a Serve path),
 *  - prefer the HTTPS row when a duplicate pair differs only by scheme,
 *  - mark already-saved URLs and keep them visible but not selectable,
 *  - keep unreachable rows visible with their reason (also not selectable).
 *
 * Nothing here saves anything; the caller sends only explicitly selected rows
 * through the existing reachability-gated add flow.
 */
export function mergeTailnetResults(
  rows: TailnetServer[],
  savedServers: Array<Pick<ServerEntry, "url"> & Partial<Pick<ServerEntry, "name">>>,
): DiscoveredServer[] {
  const saved = new Set(
    savedServers
      .map((server) => displayUrl(server.url)?.replace(/^https?:\/\//, ""))
      .filter((url): url is string => !!url),
  );
  const byBaseUrl = new Map<string, DiscoveredServer>();
  const unreachable: DiscoveredServer[] = [];
  const savedByHost = new Map<string, { url: string; name?: string }[]>();
  const savedByName = new Map<string, { url: string; name?: string }[]>();
  const discoveredByName = new Map<string, number>();
  for (const row of rows) {
    if (!row.unreachable && row.projectName?.trim()) {
      const name = row.projectName.trim().toLowerCase();
      discoveredByName.set(name, (discoveredByName.get(name) ?? 0) + 1);
    }
  }
  for (const server of savedServers) {
    try {
      const parsed = new URL(server.url);
      const aliases = [
        parsed.hostname.toLowerCase(),
        parsed.hostname.toLowerCase().split(".")[0] ?? "",
      ];
      for (const alias of aliases.filter(Boolean)) {
        const entries = savedByHost.get(alias) ?? [];
        entries.push({ url: server.url, name: server.name });
        savedByHost.set(alias, entries);
      }
      if (server.name?.trim()) {
        const name = server.name.trim().toLowerCase();
        const entries = savedByName.get(name) ?? [];
        entries.push({ url: server.url, name: server.name });
        savedByName.set(name, entries);
      }
    } catch {
      /* invalid saved entries cannot reconcile a peer */
    }
  }

  for (const row of rows) {
    if (row.unreachable || !row.url) {
      const aliases = [row.host, row.dnsName, row.displayName]
        .filter((value): value is string => !!value)
        .map((value) => value.toLowerCase().replace(/\.$/, ""));
      const projectName = row.projectName?.trim().toLowerCase() ?? "";
      const namedMatches = projectName ? (savedByName.get(projectName) ?? []) : [];
      const savedEntries = aliases.flatMap((alias) => savedByHost.get(alias) ?? []);
      if (
        savedEntries.length === 0 &&
        namedMatches.length === 1 &&
        discoveredByName.get(projectName) === 1
      ) {
        savedEntries.push(...namedMatches);
      }
      if (savedEntries.length) {
        const uniqueSaved = new Map(savedEntries.map((entry) => [entry.url, entry]));
        for (const savedEntry of uniqueSaved.values()) {
          const key = `saved-host:${row.host}:${savedEntry.url}`;
          if (unreachable.some((entry) => entry.key === key)) continue;
          unreachable.push({
            key,
            url: savedEntry.url,
            name: savedEntry.name || nameFor(row),
            host: row.host,
            saved: true,
            https: true,
            selectable: false,
            note: "Already saved",
          });
        }
        continue;
      }
      const key = `unreachable:${row.host}${row.port ? `:${row.port}` : ""}`;
      if (unreachable.some((entry) => entry.key === key)) continue;
      unreachable.push({
        key,
        url: "",
        name: nameFor(row),
        host: row.host,
        port: row.port,
        https: false,
        saved: false,
        selectable: false,
        note: noteFor(row, false, false),
      });
      continue;
    }

    const url = displayUrl(row.url);
    if (!url) {
      const key = `invalid:${row.host}${row.port ? `:${row.port}` : ""}`;
      if (unreachable.some((entry) => entry.key === key)) continue;
      unreachable.push({
        key,
        url: row.url,
        name: nameFor(row),
        host: row.host,
        port: row.port,
        https: false,
        saved: false,
        selectable: false,
        note: "Invalid URL",
      });
      continue;
    }

    // De-dupe on host+port, not scheme: the same server may be advertised once
    // as http and once as https, and only the HTTPS view is usable by Hub.
    const identity = url.replace(/^https?:\/\//, "");
    const https = url.startsWith("https://") && row.https !== false;
    // Serve URLs may use a custom hostname. Match its saved project name only
    // when that name identifies one saved server, avoiding cross-machine hits.
    const namedMatches = row.projectName
      ? (savedByName.get(row.projectName.trim().toLowerCase()) ?? [])
      : [];
    const projectName = row.projectName?.trim().toLowerCase() ?? "";
    const isSaved =
      saved.has(identity) || (namedMatches.length === 1 && discoveredByName.get(projectName) === 1);
    const next: DiscoveredServer = {
      key: url,
      url,
      name: nameFor(row),
      host: row.host,
      port: row.port,
      https,
      saved: isSaved,
      selectable: https && !isSaved,
      note: noteFor(row, https, isSaved),
    };
    const existing = byBaseUrl.get(identity);
    if (!existing) {
      byBaseUrl.set(identity, next);
      continue;
    }
    // A duplicate may be the HTTPS view of a server already seen as HTTP (or
    // vice versa). Keep the HTTPS row rather than whichever came first.
    if (next.https && !existing.https) byBaseUrl.set(identity, next);
  }

  return [...byBaseUrl.values(), ...unreachable];
}

export interface FetchTailnetOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Display name of the trusted server, used in user-facing messages. */
  serverName?: string;
}

/**
 * Ask one trusted server for the RepoOS servers it can see on the tailnet.
 * Uses the normal authenticated `/api/*` route; a refusal is surfaced as a
 * plain message rather than retried or bypassed.
 */
export async function fetchTailnetServers(
  serverUrl: string,
  options: FetchTailnetOptions = {},
): Promise<TailnetFetchResult> {
  const serverBase = serverUrlOf(serverUrl);
  if (!serverBase) {
    return { kind: "error", message: "That server needs an HTTPS URL." };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const label = options.serverName?.trim() || serverBase.replace(/^https:\/\//, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const res = await fetchImpl(`${serverBase}/api/servers/tailnet`, {
      signal: controller.signal,
      // The endpoint is authenticated like every other /api route. `same-origin`
      // sends the platform cookie jar when Hub is served by the same origin
      // (the web build) without making the native shell's cross-origin request
      // credentialed — the server's CORS reply is `*`, which browsers reject
      // for credentialed requests. A native per-server session is story #0304.
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403) {
      return {
        kind: "auth",
        message:
          "This server needs a signed-in session before it can list your tailnet. " +
          "Open the server in a browser, sign in, and use the web Hub from that same origin — " +
          "or add a server manually.",
      };
    }
    if (res.status === 404) {
      return { kind: "outdated", message: outdatedMessage(label) };
    }
    if (!res.ok) {
      return {
        kind: "error",
        message: `The server answered ${res.status}. Add a server manually, or try again later.`,
      };
    }
    const body = (await res.json().catch(() => null)) as TailnetPayload | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { kind: "outdated", message: outdatedMessage(label) };
    }
    if (body.disabled) {
      return {
        kind: "disabled",
        message:
          body.reason ??
          "Tailnet discovery is turned off on this server. Add a server manually instead.",
      };
    }
    return {
      kind: "ok",
      servers: Array.isArray(body.servers) ? body.servers : [],
      tailscaleUnavailable: body.tailscaleUnavailable === true,
      ...(body.tailscaleUnavailable
        ? {
            message:
              body.discoverySource === "configured-hosts"
                ? "This server's Tailscale discovery isn't available; it listed servers from its configured hosts instead."
                : body.discoverySource === "local-only"
                  ? "This server's Tailscale discovery isn't available and it has no configured hosts, so only its local servers were listed."
                  : // Older server: the source is unknowable, so no claim either way.
                    "This server's Tailscale discovery isn't available; it used its configured hosts or listed local servers only.",
          }
        : {}),
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      kind: "error",
      message: aborted
        ? "The server took too long to answer. Try again, or add a server manually."
        : "Couldn't reach that server. Try again, or add a server manually.",
    };
  } finally {
    clearTimeout(timer);
  }
}
