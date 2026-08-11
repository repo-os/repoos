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
 *   GET  /api/counts           -> { inbox, ready, ... }
 *   GET  /api/index            -> full RepoIndex snapshot
 *   GET  /api/docs             -> [{ path, title }]  (context docs listing)
 *   GET  /api/skills           -> [{ path, name, description }]  (skills listing)
 *   POST /api/tasks            -> create  { title, type?, area?, priority?, assignedTo? }
 *   POST /api/tasks/freeform   -> create from a freeform explanation via the PM agent
 *   PATCH/api/tasks/:id        -> patch   { status?, title?, ... }
 *   POST /api/tasks/:id/start  -> launch the engineer agent on the task (ready -> active);
 *                                also relaunches a paused active task (stays active)
 *   POST /api/tasks/:id/pause  -> stop the running agent; task stays active
 *   POST /api/tasks/:id/message -> send a follow-up to the task's agent session (active, review)
 *   GET  /api/tasks/:id/output -> { lines, stats } the retained transcript + live run stats (0080)
 *   GET  /api/tasks/:id/review -> { ok, running, enabled, review } the agent's
 *                                 review report for a task in `review`
 *   DELETE /api/tasks/:id      -> remove  the task file (emits task.deleted)
 *   POST /api/tasks/:id/preview       -> start a read-only preview of the task's worktree
 *   POST /api/tasks/:id/preview/stop  -> stop it (also DELETE /preview)
 *   GET  /api/agents/running   -> [{ id, pid, startedAt }] running agents
 *   GET  /api/agents/detect    -> { agents: [{ id, name, binary, installed, path, version, headless, drivable, installHint }] }
 *   GET  /api/events           -> SSE stream of RepoEvent
 *
 * The SSE stream is the live heartbeat the Stage 3 UI subscribes to.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, dirname, resolve, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Agent, RepoOSConfig, SkillMeta, Status, Task } from "../core/types.js";
import { STATUSES } from "../core/types.js";
import { createRepoOS } from "../core/repoos.js";
import { detectAgents, type DetectedAgent } from "../core/detect.js";
import { listModelSources, type ModelSourceResult } from "../core/models.js";
import {
  AGENT_CLIS,
  AGENT_MODELS,
  DEFAULT_AGENTS,
  getConfigSchema,
  patchTomlConfig,
  loadConfig,
} from "../core/config.js";
import {
  ensureWorktree,
  commitTaskFile,
  resetWorktree,
  syncBranchWithMain,
  worktreePathForBranch,
} from "../core/git.js";
import { LiveIndex, type RepoEvent } from "./live-index.js";
import { WorkWatcher } from "./watcher.js";
import { patchTaskFile, deleteTaskFile, WriteError, PathGuardError, type TaskPatch } from "./write.js";
import { renderInstanceIcon } from "./icons.js";
import { AgentRunner, deriveBranch, resolveEngineer, resolvePmAgent, resolveAgentForTask, runPrompt } from "./agents.js";
import { parseGeneratedTask, pmPrompt, explanationTitle } from "./freeform.js";
import { completeTask, type DoneStep } from "./done.js";
import { PreviewManager } from "./preview.js";
import { ReviewManager } from "./review.js";
import { ReloadManager, readBuildHash, isDevBuild } from "./reload.js";
import { testModelCombination } from "./model-test.js";
import { bootstrap } from "../core/bootstrap.js";
import { generateContextPack, resumePreamble } from "../core/context-pack.js";
import { sampleSystem, psAvailable, type SystemStats } from "./system.js";
import { readTunnelConfig, writeTunnelConfig } from "../core/tunnel.js";

export interface ServeOptions {
  root?: string;
  port?: number;
  host?: string;
  /**
   * True when this process is a reload replacement (REPOOS_RELOAD=1): retry
   * EADDRINUSE until the old process releases the port, instead of failing.
   */
  reloadReplacement?: boolean;
}

