/** Authenticated, read-only API for the native RepoOS Hub. */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { getAuthStore } from "../../core/auth-store.js";
import {
  capabilityRequestOrigin,
  clampHubTtl,
  createHubCapabilityToken,
  HUB_CAPABILITY_AUDIENCE,
  HUB_CAPABILITY_ISSUED_SCOPES,
  HUB_CAPABILITY_SCOPE_SEARCH,
  HUB_CAPABILITY_SCOPE_SUMMARY,
  HUB_CAPABILITY_VERSION,
  hubCapabilityIncludesScope,
  normalizeHubLabel,
  normalizeHubOrigin,
} from "../../core/hub-capabilities.js";
import {
  clampHubTaskSearchLimit,
  HUB_TASK_SEARCH_MAX_QUERY_LEN,
  HUB_TASK_SEARCH_MIN_QUERY_LEN,
  normalizeHubTaskSearchQuery,
  searchHubTasks,
} from "../../core/hub-task-search.js";
import { getCurrentUser } from "./auth.js";
import { RateLimiter } from "../../core/auth.js";

const summaryRateLimiter = new RateLimiter(60_000, 60);
const taskSearchRateLimiter = new RateLimiter(60_000, 30);

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  return typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : (req.socket.remoteAddress ?? "unknown");
}

/**
 * The native Hub may read its local RepoOS server without a bearer capability.
 * This is deliberately limited to the socket peer, not Host or forwarded
 * headers, so a proxy can never turn a remote request into local access.
 */
function isLoopbackPeer(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress?.toLowerCase() ?? "";
  return address === "::1" || address === "::ffff:127.0.0.1" || address.startsWith("127.");
}

function publicCapability(capability: any) {
  if (!capability) return null;
  const { tokenHash: _tokenHash, ...safe } = capability;
  return safe;
}

function getBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  return /^Bearer\s+(\S+)$/.exec(header)?.[1] ?? null;
}

function userForCapability(
  req: IncomingMessage,
  ctx: Parameters<RouteHandler>[0],
  res: ServerResponse,
) {
  const user = getCurrentUser(req, ctx.config);
  if (!user) {
    json(res, 401, { error: "Authentication required" });
    return null;
  }
  return user;
}

function originForRequest(req: IncomingMessage): string | null {
  return capabilityRequestOrigin(req.headers);
}

function issueCapability(
  store: NonNullable<ReturnType<typeof getAuthStore>>,
  ownerEmail: string,
  origin: string,
  label: string,
  expiresInSeconds: unknown,
) {
  const issued = createHubCapabilityToken();
  const now = new Date();
  const capability = {
    id: `hub_${issued.token.slice(4, 20)}`,
    label,
    ownerEmail,
    tokenHash: issued.tokenHash,
    origin: normalizeHubOrigin(origin)!,
    audience: HUB_CAPABILITY_AUDIENCE,
    scope: HUB_CAPABILITY_ISSUED_SCOPES,
    version: HUB_CAPABILITY_VERSION,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + clampHubTtl(expiresInSeconds) * 1000).toISOString(),
  } as const;
  store.createHubCapability(capability);
  return { capability: { ...capability, revokedAt: null, lastUsedAt: null }, token: issued.token };
}

/** POST /api/auth/hub-capabilities — explicit, one-time token issuance. */
export const createHubCapability: RouteHandler = async (ctx, req, res) => {
  const user = userForCapability(req, ctx, res);
  if (!user) return;
  const origin = originForRequest(req);
  if (!origin) return json(res, 400, { error: "Hub capabilities must be created over HTTPS" });
  const store = getAuthStore(ctx.config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });
  const body = (await readBody(req)) as Record<string, unknown>;
  const label = normalizeHubLabel(body.label);
  if (!label) return json(res, 400, { error: "label must be 1–80 characters" });
  const issued = issueCapability(store, user.email, origin, label, body.expiresInSeconds);
  store.logAudit(
    "hub_capability_created",
    null,
    user.email,
    JSON.stringify({ id: issued.capability.id, label, origin }),
  );
  return json(res, 201, {
    capability: publicCapability(issued.capability),
    token: issued.token,
    warning: "Store this token in the macOS Keychain. It will not be shown again.",
  });
};

/** GET /api/auth/hub-capabilities — metadata only; never returns plaintext. */
export const listHubCapabilities: RouteHandler = (ctx, req, res) => {
  const user = userForCapability(req, ctx, res);
  if (!user) return;
  const store = getAuthStore(ctx.config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });
  return json(res, 200, {
    capabilities: store.listHubCapabilities(user.email).map(publicCapability),
  });
};

export const revokeHubCapability: RouteHandler = (ctx, req, res, params) => {
  const user = userForCapability(req, ctx, res);
  if (!user) return;
  const store = getAuthStore(ctx.config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });
  const existing = store.getHubCapability(params.param1);
  if (!existing || existing.ownerEmail !== user.email)
    return json(res, 404, { error: "Hub capability not found" });
  if (!store.revokeHubCapability(existing.id))
    return json(res, 404, { error: "Hub capability not found" });
  store.logAudit("hub_capability_revoked", null, user.email, JSON.stringify({ id: existing.id }));
  return json(res, 200, { ok: true });
};

