/**
 * Allowlist groups API (#1132).
 *
 * `GET  /api/budget/allowlist-group`            → group, sources, drift, members
 * `POST /api/budget/allowlist-group/pause`      → pause/resume the group + propagate
 * `POST /api/budget/allowlist-group/resync`     → drop local rows that override group rows
 * `POST /api/budget/allowlist-group/apply`      → receiver for a peer's group update
 *
 * The group's state is a machine-local TOML file (never this repo's committed
 * `repoos.toml`). Local writes are merged and immediately adopted by the live
 * config. Remote members are reached over SSH by `propagateAllowlistGroup`; this
 * route never accepts a client-supplied host list, so a caller cannot turn it
 * into an arbitrary remote-exec endpoint.
 *
 * Every route here sits behind the server's normal auth middleware. Cross-host
 * writes use SSH credentials, so there is no unauthenticated write endpoint.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { json, readBody } from "./utils.js";
import type { RouteHandler } from "./types.js";
import { pauseAllowlistEntry, resumeAllowlistEntry } from "../../core/budget-allowlist.js";
import {
  allowlistDrift,
  allowlistSources,
  emptyAllowlistGroup,
  isNewerGroup,
  loadAllowlistGroup,
  mergeAllowlistRows,
  normalizeAllowlistGroupName,
  normalizeAllowlistGroupPayload,
  readAllowlistGroup,
  withGroupMutation,
  writeAllowlistGroup,
  type AllowlistGroup,
} from "../../core/allowlist-groups.js";
import {
  groupMembersFromServers,
  propagateAllowlistGroup,
  type GroupApplyResult,
  type GroupMember,
} from "../../core/allowlist-group-sync.js";
import { allowlistWithoutAutomaticPauses } from "../../core/budget-runtime-state.js";
import { agentModelAllowRows } from "../../core/budget-allowlist.js";
import { applyReloadedConfig, parseFlatToml, patchTomlConfig } from "../../core/config.js";
import {
  configTomlMutationPath,
  configTomlReadPath,
  loadConfigAfterServerWrite,
} from "../preview-config-isolation.js";
import { resolveRemoteHosts } from "../../core/remote-hosts.js";
import { serversSshArgs, type CollectTailnetOptions } from "../../core/tailnet-servers.js";
import { listValidatedServerRegistry } from "../../core/server-registry.js";
import { buildTailnetDiscoveryPayload } from "./servers.js";
import { detectAgents } from "../../core/detect.js";
import { dropTomlTableArray } from "./config.js";
import type { AgentModelAllowRow, RepoOSConfig } from "../../core/types.js";

/** Project's own committed rows (automatic runtime pauses excluded). */
export function readProjectAllowlistRows(root: string, cacheDir?: string): AgentModelAllowRow[] {
  const path = cacheDir ? configTomlReadPath(root, cacheDir) : join(root, "repoos.toml");
  if (!existsSync(path)) return [];
  try {
    const parsed = parseFlatToml(readFileSync(path, "utf8"));
    return allowlistWithoutAutomaticPauses(agentModelAllowRows(parsed["budget.allowlist"]));
  } catch {
    return [];
  }
}

export interface AllowlistGroupState {
  /** True when this project declares a group. */
  enabled: boolean;
  name: string | null;
  /** The machine-local group, absent until it is first written. */
  group: AllowlistGroup | null;
  /** The project's own committed rows. */
  projectRows: AgentModelAllowRow[];
  /** What enforcement actually uses (group base + project overrides). */
  effective: AgentModelAllowRow[];
  /** Where each CLI came from. */
  sources: Record<string, "group" | "project">;
  drift: Array<{ cli: string; detail: string }>;
  /** Members that will be updated, including this machine. */
  members: GroupMember[];
}

function groupNameOf(config: RepoOSConfig): string | undefined {
  return normalizeAllowlistGroupName(config.budget?.allowlistGroup);
}

function describeLocalMembers(
  servers: Awaited<ReturnType<typeof listValidatedServerRegistry>>,
  groupName: string,
): GroupMember[] {
  return servers
    .filter((row) => row.entry.allowlistGroup === groupName)
    .map((row) => ({
      host: "local",
      local: true,
      reachable: row.valid,
      projectName: row.entry.projectName,
      root: row.entry.root,
      port: row.entry.port,
    }));
}

