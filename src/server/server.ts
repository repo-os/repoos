/**
 * The RepoOS local server. Dependency-free: built on the Node/Bun `http`
 * module (Bun implements the same API, so this runs unchanged on both).
 *
 * It is a thin TRANSPORT over the LiveIndex + safe writers. No business logic
 * lives here that isn't already in core. Endpoints:
 *
 *   GET  /api/health           -> { ok, root, taskCount, workDir, version, buildAt }
 *                                (?reload=<secret> replies with reloadHandshake for a
 *                                 reload replacement's readiness probe)
 *   POST /api/server/restart   -> trigger the auto-reload path (see server/reload.ts);
 *                                returns { state: "reloading" | "deferred" | "not-stale" }
 *   GET  /api/tasks            -> Task[]            (?status=active to filter)
 *   GET  /api/tasks/:id        -> Task | 404  (includes `preview` when running)
 *   GET  /api/tasks/:id/stats  -> { ok, stats } task's historical session stats
 *   GET  /api/counts           -> { inbox, ready, ... }
 *   GET  /api/index            -> full RepoIndex snapshot
 *   GET  /api/stats/board      -> { ok, stats } board-level summary stats
 *   GET  /api/stats/by-type    -> { ok, stats } session stats grouped by type
 *   GET  /api/docs             -> [{ path, title }]  (context docs listing)
 *   POST /api/docs/create      -> create a document { path, content }; returns { ok, path }
 *   POST /api/docs/freeform    -> create a document from description via the PM agent; returns { ok, path }
 *   GET  /api/skills           -> [{ path, name, description }]  (skills listing)
 *   GET  /api/chat             -> RepoOS Guide identity, transcript, and running state
 *   POST /api/chat/message     -> start or continue the persistent repository chat
 *   POST /api/tasks            -> create  { title, type?, area?, priority?, assignedTo? }
 *   POST /api/tasks/freeform   -> create from a freeform explanation via the PM agent
 *   PATCH/api/tasks/:id        -> patch   { status?, title?, ... }
 *   POST /api/tasks/:id/start  -> launch the engineer agent on the task (ready -> active);
 *                                also relaunches a paused active task (stays active)
 *   POST /api/tasks/:id/pause  -> stop the running agent; task stays active
 *   POST /api/tasks/:id/message -> send a follow-up to the task's agent session (active, review)
 *   POST /api/tasks/:id/pm/message -> send a message to the PM agent about this task
 *   GET  /api/tasks/:id/output -> { lines, stats } the retained transcript + live run stats (0080)
 *   GET  /api/tasks/:id/review -> { ok, running, enabled, review, lines } the agent's
 *                                 review report + reviewer conversation for a task in `review`
 *   POST /api/tasks/:id/review/again   -> start a fresh review run against the current worktree
 *   POST /api/tasks/:id/review/message -> send a follow-up to the reviewer (its own session)
 *   DELETE /api/tasks/:id      -> remove  the task file (emits task.deleted)
 *   POST /api/tasks/:id/preview       -> start a read-only preview of the task's worktree
 *   POST /api/tasks/:id/preview/stop  -> stop it (also DELETE /preview)
 *   POST /api/tasks/:id/attachments   -> attach a screenshot { name, mime, data(base64) };
 *                                        records a `## Screenshots` section in the task body
 *   GET  /api/tasks/:id/attachments/:file -> serve a stored screenshot image
 *   GET  /api/agents/running   -> [{ id, pid, startedAt }] running agents
 *   GET  /api/agents/detect    -> { agents: [{ id, name, binary, installed, path, version, headless, drivable, installHint }] }
 *   GET  /api/supervisor/status -> { ok, enabled, mode, latestHeartbeat } supervisor status
 *   GET  /api/supervisor/heartbeats -> { ok, heartbeats } recent supervisor heartbeats
 *   POST /api/supervisor/check-now -> { ok } run a supervisor check immediately
 *   GET  /api/events           -> SSE stream of RepoEvent
 *
 * The SSE stream is the live heartbeat the Stage 3 UI subscribes to.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync, accessSync, constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { connect } from "node:net";
import { extname, join, dirname, resolve, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Agent, RepoOSConfig, SkillMeta, Status, Task } from "../core/types.js";
import { STATUSES } from "../core/types.js";
import { readBuildStamp } from "../core/build.js";
import { createRepoOS } from "../core/repoos.js";
import { detectAgents, type DetectedAgent } from "../core/detect.js";
import { listModelSources, type ModelSourceResult } from "../core/models.js";
import { createLogger, type Logger } from "../core/logger.js";
import {
  AGENT_CLIS,
  AGENT_MODELS,
  DEFAULT_AGENTS,
  agentsForConfig,
  getConfigSchema,
  patchTomlConfig,
  loadConfig,
  sanitizeBuiltInAgents,
  saveBuiltInAgentsConfig,
} from "../core/config.js";
import {
  ensureWorktree,
  commitTaskFile,
  resetWorktree,
  syncBranchWithMain,
  worktreePathForBranch,
} from "../core/git.js";
import { runBuiltInAgent, isDueForScheduledRun } from "./built-in-agents.js";
import { LiveIndex, type RepoEvent } from "./live-index.js";
import { WorkWatcher } from "./watcher.js";
import {
  patchTaskFile,
  deleteTaskFile,
  WriteError,
  PathGuardError,
  type TaskPatch,
} from "./write.js";
import { renderInstanceIcon } from "./icons.js";
import {
  AgentRunner,
  deriveBranch,
  resolveEngineer,
  resolvePmAgent,
  resolveAgentForTask,
  resolveRepoGuide,
  runPrompt,
} from "./agents.js";
import { parseGeneratedTask, pmPrompt, explanationTitle } from "./freeform.js";
import { completeTask, type DoneStep, type CloseOutLock } from "./done.js";
import { createJobCoordinator, type JobCoordinator } from "./integration-job.js";
import { CloseOutOrchestrator } from "./integration-orchestrator.js";
import { buildIntegrationSnapshot } from "./integration-status.js";
import { createRepositoryLock, createRootLock } from "./repo-lock.js";
import { handoffTask, scheduleCheckFailureRetry } from "./handoff.js";
import { guardReviewTransition } from "./review-guard.js";
import { PreviewManager, probePreview } from "./preview.js";
import { ReviewManager } from "./review.js";
import { CTOManager } from "./cto.js";
import { CTOMonitor } from "./cto-monitor.js";
import {
  appendScreenshotsSection,
  mimeForExtension,
  resolveScreenshot,
  saveScreenshot,
} from "./attachments.js";
import { ReloadManager, readBuildHash, isDevBuild } from "./reload.js";
import { ServeReaper } from "./serve-reaper.js";
import { testModelCombination } from "./model-test.js";
import { bootstrap } from "../core/bootstrap.js";
import { generateContextPack, resumePreamble } from "../core/context-pack.js";
import { sampleSystem, psAvailable, reapStrayServeProcesses, type SystemStats } from "./system.js";
import { readTunnelConfig, writeTunnelConfig } from "../core/tunnel.js";
import { notifyStatusChange, notifyTaskCreated, notifyNeedsInput, publish, ntfyBaseUrl } from "./ntfy.js";
import { AgentSupervisor } from "./supervisor.js";
import { TaskWatchdog } from "./task-watchdog.js";
import { parseCookies, SESSION_COOKIE_NAME, randomHex } from "../core/auth.js";
import { getAuthStore } from "../core/auth-store.js";
import {
  Router,
  type RouteContext,
  // Info routes
  health,
  restart,
  getCounts,
  getIndex,
  getBoard,
  getDocs,
  getSkills,
  getSystem,
  getSystemLogs,
  getTunnelStatus,
  getChat,
  sendChatMessage,
  initInfoHandlers,
  getDebugger,
  sendDebuggerMessage,
  repairWithDebugger,
  // Docs routes
  createDoc,
  createFreeformDoc,
  // Tasks routes
  getTasks,
  createTask,
  createFreeformTask,
  getTask,
  patchTask,
  deleteTask,
  getTaskOutput,
  getTaskLogs,
  getTaskStats,
  getSessionTypeStats,
  getBoardStats,
  getDailyTotals,
  getDiffStatsForTask,
  getDiffForTask,
  taskAction,
  getIntegrationJob,
  getIntegrationJobs,
  getIntegrationPipeline,
  retryIntegration,
  startPreview,
  stopPreview,
  getTaskReview,
  reviewAgain,
  reviewMessage,
  getCTO,
  ctoMessage,
  pmMessage,
  getScreenshot,
  uploadScreenshot,
  // Config routes
  readConfig,
  patchConfig,
  // Models routes
  listModels,
  testModel,
  // Agents routes
  runningAgents,
  detectInstalledAgents,
  getAgentLogs,
  // Notifications
  testNotification,
  // Transcription
  transcribe,
  // UI routes
  serveManifest,
  serveIcon,
  setIconRenderer,
  // Auth routes
  authStatus,
  bootstrapAdmin,
  requestOtp,
  verifyOtp,
  googleLogin,
  googleCallback,
  authMe,
  authLogout,
  listUsers,
  addUser,
  deleteUser,
  updateUserRole,
  getAuditLog,
} from "./routes/index.js";

function findCloudflared(): string | null {
  for (const dir of (process.env.PATH ?? "").split(":").filter(Boolean)) {
    const candidate = join(dir, "cloudflared");
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* next PATH entry */
    }
  }
  return null;
}

