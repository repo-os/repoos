/**
 * Tailnet propagation for allowlist groups (#1132).
 *
 * A group's state is machine-local; a pause must reach every member on every
 * machine. Group members are found with the same trusted path #1127 added:
 * `repoos servers --json` on each tailnet peer over SSH. Only rows that declare
 * the SAME group name are members — the tailnet is never one shared group.
 *
 * Writes travel over SSH, not an unauthenticated HTTP endpoint. SSH is the
 * credential the discovery path already uses (`BatchMode=yes`, the configured
 * remote user/key), and `repoos allowlist group apply` on the receiving host
 * performs the last-writer-wins merge itself. No git is pushed and no other
 * repo's committed files are edited: the receiver only writes its own
 * `~/.config/repoos/allowlist-groups/<name>.toml`.
 */
import { remoteHostUser } from "./remote-hosts.js";
import type { AllowlistGroup } from "./allowlist-groups.js";
import type { RemoteExec, ListedServer } from "./tailnet-servers.js";
import type { RemoteValidationConfig, RemoteValidationHost } from "./types.js";

/** How one member answered a propagation attempt. */
export type GroupApplyStatus = "applied" | "unreachable" | "refused";

/** A project that declares the same allowlist group. */
export interface GroupMember {
  /** Tailnet host name, or `local` for this machine. */
  host: string;
  projectName?: string;
  root?: string;
  port?: number;
  /** True for a server on the machine doing the propagating. */
  local: boolean;
  /** False when discovery could not reach the host (it then has no group data). */
  reachable: boolean;
}

export interface GroupApplyResult extends GroupMember {
  status: GroupApplyStatus;
  /** Short human-readable reason for `unreachable`/`refused`. */
  reason?: string;
  /** Allowed CLIs the host is not logged in to (never synced, only reported). */
  notLoggedIn?: string[];
}

/**
 * Filter discovered servers down to members of `groupName`. Unreachable hosts
 * carry no group declaration and are NOT members — we cannot know their group,
 * so a change must never be pushed to them.
 */
export function groupMembersFromServers(servers: ListedServer[], groupName: string): GroupMember[] {
  const members: GroupMember[] = [];
  for (const server of servers) {
    if (server.unreachable) continue;
    if (server.allowlistGroup !== groupName) continue;
    const host = typeof server.host === "string" && server.host ? server.host : "local";
    members.push({
      host,
      local: host === "local",
      reachable: true,
      ...(typeof server.projectName === "string" ? { projectName: server.projectName } : {}),
      ...(typeof server.root === "string" ? { root: server.root } : {}),
      ...(typeof server.port === "number" ? { port: server.port } : {}),
    });
  }
  return members;
}

/** The payload the receiving CLI merges (never contains a credential). */
export interface GroupApplyPayload {
  group: AllowlistGroup;
  /** Host the change came from, for the receiver's log/result. */
  originHost?: string;
}

/** Base64-encode a JSON payload safely for one SSH command argument. */
export function encodeGroupApplyPayload(payload: GroupApplyPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

/** Single-quote a path for the remote shell. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The command a peer runs to apply a group payload. It `cd`s to the member's
 * repo root so the receiver can verify that *this* project declares the group
 * before writing the machine-local file (an SSH login shell starts in $HOME).
 */
export function groupApplyCommand(
  payload: GroupApplyPayload,
  checkLogins = true,
  repoRoot?: string,
): string {
  const b64 = encodeGroupApplyPayload(payload);
  const prefix = repoRoot ? `cd ${shellQuote(repoRoot)} && ` : "";
  return `${prefix}repoos allowlist group apply --json --payload-base64 ${b64}${
    checkLogins ? " --check-logins" : ""
  }`;
}

/** Parse the receiver's JSON. Returns null on anything unparseable. */
export function parseGroupApplyOutput(
  stdout: string,
): { applied: boolean; status?: GroupApplyStatus; reason?: string; notLoggedIn?: string[] } | null {
  const text = stdout.trim();
  if (!text) return null;
  // Tolerate a banner line before the JSON object (a login shell may print one).
  const start = text.indexOf("{");
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(text.slice(start)) as Record<string, unknown>;
    const applied = parsed.applied === true;
    const status =
      parsed.status === "applied" || parsed.status === "refused" || parsed.status === "unreachable"
        ? parsed.status
        : undefined;
    return {
      applied,
      ...(status ? { status } : {}),
      ...(typeof parsed.reason === "string" && parsed.reason ? { reason: parsed.reason } : {}),
      ...(Array.isArray(parsed.notLoggedIn)
        ? {
            notLoggedIn: parsed.notLoggedIn
              .map((item) =>
                typeof item === "string" ? item : String((item as { cli?: unknown })?.cli ?? ""),
              )
              .filter(Boolean),
          }
        : {}),
    };
  } catch {
    return null;
  }
}

/** Classify an SSH/exec failure: transport problems are unreachable, the rest refused. */
export function classifyGroupApplyFailure(error: unknown): GroupApplyStatus {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /ssh:|connect|could not resolve|permission denied|no route|timed? ?out|timeout|network is unreachable|connection (?:refused|closed|reset)/i.test(
      message,
    )
  ) {
    return "unreachable";
  }
  return "refused";
}

export interface PropagateOptions {
  /** Injectable SSH seam; tests never hit the network. */
  remoteExec: RemoteExec;
  remoteValidation?: RemoteValidationConfig;
  remoteHosts?: RemoteValidationHost[];
  /** Per-host command budget. */
  timeoutMs?: number;
  now?: () => number;
  /** Skip login probing (tests, or a caller that only cares about the write). */
  checkLogins?: boolean;
}

/** Run `fn` for every item with a hard per-item timeout. */
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), Math.max(0, ms));
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Push a group state to every reachable non-local member and report each
 * member's outcome. Local members are reported `applied` without a write: they
 * share this machine's group file, and their config watcher picks it up.
 */
export async function propagateAllowlistGroup(
  group: AllowlistGroup,
  members: GroupMember[],
  originHost: string,
  options: PropagateOptions,
): Promise<GroupApplyResult[]> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const hosts = new Map((options.remoteHosts ?? []).map((host) => [host.host, host]));
  const payload: GroupApplyPayload = { group, originHost };
  return Promise.all(
    members.map(async (member): Promise<GroupApplyResult> => {
      if (member.local) return { ...member, status: "applied" };
      const hostConfig = hosts.get(member.host) ?? { host: member.host };
      const user = options.remoteValidation
        ? remoteHostUser(options.remoteValidation, hostConfig)
        : hostConfig.user?.trim() || "root";
      const command = groupApplyCommand(payload, options.checkLogins !== false, member.root);
      try {
        const stdout = await withTimeout(
          options.remoteExec(member.host, user, timeoutMs, command),
          timeoutMs,
          "",
        );
        const parsed = parseGroupApplyOutput(stdout);
        if (!parsed) {
          return {
            ...member,
            status: "unreachable",
            reason: "no response from the remote RepoOS CLI",
          };
        }
        if (parsed.applied) {
          return {
            ...member,
            status: "applied",
            ...(parsed.notLoggedIn?.length ? { notLoggedIn: parsed.notLoggedIn } : {}),
          };
        }
        return {
          ...member,
          status: parsed.status === "unreachable" ? "unreachable" : "refused",
          reason: parsed.reason ?? "the remote host refused the update",
        };
      } catch (error) {
        const status = classifyGroupApplyFailure(error);
        return {
          ...member,
          status,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}