/** Build the group state for the UI, optionally including tailnet discovery. */
export async function buildAllowlistGroupState(
  config: RepoOSConfig,
  deps: {
    discoverRemote?: boolean;
    collect?: CollectTailnetOptions;
    registry?: Awaited<ReturnType<typeof listValidatedServerRegistry>>;
  } = {},
): Promise<AllowlistGroupState> {
  const name = groupNameOf(config);
  const projectRows = readProjectAllowlistRows(config.root, config.cacheDir);
  if (!name) {
    return {
      enabled: false,
      name: null,
      group: null,
      projectRows,
      effective: projectRows,
      sources: {},
      drift: [],
      members: [],
    };
  }
  const loaded = loadAllowlistGroup(name);
  const group = loaded?.group ?? null;
  const groupRows = group?.allowlist ?? [];
  const registry = deps.registry ?? (await listValidatedServerRegistry());
  let members = describeLocalMembers(registry, name);
  if (deps.discoverRemote !== false && config.tailnetDiscovery !== false) {
    const payload = await buildTailnetDiscoveryPayload(config, deps.collect ?? {});
    // `payload.servers` repeats this machine's registry rows; local membership
    // already came from `describeLocalMembers`, so only add remote hosts here.
    members = [
      ...members,
      ...groupMembersFromServers(payload.servers, name).filter((member) => !member.local),
    ];
  }
  return {
    enabled: true,
    name,
    group,
    projectRows,
    effective: mergeAllowlistRows(groupRows, projectRows),
    sources: allowlistSources(groupRows, projectRows),
    drift: allowlistDrift(groupRows, projectRows),
    members,
  };
}

function reloadConfig(ctx: { repoos: { config: RepoOSConfig } }): void {
  const config = ctx.repoos.config;
  applyReloadedConfig(ctx.repoos, loadConfigAfterServerWrite(config.root, config.cacheDir));
}

export const getAllowlistGroup: RouteHandler = async (ctx, req, res) => {
  const url = new URL(req.url ?? "/", "http://local");
  const discoverRemote = url.searchParams.get("members") !== "0";
  return json(res, 200, await buildAllowlistGroupState(ctx.repoos.config, { discoverRemote }));
};

interface PauseBody {
  action?: unknown;
  cli?: unknown;
  model?: unknown;
  until?: unknown;
  reason?: unknown;
  /** Optional subset of member hosts to skip (UI confirmation unchecked rows). */
  skipHosts?: unknown;
  /** Set false to apply only on this machine (no tailnet attempt). */
  propagate?: unknown;
}

/**
 * Pause or resume a group entry on this machine, then push the new group state
 * to every other member. Returns one result per member so the UI can say
 * "applied / unreachable / refused" for each project and host.
 */
