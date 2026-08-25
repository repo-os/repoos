import { join } from "node:path";
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { loadBuildInfo, listDocs, listSkills, repoGuideContext } from "./helpers.js";
import { sampleSystem } from "../system.js";
import { resolveRepoGuide } from "../agents.js";
import { CANARY_COUNTER } from "../../core/canary.js";

// Must match the id the guide client subscribes to and persists under
// (RepoGuideChat.vue uses "repoos-guide"); a previous refactor drifted this to
// "__repoos-guide__", which hid the guide's running/stop state from the UI.
const REPO_GUIDE_SESSION_ID = "repoos-guide";

// These will be passed via context in server.ts during integration
let loadedHash: string;
let tunnelReadinessFn: (root: string, port?: number) => Promise<any>;

export function initInfoHandlers(hash: string, tunnelFn: (root: string, port?: number) => Promise<any>) {
  loadedHash = hash;
  tunnelReadinessFn = tunnelFn;
}

export const health: RouteHandler = (ctx, req, res) => {
  const { index } = ctx;
  const url = new URL(req.url ?? "/", "http://localhost");
  const snap = index.snapshot();
  const build = loadBuildInfo();
  const secret = process.env.REPOOS_RELOAD_SECRET;
  const handshake =
    typeof secret === "string" && secret !== "" && url.searchParams.get("reload") === secret;
  // A build parked by a close-out (0143). Exposing it on /api/health gives a
  // (re)connecting UI a reliable reconcile path that does not depend on the
  // one-shot build.available SSE event arriving while it was connected.
  const parked = ctx.reload?.buildAvailable ?? null;
  return json(res, 200, {
    ok: true,
    root: ctx.config.root,
    taskCount: snap.taskCount,
    workDir: ctx.config.workDir,
    version: build.version,
    buildAt: build.buildAt,
    buildHash: loadedHash,
    buildAvailableHash: parked?.hash ?? null,
    buildAvailableAt: parked?.buildAt ?? null,
    isPreviewBuild: process.env.REPOOS_PREVIEW_CHILD === "1",
    canaryCounter: CANARY_COUNTER,
    ...(handshake ? { reloadHandshake: true } : {}),
  });
};

export const restart: RouteHandler = (ctx, _req, res) => {
  const reload = ctx.reload;
  const state =
    reload?.requestReload("manual restart", { manual: true }) ??
    ({
      state: "not-stale",
      reason: "auto-reload unavailable",
    } as const);
  return json(res, 200, state);
};

export const getCounts: RouteHandler = (ctx, _req, res) => {
  const { index } = ctx;
  return json(res, 200, index.counts());
};

export const getIndex: RouteHandler = async (ctx, _req, res) => {
  const { index, reviews, indexReady } = ctx;
  await indexReady;
  const snapshot = index.snapshot();
  const withReviewStatus = (t: any) => ({
    ...t,
    automaticReview: {
      running: reviews.isRunning(t.id),
      enabled: reviews.enabled(),
    },
  });
  return json(res, 200, {
    ...snapshot,
    tasks: snapshot.tasks.map(withReviewStatus),
  });
};

/** Lightweight board endpoint — returns only the fields TaskCard.vue needs. */
export const getBoard: RouteHandler = async (ctx, _req, res) => {
  const { index, reviews, indexReady } = ctx;
  // A reload handoff spawns the replacement with the listener already accepting
  // connections while the full index build runs in the background (0285). Await
  // boot readiness so a sharp reconnect can never be answered from a stale or
  // partially-built index — the snap must reflect disk before it is served.
  await indexReady;
  const snapshot = index.boardSnapshot();
  const withReviewStatus = (t: any) => ({
    ...t,
    automaticReview: {
      running: reviews.isRunning(t.id),
      enabled: reviews.enabled(),
    },
  });
  return json(res, 200, {
    ...snapshot,
    tasks: snapshot.tasks.map(withReviewStatus),
  });
};

export const getDocs: RouteHandler = (ctx, _req, res) => {
  const { config } = ctx;
  return json(res, 200, listDocs(config));
};

export const getSkills: RouteHandler = (ctx, _req, res) => {
  const { config } = ctx;
  return json(res, 200, listSkills(config));
};

export const getSystem: RouteHandler = (ctx, _req, res) => {
  const { config, runner } = ctx;
  const stats = sampleSystem({
    serverPid: process.pid,
    cacheDir: join(config.root, config.cacheDir),
    runningAgents: runner.running(),
  });
  return json(res, 200, stats);
};

export const getTunnelStatus: RouteHandler = async (ctx, req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const rawPort = url.searchParams.get("port");
  const port = rawPort ? Number(rawPort) : undefined;
  if (rawPort) {
    if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
      return json(res, 400, { error: "port must be an integer from 1 to 65535" });
    }
  }
  return json(res, 200, await tunnelReadinessFn(ctx.config.root, port));
};

export const getChat: RouteHandler = (ctx, _req, res) => {
  const { config, runner } = ctx;
  const agent = resolveRepoGuide(config);
  const session = runner.output(REPO_GUIDE_SESSION_ID);
  return json(res, 200, {
    ok: true,
    agent,
    enabled: Boolean(agent?.enabled),
    lines: session?.lines ?? [],
    running: runner.isRunning(REPO_GUIDE_SESSION_ID),
    stats: runner.stats(REPO_GUIDE_SESSION_ID),
  });
};

export const sendChatMessage: RouteHandler = async (ctx, req, res) => {
  const { config, index, runner } = ctx;
  const agent = resolveRepoGuide(config);
  if (!agent) {
    return json(res, 400, {
      error: "Ross is disabled — enable it on the Agents page to chat",
    });
  }
  const body = (await readBody(req)) as { text?: unknown };
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return json(res, 400, { error: "message text is required" });

  const context = repoGuideContext(config, index.getTasks());
  const existing = runner.output(REPO_GUIDE_SESSION_ID);
  const result = existing
    ? runner.send(REPO_GUIDE_SESSION_ID, text, agent, {
        resumePreamble: `Updated repository context:\n${context}`,
      })
    : (runner as any).startChat(REPO_GUIDE_SESSION_ID, text, agent, context);
  if (!result.ok && (result as any).busy) {
    return json(res, 409, { error: result.reason ?? "Ross is busy" });
  }
  if (!result.ok) {
    return json(res, 400, { error: result.reason ?? "could not send message" });
  }
  return json(res, 200, { ok: true });
};

/** Interrupt a running RepoOS guide (Ross) response. Idempotent. */
export const interruptChatMessage: RouteHandler = (ctx, _req, res) => {
  const result = ctx.runner.interrupt(REPO_GUIDE_SESSION_ID);
  return json(res, 200, { ok: true, ...result });
};

export const getSystemLogs: RouteHandler = (ctx, _req, res) => {
  const { logger } = ctx;
  const limit = 1000;
  const logs = logger.getSystemLogs(limit);
  return json(res, 200, { ok: true, logs });
};
