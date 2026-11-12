import { join } from "node:path";
import type { RouteContext, RouteHandler } from "./types.js";
import { readWorktreeReviewLock } from "../worktree-handoff-guard.js";
import { isPostHandoffCheckpointRecoveryActive } from "../post-handoff-checkpoint-recovery.js";
import { json, readBody } from "./utils.js";
import { loadBuildInfo, listDocs, listSkills, repoGuideContext } from "./helpers.js";
import { copyInspectorApiEnabled } from "./copy-inspector.js";
import { sampleSystem } from "../system.js";
import { resolveRepoGuide, REPO_GUIDE_SESSION_ID } from "../agents.js";
import { withPmWorking } from "../pm-runs.js";
import { previewTargetOptions } from "../preview.js";
import { canaryRelPath } from "../../core/canary.js";
import { readCanaryCounter } from "../../core/canary-repo.js";
import { projectDisplayName, projectDisplayBranch } from "../../core/config.js";
import {
  storiesDirOf,
  listStoryDefinitionsFromCommits,
} from "../../core/story-definition-files.js";
import { getGitWorker } from "../git-worker.js";
import { restartCommand } from "../../core/service-manager.js";
import { installRoot, readInstallVersion } from "../../commands/upgrade.js";
import { detectSupervisor } from "../../core/supervisor-detect.js";
import { isNewerVersion } from "../../core/release-version.js";

let idleRestartTimer: ReturnType<typeof setInterval> | null = null;
let idleRestartPending = false;
// Freeze this at module start: the install marker can change during `repoos upgrade`.
const SERVER_RUNNING_VERSION = loadBuildInfo().version;
let installedVersionCache: { value: string | null; expiresAt: number } | null = null;
let supervisedCache: { value: boolean; expiresAt: number } | null = null;

// These will be passed via context in server.ts during integration
let loadedHash: string;
let tunnelReadinessFn: (root: string, port?: number) => Promise<any>;

export function initInfoHandlers(
  hash: string,
  tunnelFn: (root: string, port?: number) => Promise<any>,
) {
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
    projectName: projectDisplayName(ctx.config.root),
    branch: projectDisplayBranch(ctx.config.root),
    taskCount: snap.taskCount,
    workDir: ctx.config.workDir,
    version: build.version,
    buildAt: build.buildAt,
    buildHash: loadedHash,
    // The running server's OWN build (the install the binary was loaded from),
    // not `buildHash` above — that one is the *served repo root's* build, which
    // is null for a project repo (tuk-private #0701). A client (the CLI or the
    // UI) can compare this with its own build to spot a stale server.
    serverVersion: build.version,
    serverBuildHash: build.hash,
    serverBuildAt: build.buildAt,
    buildAvailableHash: parked?.hash ?? null,
    buildAvailableAt: parked?.buildAt ?? null,
    restartNeeded: ctx.reload?.needsRestart ?? false,
    // ISO start time of this serve process, derived from process.uptime(). Lets
    // `repoos status` render uptime from /api/health when the serve lockfile is
    // thin (missing startedAt) — the lockfile stays the primary source.
    serverStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    isPreviewBuild: process.env.REPOOS_PREVIEW_CHILD === "1",
    /** Live engineer turns (#0871). Registry entries carry the same count. */
    activeEngineers: ctx.runner.running().length,
    // What a restart's stop will cancel (#1091) — the CLI warns with these so a
    // real shutdown is never presented as the UI's in-flight-preserving reload.
    // Reviews and previews are killed by a real shutdown; freeform runs and dev
    // targets are durable-ish (re-adopted / restarted), but the count still
    // names what the person is about to interrupt.
    activeReviews: ctx.reviews.runningCount(),
    activeFreeformRuns: ctx.freeformRuns.activeCount(),
    activeDevTargets: ctx.devTargets?.activeCount() ?? 0,
    activePreviews: ctx.previews.runningPreviews().length,
    copyInspectorAvailable: copyInspectorApiEnabled(ctx.config.root),
    canaryCounter: readCanaryCounter(ctx.config.root, ctx.config.cacheDir),
    canaryPath: canaryRelPath(ctx.config.cacheDir),
    // Shown by the UI when this server stops answering (#0959).
    restartCommand: restartCommand(ctx.config.root, req.socket?.localPort ?? null),
    ...(handshake ? { reloadHandshake: true } : {}),
  });
};

export const restart: RouteHandler = async (ctx, req, res) => {
  const reload = ctx.reload;
  const state =
    reload?.requestReload("manual restart", { manual: true }) ??
    ({
      state: "not-stale",
      reason: "auto-reload unavailable",
    } as const);
  return json(res, 200, state);
};

/** Cheap local check for an installed build newer than this process (#1075). */
export const getUpdateStatus: RouteHandler = (ctx, _req, res) => {
  const status = getInstalledUpgradeStatus(ctx);
  const installedVersion = installedVersionCache!.value;
  const runningVersion = SERVER_RUNNING_VERSION;
  return json(res, 200, {
    restartPending: isNewerVersion(installedVersion ?? "", runningVersion),
    restartWhenIdlePending: idleRestartPending,
    runningVersion,
    installedVersion,
    activeWork: status.activeWork,
    supervised: status.supervised,
    manualCommand: status.manualCommand,
  });
};