export interface ServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
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
        const rel = full.slice(config.root.length + 1).split("\\").join("/");
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
 * the last build (dist/.build-info.json, written by scripts/copy-assets.mjs).
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
  let buildAt: string | null = null;
  try {
    const info = JSON.parse(readFileSync(join(root, "dist", ".build-info.json"), "utf8"));
    if (typeof info?.generatedAt === "string") buildAt = info.generatedAt;
  } catch {
    /* build marker missing or corrupt */
  }
  return { version, buildAt };
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
function serveStaticUi(
  res: ServerResponse,
  uiDir: string,
  urlPath: string,
): boolean {
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

export function startServer(opts: ServeOptions = {}): Promise<ServerHandle> {
  const repoos = createRepoOS(opts.root);
  const config = repoos.config;
  const index = new LiveIndex(config);
  index.refreshAll();

  const uiDir = findUiDir(repoos.config.root);

  // The build hash of the code this process is running. Auto-reload (0066)
  // triggers a replacement whenever the on-disk hash diverges. Skipped in dev
  // mode (no compiled build to reload into), in preview children, and when an
  // ephemeral port is requested (nothing stable to hand off).
  const loadedHash = readBuildHash(config.root);
  const reloadEnabled =
    !isDevBuild() && process.env.REPOOS_PREVIEW_CHILD !== "1" && opts.port !== 0;
  let reload: ReloadManager | null = null;

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

  // The review agent (0101): when a task lands in `review`, it inspects the
  // implementation and writes a short report for whoever signs the task off.
  // Advisory only — it never moves a task to `done`.
  const reviews = new ReviewManager(config, emitEvent);

  // Tasks that landed in `review` while their engineer turn was still winding
  // down. Reviewing a worktree an agent is still committing to would report on
  // a half-written state, so the review waits for `agent.exited`.
  const pendingReview = new Set<string>();

  // Track launched coding agents so Pause can signal them and the UI can
  // reflect live running state without any polling.
  const runner = new AgentRunner(config, (e) => {
    emitEvent(e);
    if (e.type !== "agent.exited" || !pendingReview.delete(e.id)) return;
    const task = index.getTask(e.id);
    if (task?.status === "review") void reviews.run(task);
  });

  // Read-only preview servers for review/active tasks. Orphans from a crashed
  // previous main server are reaped at boot; this instance starts with none.
  const previews = new PreviewManager(config, emitEvent);
  previews.cleanupOrphans();

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
      });
      emitEvent({ type: "system.stats", stats });
    } catch {
      /* sampling is best-effort — never crash the poll loop */
    }
  }, SYSTEM_SAMPLE_INTERVAL_MS);

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

  // The file-watcher path (a direct task-file edit on disk) bypasses
  // patchTaskFile, so it never fires `onStatusChange`. The index's own event
  // stream sees EVERY status change from every route (HTTP PATCH, /done,
  // start/pause, the watcher, and the 0077 self-heal) — apply the same cleanup
  // there. Both firing for a single transition is harmless: `previews.stop` and
  // `runner.stop` are idempotent.
  const unsubscribeCleanup = index.on((e) => {
    if (e.type !== "task.updated") return;
    const prev = e.prev.status;
    if (prev === undefined || prev === e.task.status) return;
    onStatusChange(e.task, prev, e.task.status);
    // Every route into `review` — a board drag, the drawer, an agent editing
    // its own task file — surfaces here, so this is the one place the agent
    // review needs to hang off.
    if (e.task.status === "review") startReview(e.task);
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
      const mainUpdated = patchTaskFile(config, task.absPath, { needsMerge: value }, {
        onStatusChange: onServerStatusChange,
      });
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

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
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

    try {
      // ---- reads ----
      if (path === "/api/health" && method === "GET") {
        const snap = index.snapshot();
        const build = loadBuildInfo();
        // Readiness handshake for a reload replacement (0066): when this
        // process carries a reload secret AND the probe matches it, the answer
        // proves a live replacement is listening and healthy. The parent's own
        // health handler answers without the handshake (different secret), so
        // it can never confirm itself.
        const secret = process.env.REPOOS_RELOAD_SECRET;
        const handshake =
          typeof secret === "string" &&
          secret !== "" &&
          url.searchParams.get("reload") === secret;
        return json(res, 200, {
          ok: true,
          root: config.root,
          taskCount: snap.taskCount,
          workDir: config.workDir,
          version: build.version,
          buildAt: build.buildAt,
          ...(handshake ? { reloadHandshake: true } : {}),
        });
      }
      if (path === "/api/server/restart" && method === "POST") {
        // Best-effort manual reload (same path as the build watch): reloads
        // now when stale and idle, defers while agents run, or reports
        // not-stale when this process already serves the current build.
        const state = reload?.requestReload("manual restart") ?? {
          state: "not-stale",
          reason: "auto-reload unavailable",
        } as const;
        return json(res, 200, state);
      }
      if (path === "/api/tasks" && method === "GET") {
        const status = url.searchParams.get("status") as Status | null;
        if (status && !(STATUSES as readonly string[]).includes(status)) {
          return json(res, 400, { error: `Invalid status "${status}"` });
        }
        return json(res, 200, index.getTasks(status ?? undefined));
      }
      if (path === "/api/counts" && method === "GET") {
        return json(res, 200, index.counts());
      }
      if (path === "/api/index" && method === "GET") {
        return json(res, 200, index.snapshot());
      }
      if (path === "/api/docs" && method === "GET") {
        return json(res, 200, listDocs(config));
      }
      if (path === "/api/skills" && method === "GET") {
        return json(res, 200, listSkills(config));
      }
      if (path === "/api/agents/running" && method === "GET") {
        return json(res, 200, { tasks: runner.running() });
      }
      if (path === "/api/agents/detect" && method === "GET") {
        // Best-effort: a broken PATH entry or a hung probe must never break
        // the endpoint, so the whole detection is wrapped.
        let agents: DetectedAgent[] = [];
        try {
          agents = await detectAgents();
        } catch {
          agents = [];
        }
        return json(res, 200, { agents });
      }
      if (path === "/api/system" && method === "GET") {
        const stats = sampleSystem({
          serverPid: process.pid,
          cacheDir: join(config.root, config.cacheDir),
          runningAgents: runner.running(),
        });
        return json(res, 200, stats);
      }
      const outputMatch = path.match(/^\/api\/tasks\/([^/]+)\/output$/);
      if (outputMatch && method === "GET") {
        const session = runner.output(outputMatch[1]);
        return json(res, 200, {
          ok: true,
          lines: session?.lines ?? [],
          stats: runner.stats(outputMatch[1]),
        });
      }
      const reviewMatch = path.match(/^\/api\/tasks\/([^/]+)\/review$/);
      if (reviewMatch && method === "GET") {
        const reviewId = reviewMatch[1];
        return json(res, 200, {
          ok: true,
          /** Whether an agent review is being written right now. */
          running: reviews.isRunning(reviewId),
          /** Whether the review agent is enabled on the Agents page at all. */
          enabled: reviews.enabled(),
          review: reviews.read(reviewId),
        });
      }
      const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch && method === "GET") {
        const t = index.getTask(taskMatch[1]);
        return t
          ? json(res, 200, { ...t, preview: previews.get(t.id) ?? null })
          : json(res, 404, { error: `Task #${taskMatch[1]} not found` });
      }

      // ---- previews (read-only worktree servers, one per task) ----
      const previewStopMatch = path.match(/^\/api\/tasks\/([^/]+)\/preview\/stop$/);
      if (previewStopMatch && (method === "POST" || method === "DELETE")) {
        await previews.stop(previewStopMatch[1]);
        return json(res, 200, { ok: true });
      }
      const previewMatch = path.match(/^\/api\/tasks\/([^/]+)\/preview$/);
      if (previewMatch && (method === "POST" || method === "DELETE")) {
        if (method === "DELETE") {
          await previews.stop(previewMatch[1]);
          return json(res, 200, { ok: true });
        }
        const t = index.getTask(previewMatch[1]);
        if (!t) {
          return json(res, 404, { error: `Task #${previewMatch[1]} not found` });
        }
        const result = await previews.start(t);
        if (!result.ok) {
          return json(res, 400, { error: result.error ?? "could not start preview" });
        }
        return json(res, 200, { ok: true, port: result.port, url: result.url });
      }

      // ---- writes ----
      if (path === "/api/tasks" && method === "POST") {
        const body = (await readBody(req)) as Record<string, unknown>;
        if (!body.title || typeof body.title !== "string") {
          return json(res, 400, { error: "title is required" });
        }
        const created = repoos.createTask({
          title: body.title,
          type: body.type as string | undefined,
          area: body.area as string | undefined,
          priority: body.priority as string | undefined,
          assignedTo: body.assignedTo as string | undefined,
          status: body.status as Status | undefined,
        });
        // The watcher will also fire, but emit immediately so the requester's
        // own SSE stream sees it without waiting on fs latency.
        index.applyFileChange(created.absPath);
        // New task files are committed to main so they are never untracked
        // when their branch is merged later. Fail-soft: creation already
        // succeeded.
        commitTaskFile(config.root, created.absPath, `docs(${created.id}): add task`);
        return json(res, 201, index.getTask(created.id));
      }
      if (path === "/api/tasks/freeform" && method === "POST") {
        const body = (await readBody(req)) as Record<string, unknown>;
        const explanation =
          typeof body?.explanation === "string" ? body.explanation.trim() : "";
        if (!explanation) {
          return json(res, 400, { error: "explanation is required" });
        }
        // The client generates a per-run id so the PM agent's streamed output
        // (agent.output SSE events) can be correlated back to this request.
        const runId = typeof body?.runId === "string" && body.runId ? body.runId : null;

        // Fallback helper: persist the raw explanation as a draft task so a
        // missing/failed PM agent never loses the user's capture.
        const saveDraft = (fallbackReason: "no-pm-agent" | "agent-failed", detail?: string) => {
          const created = repoos.createTask({
            title: explanationTitle(explanation),
            body: explanation,
            status: "draft",
          });
          index.applyFileChange(created.absPath);
          commitTaskFile(config.root, created.absPath, `docs(${created.id}): add task`);
          return json(res, 201, {
            ok: true,
            fallback: true,
            fallbackReason,
            reason: detail,
            task: index.getTask(created.id),
          });
        };

        // Build a one-shot agent override for this freeform request.
        const freeformAgentName = typeof body?.agentOverride === "string" && body.agentOverride
          ? body.agentOverride : undefined;
        const freeformCli = typeof body?.cliOverride === "string" && body.cliOverride
          ? body.cliOverride : undefined;
        const freeformModel = typeof body?.modelOverride === "string" && body.modelOverride
          ? body.modelOverride : undefined;
        const hasFreeformOverride = freeformAgentName || freeformCli || freeformModel;

        // Resolve the PM agent, applying any one-shot override.
        let pm: Agent | null;
        if (hasFreeformOverride) {
          const list = config.agents?.length ? config.agents : DEFAULT_AGENTS;
          const baseName = freeformAgentName || "pm";
          const base = list.find((a) => a.enabled && a.name === baseName) ?? null;
          pm = base ? { ...base, ...(freeformCli ? { cli: freeformCli } : {}), ...(freeformModel ? { model: freeformModel } : {}) } : null;
        } else {
          pm = resolvePmAgent(config);
        }
        if (!pm) {
          return saveDraft("no-pm-agent");
        }

        const result = await runPrompt(pm, pmPrompt(explanation), {
          cwd: config.root,
          onLine: runId
            ? (line) => {
                emitEvent({
                  type: "agent.output",
                  id: runId,
                  entry: { s: "out", d: line },
                  stream: "out",
                  at: new Date().toISOString(),
                });
              }
            : undefined,
        });
        if (!result.ok || !result.output) {
          return saveDraft(
            "agent-failed",
            result.error ?? "the PM agent returned no usable output",
          );
        }
        const fields = parseGeneratedTask(result.output);
        if (!fields.title || !fields.body) {
          return saveDraft("agent-failed", "the PM agent returned unusable output");
        }
        const created = repoos.createTask(fields);
        index.applyFileChange(created.absPath);
        commitTaskFile(config.root, created.absPath, `docs(${created.id}): add task`);
        return json(res, 201, {
          ok: true,
          fallback: false,
          task: index.getTask(created.id),
        });
      }
      if (taskMatch && method === "PATCH") {
        const existing = index.getTask(taskMatch[1]);
        if (!existing) {
          return json(res, 404, { error: `Task #${taskMatch[1]} not found` });
        }
        const body = (await readBody(req)) as TaskPatch;
        const prevStatus = existing.status;
        const updated = patchTaskFile(config, existing.absPath, body, {
          onStatusChange: onServerStatusChange,
        });
        index.applyFileChange(updated.absPath);

        // Auto-sync main into the task branch when a task lands in review,
        // unless an agent turn is still cleaning up. Conflicts set needs_merge.
        if (
          prevStatus !== "review" &&
          updated.status === "review" &&
          updated.branch &&
          !runner.isRunning(updated.id)
        ) {
          void syncTaskBranch(updated);
        }

        return json(res, 200, index.getTask(updated.id));
      }
      const actionMatch = path.match(/^\/api\/tasks\/([^/]+)\/(start|pause|message|done|sync)$/);
      if (actionMatch && method === "POST") {
        const id = actionMatch[1];
        const existing = index.getTask(id);
        if (!existing) {
          return json(res, 404, { error: `Task #${id} not found` });
        }

        if (actionMatch[2] === "start") {
          // A `ready` task launches fresh; an `active` task with no running
          // agent (i.e. paused via /pause) relaunches in place — status stays
          // `active` either way, so a paused task never bounces through `ready`.
          if (existing.status !== "ready" && existing.status !== "active") {
            return json(res, 400, {
              error: `Only ready or paused tasks can be started (#${id} is ${existing.status})`,
            });
          }
          if (runner.isRunning(id)) {
            return json(res, 400, { error: `Task #${id} is already running` });
          }
          const agent = resolveAgentForTask(config, existing);
          if (!agent) {
            return json(res, 400, {
              error: "No enabled engineer agent is configured on the Agents page",
            });
          }
          // The task's branch wins; otherwise derive one from the title (the
          // same rule the task drawer uses) and persist it with the transition.
          // The agent works in a git worktree on that branch so the main
          // checkout — and the user — is never yanked off the current branch.
          // An optional `mode: "clean"` restarts a dirty task from scratch:
          // the existing worktree and branch are discarded so the agent begins
          // from a fresh checkout. The default ("resume") keeps the existing
          // worktree and its uncommitted changes.
          const body = (await readBody(req)) as { mode?: unknown };
          const clean = body?.mode === "clean";
          const branch = existing.branch || deriveBranch(existing.title);
          if (clean) {
            if (!existing.branch) {
              return json(res, 400, {
                error: `Task #${id} has no worktree yet — start normally instead`,
              });
            }
            if (!resetWorktree(config.root, branch)) {
              return json(res, 400, {
                error: `Could not reset the worktree for ${branch} — is it the main checkout?`,
              });
            }
          }
          const wtRes = ensureWorktree(config.root, branch);
          const patch: TaskPatch = { status: "active", needsInput: false };
          if (!existing.branch) patch.branch = branch;
          const updated = patchTaskFile(config, existing.absPath, patch, {
            onStatusChange: onServerStatusChange,
          });
          index.applyFileChange(updated.absPath);
          index.refreshBranches();
          const cwd = wtRes.ok ? wtRes.path : config.root;

          // Bootstrap: RepoOS-owned preflight before the agent sees the
          // worktree. Validates the root/worktree/branch, checks the
          // orchestration build, and installs missing dependencies. Failures
          // stop the launch with a clear error — the task stays `active` and
          // the worktree is left unchanged so the problem is recoverable.
          const taskForLaunch = index.getTask(updated.id) ?? updated;
          const bootResult = await bootstrap(config, taskForLaunch, branch, cwd);
          if (!bootResult.ok) {
            return json(res, 500, {
              ok: false,
              error: `Bootstrap failed: ${bootResult.reason ?? "unknown error"}`,
              bootstrap: {
                ok: false,
                durationMs: bootResult.durationMs,
                steps: bootResult.steps.map((s) => ({
                  name: s.name,
                  ok: s.ok,
                  durationMs: s.durationMs,
                  detail: s.detail,
                })),
              },
            });
          }

          // Generate a cached task context pack so the agent starts with
          // knowledge of the repo, relevant files, tests, and worktree state.
          const pack = generateContextPack(config, taskForLaunch, branch, cwd, bootResult);

          // Resume preamble: when resuming a dirty worktree, explicitly
          // describe existing partial changes so the agent doesn't rediscover
          // them from scratch.
          const preamble =
            clean || !existing.branch
              ? undefined
              : resumePreamble(config, taskForLaunch, branch, cwd);

          const spawnRes = runner.start(taskForLaunch, branch, agent, {
            cwd,
            contextPack: pack.content,
            resumePreamble: preamble,
          });
          return json(res, 200, {
            ok: true,
            task: index.getTask(updated.id),
            branch,
            clean,
            git: wtRes.ok ? "ok" : wtRes.reason ?? "unknown",
            worktree: wtRes.ok ? wtRes.path : undefined,
            spawn: {
              ok: spawnRes.ok,
              pid: spawnRes.pid,
              reason: spawnRes.reason,
            },
            bootstrap: {
              ok: bootResult.ok,
              durationMs: bootResult.durationMs,
              steps: bootResult.steps.map((s) => ({
                name: s.name,
                ok: s.ok,
                durationMs: s.durationMs,
              })),
            },
            context: {
              cacheHit: pack.cacheHit,
              generationMs: pack.generationMs,
              size: pack.size,
            },
          });
        }

        if (actionMatch[2] === "done") {
          if (existing.status !== "review") {
            return json(res, 400, {
              error: `Only review tasks can be completed (#${id} is ${existing.status})`,
            });
          }
          if (!existing.branch) {
            return json(res, 400, { error: `Task #${id} has no branch to merge` });
          }
          if (runner.isRunning(id)) {
            return json(res, 409, {
              error: `Task #${id} has an agent turn in progress`,
            });
          }
          // The merge removes the worktree, so the preview of it must die first.
          await previews.stop(id);
          // Same for an agent review still reading that worktree: the human is
          // signing off now, so the report has served its purpose either way.
          pendingReview.delete(id);
          reviews.cancel(id);
          // ... and any agent process must be released too, so the worktree is
          // never torn out from under a live process. The 409 above guards the
          // case of a genuinely-active turn; this is belt-and-braces for a turn
          // still in its stop grace window. A no-op when nothing is running.
          void runner.stop(id);
          const result = await completeTask(config, existing, (step: DoneStep) => {
            emitEvent({
              type: "task.progress",
              id,
              step,
              at: new Date().toISOString(),
            });
          });
          if (result.task) index.applyFileChange(result.task.absPath);
          index.refreshBranches();
          return json(res, result.ok ? 200 : 400, {
            ok: result.ok,
            merged: result.merged,
            conflicts: result.conflicts,
            ff: result.ff,
            drifted: result.drifted,
            check: result.check,
            error: result.reason,
            task: result.task ? index.getTask(result.task.id) : undefined,
          });
        }

        if (actionMatch[2] === "sync") {
          if (existing.status !== "review") {
            return json(res, 400, {
              error: `Only review tasks can be synced (#${id} is ${existing.status})`,
            });
          }
          if (!existing.branch) {
            return json(res, 400, { error: `Task #${id} has no branch to sync` });
          }
          if (runner.isRunning(id)) {
            return json(res, 409, {
              error: `Task #${id} has an agent turn in progress`,
            });
          }
          const sync = await syncTaskBranch(existing);
          index.refreshBranches();
          return json(res, sync.ok ? 200 : 409, {
            ok: sync.ok,
            conflicts: sync.conflicts,
            error: sync.reason,
          });
        }

        if (actionMatch[2] === "message") {
          if (existing.status !== "active" && existing.status !== "review") {
            return json(res, 400, {
              error: `Only active or review tasks accept messages (#${id} is ${existing.status})`,
            });
          }
          const agent = resolveAgentForTask(config, existing);
          if (!agent) {
            return json(res, 400, {
              error: "No enabled engineer agent is configured on the Agents page",
            });
          }
          const body = (await readBody(req)) as { text?: unknown };
          const text = typeof body?.text === "string" ? body.text.trim() : "";
          if (!text) {
            return json(res, 400, { error: "message text is required" });
          }
          // Replying means the human is no longer needed: clear the flag on the
          // main copy before the session resumes so the board stops signalling.
          if (existing.needsInput) {
            const cleared = patchTaskFile(config, existing.absPath, { needsInput: false });
            index.applyFileChange(cleared.absPath);
          }
          // Build a resume preamble so the agent sees existing partial changes
          // without rediscovering them from scratch.
          let preamble: string | undefined;
          if (existing.branch) {
            const wtPath = worktreePathForBranch(config.root, existing.branch);
            if (wtPath) {
              preamble = resumePreamble(config, existing, existing.branch, wtPath) || undefined;
            }
          }
          const sendRes = runner.send(id, text, agent, { resumePreamble: preamble });
          if (!sendRes.ok && sendRes.busy) {
            return json(res, 409, { error: sendRes.reason ?? "agent is busy" });
          }
          if (!sendRes.ok) {
            return json(res, 400, { error: sendRes.reason ?? "could not send message" });
          }
          return json(res, 200, {
            ok: true,
            spawn: { ok: true, pid: sendRes.pid },
          });
        }

        if (existing.status !== "active") {
          return json(res, 400, {
            error: `Only active tasks can be paused (#${id} is ${existing.status})`,
          });
        }
        const stopRes = runner.stop(id);
        // Status stays `active` — pausing only stops the agent process, it no
        // longer demotes the task back to `ready` (see #0070). `needsInput`
        // still clears: a stopped agent isn't waiting on a reply.
        const updated = patchTaskFile(config, existing.absPath, {
          needsInput: false,
        }, {
          onStatusChange: onServerStatusChange,
        });
        index.applyFileChange(updated.absPath);
        return json(res, 200, {
          ok: true,
          task: index.getTask(updated.id),
          stopped: stopRes.stopped,
          reason: stopRes.reason,
        });
      }
      if (taskMatch && method === "DELETE") {
        const existing = index.getTask(taskMatch[1]);
        if (!existing) {
          return json(res, 404, { error: `Task #${taskMatch[1]} not found` });
        }
        // A deleted task's preview must not outlive it.
        await previews.stop(taskMatch[1]);
        try {
          deleteTaskFile(config, existing.absPath);
        } catch (err) {
          if (err instanceof PathGuardError) {
            return json(res, 400, { error: err.message });
          }
          // Idempotent: the file is already gone, so the task no longer exists.
          return json(res, 404, { error: `Task #${taskMatch[1]} not found` });
        }
        index.applyFileDelete(existing.absPath);
        return json(res, 200, { ok: true });
      }

      // ---- config read / write ----
      if (path === "/api/config" && method === "GET") {
        // Agents default at runtime: when nothing is stored, serve the built-ins.
        const storedAgents = Array.isArray(repoos.config.agents) ? repoos.config.agents : [];
        const agents = storedAgents.length ? storedAgents : DEFAULT_AGENTS;
        return json(res, 200, {
          config: { ...repoos.config, agents },
          schema: getConfigSchema(),
          // The static list is the fallback the Agents page shows while /api/models
          // loads (and when no model source is available).
          agentsMeta: { clis: AGENT_CLIS, models: AGENT_MODELS, defaults: DEFAULT_AGENTS },
        });
      }
      if (path === "/api/models" && method === "GET") {
        // Per-CLI live model lists, probed on demand (the Agents page fetches
        // on mount and re-probes with ?refresh=1). Best-effort: a broken PATH,
        // missing binary, or hung probe must never break the endpoint.
        const refresh = url.searchParams.get("refresh") === "1";
        let byCli: Record<string, ModelSourceResult> = {};
        try {
          byCli = await listModelSources({ refresh, cwd: config.root });
        } catch {
          byCli = {};
        }
        return json(res, 200, { byCli, at: new Date().toISOString() });
      }
      if (path === "/api/models/test" && method === "POST") {
        try {
          const body = (await readBody(req)) as { cli?: unknown; model?: unknown };
          if (typeof body.cli !== "string" || !AGENT_CLIS.includes(body.cli as typeof AGENT_CLIS[number])) {
            return json(res, 400, { error: "cli must be a supported coding agent" });
          }
          if (typeof body.model !== "string" || !body.model.trim() || body.model.length > 120) {
            return json(res, 400, { error: "model must be a non-empty string" });
          }
          // Model discovery and execution are separate capabilities. Claude
          // and Qwen cannot list their catalogs, but they can still execute a
          // user-selected/default model and must reach the real probe.
          const result = await testModelCombination(body.cli, body.model, { cwd: config.root });
          return json(res, 200, { result, at: new Date().toISOString() });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          return json(res, 500, { error: `Model compatibility test failed: ${reason}` });
        }
      }
      if (path === "/api/config" && method === "PATCH") {
        const body = (await readBody(req)) as Record<string, unknown>;
        const patch: Record<string, unknown> = {};

        // Agents are validated outside the schema loop (they're a table array).
        if (body.agents !== undefined) {
          if (!Array.isArray(body.agents)) {
            return json(res, 400, { error: "agents must be an array" });
          }
          const list: {
            name: string;
            cli: string;
            model: string;
            enabled: boolean;
            instructions?: string;
          }[] = [];
          for (const agent of body.agents) {
            const a = agent as Record<string, unknown>;
            if (typeof a?.name !== "string" || !a.name.trim()) {
              return json(res, 400, { error: "each agent needs a non-empty name" });
            }
            if (!AGENT_CLIS.includes(a.cli as (typeof AGENT_CLIS)[number])) {
              return json(res, 400, { error: `cli must be one of: ${AGENT_CLIS.join(", ")}` });
            }
            // The model stays a RepoOS-side label: any non-empty string is
            // accepted so dynamically-selected models save. AGENT_MODELS remains
            // the fallback suggested list, never an allowlist.
            if (typeof a.model !== "string" || !a.model.trim()) {
              return json(res, 400, { error: `agent "${a.name}" model must be a non-empty string` });
            }
            if (typeof a.enabled !== "boolean") {
              return json(res, 400, { error: `agent "${a.name}" enabled must be true or false` });
            }
            if (a.instructions !== undefined && typeof a.instructions !== "string") {
              return json(res, 400, { error: `agent "${a.name}" instructions must be a string` });
            }
            const entry: {
              name: string;
              cli: string;
              model: string;
              enabled: boolean;
              instructions?: string;
            } = {
              name: a.name.trim(),
              cli: a.cli as string,
              model: a.model as string,
              enabled: a.enabled,
            };
            if (typeof a.instructions === "string" && a.instructions.trim()) {
              entry.instructions = a.instructions.trim();
            }
            list.push(entry);
          }
          patch.agents = list;
        }

        // Validate every field against the schema
        const schema = getConfigSchema();
        for (const field of schema) {
          if (body[field.key] === undefined) continue;
          const val = body[field.key];

          if (field.type === "string") {
            if (typeof val !== "string" || !val.toString().trim()) {
              return json(res, 400, { error: `${field.label} must be a non-empty string` });
            }
            patch[field.key] = val.toString().trim();
          } else if (field.type === "boolean") {
            if (typeof val !== "boolean") {
              return json(res, 400, { error: `${field.label} must be true or false` });
            }
            patch[field.key] = val;
          } else if (field.type === "select") {
            const valid = field.options?.map((o) => o.value) ?? [];
            if (!valid.includes(val as string)) {
              return json(res, 400, {
                error: `${field.label} must be one of: ${valid.join(", ")}`,
              });
            }
            patch[field.key] = val;
          } else if (field.type === "array") {
            if (!Array.isArray(val) || !val.length) {
              return json(res, 400, { error: `${field.label} must be a non-empty array` });
            }
            for (const item of val) {
              if (typeof item !== "string" || !item.trim()) {
                return json(res, 400, { error: `${field.label} entries must be non-empty strings` });
              }
            }
            patch[field.key] = (val as string[]).map((s) => s.trim());
          }
        }

        const tunnelEnabled =
          typeof patch.tunnelEnabled === "boolean" ? patch.tunnelEnabled : undefined;
        delete patch.tunnelEnabled;

        if (Object.keys(patch).length === 0 && tunnelEnabled === undefined) {
          return json(res, 400, { error: "No valid fields to update" });
        }

        if (Object.keys(patch).length > 0) {
          patchTomlConfig(join(config.root, "repoos.toml"), patch);
        }
        if (tunnelEnabled !== undefined) {
          const tunnel = readTunnelConfig(config.root);
          tunnel.enabled = tunnelEnabled;
          writeTunnelConfig(config.root, tunnel);
        }

        // Update in-memory config so live endpoints see fresh values
        Object.assign(repoos.config, loadConfig(config.root));

        // Re-index if operational paths changed
        if (patch.workDir || patch.cacheDir || patch.taskExtensions) {
          index.refreshAll();
        }

        return json(res, 200, { ok: true, config: repoos.config });
      }

      // ---- PWA: per-instance manifest + icons ----
      if (path === "/manifest.webmanifest" && method === "GET") {
        res.writeHead(200, {
          "Content-Type": "application/manifest+json; charset=utf-8",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(manifestFor(config.root));
        return;
      }
      const iconMatch = path.match(/^\/icons\/icon-(\d+)\.png$/);
      if (iconMatch && method === "GET") {
        const size = Math.min(1024, Math.max(16, Number(iconMatch[1]) || 512));
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Cache-Control": "max-age=86400",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(renderInstanceIcon(basename(config.root) || "repoos", size));
        return;
      }

      // ---- static: built UI + doc files ----
      if (method === "GET" && uiDir) {
        // Built SPA assets (index.html, /assets/*, favicon, manifest, …).
        if (serveStaticUi(res, uiDir, path)) return;
      }
      if (method === "GET" && !path.startsWith("/api/")) {
        // serve markdown docs (AGENTS.md, docs/**.md) for the Context view
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
      // SPA fallback: unknown GET paths (e.g. /work on refresh) render the app.
      if (method === "GET" && uiDir) {
        const index = join(uiDir, "index.html");
        if (existsSync(index)) {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(readFileSync(index));
          return;
        }
        return json(res, 500, { error: "UI asset not found — run `bun run build`" });
      }

      return json(res, 404, { error: "Not found", path });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof WriteError ? 400 : 500;
      return json(res, code, { error: msg });
    }
  });

  const port = opts.port ?? 7171;
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
          if (!bound) throw new Error(`EADDRINUSE: port ${port} never freed for the reload replacement`);
        } else {
          await bindOnce(false);
        }
      } catch (err) {
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
        runner.dispose();
        throw err;
      }

      const actualPort = (server.address() as { port: number }).port;
      const url = `http://${host}:${actualPort}`;
      // The agent runner injects the real control-plane URL into every spawned
      // agent so preview requests target THIS server, never a hardcoded port.
      runner.apiUrl = url;
      const handle: ServerHandle = {
        url,
        port: actualPort,
        index,
        close: async () => {
          clearInterval(systemSampleTimer);
          runner.dispose();
          unsubscribe();
          unsubscribeCleanup();
          watcher.stop();
          reload?.stop();
          // No preview survives the main server: on SIGTERM/SIGINT (or an
          // in-process close / reload handover) tear them all down so no
          // orphan `repoos serve` process is left behind. Same for review
          // agents — a one-shot child must not outlive the server that
          // launched it and wait 15 minutes to write a report nobody reads.
          reviews.cancelAll();
          await previews.stopAll();
          for (const c of clients) {
            try {
              c.end();
            } catch {
              /* ignore */
            }
          }
          clients.clear();
          await closeHttp();
        },
      };

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
        cliEntry: cliEntryPath,
        stopListening: closeHttp,
        listen: () => bindOnce(false),
        onReloadConfirmed: async () => {
          await handle.close();
          process.exit(0);
        },
        onReloadFailed: (reason) => {
          console.log(`  ${reason} — old process keeps serving`);
        },
        log: (msg) => console.log(msg),
      });
      reload.start();
      // Stale-boot self-heal: a newer build that landed while we were starting
      // is picked up immediately (skipped by REPOOS_RELOAD=1 replacements).
      void reload.bootSelfHeal();

      resolve(handle);
    })().catch((e) => reject(e as Error));
  });
}
