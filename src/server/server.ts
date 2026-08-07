/**
 * The RepoOS local server. Dependency-free: built on the Node/Bun `http`
 * module (Bun implements the same API, so this runs unchanged on both).
 *
 * It is a thin TRANSPORT over the LiveIndex + safe writers. No business logic
 * lives here that isn't already in core. Endpoints:
 *
 *   GET  /api/health           -> { ok, root, taskCount, workDir, version, buildAt }
 *   GET  /api/tasks            -> Task[]            (?status=active to filter)
 *   GET  /api/tasks/:id        -> Task | 404
 *   GET  /api/counts           -> { inbox, ready, ... }
 *   GET  /api/index            -> full RepoIndex snapshot
 *   GET  /api/docs             -> [{ path, title }]  (context docs listing)
 *   GET  /api/skills           -> [{ path, name, description }]  (skills listing)
 *   POST /api/tasks            -> create  { title, type?, area?, priority?, assignedTo? }
 *   POST /api/tasks/freeform   -> create from a freeform explanation via the PM agent
 *   PATCH/api/tasks/:id        -> patch   { status?, title?, ... }
 *   POST /api/tasks/:id/start  -> launch the engineer agent on the task (ready -> active)
 *   POST /api/tasks/:id/pause  -> stop the running agent (active -> ready)
 *   POST /api/tasks/:id/message -> send a follow-up to the task's agent session (active)
 *   GET  /api/tasks/:id/output -> the retained session transcript for a task
 *   DELETE /api/tasks/:id      -> remove  the task file (emits task.deleted)
 *   GET  /api/agents/running   -> [{ id, pid, startedAt }] running agents
 *   GET  /api/events           -> SSE stream of RepoEvent
 *
 * The SSE stream is the live heartbeat the Stage 3 UI subscribes to.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoOSConfig, SkillMeta, Status } from "../core/types.js";
import { STATUSES } from "../core/types.js";
import { createRepoOS } from "../core/repoos.js";
import {
  AGENT_CLIS,
  AGENT_MODELS,
  DEFAULT_AGENTS,
  getConfigSchema,
  patchTomlConfig,
  loadConfig,
} from "../core/config.js";
import { ensureWorktree, commitTaskFile } from "../core/git.js";
import { LiveIndex, type RepoEvent } from "./live-index.js";
import { WorkWatcher } from "./watcher.js";
import { patchTaskFile, deleteTaskFile, WriteError, PathGuardError, type TaskPatch } from "./write.js";
import { renderInstanceIcon } from "./icons.js";
import { AgentRunner, deriveBranch, resolveEngineer, resolvePmAgent, runPrompt } from "./agents.js";
import { parseGeneratedTask, pmPrompt, explanationTitle } from "./freeform.js";
import { completeTask, type DoneStep } from "./done.js";

export interface ServeOptions {
  root?: string;
  port?: number;
  host?: string;
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

  const watcher = new WorkWatcher(config, index);
  watcher.start();

  // active SSE clients
  const clients = new Set<ServerResponse>();
  const emitEvent = (e: RepoEvent) => {
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

  // Track launched coding agents so Pause can signal them and the UI can
  // reflect live running state without any polling.
  const runner = new AgentRunner(config, emitEvent);

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
        return json(res, 200, {
          ok: true,
          root: config.root,
          taskCount: snap.taskCount,
          workDir: config.workDir,
          version: build.version,
          buildAt: build.buildAt,
        });
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
      const outputMatch = path.match(/^\/api\/tasks\/([^/]+)\/output$/);
      if (outputMatch && method === "GET") {
        const session = runner.output(outputMatch[1]);
        return json(res, 200, { ok: true, lines: session?.lines ?? [] });
      }
      const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch && method === "GET") {
        const t = index.getTask(taskMatch[1]);
        return t
          ? json(res, 200, t)
          : json(res, 404, { error: `Task #${taskMatch[1]} not found` });
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

        const pm = resolvePmAgent(config);
        if (!pm) {
          return saveDraft("no-pm-agent");
        }

        const result = await runPrompt(pm, pmPrompt(explanation), { cwd: config.root });
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
        const updated = patchTaskFile(config, existing.absPath, body);
        index.applyFileChange(updated.absPath);
        return json(res, 200, index.getTask(updated.id));
      }
      const actionMatch = path.match(/^\/api\/tasks\/([^/]+)\/(start|pause|message|done)$/);
      if (actionMatch && method === "POST") {
        const id = actionMatch[1];
        const existing = index.getTask(id);
        if (!existing) {
          return json(res, 404, { error: `Task #${id} not found` });
        }

        if (actionMatch[2] === "start") {
          if (existing.status !== "ready") {
            return json(res, 400, {
              error: `Only ready tasks can be started (#${id} is ${existing.status})`,
            });
          }
          if (runner.isRunning(id)) {
            return json(res, 400, { error: `Task #${id} is already running` });
          }
          const agent = resolveEngineer(config);
          if (!agent) {
            return json(res, 400, {
              error: "No enabled engineer agent is configured on the Agents page",
            });
          }
          // The task's branch wins; otherwise derive one from the title (the
          // same rule the task drawer uses) and persist it with the transition.
          // The agent works in a git worktree on that branch so the main
          // checkout — and the user — is never yanked off the current branch.
          const branch = existing.branch || deriveBranch(existing.title);
          const wtRes = ensureWorktree(config.root, branch);
          const patch: TaskPatch = { status: "active" };
          if (!existing.branch) patch.branch = branch;
          const updated = patchTaskFile(config, existing.absPath, patch);
          index.applyFileChange(updated.absPath);
          index.refreshBranches();
          // Best-effort spawn — never block the HTTP response on the agent.
          const cwd = wtRes.ok ? wtRes.path : config.root;
          const spawnRes = runner.start(index.getTask(updated.id) ?? updated, branch, agent, { cwd });
          return json(res, 200, {
            ok: true,
            task: index.getTask(updated.id),
            branch,
            git: wtRes.ok ? "ok" : wtRes.reason ?? "unknown",
            worktree: wtRes.ok ? wtRes.path : undefined,
            spawn: {
              ok: spawnRes.ok,
              pid: spawnRes.pid,
              reason: spawnRes.reason,
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
          const result = completeTask(config, existing, (step: DoneStep) => {
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
            check: result.check,
            error: result.reason,
            task: result.task ? index.getTask(result.task.id) : undefined,
          });
        }

        if (actionMatch[2] === "message") {
          if (existing.status !== "active") {
            return json(res, 400, {
              error: `Only active tasks accept messages (#${id} is ${existing.status})`,
            });
          }
          const agent = resolveEngineer(config);
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
          const sendRes = runner.send(id, text, agent);
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
        const updated = patchTaskFile(config, existing.absPath, { status: "ready" });
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
          agentsMeta: { clis: AGENT_CLIS, models: AGENT_MODELS, defaults: DEFAULT_AGENTS },
        });
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
            if (!AGENT_MODELS.includes(a.model as (typeof AGENT_MODELS)[number])) {
              return json(res, 400, { error: `model must be one of: ${AGENT_MODELS.join(", ")}` });
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

        if (Object.keys(patch).length === 0) {
          return json(res, 400, { error: "No valid fields to update" });
        }

        patchTomlConfig(join(config.root, "repoos.toml"), patch);

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
        const legacy = join(uiDir, "app.html"); // pre-Vite build
        const entry = existsSync(index) ? index : legacy;
        if (existsSync(entry)) {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(readFileSync(entry));
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

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const actualPort = (server.address() as { port: number }).port;
      const url = `http://${host}:${actualPort}`;
      resolve({
        url,
        port: actualPort,
        index,
        close: () =>
          new Promise<void>((res) => {
            unsubscribe();
            watcher.stop();
            for (const c of clients) {
              try {
                c.end();
              } catch {
                /* ignore */
              }
            }
            clients.clear();
            server.close(() => res());
          }),
      });
    });
  });
}