/** Restart an installed upgrade through its known supervisor (#1075). */
export const restartInstalledUpgrade: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req).catch(() => ({}))) as { whenIdle?: boolean; cancel?: boolean };
  if (body.cancel) {
    idleRestartPending = false;
    if (idleRestartTimer) clearInterval(idleRestartTimer);
    idleRestartTimer = null;
    return json(res, 200, { state: "cancelled" });
  }
  const status = getInstalledUpgradeStatus(ctx);
  if (!status.supervised) return json(res, 409, { state: "manual", command: status.manualCommand });
  if (body.whenIdle) {
    idleRestartPending = true;
    if (!idleRestartTimer) {
      idleRestartTimer = setInterval(() => {
        const active = getInstalledUpgradeStatus(ctx).activeWork;
        if (active.agents || active.checks || ctx.closeOutLock.closingOut()) return;
        idleRestartPending = false;
        if (idleRestartTimer) clearInterval(idleRestartTimer);
        idleRestartTimer = null;
        void performSupervisedRestart(ctx);
      }, 1000);
    }
    return json(res, 202, { state: "waiting-for-idle" });
  }
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ state: "restarting" }));
  setTimeout(() => void performSupervisedRestart(ctx), 100);
};

function getInstalledUpgradeStatus(ctx: RouteContext) {
  const now = Date.now();
  if (!installedVersionCache || installedVersionCache.expiresAt < now)
    installedVersionCache = { value: readInstallVersion(installRoot()), expiresAt: now + 2000 };
  if (!supervisedCache || supervisedCache.expiresAt < now) {
    const supervisor = detectSupervisor(process.pid);
    supervisedCache = {
      value: supervisor.kind === "external" || supervisor.kind === "managed",
      expiresAt: now + 10_000,
    };
  }
  const snapshot = ctx.index.snapshot();
  return {
    manualCommand: restartCommand(ctx.config.root, ctx.servePort ?? null),
    supervised: supervisedCache.value,
    activeWork: {
      agents: ctx.runner.running().length + ctx.reviews.runningCount(),
      checks: ctx.taskChecks
        ? snapshot.tasks.reduce(
            (n, task) => n + ctx.taskChecks!.getRuns(task.id).filter((run) => run.running).length,
            0,
          )
        : 0,
    },
  };
}

async function performSupervisedRestart(ctx: RouteContext): Promise<void> {
  try {
    const { restartRepoServer } = await import("../../core/server-restart.js");
    const result = await restartRepoServer(ctx.config.root, { portFilter: ctx.servePort });
    if (!result.ok)
      ctx.logger.system(
        "error",
        `installed-upgrade restart failed: ${result.message ?? "unknown error"}`,
      );
  } catch (error) {
    ctx.logger.system("error", `installed-upgrade restart failed: ${(error as Error).message}`);
  }
}

export const getCounts: RouteHandler = (ctx, _req, res) => {
  const { index } = ctx;
  return json(res, 200, index.counts());
};

export const getIndex: RouteHandler = async (ctx, _req, res) => {
  const { config, index, reviews, indexReady } = ctx;
  await indexReady;
  const snapshot = index.snapshot();
  const blockers = await getGitWorker(config.root).dependencyBlockers(config.root, snapshot.tasks);
  const withReviewStatus = (t: any) => ({
    ...withPmWorking(t),
    automaticReview: {
      running: reviews.isRunning(t.id),
      enabled: reviews.enabled(),
    },
    worktreeReviewLock: readWorktreeReviewLock(config.root, config.cacheDir, t.id),
    // #0834: a post-handoff checkpoint recovery in flight, so a reload keeps
    // showing it instead of going silent until the next SSE event.
    checkpointRecovery: isPostHandoffCheckpointRecoveryActive(config, t.id),
  });
  return json(res, 200, {
    ...snapshot,
    tasks: snapshot.tasks.map((task) => ({
      ...withReviewStatus(task),
      blockedBy: blockers.get(task.id) ?? [],
    })),
  });
};

/** Lightweight board endpoint — returns only the fields TaskCard.vue needs. */
export const getBoard: RouteHandler = async (ctx, _req, res) => {
  const { config, index, reviews, indexReady } = ctx;
  // A reload handoff spawns the replacement with the listener already accepting
  // connections while the full index build runs in the background (0285). Await
  // boot readiness so a sharp reconnect can never be answered from a stale or
  // partially-built index — the snap must reflect disk before it is served.
  await indexReady;
  const tasks = index.getTasks();
  const worker = getGitWorker(config.root);
  const [blockers, storyDefinitions] = await Promise.all([
    worker.dependencyBlockers(config.root, tasks),
    config.stories?.enabled === true
      ? worker
          .directoryCommits(config.root, storiesDirOf(config))
          .then((commits) => listStoryDefinitionsFromCommits(config, commits))
      : Promise.resolve(undefined),
  ]);
  const snapshot = index.boardSnapshot({ blockers, storyDefinitions });
  const withReviewStatus = (t: any) => ({
    ...withPmWorking(t),
    automaticReview: {
      running: reviews.isRunning(t.id),
      enabled: reviews.enabled(),
    },
    worktreeReviewLock: readWorktreeReviewLock(config.root, config.cacheDir, t.id),
    // #0834: see getIndex — keep the card's recovery hint alive across reloads.
    checkpointRecovery: isPostHandoffCheckpointRecoveryActive(config, t.id),
    // #0379: preview target identity/multiplicity, same as GET /api/tasks/:id.
    previewTargets: previewTargetOptions(config, t),
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

export const getSystem: RouteHandler = async (ctx, _req, res) => {
  const { config, runner } = ctx;
  const stats = await sampleSystem({
    serverPid: process.pid,
    cacheDir: join(config.root, config.cacheDir),
    runningAgents: runner.running(),
    root: config.root,
    config,
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
  return json(res, 200, { ok: true, queued: Boolean((result as any).queued) });
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
