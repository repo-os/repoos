/**
 * The RepoOS local server. Dependency-free: built on the Node/Bun `http`
 * module (Bun implements the same API, so this runs unchanged on both).
 *
 * It is a thin TRANSPORT over the LiveIndex + safe writers. No business logic
 * lives here that isn't already in core. Endpoints:
 *
 *   GET  /api/health           -> { ok, root, taskCount }
 *   GET  /api/tasks            -> Task[]            (?status=active to filter)
 *   GET  /api/tasks/:id        -> Task | 404
 *   GET  /api/counts           -> { inbox, ready, ... }
 *   GET  /api/index            -> full RepoIndex snapshot
 *   GET  /api/docs             -> [{ path, title }]  (context docs listing)
 *   POST /api/tasks            -> create  { title, type?, area?, priority?, assignedTo? }
 *   PATCH/api/tasks/:id        -> patch   { status?, title?, ... }
 *   GET  /api/events           -> SSE stream of RepoEvent
 *
 * The SSE stream is the live heartbeat the Stage 3 UI subscribes to.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoOSConfig, Status } from "../core/types.js";
import { STATUSES } from "../core/types.js";
import { createRepoOS } from "../core/repoos.js";
import { LiveIndex, type RepoEvent } from "./live-index.js";
import { WorkWatcher } from "./watcher.js";
import { patchTaskFile, WriteError, type TaskPatch } from "./write.js";

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

/** Locate the bundled UI html. Resolves relative to the compiled server.js. */
function findUiHtml(): string | null {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/server
  const candidates = [
    join(here, "..", "ui", "app.html"), // dist/ui/app.html (shipped)
    join(here, "..", "..", "src", "ui", "app.html"), // src during dev
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
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
  const ros = createRepoOS(opts.root);
  const config = ros.config;
  const index = new LiveIndex(config);
  index.refreshAll();

  const uiPath = findUiHtml();
  const uiHtml = uiPath ? readFileSync(uiPath, "utf8") : null;
  const vendorVue = uiPath
    ? (() => {
        const v = join(dirname(uiPath), "vendor", "vue.global.prod.js");
        return existsSync(v) ? readFileSync(v, "utf8") : null;
      })()
    : null;
  const favicon = uiPath
    ? (() => {
        const f = join(dirname(uiPath), "favicon.svg");
        return existsSync(f) ? readFileSync(f, "utf8") : null;
      })()
    : null;

  const watcher = new WorkWatcher(config, index);
  watcher.start();

  // active SSE clients
  const clients = new Set<ServerResponse>();
  const unsubscribe = index.on((e: RepoEvent) => {
    const frame = `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
    for (const res of clients) {
      try {
        res.write(frame);
      } catch {
        clients.delete(res);
      }
    }
  });

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
        return json(res, 200, {
          ok: true,
          root: config.root,
          taskCount: snap.taskCount,
          workDir: config.workDir,
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
        const created = ros.createTask({
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
        return json(res, 201, index.getTask(created.id));
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

      // ---- static: UI + doc files ----
      if (path === "/vendor/vue.global.prod.js" && method === "GET") {
        if (!vendorVue) return json(res, 500, { error: "vue asset missing" });
        res.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "max-age=86400",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(vendorVue);
        return;
      }
      if (path === "/favicon.svg" && method === "GET") {
        if (!favicon) return json(res, 404, { error: "favicon not found" });
        res.writeHead(200, {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "max-age=86400",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(favicon);
        return;
      }
      if ((path === "/" || path === "/index.html") && method === "GET") {
        if (!uiHtml) {
          return json(res, 500, { error: "UI asset not found" });
        }
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(uiHtml);
        return;
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
      const url = `http://${host}:${port}`;
      resolve({
        url,
        port,
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