export const mutateAllowlistGroup: RouteHandler = async (ctx, req, res) => {
  const config = ctx.repoos.config;
  const name = groupNameOf(config);
  if (!name) {
    return json(res, 400, {
      error:
        "This project is not in an allowlist group. Set budget.allowlistGroup in repoos.toml " +
        "on the Budget Controls tab first.",
    });
  }
  let body: PauseBody;
  try {
    body = (await readBody(req)) as PauseBody;
  } catch {
    return json(res, 400, { error: "invalid JSON body" });
  }
  const action = body.action;
  if (action !== "pause" && action !== "resume" && action !== "add" && action !== "remove") {
    return json(res, 400, {
      error: 'action must be "pause", "resume", "add" or "remove"',
    });
  }
  if (typeof body.cli !== "string" || !body.cli.trim()) {
    return json(res, 400, { error: "cli is required" });
  }
  const projectRows = readProjectAllowlistRows(config.root, config.cacheDir);
  const existing = loadAllowlistGroup(name);
  if (existing?.invalid) {
    return json(res, 409, {
      error: `Allowlist group "${name}" could not be read — fix or remove its group file first`,
    });
  }
  // A missing group file is seeded from the project's current rows so the very
  // first pause still creates the shared state instead of failing.
  const group = existing?.group ?? emptyAllowlistGroup(name, mergeAllowlistRows([], projectRows));
  const target = {
    cli: body.cli.trim(),
    ...(typeof body.model === "string" && body.model.trim() ? { model: body.model.trim() } : {}),
    ...(typeof body.until === "string" && body.until.trim() ? { until: body.until.trim() } : {}),
    ...(typeof body.reason === "string" && body.reason.trim()
      ? { reason: body.reason.trim() }
      : {}),
  };
  let mutation: { rows: AgentModelAllowRow[] } | { error: string };
  if (action === "add" || action === "remove") {
    const model = typeof body.model === "string" ? body.model.trim() : "";
    const existing = group.allowlist.find((row) => row.cli === target.cli);
    if (action === "add" && !model) {
      return json(res, 400, { error: "model is required for add" });
    }
    if (action === "add") {
      mutation = existing
        ? {
            rows: group.allowlist.map((row) =>
              row.cli === target.cli
                ? { ...row, models: [...new Set([...row.models, model])] }
                : row,
            ),
          }
        : { rows: [...group.allowlist, { cli: target.cli, models: [model] }] };
    } else if (!existing) {
      return json(res, 400, { error: `"${target.cli}" is not on allowlist group "${name}"` });
    } else if (!model) {
      // Removing the whole agent from the group.
      mutation = { rows: group.allowlist.filter((row) => row.cli !== target.cli) };
    } else if (!existing.models.includes(model)) {
      return json(res, 400, {
        error: `"${model}" is not an allowed model for "${target.cli}" in group "${name}"`,
      });
    } else {
      const models = existing.models.filter((candidate) => candidate !== model);
      mutation = {
        rows: models.length
          ? group.allowlist.map((row) => (row.cli === target.cli ? { ...row, models } : row))
          : group.allowlist.filter((row) => row.cli !== target.cli),
      };
    }
  } else {
    mutation =
      action === "pause"
        ? pauseAllowlistEntry(group.allowlist, target)
        : resumeAllowlistEntry(group.allowlist, target);
  }
  if ("error" in mutation) return json(res, 400, { error: mutation.error });
  const next = withGroupMutation(group, mutation.rows);
  writeAllowlistGroup(next);
  reloadConfig(ctx);

  const skip = new Set(
    Array.isArray(body.skipHosts)
      ? body.skipHosts.filter((host): host is string => typeof host === "string")
      : [],
  );
  // Remote members are only needed when the change is actually going out; a
  // local-only save (`propagate: false`) must not wait on tailnet discovery.
  const state = await buildAllowlistGroupState(ctx.repoos.config, {
    discoverRemote: body.propagate !== false,
  });
  const members = state.members.filter((member) => !skip.has(member.host));
  let results: GroupApplyResult[] =
    body.propagate === false
      ? members.map((member) => ({ ...member, status: "applied" as const }))
      : await propagateAllowlistGroup(next, members, "local", {
          remoteExec: defaultRemoteExec,
          remoteValidation: config.remoteValidation,
          remoteHosts: resolveRemoteHosts(config.remoteValidation),
          timeoutMs: 10_000,
        });
  if (body.propagate !== false) results = await annotateLogins(results, next);
  return json(res, 200, { ok: true, group: next, results });
};

/** Report CLIs an applied host is not logged in to (credentials are never synced). */
async function annotateLogins(
  results: GroupApplyResult[],
  group: AllowlistGroup,
): Promise<GroupApplyResult[]> {
  if (!group.allowlist.length) return results;
  const wanted = new Set(group.allowlist.map((row) => row.cli));
  let detected: Awaited<ReturnType<typeof detectAgents>>;
  try {
    detected = await detectAgents({ probeAuth: true, versionTimeoutMs: 1200 });
  } catch {
    return results;
  }
  const clis = detected
    .filter((agent) => agent.cli && wanted.has(agent.cli) && agent.auth === false)
    .map((agent) => agent.cli as string);
  if (!clis.length) return results;
  return results.map((result) =>
    result.local && result.status === "applied" ? { ...result, notLoggedIn: clis } : result,
  );
}

const execFileAsync = promisify(execFile);