/** POST /api/auth/hub-capabilities/:id/rotate — revoke and issue a replacement. */
export const rotateHubCapability: RouteHandler = async (ctx, req, res, params) => {
  const user = userForCapability(req, ctx, res);
  if (!user) return;
  const origin = originForRequest(req);
  if (!origin) return json(res, 400, { error: "Hub capabilities must be rotated over HTTPS" });
  const store = getAuthStore(ctx.config.root);
  if (!store) return json(res, 500, { error: "Auth store unavailable" });
  const existing = store.getHubCapability(params.param1);
  if (!existing || existing.ownerEmail !== user.email)
    return json(res, 404, { error: "Hub capability not found" });
  if (!store.revokeHubCapability(existing.id))
    return json(res, 404, { error: "Hub capability not found" });
  const body = (await readBody(req)) as Record<string, unknown>;
  const replacement = issueCapability(
    store,
    user.email,
    origin,
    normalizeHubLabel(body.label) ?? existing.label,
    body.expiresInSeconds,
  );
  store.logAudit(
    "hub_capability_rotated",
    null,
    user.email,
    JSON.stringify({ revokedId: existing.id, id: replacement.capability.id, origin }),
  );
  return json(res, 201, {
    capability: publicCapability(replacement.capability),
    token: replacement.token,
    warning: "Store this token in the macOS Keychain. It will not be shown again.",
  });
};

function latestActivity(taskTimes: Array<string | null>, agentTimes: string[]): string | null {
  const times = [...taskTimes.filter((value): value is string => Boolean(value)), ...agentTimes];
  return times.length ? (times.sort().at(-1) ?? null) : null;
}

function resolveHubBearerCapability(
  req: IncomingMessage,
  ctx: Parameters<RouteHandler>[0],
  res: ServerResponse,
  requiredScope: string,
) {
  const token = getBearer(req);
  const origin = originForRequest(req);
  const store = getAuthStore(ctx.config.root);
  if (!token || !origin || !store) {
    json(res, 401, { error: "Invalid Hub capability" });
    return null;
  }
  const capability = store.getHubCapabilityByToken(token);
  if (
    !capability ||
    capability.version !== HUB_CAPABILITY_VERSION ||
    capability.audience !== HUB_CAPABILITY_AUDIENCE ||
    capability.origin !== origin ||
    !hubCapabilityIncludesScope(capability.scope, requiredScope)
  ) {
    json(res, 401, { error: "Invalid Hub capability" });
    return null;
  }
  return { capability, store };
}

function resolveHubReadAccess(
  req: IncomingMessage,
  ctx: Parameters<RouteHandler>[0],
  res: ServerResponse,
  requiredScope: string,
) {
  // A bare request is only trusted when the server can prove it arrived over
  // loopback. Remote HTTP/HTTPS callers still require the scoped capability.
  if (!getBearer(req) && isLoopbackPeer(req)) {
    return { capability: null, store: null, rateLimitKey: `loopback:${clientIp(req)}` };
  }
  const resolved = resolveHubBearerCapability(req, ctx, res, requiredScope);
  if (!resolved) return null;
  return { ...resolved, rateLimitKey: `${resolved.capability.id}:${clientIp(req)}` };
}

/** GET /api/hub/v1/summary — compact v1 contract for native clients. */
export const hubSummary: RouteHandler = async (ctx, req, res) => {
  const resolved = resolveHubReadAccess(req, ctx, res, HUB_CAPABILITY_SCOPE_SUMMARY);
  if (!resolved) return;
  const { capability, store } = resolved;
  if (!summaryRateLimiter.tryAcquire(resolved.rateLimitKey)) {
    return json(res, 429, { error: "Too many Hub summary requests", retryAfterSeconds: 60 });
  }
  await ctx.indexReady;
  const tasks = ctx.index.getTasks();
  const running = ctx.runner.running();
  const generatedAt = new Date().toISOString();
  if (capability && store) store.markHubCapabilityUsed(capability.id);
  return json(res, 200, {
    apiVersion: "v1",
    generatedAt,
    lastActivityAt: latestActivity(
      tasks.map((task) => task.updated_at),
      running.map((agent) => agent.startedAt),
    ),
    attention: {
      activeAgents: running.length,
      reviewReadyTasks: tasks.filter((task) => task.status === "review").length,
      needsInputTasks: tasks.filter((task) => task.needsInput).length,
    },
  });
};

/** GET /api/hub/v1/tasks/search?q=… — bounded task lookup for the native Hub palette. */
export const hubTaskSearch: RouteHandler = async (ctx, req, res) => {
  const resolved = resolveHubReadAccess(req, ctx, res, HUB_CAPABILITY_SCOPE_SEARCH);
  if (!resolved) return;
  const { capability, store } = resolved;
  if (!taskSearchRateLimiter.tryAcquire(resolved.rateLimitKey)) {
    return json(res, 429, { error: "Too many Hub task search requests", retryAfterSeconds: 60 });
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  const query = normalizeHubTaskSearchQuery(url.searchParams.get("q") ?? "");
  if (!query) {
    return json(res, 400, {
      error: `Query must be ${HUB_TASK_SEARCH_MIN_QUERY_LEN}–${HUB_TASK_SEARCH_MAX_QUERY_LEN} characters`,
    });
  }
  const limit = clampHubTaskSearchLimit(Number(url.searchParams.get("limit") ?? ""));
  await ctx.indexReady;
  const tasks = ctx.index.getTasks();
  const generatedAt = new Date().toISOString();
  if (capability && store) store.markHubCapabilityUsed(capability.id);
  const results = searchHubTasks(
    query,
    tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      updated_at: task.updated_at,
    })),
    limit,
  );
  return json(res, 200, {
    apiVersion: "v1",
    generatedAt,
    query,
    results,
  });
};