function storedCloudflareToken(): boolean {
  if (process.env.CLOUDFLARE_API_TOKEN?.trim()) return true;
  try {
    if (process.platform === "darwin") {
      return (
        execFileSync(
          "security",
          ["find-generic-password", "-a", "repoos", "-s", "repoos:cloudflare-token", "-w"],
          { encoding: "utf8", timeout: 2000 },
        ).trim().length > 0
      );
    }
    if (process.platform === "linux") {
      return (
        execFileSync(
          "secret-tool",
          ["lookup", "service", "repoos:cloudflare-token", "user", "repoos"],
          { encoding: "utf8", timeout: 2000 },
        ).trim().length > 0
      );
    }
  } catch {
    /* unavailable or not stored */
  }
  return false;
}

const REPO_GUIDE_SESSION_ID = "repoos-guide";

/** Compact live context for the guide; detailed answers can read the listed files. */
function repoGuideContext(config: RepoOSConfig, tasks: Task[]): string {
  const counts = new Map<string, number>();
  for (const task of tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
  const statusSummary = STATUSES.map((status) => `${status}: ${counts.get(status) ?? 0}`).join(", ");
  const taskSummary = tasks
    .map(
      (task) =>
        `- #${task.id} [${task.status}] ${task.title} (type: ${task.type}, priority: ${task.priority}, area: ${task.area || "unspecified"}, file: ${task.path})`,
    )
    .join("\n");
  const docs = listDocs(config)
    .map((doc) => `- ${doc.title} (${doc.path})`)
    .join("\n");
  return `Repository: ${basename(config.root)}\nRoot: ${config.root}\nTask counts: ${statusSummary}\n\nTasks:\n${taskSummary || "- none"}\n\nContext documents:\n${docs || "- none"}`;
}

function tunnelProcessRunning(): boolean {
  try {
    return (
      execFileSync("pgrep", ["-f", "cloudflared.*tunnel.*run"], {
        encoding: "utf8",
        timeout: 2000,
      }).trim() !== ""
    );
  } catch {
    return false;
  }
}

function usableOriginCertificate(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const pem = readFileSync(path, "utf8");
    return /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(pem);
  } catch {
    return false;
  }
}

function serviceRunning(): boolean {
  try {
    if (process.platform === "darwin") {
      const out = execFileSync("launchctl", ["list"], { encoding: "utf8", timeout: 2000 });
      return out
        .split("\n")
        .some((line) => line.includes("com.cloudflare.cloudflared") && /^\s*\d+\s+/.test(line));
    }
    if (process.platform === "linux")
      return (
        execFileSync("systemctl", ["is-active", "cloudflared"], {
          encoding: "utf8",
          timeout: 2000,
        }).trim() === "active"
      );
  } catch {
    /* service manager unavailable */
  }
  return false;
}

function portListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const finish = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(800, () => finish(false));
  });
}

async function tunnelReadiness(root: string, port?: number) {
  const tunnel = readTunnelConfig(root);
  const bin = findCloudflared();
  let version: string | null = null;
  if (bin) {
    try {
      version =
        execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 3000 })
          .trim()
          .split("\n")[0] || null;
    } catch {
      /* installed but unavailable */
    }
  }
  const certPath = join(homedir(), ".cloudflared", "cert.pem");
  const originCertificate = {
    present: existsSync(certPath),
    usable: usableOriginCertificate(certPath),
  };
  const originListening =
    typeof port === "number" && Number.isInteger(port) ? await portListening(port) : null;
  return {
    cloudflared: { installed: !!bin, version },
    originCertificate,
    apiTokenStored: storedCloudflareToken(),
    configured: {
      tunnelName: tunnel.tunnelId ? tunnel.name : null,
      tunnelId: tunnel.tunnelId || null,
      baseDomain: tunnel.domain || null,
    },
    localOrigin: { port: port ?? null, listening: originListening },
    running: tunnelProcessRunning() || serviceRunning(),
    publishedHostnames: Object.values(tunnel.apps)
      .map((app) => app.hostname)
      .sort(),
    checkedAt: new Date().toISOString(),
  };
}

export interface ServeOptions {
  root?: string;
  port?: number;
  host?: string;
  /**
   * True when this process is a reload replacement (REPOOS_RELOAD=1): retry
   * EADDRINUSE until the old process releases the port, instead of failing.
   */
  reloadReplacement?: boolean;
  /**
   * Force auth off for this instance regardless of [auth] in repoos.toml.
   * For ephemeral in-process servers (the UI smoke gate) that test generic
   * rendering, not auth flows — a project with real auth enabled must not
   * make `repoos check` itself unable to reach the dashboard.
   */
  disableAuth?: boolean;
}

/**
 * Only a long-lived control-plane server may sweep machine-wide serve
 * processes. Preview children deliberately run the same CLI on an ephemeral
 * port, but must never classify their parent control plane (often detached
 * with PPID 1 after a nohup/reload handoff) as an orphan and terminate it.
 * Likewise, in-process test servers use port 0 and are never supervisors.
 */
export function shouldReapStrayServeProcesses(
  opts: Pick<ServeOptions, "port">,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.REPOOS_PREVIEW_CHILD !== "1" && opts.port !== 0;
}

export interface ServerHandle {
  url: string;
  port: number;
  close: (reason?: string) => Promise<void>;
  index: LiveIndex;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

/** List context docs (markdown under docsDir + root-level AGENTS/CLAUDE). */
function listDocs(config: RepoOSConfig): { path: string; title: string }[] {
  const out: { path: string; title: string }[] = [];
  const seen = new Set<string>();
  const add = (abs: string, rel: string) => {
    if (seen.has(rel) || !existsSync(abs)) return;
    seen.add(rel);
    let title = rel;
    try {
      const m = readFileSync(abs, "utf8").match(/^\s*#\s+(.+)$/m);
      if (m) title = m[1].trim();
    } catch {
      /* ignore */
    }
    out.push({ path: rel, title });
  };
  for (const name of ["AGENTS.md", "CLAUDE.md", "README.md"]) {
    add(join(config.root, name), name);
  }
  const docsPath = join(config.root, config.docsDir);
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      if (e.startsWith(".")) continue;
      const full = join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (extname(e) === ".md") {
        const rel = full
          .slice(config.root.length + 1)
          .split("\\")
          .join("/");
        add(full, rel);
      }
    }
  };
  walk(docsPath);
  return out;
}

/** Read a field from a skill file's `---` frontmatter block, or null. */
function skillField(text: string, field: string): string | null {
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const m = fm[1].match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * List repo skills: each is `skills/<name>/SKILL.md` with optional frontmatter
 * (`name`, `description`). Malformed or unreadable skills are skipped, never
 * fatal — a repo with no skills dir yields an empty list.
 */
function listSkills(config: RepoOSConfig): SkillMeta[] {
  const out: SkillMeta[] = [];
  const skillsPath = join(config.root, config.skillsDir);
  if (!existsSync(skillsPath)) return out;
  for (const e of readdirSync(skillsPath)) {
    if (e.startsWith(".")) continue;
    const dir = join(skillsPath, e);
    if (!statSync(dir).isDirectory()) continue;
    const file = join(dir, "SKILL.md");
    if (!existsSync(file)) continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    out.push({
      path: `${config.skillsDir.split("\\").join("/")}/${e}/SKILL.md`,
      name: skillField(text, "name") ?? e,
      description: skillField(text, "description") ?? "",
    });
  }
  return out;
}

/**
 * Resolve the package root (the dir containing package.json) relative to the
 * running module — works from both dist/ (compiled) and src/ (dev mode).
 */
function findPackageRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/server or src/server
  const grandparent = dirname(dirname(here));
  if (existsSync(join(grandparent, "package.json"))) return grandparent;
  const great = dirname(grandparent);
  if (existsSync(join(great, "package.json"))) return great;
  return null;
}

/**
 * Absolute path of the compiled CLI entrypoint, so the reload manager can spawn
 * a replacement `repoos serve` process. Same resolution as preview.ts.
 */