async function defaultRemoteExec(
  host: string,
  user: string,
  timeoutMs: number,
  command?: string,
): Promise<string> {
  const { stdout } = await execFileAsync("ssh", serversSshArgs(host, user, timeoutMs, command), {
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.toString();
}

/**
 * Re-sync this project to its group: drop the project's own rows for CLIs the
 * group defines, so the effective list is the group's state again. Project-only
 * rows are kept. Returns the drift that was cleared.
 */
export const resyncAllowlistGroup: RouteHandler = async (ctx, _req, res) => {
  const config = ctx.repoos.config;
  const name = groupNameOf(config);
  if (!name) {
    return json(res, 400, { error: "This project is not in an allowlist group" });
  }
  const loaded = loadAllowlistGroup(name);
  if (!loaded?.group || !loaded.group.allowlist.length) {
    return json(res, 400, { error: `Allowlist group "${name}" has nothing to re-sync from yet` });
  }
  const projectRows = readProjectAllowlistRows(config.root, config.cacheDir);
  const groupClis = new Set(loaded.group.allowlist.map((row) => row.cli));
  const kept = projectRows.filter((row) => !groupClis.has(row.cli));
  const mutationPath = configTomlMutationPath(config.root, config.cacheDir);
  const tracked = allowlistWithoutAutomaticPauses(kept);
  if (tracked.length) {
    patchTomlConfig(mutationPath, { "budget.allowlist": tracked });
  } else {
    dropTomlTableArray(mutationPath, "budget.allowlist");
  }
  reloadConfig(ctx);
  return json(res, 200, {
    ok: true,
    removed: [...groupClis].filter((cli) => projectRows.some((row) => row.cli === cli)),
    effective: mergeAllowlistRows(loaded.group.allowlist, kept),
  });
};

interface ApplyBody {
  /** Base64 JSON payload, or the payload object itself for API callers. */
  payloadBase64?: unknown;
  payload?: unknown;
}

export interface GroupApplyResponse {
  ok: true;
  applied: boolean;
  status: "applied" | "refused";
  name: string;
  updatedAt: string;
  reason?: string;
  notLoggedIn?: string[];
}

/**
 * Receiving side of a group update. Newest change wins by `updatedAt` (then
 * `version`); an equal/older state is refused with a readable reason rather
 * than silently overwriting a newer local edit.
 */
export const applyAllowlistGroup: RouteHandler = async (ctx, req, res) => {
  let body: ApplyBody;
  try {
    body = (await readBody(req)) as ApplyBody;
  } catch {
    return json(res, 400, { error: "invalid JSON body" });
  }
  let incomingRaw: unknown = body.payload;
  if (typeof body.payloadBase64 === "string" && body.payloadBase64.trim()) {
    try {
      incomingRaw = JSON.parse(Buffer.from(body.payloadBase64.trim(), "base64").toString("utf8"));
    } catch {
      return json(res, 400, { error: "payloadBase64 is not base64-encoded JSON" });
    }
  }
  const config = ctx.repoos.config;
  const currentName = groupNameOf(config);
  if (!currentName) {
    return json(res, 409, {
      ok: false,
      error: "this project is not in an allowlist group; refusing a group update",
    });
  }
  const rawGroup = (incomingRaw as { group?: Record<string, unknown> } | undefined)?.group;
  const incomingName = normalizeAllowlistGroupName(rawGroup?.name);
  // A member only accepts updates for the group it declares. This is what keeps
  // a tailnet of different companies from leaking into each other.
  if (currentName && incomingName && currentName !== incomingName) {
    return json(res, 409, {
      ok: false,
      error: `this project is in allowlist group "${currentName}", not "${incomingName}"`,
    });
  }
  const incoming = normalizeAllowlistGroupPayload(incomingRaw, currentName);
  if (typeof incoming === "string") return json(res, 400, { error: incoming });

  const currentRead = readAllowlistGroup(incoming.name);
  if (currentRead === "invalid") {
    return json(res, 409, {
      ok: false,
      error: `local allowlist group "${incoming.name}" could not be read; refusing to overwrite it`,
    });
  }
  const current = currentRead ?? null;
  if (!isNewerGroup(incoming, current)) {
    const response: GroupApplyResponse = {
      ok: true,
      applied: false,
      status: "refused",
      name: incoming.name,
      updatedAt: current?.updatedAt ?? incoming.updatedAt,
      reason: "this host already has a newer allowlist-group state",
    };
    return json(res, 200, response);
  }
  writeAllowlistGroup(incoming);
  reloadConfig(ctx);
  const response: GroupApplyResponse = {
    ok: true,
    applied: true,
    status: "applied",
    name: incoming.name,
    updatedAt: incoming.updatedAt,
  };
  return json(res, 200, response);
};