function cliEntryPath(): string | null {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/server or src/server
  const candidates = [
    join(here, "..", "cli", "index.js"), // compiled: dist/cli/index.js
    join(here, "..", "..", "dist", "cli", "index.js"), // dev: repo-root dist
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** How long a reload replacement retries EADDRINUSE before giving up. */
const RELOAD_BIND_TIMEOUT_MS = 40_000;
const RELOAD_BIND_RETRY_MS = 300;

/**
 * Build metadata served to the UI: the package version and the timestamp of
 * the last build (dist/.build-stamp.json, written by scripts/copy-assets.mjs).
 * Both are best-effort — null when unavailable so the UI can fall back.
 */
function loadBuildInfo(): { version: string | null; buildAt: string | null } {
  const root = findPackageRoot();
  if (!root) return { version: null, buildAt: null };
  let version: string | null = null;
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (typeof pkg?.version === "string") version = pkg.version;
  } catch {
    /* package.json unreadable */
  }
  // The timestamp lives in dist/.build-stamp.json (gitignored) so the hash
  // marker stays deterministic; readBuildStamp falls back to the legacy
  // inline field for installs built before the split.
  return { version, buildAt: readBuildStamp(root) };
}

/**
 * Locate the bundled UI directory (Vite build output). Prefers the resolved
 * repo root's `dist/ui` so a `bun link` install run from a worktree serves
 * that worktree's own build, not the linked package's stale dist. Falls back
 * to the import.meta.url candidates (compiled dist/ui and dev-mode src/../..)
 * when no root-relative build exists.
 */
function findUiDir(root: string): string | null {
  const candidates = [join(root, "dist", "ui")];
  const here = dirname(fileURLToPath(import.meta.url)); // dist/server or src/server
  candidates.push(
    join(here, "..", "ui"), // dist/ui (compiled, shipped)
    join(here, "..", "..", "dist", "ui"), // repo-root dist/ui (dev mode)
  );
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

/** Content type for a static UI asset by extension. */
const UI_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

/** Serve a static file from the UI build directory. Returns false on miss. */
function serveStaticUi(res: ServerResponse, uiDir: string, urlPath: string): boolean {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  if (rel.includes("..")) return false;
  const abs = resolve(uiDir, rel || "index.html");
  if (!abs.startsWith(resolve(uiDir))) return false;
  if (!existsSync(abs) || !statSync(abs).isFile()) return false;
  const ext = extname(abs).toLowerCase();
  // Service workers and the manifest must never be cached long-term, or
  // installs/app updates would serve stale assets.
  const noCache = rel === "sw.js" || rel === "manifest.webmanifest";
  res.writeHead(200, {
    "Content-Type": UI_MIME[ext] ?? "application/octet-stream",
    "Cache-Control": noCache ? "no-cache" : ext === ".html" ? "no-cache" : "max-age=86400",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(readFileSync(abs));
  return true;
}

/** Per-instance PWA manifest so multiple RepoOS installs are distinguishable. */
function manifestFor(root: string): string {
  const name = basename(root) || "repoos";
  return JSON.stringify(
    {
      id: "/",
      name: `RepoOS · ${name}`,
      short_name: `RepoOS · ${name}`,
      description: `Repo-native task tracking for ${name}`,
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait-primary",
      background_color: "#070a12",
      theme_color: "#070a12",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  );
}

/** Guard against path traversal when serving repo doc files. */
function safeRepoFile(root: string, urlPath: string): string | null {
  const rel = decodeURIComponent(urlPath.replace(/^\/+/, ""));
  if (rel.includes("..")) return null;
  const abs = resolve(root, rel);
  if (!abs.startsWith(resolve(root))) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  if (extname(abs) !== ".md") return null; // only markdown docs are servable
  return abs;
}

/**
 * Fatal/crash-level capture (0187): by default Node terminates the process on
 * both of these events with nothing recorded anywhere. Registered once per
 * process (not once per `startServer` call — the test suite starts many
 * short-lived servers in the same process, and stacking a listener per call
 * would both spam MaxListenersExceededWarning and risk one test's error
 * exiting the whole worker) and always logs to whichever server is currently
 * active. Only exits the process outside the test runner: many independent
 * test servers share this process, so exiting here on an unrelated test's
 * error would take the whole suite down with it.
 */
let activeLogger: Logger | null = null;
let fatalHandlersRegistered = false;
function registerFatalHandlersOnce(): void {
  if (fatalHandlersRegistered) return;
  fatalHandlersRegistered = true;
  const logFatal = (message: string, err: unknown) => {
    activeLogger?.system("fatal", message, {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    if (process.env.VITEST !== "true") process.exit(1);
  };
  process.on("uncaughtException", (err) => logFatal("Uncaught exception", err));
  process.on("unhandledRejection", (reason) => logFatal("Unhandled promise rejection", reason));
}

export function startServer(opts: ServeOptions = {}): Promise<ServerHandle> {
  const repoos = createRepoOS(opts.root);
  const config = repoos.config;
  if (opts.disableAuth && config.auth) {
    config.auth = { ...config.auth, enabled: false };
  }
  const logger = createLogger(config.root);
  const index = new LiveIndex(config);
  index.refreshAll();

  const requestedPort = opts.port ?? 7171;
  const isPreviewChild = process.env.REPOOS_PREVIEW_CHILD === "1";
  const isControlPlane = requestedPort !== 0 && !isPreviewChild;
  const mode = isPreviewChild ? "preview" : requestedPort === 0 ? "ephemeral" : opts.reloadReplacement ? "reload-replacement" : "control-plane";
  logger.system("info", "RepoOS server starting", {
    root: config.root,
    pid: process.pid,
    requestedPort,
    host: opts.host ?? "127.0.0.1",
    mode,
    buildHash: readBuildHash(config.root),
  });
  activeLogger = logger;
  registerFatalHandlersOnce();

  // ---- Fail-closed auth validation at startup (0246) ----
  // When auth is enabled, the server must have a usable login method and a
  // bootstrap admin path — otherwise enable auth silently locks everyone out.
  if (config.auth?.enabled) {
    const hasEmailProvider = !!(config.auth.emailProvider?.apiKey && config.auth.emailProvider?.fromAddress);
    const hasGoogle = !!(config.auth.google?.clientId && config.auth.google?.clientSecret);
    if (!hasEmailProvider && !hasGoogle) {
      throw new Error(
        "Auth is enabled but no login provider is configured. " +
        "Set [auth.emailProvider] (Resend API key + from address) or " +
        "[auth.google] (client ID + secret) in your config, or disable auth.",
      );
    }
    // Auto-generate a session secret if none was provided. The secret is
    // only meaningful for signed-cookie schemes; with DB-backed sessions
    // the token is opaque — but keep the field consistent for forward
    // compatibility and so the config is explicit about intent.
    if (!config.auth.sessionSecret) {
      config.auth.sessionSecret = randomHex(32);
    }
    const authStore = getAuthStore(config.root);
    const userCount = authStore?.listUsers().length ?? 0;
    if (userCount === 0 && !config.auth.bootstrapAdmin) {
      throw new Error(
        "Auth is enabled but no users exist and no bootstrap admin email is configured. " +
        "Set [auth.bootstrapAdmin] to an email address in your config, " +
        "or use the Settings UI to add users before enabling auth.",
      );
    }
    logger.system("info", "Auth enabled — login providers validated", {
      emailProvider: hasEmailProvider,
      google: hasGoogle,
      userCount,
      bootstrapAdmin: config.auth.bootstrapAdmin ?? null,
    });
  }

  const uiDir = findUiDir(repoos.config.root);

  // The build hash of the code this process is running. Auto-reload (0066)
  // triggers a replacement whenever the on-disk hash diverges. Skipped in dev
  // mode (no compiled build to reload into), in preview children, and when an
  // ephemeral port is requested (nothing stable to hand off).
  const loadedHash = readBuildHash(config.root);
  const reloadEnabled =
    !isDevBuild() && process.env.REPOOS_PREVIEW_CHILD !== "1" && opts.port !== 0;
  let reload: ReloadManager | null = null;

  // Close-out lock (0143): while `completeTask` holds it, the reload manager
  // defers every auto-reload and parks the new build for the user instead —
  // the close-out pipeline builds/checks dist itself and would be killed by a
  // mid-flight reload. The lock is server-owned: the UI never touches it.
  let closeOutInProgress = false;
  const closeOutLock: CloseOutLock = {
    closingOut: () => closeOutInProgress,
    acquire: () => {
      closeOutInProgress = true;
    },
    release: () => {
      closeOutInProgress = false;
    },
  };

  // Integration job coordinator for serialized close-outs (0118)
  const jobCoordinator = createJobCoordinator(config.root);
  const repoLock = createRepositoryLock(config.root);
  const rootLock = createRootLock(config.root);

  // Recovery on startup: resume interrupted jobs (0118)
  const interruptedJobs = jobCoordinator.findInterruptedJobs();
  for (const job of interruptedJobs) {
    console.log(`Resuming interrupted job for task ${job.taskId} from phase ${job.phase}`);
  }

  let processingJob = false;
  let triggerJobProcessing: () => void = () => {}; // Initialized below

  const watcher = new WorkWatcher(config, index);
  watcher.start();

  // active SSE clients
  const clients = new Set<ServerResponse>();
  const emitEvent = (e: RepoEvent) => {
    // A drained runner unblocks a deferred reload immediately (0066).
    reload?.onEvent(e);
    const frame = `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
    for (const res of clients) {
      try {
        res.write(frame);
      } catch {
        clients.delete(res);
      }
    }
  };
  const unsubscribe = index.on(emitEvent);

  // Last integration-pipeline stage progress reported per task id (0207). The
  // orchestrator's DoneStep callbacks drive the pinned status bar's stage
  // indicator; recorded here so the live `integration` snapshot is accurate.
  const reportedStages: Record<string, DoneStep> = {};

  /** Emit the current integration-pipeline snapshot to every SSE client (0207). */
  const emitIntegration = (): void => {
    emitEvent({ type: "integration", pipeline: buildIntegrationSnapshot(jobCoordinator, reportedStages) });
  };

  // Initialize job processing (runs after emitEvent is available) (0118)
  triggerJobProcessing = () => {
    if (processingJob) return;
    processingJob = true;
    setImmediate(async () => {
      try {
        // A fresh enqueue (or recovered job) can now be seen by the status bar.
        emitIntegration();
        const orchestrator = new CloseOutOrchestrator(
          config,
          jobCoordinator,
          repoLock,
          rootLock,
          (taskId) => index.getTask(taskId),
          (step) => {
            const job = jobCoordinator.peekNext();
            if (job) {
              reportedStages[job.taskId] = step;
              emitEvent({
                type: "task.progress",
                id: job.taskId,
                step,
                at: new Date().toISOString(),
              });
              emitIntegration();
            }
          },
          logger,
        );
        const jobBefore = jobCoordinator.peekNext();
        const result = await orchestrator.processNext();
        // Surface close-out failures (0199): the /done action returns as soon
        // as the job is enqueued, so the UI never learns of a background
        // failure. Only emit for a terminal `failed` phase — "main advanced,
        // revalidating" is a retry, not a failure.
        if (
          jobBefore &&
          result &&
          result.ok === false &&
          result.reason &&
          jobCoordinator.getJob(jobBefore.taskId)?.phase === "failed"
        ) {
          emitEvent({
            type: "task.progress",
            id: jobBefore.taskId,
            step: "failed",
            detail: result.reason,
            phase: jobCoordinator.getJob(jobBefore.taskId)?.failedPhase,
            at: new Date().toISOString(),
          });
        }
        // Keep the live index in sync: the orchestrator writes the task file
        // (markTaskReleased) and merges the branch directly, bypassing the
        // done-action's usual index.applyFileChange/refreshBranches.
        const processed = jobCoordinator.peekNext();
        if (processed && processed.phase === "done") {
          const doneTask = index.getTask(processed.taskId);
          if (doneTask) index.applyFileChange(doneTask.absPath);
        }
        index.refreshBranches();
        // Reflect the post-job pipeline state (job now done/failed, or the next
        // queued job becoming active) in the pinned status bar (0207).
        emitIntegration();
        // Continue processing if there are more jobs or recovered jobs
        const next = jobCoordinator.peekNext();
        if (next && next.phase !== "done" && next.phase !== "failed") {
          processingJob = false;
          triggerJobProcessing();
        } else {
          processingJob = false;
        }
      } catch (err) {
        console.error("Job processor error:", err);
        processingJob = false;
      }
    });
  };

  // Trigger processing of recovered jobs once emitEvent is ready (0118)
  let triggerRecoveryJobs: (() => void) | null = () => {
    if (interruptedJobs.length > 0) {
      console.log(`Processing ${interruptedJobs.length} recovered jobs`);
      triggerJobProcessing();
    }
    triggerRecoveryJobs = null;
  };

  // Trigger processing of recovered jobs on startup
  if (triggerRecoveryJobs) {
    setImmediate(triggerRecoveryJobs);
  }

  // Tasks that landed in `review` while their engineer turn was still winding
  // down. Reviewing a worktree an agent is still committing to would report on
  // a half-written state, so the review waits for `agent.exited`.
  const pendingReview = new Set<string>();

  // Read-only preview servers for review/active tasks. Orphans from a crashed
  // previous main server are reaped at boot; this instance starts with none.
  // Declared before the runner so its preview-request handler can close over it.
  const previews = new PreviewManager(config, emitEvent);
  previews.cleanupOrphans();

  // Serve process reaper (0168): detect and reap stale serve processes,
  // and prevent port binding conflicts.
  // Port-0 harnesses and preview children must neither overwrite nor remove
  // the real control-plane lock. They are deliberately short-lived and are
  // not valid evidence about who owns 7171.
  const reaper = new ServeReaper(config.root, config.cacheDir, isControlPlane);
  reaper.cleanupStale();
  // Boot-time sweep for historical orphans whose deleted root took their
  // lockfile with it. Deliberately fire-and-forget: the sweep is async and
  // bounded, so serve startup never blocks on it even with hundreds of
  // accumulated orphans. It always resolves (never rejects). Gated like the
  // periodic stray sweep — preview children and ephemeral in-process servers
  // must not each run a full `ps`+`lsof` census of the machine.
  if (shouldReapStrayServeProcesses(opts)) {
    void reaper.cleanupOrphanedRoots();
  }

  // Agent supervisor: periodic health checks and safe recovery (0112)
  let supervisor: AgentSupervisor | null = null;

  // Task watchdog: surfaces active tasks whose agent is dead or stalled (0180).
  // Constructed after the reload manager so it can observe `isReloading()`.
  let watchdog: TaskWatchdog | null = null;

  // Track launched coding agents so Pause can signal them and the UI can
  // reflect live running state without any polling.
  let reviews: ReviewManager; // Assigned after runner creation below
  const runner = new AgentRunner(
    config,
    (e) => {
      emitEvent(e);
      if (e.type !== "agent.exited" || !pendingReview.delete(e.id)) return;
      const task = index.getTask(e.id);
      if (task?.status === "review") void reviews.run(task);
    },
    { logger, getTask: (taskId) => index.getTask(taskId), onHandoff: async (request) => {
      if (!runner.consumeHandoff(request)) {
        runner.system(request.taskId, "✗ server-side handoff rejected: invalid or expired runner session");
        return;
      }
      // AgentRunner marks the handoff as in-flight *before* invoking this
      // callback so it cannot be mistaken for a stalled task or restarted
      // mid-finalization. The capability above is single-use, so a duplicate
      // callback has already been rejected by consumeHandoff(). Checking the
      // in-flight marker here would reject this very handoff every time.
      const task = index.getTask(request.taskId);
      if (!task) {
        runner.system(request.taskId, "✗ server-side handoff failed: task no longer exists");
        return;
      }
      runner.system(request.taskId, "Server finalization started — validating the runner handoff");
      const result = await handoffTask(
        config,
        task,
        request,
        (step) => {
          emitEvent({ type: "task.progress", id: task.id, step: `handoff:${step}`, at: new Date().toISOString() });
          if (step !== "validate" && step !== "done") {
            runner.system(task.id, `Server finalization: ${step}`);
          }
        },
        onServerStatusChange,
      );
      if (result.ok) {
        index.applyFileChange(task.absPath, { guarded: true });
        runner.system(task.id, "✓ Server finalization complete — task moved to review");
      } else {
        runner.system(
          task.id,
          `✗ Server finalization stopped at ${result.step}: ${result.detail ?? "unknown error"}. The same worktree can be resumed and retried.`,
        );
        scheduleCheckFailureRetry(config, task, result, runner);
      }
    },
    onPreviewRequest: async (request) => {
      // The capability was minted by the runner for THIS run: task id, run id,
      // registered branch, and registered worktree all bind to server state.
      // Anything else — a forged or expired run, a cross-task claim, or a
      // substituted path — is rejected before any process is started (#0121).
      if (!runner.validatePreview(request)) {
        runner.system(request.taskId, "✗ managed preview request rejected: no matching live runner run");
        return;
      }
      const task = index.getTask(request.taskId);
      if (!task) {
        runner.system(request.taskId, "✗ managed preview request failed: task no longer exists");
        return;
      }
      runner.system(
        request.taskId,
        "Server-owned preview requested — validating the run and starting the worktree preview",
      );
      // Reuse the existing PreviewManager: idempotent per task, RepoOS chooses
      // the port and owns the process lifecycle. Never a parallel implementation.
      const result = await previews.start(task);
      if (!result.ok) {
        runner.system(
          request.taskId,
          `✗ managed preview failed: ${result.error ?? "could not start the preview"}. The worktree is unchanged and the same session can be resumed.`,
        );
        return;
      }
      const url = result.url ?? "";
      runner.system(request.taskId, `✓ Managed preview ready: ${url}`);
      // The sandbox may not be able to open the URL — probe it from the
      // privileged server side and record the structured outcome.
      const probe = await probePreview(url);
      if (probe.ok) {
        runner.system(request.taskId, `✓ Server-side preview probe passed — ${probe.detail ?? "preview responds"}`);
      } else {
        runner.system(request.taskId, `✗ Server-side preview probe failed: ${probe.error ?? "unreachable"}`);
      }
    } },
  );

  // Adopt any agent children that survived a server restart (0214).
  // Reads the durable registry, checks PID aliveness, and re-attaches
  // to still-running children so isRunning() reports true immediately.
  runner.adoptRunningAgents();

  // Recover any pending handoff requests from a previous interrupted turn (#0235).
  // Validates each request (task still exists, active, branch matches) and
  // re-fires onHandoff for valid ones. Must run after adoptRunningAgents so
  // in-flight handoffs from adopted agents are visible.
  runner.recoverPendingHandoffs();

  // The review agent (0101): when a task lands in `review`, it inspects the
  // implementation and writes a short report for whoever signs the task off.
  // Advisory only — it never moves a task to `done`.
  // Created after the runner so it can send auto-bounce messages to the engineer.
  reviews = new ReviewManager(config, emitEvent, runner);

  // The CTO agent (0174): always-on board monitor that detects stuck tasks,
  // stale reviews, and broken builds, then nudges agents or escalates to the human.
  const cto = new CTOManager(config, emitEvent, runner);
  const ctoMonitor = new CTOMonitor(config, index, cto);
  // Run the monitor cadence unconditionally: `checkNow` no-ops while the CTO
  // agent is disabled, so enabling it from the Agents page takes effect on the
  // next tick without a restart, and disabling it stops runs immediately.
  // Interval configurable from config if present; default to 5 minutes.
  const ctoIntervalMs = (config as unknown as Record<string, unknown>)?.ctoMonitorIntervalMs as number | undefined || 5 * 60 * 1000;
  ctoMonitor.start(ctoIntervalMs);

  // Review activity is transient server state, not task-file frontmatter. Add
  // its small authoritative summary to index-shaped API responses so a board
  // refresh/reconnect cannot leave a card stuck in (or missing) Reviewing.
  const withReviewStatus = <T extends Task>(task: T): T & {
    automaticReview: { running: boolean; enabled: boolean };
  } => ({
    ...task,
    automaticReview: {
      running: reviews.isRunning(task.id),
      enabled: reviews.enabled(),
    },
  });

  // System resource polling over SSE. Samples CPU/memory/process stats every
  // 5s while at least one SSE client is connected; idles when no one is
  // listening (a headless server should not burn cycles measuring itself for
  // nobody). Graceful: skips sampling entirely when `ps` is unavailable.
  const SYSTEM_SAMPLE_INTERVAL_MS = 5000;
  const systemSampleTimer = setInterval(() => {
    if (clients.size === 0 || !psAvailable()) return;
    try {
      const stats = sampleSystem({
        serverPid: process.pid,
        cacheDir: join(config.root, config.cacheDir),
        runningAgents: runner.running(),
        knownServePids: previews.knownPids(),
      });
      emitEvent({ type: "system.stats", stats });
    } catch {
      /* sampling is best-effort — never crash the poll loop */
    }
  }, SYSTEM_SAMPLE_INTERVAL_MS);

  // Stray serve-process reaping (#0216): orphaned repoos serve processes
  // (their spawning parent confirmed dead) accumulate from failed
  // reload-replacement attempts and interrupted test/close-out runs. Left
  // alone they starve the close-out gate and, at volume, strain the whole
  // machine — not just this server. Runs independent of SSE client presence
  // (unlike the stats sampler above) since strays keep accumulating whether
  // or not anyone is watching the UI. `psAvailable()` gate matches the
  // sampler's own platform guard.
  const REAP_INTERVAL_MS = 30_000;
  const reapTimer = shouldReapStrayServeProcesses(opts)
    ? setInterval(() => {
        if (!psAvailable()) return;
        try {
          const reaped = reapStrayServeProcesses(process.pid, new Set(previews.knownPids()));
          if (reaped > 0) console.log(`serve-reaper: reaped ${reaped} orphaned serve process${reaped === 1 ? "" : "es"}`);
          // The PPID-based pass above cannot see every deleted-root orphan;
          // repeat the narrower root sweep so leaks created after boot do not
          // wait until the next control-plane restart.
          void reaper.cleanupOrphanedRoots();
        } catch {
          /* reaping is best-effort — never crash the server over it */
        }
      }, REAP_INTERVAL_MS)
    : null;

  // Built-in agent scheduling: a single in-flight guard shared with the manual
  // /run endpoint, checked once a minute. An enabled agent whose daily/weekly
  // schedule is due runs exactly one scan per tick; scheduled and manual runs
  // can never overlap. Errors only log — the scheduler is best-effort and must
  // never crash the poll loop.
  const BUILT_IN_CHECK_INTERVAL_MS = 60_000;
  const builtInRun = { inFlight: false };
  const builtInTimer = setInterval(() => {
    if (builtInRun.inFlight) return;
    const agents = repoos.config.builtInAgents ?? {};
    for (const name of Object.keys(agents)) {
      // Chat-only agents (the Debugger) have no scan to schedule — their
      // floating-head conversation is the only interaction surface (0201).
      if (name === "debugger") continue;
      if (!isDueForScheduledRun(agents[name])) continue;
      builtInRun.inFlight = true;
      void runBuiltInAgent(name, repoos.config, logger)
        .then((result: any) => {
          if (result && result.failed > 0) {
            console.error(
              `[built-in-agents] scheduled run of "${name}" wrote ${result.failed} failed task(s): ${result.errors.join("; ")}`,
            );
          }
        })
        .catch((err: any) => {
          console.error(`[built-in-agents] scheduled run of "${name}" failed:`, err);
          logger.agent(name, "error", `Built-in agent run failed`, { error: String(err) });
        })
        .finally(() => {
          builtInRun.inFlight = false;
          index.refreshAll();
        });
      break; // one built-in agent per tick
    }
  }, BUILT_IN_CHECK_INTERVAL_MS);

  // Any status change that leaves active/review must stop the task's preview
  // (done/ready/paused). Previews never outlive the state they preview.
  const stopPreviewIfLeft = (task: Task, _prev: Status, next: Status): void => {
    if (next !== "active" && next !== "review") void previews.stop(task.id);
  };

  // A task that leaves `active` must also release its agent process (0087) —
  // by ANY route: agent self-transition, API PATCH, pause, or a direct file
  // edit. This reuses the exact graceful path `/pause` uses (`runner.stop`:
  // SIGTERM, then SIGKILL after the grace period, clearing the registry on
  // exit), so an agent turn can never keep running against a task that no
  // longer claims it — the 3h54m leak observed on #0069. The SESSION
  // (transcript + resumable session id) lives in `sessions`, not `entries`,
  // and `stop()` only clears `entries` — so logs and chat stay available in
  // review (0053) and a follow-up message still resumes the same conversation.
  // Idempotent: a task whose agent already exited on its own is a silent no-op.
  const stopAgentIfLeftActive = (task: Task, prev: Status, next: Status): void => {
    if (prev === "active" && next !== "active") void runner.stop(task.id);
  };

  // Combined status-change hook, fired for every status change by any route.
  const onStatusChange = (task: Task, prev: Status, next: Status): void => {
    stopPreviewIfLeft(task, prev, next);
    stopAgentIfLeftActive(task, prev, next);
    if (next === "done") runner.complete(task.id);
  };

  /**
   * Hook for the SERVER's own writes (API PATCH, start, sync) — everything
   * `onStatusChange` does, plus: a human moving a task out of `review` drops
   * its pending agent review. Deliberately NOT wired to the index event
   * stream: a task file edited into `done` on disk is exactly the agent
   * overreach the review guard exists to catch, and cancelling on it would
   * disarm the guard.
   */
  const onServerStatusChange = (task: Task, prev: Status, next: Status): void => {
    onStatusChange(task, prev, next);
    if (prev === "review" && next !== "review") {
      pendingReview.delete(task.id);
      reviews.cancel(task.id);
    }
  };

  // #0210: every transition INTO `review` that bypasses the trusted PATCH and
  // handoff routes — a direct task-file edit picked up by the watcher — must
  // still pass the commit/vacuity gate. The index defers such transitions to
  // this guard; returning false reverts the file to its previous status.
  index.setReviewGuard(async (task: Task, prev: Task): Promise<boolean> => {
    const gate = await guardReviewTransition(config, task);
    if (gate.ok) return true;
    try {
      emitEvent({
        type: "task.progress",
        id: task.id,
        step: "review-rejected",
        detail: `Direct edit to review rejected: ${gate.detail}. The task was reverted to ${prev.status}.`,
        at: new Date().toISOString(),
      });
    } catch {
      /* best-effort signalling */
    }
    return false;
  });

  /**
   * Kick off the agent review for a task that just landed in `review`. A no-op
   * when the review agent is disabled on the Agents page (`reviews.run` skips
   * silently), and deferred while the task's own agent turn is still running.
   */
  const startReview = (task: Task): void => {
    if (!reviews.enabled()) return;
    // This task is only back in `review` because the guard put it there after
    // an agent overstepped — reviewing it again would just repeat that.
    if (reviews.claimRevert(task.id)) return;
    if (runner.isRunning(task.id)) {
      pendingReview.add(task.id);
      return;
    }
    pendingReview.delete(task.id);
    void reviews.run(task);
  };

  /**
   * Auto-launch a read-only preview the moment a task lands in `review` (#0198).
   * The whole point of automation is that no one clicks a button: the preview
   * is up before the reviewer looks. `PreviewManager.start` enforces the
   * concurrency cap (FIFO eviction of the oldest) and returns a structured
   * result, so a failed launch is logged and never crashes the server. The
   * preview closes automatically when the task leaves review (see
   * `stopPreviewIfLeft`).
   */
  const autoLaunchPreview = async (task: Task): Promise<void> => {
    try {
      const result = await previews.start(task);
      if (!result.ok) {
        console.error(
          `[preview] ${new Date().toISOString()} #${task.id} auto-launch failed — ${result.error ?? "unknown error"}`,
        );
      }
    } catch (err) {
      // Never let a failed launch take the server down.
      console.error(
        `[preview] ${new Date().toISOString()} #${task.id} auto-launch threw — ${(err as Error)?.message ?? err}`,
      );
    }
  };

  // The file-watcher path (a direct task-file edit on disk) bypasses
  // patchTaskFile, so it never fires `onStatusChange`. The index's own event
  // stream sees EVERY status change from every route (HTTP PATCH, /done,
  // start/pause, the watcher, and the 0077 self-heal) — apply the same cleanup
  // there. Both firing for a single transition is harmless: `previews.stop` and
  // `runner.stop` are idempotent.
  const unsubscribeCleanup = index.on((e) => {
    // Optional ntfy push notifications hang off the index stream for the same
    // reason the cleanup does: it is the one place every transition surfaces,
    // exactly once per real change (applyFileChange dedupes by state diff).
    if (e.type === "task.created") {
      notifyTaskCreated(config, e.task);
      return;
    }
    if (e.type !== "task.updated") return;
    const prev = e.prev.status;
    if (prev === undefined || prev === e.task.status) return;
    onStatusChange(e.task, prev, e.task.status);
    notifyStatusChange(config, e.task, prev, e.task.status);
    // Every route into `review` — a board drag, the drawer, an agent editing
    // its own task file — surfaces here, so this is the one place the agent
    // review needs to hang off.
    if (e.task.status === "review") {
      startReview(e.task);
      void autoLaunchPreview(e.task);
    }
  });

  // Preview state is process-local. Recreate previews for tasks that were
  // already in review when this control-plane process started, otherwise a
  // server restart leaves review tasks without their expected preview URL.
  for (const task of index.getTasks()) {
    if (task.status === "review") void autoLaunchPreview(task);
  }

  // Handle needsInput changes separately (fires alongside status change when both occur).
  const unsubscribeNeedsInput = index.on((e) => {
    if (e.type !== "task.updated") return;
    const prevNeedsInput = e.prev.needsInput ?? false;
    const nextNeedsInput = e.task.needsInput;
    if (!prevNeedsInput && nextNeedsInput) {
      notifyNeedsInput(config, e.task);
    }
  });

  // Trigger CTO monitor on key events: task status changes, review completion, agent exit.
  const unsubscribeCTOEvents = index.on((e) => {
    if (!cto.enabled()) return;
    if (e.type === "task.updated") {
      const prev = e.prev.status;
      if (prev !== undefined && prev !== e.task.status) {
        ctoMonitor.onEvent(`task #${e.task.id} status change: ${prev} → ${e.task.status}`);
      }
    } else if (e.type === "review") {
      ctoMonitor.onEvent(`review complete for task #${e.id}: ${e.state}`);
    } else if (e.type === "agent.exited") {
      ctoMonitor.onEvent(`agent exited: task #${e.id}`);
    }
  });

  interface SyncResult {
    ok: boolean;
    conflicts: string[];
    reason?: string;
  }

  /**
   * Merge the main checkout's current branch into the task's branch inside its
   * linked worktree. On conflict the merge is aborted and the task file in both
   * copies is flagged `needs_merge`. On success the flag is cleared.
   */
  async function syncTaskBranch(task: Task): Promise<SyncResult> {
    const rel = relative(config.root, task.absPath);
    const result = await syncBranchWithMain(config.root, task.branch, { autoResolve: [rel] });
    const wtPath = worktreePathForBranch(config.root, task.branch);

    const setNeedsMerge = async (value: boolean): Promise<void> => {
      const mainUpdated = patchTaskFile(
        config,
        task.absPath,
        { needsMerge: value },
        {
          onStatusChange: onServerStatusChange,
        },
      );
      index.applyFileChange(mainUpdated.absPath);
      // Mirror the flag on the worktree copy so an agent resuming there sees it.
      if (wtPath) {
        const wtAbsPath = join(wtPath, task.path);
        if (existsSync(wtAbsPath)) {
          patchTaskFile({ ...config, root: wtPath }, wtAbsPath, { needsMerge: value });
        }
      }
    };

    if (!result.ok) {
      await setNeedsMerge(true);
      return {
        ok: false,
        conflicts: result.conflicts,
        reason: result.reason ?? "sync failed",
      };
    }

    await setNeedsMerge(false);
    return { ok: true, conflicts: [] };
  }

  // Initialize route handlers that need runtime configuration
  initInfoHandlers(loadedHash || "", tunnelReadiness);
  setIconRenderer((size: number) => renderInstanceIcon(basename(config.root) || "repoos", size));

  // Create and register all routes with the router
  const router = new Router();

  // Info/metadata routes
  router.register("GET", "/api/health", health);
  router.register("POST", "/api/server/restart", restart);
  router.register("GET", "/api/counts", getCounts);
  router.register("GET", "/api/index", getIndex);
  router.register("GET", "/api/board", getBoard);
  router.register("GET", "/api/docs", getDocs);
  router.register("POST", "/api/docs/create", createDoc);
  router.register("POST", "/api/docs/freeform", createFreeformDoc);
  router.register("GET", "/api/skills", getSkills);
  router.register("GET", "/api/system", getSystem);
  router.register("GET", "/api/system/logs", getSystemLogs);
  router.register("GET", "/api/tunnel/readiness", getTunnelStatus);
  router.register("GET", "/api/chat", getChat);
  router.register("POST", "/api/chat/message", sendChatMessage);
  router.register("GET", "/api/debugger", getDebugger);
  router.register("POST", "/api/debugger/message", sendDebuggerMessage);
  router.register("POST", "/api/debugger/repair", repairWithDebugger);

  // Session stats routes
  router.register("GET", "/api/stats/board", getBoardStats);
  router.register("GET", "/api/stats/by-type", getSessionTypeStats);
  router.register("GET", "/api/stats/daily", getDailyTotals);

  // Task routes
  router.register("GET", "/api/tasks", getTasks);
  router.register("POST", "/api/tasks", createTask);
  router.register("POST", "/api/tasks/freeform", createFreeformTask);
  router.register("GET", /^\/api\/tasks\/([^/]+)$/, getTask);
  router.register("PATCH", /^\/api\/tasks\/([^/]+)$/, patchTask);
  router.register("DELETE", /^\/api\/tasks\/([^/]+)$/, deleteTask);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/output$/, getTaskOutput);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/logs$/, getTaskLogs);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/stats$/, getTaskStats);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/diff-stats$/, getDiffStatsForTask);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/diff$/, getDiffForTask);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/integration-job$/, getIntegrationJob);
  router.register("GET", "/api/integration-jobs", getIntegrationJobs);
  router.register("GET", "/api/integration/pipeline", getIntegrationPipeline);
  router.register("POST", /^\/api\/integration\/pipeline\/retry\/([^/]+)$/, retryIntegration);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/(start|pause|message|done|sync|hotfix)$/, taskAction);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/preview$/, startPreview);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/preview\/stop$/, stopPreview);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/review$/, getTaskReview);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/review\/again$/, reviewAgain);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/review\/message$/, reviewMessage);
  router.register("GET", "/api/cto", getCTO);
  router.register("POST", "/api/cto/message", ctoMessage);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/pm\/message$/, pmMessage);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/attachments\/([^/]+)$/, getScreenshot);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/attachments$/, uploadScreenshot);

  // Config routes
  router.register("GET", "/api/config", readConfig);
  router.register("PATCH", "/api/config", patchConfig);

  // Model routes
  router.register("GET", "/api/models", listModels);
  router.register("POST", "/api/models/test", testModel);

  // Agent routes
  router.register("GET", "/api/agents/running", runningAgents);
  router.register("GET", "/api/agents/detect", detectInstalledAgents);
  router.register("GET", /^\/api\/agents\/([^/]+)\/logs$/, getAgentLogs);
  router.register("POST", /^\/api\/agents\/built-in\/([^/]+)\/run$/, async (ctx, _req, res, params) => {
    const agentName = params.param1;
    const cfg = ctx.repoos.config;
    // The Debugger is chat-only (its floating head / bug-paste panel). It has
    // no scan to run now, and exposing a dead endpoint invites a 500 when the
    // dispatch returns null — reject it explicitly before touching the
    // in-flight guard (0201).
    if (agentName === "debugger") {
      return json(res, 400, {
        error: `"${agentName}" is chat-only — talk to it from its floating head instead of running it`,
      });
    }
    // Manual and scheduled runs share one in-flight guard, so two scans can
    // never overlap and block the server twice over.
    if (builtInRun.inFlight) {
      return json(res, 409, {
        error: `A built-in agent run is already in progress — wait for it to finish`,
      });
    }
    builtInRun.inFlight = true;
    try {
      const result = await runBuiltInAgent(agentName, cfg, logger);
      if (!result) {
        return json(res, 404, { error: `Unknown built-in agent: ${agentName}` });
      }
      ctx.index.refreshAll();
      return json(res, 200, {
        ok: true,
        taskCount: result.created,
        skipped: "skipped" in result ? result.skipped : 0,
        failed: result.failed,
        errors: result.errors,
        issuesFound: "issuesFound" in result ? result.issuesFound : 0,
        findingsFound: "findingsFound" in result ? result.findingsFound : 0,
        scannedFiles: "scannedFiles" in result ? result.scannedFiles : 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run built-in agent";
      logger.agent(agentName, "error", `Manual run of built-in agent failed`, { error: message });
      return json(res, 500, { error: message });
    } finally {
      builtInRun.inFlight = false;
    }
  });

  // Notification routes
  router.register("POST", "/api/ntfy/test", testNotification);

  // Transcription routes
  router.register("POST", "/api/transcribe", transcribe);

  // Auth routes
  router.register("GET", "/api/auth/status", authStatus);
  router.register("POST", "/api/auth/bootstrap-admin", bootstrapAdmin);
  router.register("POST", "/api/auth/request-otp", requestOtp);
  router.register("POST", "/api/auth/verify-otp", verifyOtp);
  router.register("GET", "/api/auth/login/google", googleLogin);
  router.register("GET", "/api/auth/callback/google", googleCallback);
  router.register("GET", "/api/auth/me", authMe);
  router.register("POST", "/api/auth/logout", authLogout);
  router.register("GET", "/api/auth/users", listUsers);
  router.register("POST", "/api/auth/users", addUser);
  router.register("DELETE", /^\/api\/auth\/users\/([^/]+)$/, deleteUser);
  router.register("PATCH", /^\/api\/auth\/users\/([^/]+)$/, updateUserRole);
  router.register("GET", "/api/auth/audit", getAuditLog);

  // UI routes
  router.register("GET", "/manifest.webmanifest", serveManifest);
  router.register("GET", /^\/icons\/icon-(\d+)\.png$/, serveIcon);

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    try {
      if (method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }

    // ---- Auth middleware ----
    // When auth is enabled, every request except public routes must carry a
    // valid session cookie. Public routes: /api/health, /api/auth/*,
    // /login, static UI assets, manifest, icons, and OPTIONS. Unauthenticated
    // API requests get 401; browser navigations to non-public non-SPA routes
    // redirect to /login. Auth-disabled deployments pass everything through.
    const authEnabled = config.auth?.enabled === true;
    if (authEnabled) {
      const PUBLIC_PREFIXES = ["/api/health", "/api/auth/"];
      const PUBLIC_PATHS = ["/login", "/manifest.webmanifest"];
      const isPublicRoute =
        PUBLIC_PREFIXES.some((p) => path.startsWith(p)) ||
        PUBLIC_PATHS.includes(path) ||
        path.startsWith("/icons/") ||
        path.startsWith("/assets/") ||
        method === "OPTIONS";
      if (!isPublicRoute) {
        const cookies = parseCookies(req.headers.cookie);
        const sessionToken = cookies[SESSION_COOKIE_NAME];
        let validSession = false;
        if (sessionToken) {
          const authStore = getAuthStore(config.root);
          const session = authStore?.getSession(sessionToken);
          validSession = !!session;
        }
        if (!validSession) {
          // API requests get 401 JSON; browser GETs to SPA routes are served
          // the login page (via SPA fallback) so the client-side router can
          // render the login UI. Other browser navigations redirect to /login.
          const isApiRequest = path.startsWith("/api/");
          const isNavigation = method === "GET" && req.headers.accept?.includes("text/html");
          if (isApiRequest) {
            return json(res, 401, { error: "Authentication required" });
          }
          if (isNavigation && uiDir) {
            // Serve the SPA shell so the client router renders /login
            const indexPath = join(uiDir, "index.html");
            if (existsSync(indexPath)) {
              res.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(readFileSync(indexPath, "utf8"));
              return;
            }
          }
          if (isNavigation) {
            res.writeHead(302, { Location: `/login?redirect=${encodeURIComponent(path)}` });
            return res.end();
          }
          return json(res, 401, { error: "Authentication required" });
        }
      }
    }

    // ---- SSE stream ----
    if (path === "/api/events" && method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`retry: 2000\n\n`);
      const hello: RepoEvent = {
        type: "hello",
        taskCount: index.snapshot().taskCount,
        at: new Date().toISOString(),
      };
      res.write(`event: hello\ndata: ${JSON.stringify(hello)}\n\n`);
      clients.add(res);
      // keep-alive comment ping every 25s so proxies don't drop the connection
      const ping = setInterval(() => {
        try {
          res.write(`: ping\n\n`);
        } catch {
          /* ignore */
        }
      }, 25000);
      req.on("close", () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }

    // ---- Supervisor routes ----
    if (path === "/api/supervisor/status" && method === "GET") {
      const heartbeat = supervisor?.getLatestHeartbeat() ?? null;
      return json(res, 200, {
        ok: true,
        enabled: supervisor?.config.enabled ?? false,
        mode: supervisor?.config.mode ?? "observe",
        latestHeartbeat: heartbeat,
      });
    }
    if (path === "/api/supervisor/heartbeats" && method === "GET") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? "10"), 100);
      const heartbeats = supervisor?.getRecentHeartbeats(limit) ?? [];
      return json(res, 200, { ok: true, heartbeats });
    }
    if (path === "/api/supervisor/check-now" && method === "POST") {
      if (!supervisor) {
        return json(res, 503, { error: "Supervisor not available" });
      }
      void supervisor.runCycle();
      return json(res, 202, { ok: true, message: "Supervisor check started" });
    }

    // Create the route context with all necessary dependencies
    const routeContext: RouteContext = {
      config,
      index,
      runner,
      previews,
      reviews,
      cto,
      repoos,
      logger,
      emitEvent: (e: RepoEvent) => {
        for (const client of clients) {
          try {
            client.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
          } catch {
            /* client disconnected */
          }
        }
      },
      closeOutLock,
      rootLock,
      jobCoordinator,
      triggerJobProcessing,
      pendingReview,
      uiDir,
      syncTaskBranch,
      onServerStatusChange,
      reload,
    } as RouteContext;

    // Try to dispatch through the router for all API routes
    const handled = await router.dispatch(routeContext, method, path, req, res);
      if (handled) return;

      // ---- Not an API route; try doc serving ----
      if (method === "GET" && !path.startsWith("/api/")) {
        const docAbs = safeRepoFile(config.root, path);
        if (docAbs) {
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(readFileSync(docAbs, "utf8"));
          return;
        }
      }

      // ---- Static UI serving + SPA fallback ----
      if (method === "GET" && uiDir) {
        if (serveStaticUi(res, uiDir, path)) return;
      }

      // SPA fallback: unknown GET paths render the app
      if (method === "GET" && uiDir) {
        const indexPath = join(uiDir, "index.html");
        if (existsSync(indexPath)) {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(readFileSync(indexPath, "utf8"));
          return;
        }
        return json(res, 500, { error: "UI asset not found — run `bun run build`" });
      }

      return json(res, 404, { error: "Not found", path });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof WriteError ? 400 : 500;
      if (code === 500) {
        logger.system("error", "Request handler error", {
          method,
          path,
          error: msg,
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
      return json(res, code, { error: msg });
    }
  });

  const port = requestedPort;
  const host = opts.host ?? "127.0.0.1";

  /** One bind attempt: resolves once listening, rejects on the listen error. */
  const bindOnce = (withReusePort: boolean): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const onErr = (e: Error) => reject(e);
      server.once("error", onErr);
      server.listen({ port, host, reusePort: withReusePort }, () => {
        server.removeListener("error", onErr);
        resolve();
      });
    });

  /** Release the HTTP listener (drain window / shutdown). Idempotent. */
  const closeHttp = (): Promise<void> =>
    new Promise((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      // End in-flight/keep-alive connections (SSE included) so the port frees
      // promptly instead of waiting on them.
      try {
        server.closeAllConnections?.();
      } catch {
        /* ignore */
      }
      server.close(() => resolve());
    });

  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        if (opts.reloadReplacement) {
          // Replacement (REPOOS_RELOAD=1): first try SO_REUSEPORT so the new
          // process can share the port with the old one (zero-downtime on
          // platforms that support it). Where that is unsupported (ENOTSUP on
          // macOS) or the old process bound without it (EADDRINUSE), fall back
          // to a plain bind retried until the old process releases the port.
          const deadline = Date.now() + RELOAD_BIND_TIMEOUT_MS;
          let bound = false;
          try {
            await bindOnce(true);
            bound = true;
          } catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            if (code !== "ENOTSUP" && code !== "EOPNOTSUPP" && code !== "EADDRINUSE") throw e;
          }
          while (!bound && Date.now() < deadline) {
            try {
              await bindOnce(false);
              bound = true;
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
              await sleep(RELOAD_BIND_RETRY_MS);
            }
          }
          if (!bound)
            throw new Error(`EADDRINUSE: port ${port} never freed for the reload replacement`);
        } else {
          // Check for port conflicts before binding (0168)
          const conflict = reaper.detectConflict(port, host);
          if (conflict) throw new Error(conflict);
          await bindOnce(false);
        }
      } catch (err) {
        logger.system("error", "RepoOS server bind failed", {
          pid: process.pid,
          port,
          host,
          mode,
          error: err instanceof Error ? err.message : String(err),
        });
        // A bind-only failure must terminate the process cleanly: the file
        // watcher and SSE subscriber are live handles that would otherwise keep
        // a listenerless `repoos serve` process alive (the #0096 incident).
        try {
          watcher.stop();
        } catch {
          /* ignore */
        }
        try {
          unsubscribe();
        } catch {
          /* ignore */
        }
        clearInterval(systemSampleTimer);
        if (reapTimer) clearInterval(reapTimer);
        clearInterval(builtInTimer);
        ctoMonitor.stop();
        runner.dispose();
        throw err;
      }

      const actualPort = (server.address() as { port: number }).port;
      const url = `http://${host}:${actualPort}`;
      logger.system("info", "RepoOS server listening", {
        pid: process.pid,
        port: actualPort,
        host,
        mode,
        buildHash: loadedHash,
      });
      // The agent runner injects the real control-plane URL into every spawned
      // agent so preview requests target THIS server, never a hardcoded port.
      runner.apiUrl = url;

      // Register this serve process in the lockfile so port conflicts can be
      // detected on the next startup (0168).
      reaper.register(actualPort, host);
      const handle: ServerHandle = {
        url,
        port: actualPort,
        index,
        close: async (reason: string = "handle.close") => {
          if (isControlPlane) {
            logger.system("info", "RepoOS control plane shutting down", {
              pid: process.pid,
              port: actualPort,
              reason,
            });
          }
          clearInterval(systemSampleTimer);
          if (reapTimer) clearInterval(reapTimer);
          clearInterval(builtInTimer);
          ctoMonitor.stop();
          runner.dispose();
          unsubscribe();
          unsubscribeCleanup();
          unsubscribeNeedsInput();
          unsubscribeCTOEvents();
          watcher.stop();
          supervisor?.stop();
          watchdog?.stop();
          reload?.stop();
          // No preview survives the main server: on SIGTERM/SIGINT (or an
          // in-process close / reload handover) tear them all down so no
          // orphan `repoos serve` process is left behind. Same for review
          // agents — a one-shot child must not outlive the server that
          // launched it and wait 15 minutes to write a report nobody reads.
          reviews.cancelAll();
          cto.cancelAll();
          await previews.stopAll();
          runner.flushAll();
          for (const c of clients) {
            try {
              c.end();
            } catch {
              /* ignore */
            }
          }
          clients.clear();
          reaper.unregister();
          await closeHttp();
          if (isControlPlane) {
            logger.system("info", "RepoOS control plane stopped", {
              pid: process.pid,
              port: actualPort,
              reason,
            });
          }
        },
      };

      // A fixture or preview can have its checkout deleted while this child is
      // still alive (for example when a test aborts before its finally block).
      // Do not let that leave a server with an unreapable lockfile inside the
      // deleted root: close its listener and all owned resources on its own.
      // Only ephemeral test servers and preview children watch their root.
      // A live control plane can serve a real checkout on a briefly unavailable
      // network volume; it must not terminate itself in that situation.
      if (opts.port === 0 || process.env.REPOOS_PREVIEW_CHILD === "1") {
        reaper.watchRoot(() => {
          void handle.close();
        });
      }

      // Auto-reload (0066): watch dist/.build-info.json and hand over to a
      // replacement process on a hash change. Deferred while an agent runs.
      reload = new ReloadManager({
        root: config.root,
        host,
        port: actualPort,
        loadedHash,
        enabled: reloadEnabled,
        isReplacement: process.env.REPOOS_RELOAD === "1",
        // An in-flight agent review is a spawned turn like any other: reloading
        // under it would kill the report the human is waiting on.
        isBusy: () => runner.running().length + reviews.runningCount(),
        // A close-out holds this lock for its whole pipeline (0143): no
        // auto-reload may fire under it, and any build it produces is parked
        // for the user to apply on their own schedule.
        closingOut: closeOutLock.closingOut,
        // A close-out build landed on disk: surface a persistent "New version
        // available" notice so the user can reload when they choose.
        onBuildAvailable: (hash) => {
          emitEvent({
            type: "build.available",
            hash,
            buildAt: loadBuildInfo().buildAt,
            at: new Date().toISOString(),
          });
        },
        cliEntry: cliEntryPath,
        stopListening: closeHttp,
        listen: () => bindOnce(false),
        onReloadConfirmed: async () => {
          await handle.close("reload replacement confirmed");
          process.exit(0);
        },
        onReloadFailed: (reason) => {
          console.log(`  ${reason} — old process keeps serving`);
          logger.system("warn", "RepoOS reload failed; old control plane retained", {
            pid: process.pid,
            port: actualPort,
            reason,
          });
          // A manual restart failed: the old server keeps serving (no outage).
          // Release the UI's "Restarting…" state so the notice stays actionable.
          emitEvent({
            type: "reload.failed",
            reason,
            at: new Date().toISOString(),
          });
        },
        log: (msg) => {
          console.log(msg);
          logger.system("info", "RepoOS reload lifecycle", { pid: process.pid, port: actualPort, message: msg });
        },
      });
      reload.start();
      // Stale-boot self-heal: a newer build that landed while we were starting
      // is picked up immediately (skipped by REPOOS_RELOAD=1 replacements).
      void reload.bootSelfHeal();

      // Agent supervisor: periodic health checks and safe recovery (0112)
      supervisor = new AgentSupervisor(config, index, emitEvent);
      supervisor.start();

      // Task watchdog: surface active tasks whose agent session is dead or
      // stalled (0180). Guarded so it never fires while the server is handing
      // over to a reload replacement.
      const watchdogConfig = config.watchdog ?? {};
      watchdog = new TaskWatchdog(
        config,
        index,
        runner,
        watchdogConfig.stalenessMs ?? 5 * 60 * 1000,
        {
          autoTransition: watchdogConfig.autoTransition !== false,
          canRun: () => !(reload?.isReloading ?? false),
        },
      );
      if (watchdogConfig.enabled !== false) watchdog.start();

      resolve(handle);
    })().catch((e) => reject(e as Error));
  });
}
