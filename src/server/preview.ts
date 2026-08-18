/**
 * Read-only preview servers for review/active tasks.
 *
 * Each preview is a separate `repoos serve` process rooted at the task's own
 * git worktree, bound to an OS-assigned ephemeral port (never a hardcoded
 * range). The main server keeps a registry — in memory plus persisted to
 * `<cacheDir>/previews.json` — so previews can be stopped on demand, reaped
 * when a task leaves active/review, torn down on shutdown, and cleaned up at
 * boot when a crashed main server left orphans behind.
 *
 * Zero runtime deps: node:child_process / node:net / node:fs only.
 */
import { spawn, spawnSync, execFileSync, type ChildProcess } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoOSConfig, Status, Task } from "../core/types.js";
import { worktreePathForBranch } from "../core/git.js";
import { checkBuildForRoot } from "../core/build.js";
import type { RepoEvent } from "./live-index.js";

export interface PreviewInfo {
  port: number;
  url: string;
  startedAt: string;
  pid: number;
}

export interface PreviewResult {
  ok: boolean;
  port?: number;
  url?: string;
  error?: string;
}

/** Result of a trusted server-side health/static probe of a preview URL (#0121). */
export interface PreviewProbe {
  ok: boolean;
  detail?: string;
  error?: string;
}

/** Registry persisted between main-server runs (for orphan cleanup at boot). */
interface RegistryFile {
  mainPid: number;
  previews: Record<string, PreviewInfo>;
}

const PREVIEW_STATES: readonly Status[] = ["active", "review"];
const HOST = "127.0.0.1";
const HEALTH_TIMEOUT_MS = 10_000;
const BUILD_TIMEOUT_MS = 240_000;
/** Hard cap on concurrently running preview servers (#0198). */
const MAX_PREVIEWS = 4;
/** Marks a spawned child so it skips its own boot-time orphan cleanup. */
const CHILD_ENV = "REPOOS_PREVIEW_CHILD";

const now = (): string => new Date().toISOString();

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A fresh OS-assigned port, released just before the preview child binds. */
function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createTcpServer();
    srv.once("error", reject);
    srv.listen(0, HOST, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

/** Whether the child responds to /api/health within the window. */
async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  return false;
}

/**
 * Probe a live preview URL from the trusted server side (#0121): the health
 * endpoint first, then the root page. A healthy health endpoint is enough for
 * a pass — the static-page check is informational so the transcript can state
 * exactly what was verified. Used when a sandboxed agent cannot open the
 * returned URL itself.
 */
export async function probePreview(url: string): Promise<PreviewProbe> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastError = "preview did not respond";
  while (Date.now() < deadline) {
    let healthStatus = 0;
    try {
      const r = await fetch(`${url}/api/health`);
      healthStatus = r.status;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (healthStatus === 200) {
      let pageStatus = 0;
      try {
        const page = await fetch(url);
        pageStatus = page.status;
      } catch {
        /* static-page check is best-effort */
      }
      return {
        ok: true,
        detail:
          pageStatus === 200
            ? "health endpoint and root page respond"
            : `health endpoint responds (root page: HTTP ${pageStatus || "unreachable"})`,
      };
    }
    if (healthStatus > 0) {
      return { ok: false, error: `preview health endpoint returned HTTP ${healthStatus}` };
    }
    await sleep(150);
  }
  return { ok: false, error: lastError };
}

/** Absolute path of the compiled CLI entrypoint relative to this module. */
function cliEntry(): string | null {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/server or src/server
  const candidates = [
    join(here, "..", "cli", "index.js"), // compiled: dist/cli/index.js
    join(here, "..", "..", "dist", "cli", "index.js"), // dev: repo-root dist
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

/**
 * Rebuild a worktree's `dist/` when its src hash no longer matches its build
 * marker — the same staleness check the CLI warns about — so a preview always
 * serves current code. A checkout with no `src/` is treated as published.
 */
function ensureFreshBuild(root: string): { ok: boolean; error?: string } {
  const check = checkBuildForRoot(root);
  if (!check.stale) return { ok: true };
  const steps: string[][] = [
    ["bun", "run", "build"],
    ["npm", "run", "build"],
  ];
  let lastError = check.message ?? "build failed";
  for (const cmd of steps) {
    const run = spawnSync(cmd[0], cmd.slice(1), {
      cwd: root,
      encoding: "utf8",
      timeout: BUILD_TIMEOUT_MS,
    });
    if (run.status === 0) return { ok: true };
    const out = [run.stdout, run.stderr]
      .filter((x): x is string => typeof x === "string" && x.trim() !== "")
      .join("\n")
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join(" · ");
    lastError = out || `${cmd[0]} ${cmd[1]} failed (exit ${run.status})`;
  }
  return { ok: false, error: `could not build the worktree before previewing: ${lastError}` };
}

/**
 * True when `pid` is a live process that is serving on `port`. The command
 * line is matched structurally — the repoos CLI entry + the exact `--port`
 * value the preview was spawned with — so it never depends on the repo path
 * happening to contain "repoos", and can't match an unrelated `node serve`.
 */
function isPreviewProcess(pid: number, port: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false; // no such process
  }
  if (process.platform === "win32") return true; // no portable cmdline inspection
  try {
    const cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 4000,
    });
    return (
      /cli[/\\]index\.(js|ts)/.test(cmd) &&
      cmd.includes("serve") &&
      cmd.includes(`--port ${port}`)
    );
  } catch {
    return false;
  }
}

export class PreviewManager {
  private registry = new Map<string, PreviewInfo>();
  private readonly file: string;
  private readonly config: RepoOSConfig;
  private readonly emit: (e: RepoEvent) => void;
  /** Last stderr lines from a still-booting preview, for diagnostics. */
  private bootErrors = new Map<string, string>();
  /** Starts still in flight per task, so concurrent calls never double-spawn. */
  private inflight = new Map<string, Promise<PreviewResult>>();

  constructor(config: RepoOSConfig, emit: (e: RepoEvent) => void) {
    this.config = config;
    this.emit = emit;
    this.file = join(config.root, config.cacheDir, "previews.json");
  }

  /**
   * PIDs of preview servers this manager started. Used by the serve-process
   * census (#0216) so a legitimate preview is never counted as a stray.
   */
  knownPids(): number[] {
    return [...this.registry.values()].map((i) => i.pid).filter((p) => p > 0);
  }

  get(taskId: string): PreviewInfo | null {
    return this.registry.get(taskId) ?? null;
  }

  /**
   * Start a preview for a task: rebuild the worktree if stale, allocate an
   * ephemeral port, spawn a `repoos serve` rooted at the worktree, and wait
   * for it to come up. Returns `{ ok, port, url }` or a human-readable error.
   *
   * Every check happens BEFORE anything starts: the task id must resolve, the
   * task must be in an allowed state (active/review), it must carry a
   * registered branch, and that branch must have a real linked worktree. The
   * worktree path is resolved from the task's own branch — never an
   * agent-supplied path (ADR-0005). Repeated requests are idempotent and
   * return the existing healthy preview.
   */
  async start(task: Task): Promise<PreviewResult> {
    // A preview is a read-only leaf in the process tree. It still hosts the
    // normal API for static rendering, but it must never become an authority
    // that can create another preview (which otherwise permits recursive
    // preview trees when a request reaches a preview's API port).
    if (process.env[CHILD_ENV] === "1") {
      return {
        ok: false,
        error: "Preview servers are read-only; only the main RepoOS control plane can start previews",
      };
    }
    if (!task.id) {
      return { ok: false, error: "A task id is required to start a preview" };
    }
    if (!PREVIEW_STATES.includes(task.status)) {
      return {
        ok: false,
        error: `Only active or review tasks can be previewed (#${task.id} is ${task.status})`,
      };
    }
    const existing = this.registry.get(task.id);
    if (existing) return { ok: true, port: existing.port, url: existing.url };
    // Concurrent starts for the same task (e.g. duplicate transition events)
    // must share one spawn — never double-spawn a process and leak one.
    const inflight = this.inflight.get(task.id);
    if (inflight) return inflight;
    const p = this.doStart(task);
    this.inflight.set(task.id, p);
    p.finally(() => this.inflight.delete(task.id)).catch(() => {
      /* handled by caller */
    });
    return p;
  }

  private async doStart(task: Task): Promise<PreviewResult> {
    if (!task.branch) {
      return { ok: false, error: `Task #${task.id} has no branch to preview` };
    }
    if (task.hotfix) {
      return { ok: false, error: `Hotfix tasks do not support previews` };
    }
    const root = worktreePathForBranch(this.config.root, task.branch);
    if (!root) {
      return { ok: false, error: `No git worktree exists for branch "${task.branch}"` };
    }

    const build = ensureFreshBuild(root);
    if (!build.ok) {
      this.logLifecycle("start-failed", task.id, build.error);
      return { ok: false, error: build.error };
    }

    // Enforce the concurrent-preview cap (#0198): before launching a new
    // preview, free a slot if at capacity by terminating the oldest running
    // preview (FIFO). A task that already has a preview is a no-op elsewhere.
    await this.evictIfAtCapacity(task.id);

    let port: number;
    try {
      port = await reservePort();
    } catch {
      this.logLifecycle("start-failed", task.id, "could not allocate an ephemeral port for the preview");
      return { ok: false, error: "could not allocate an ephemeral port for the preview" };
    }

    const spawned = this.spawnPreview(root, port, task.id);
    if (!spawned.ok) {
      this.logLifecycle("start-failed", task.id, spawned.error);
      return { ok: false, error: spawned.error };
    }
    const { pid } = spawned;

    if (!(await waitForHealth(`http://${HOST}:${port}`, HEALTH_TIMEOUT_MS))) {
      void this.kill(pid);
      const diag = this.bootErrors.get(task.id);
      this.bootErrors.delete(task.id);
      const error = `preview server for #${task.id} did not become ready${diag ? ` — ${diag}` : ""}`;
      this.logLifecycle("start-failed", task.id, error);
      return { ok: false, error };
    }

    const info: PreviewInfo = {
      port,
      url: `http://${HOST}:${port}`,
      startedAt: now(),
      pid,
    };
    this.registry.set(task.id, info);
    this.persist();
    this.logLifecycle("started", task.id, `url=${info.url} pid=${info.pid} port=${info.port}`);
    this.emit({
      type: "preview",
      id: task.id,
      preview: { port: info.port, url: info.url, startedAt: info.startedAt },
      at: now(),
    });
    return { ok: true, port: info.port, url: info.url };
  }

  /** Stop a task's preview. Idempotent: stopping nothing is a no-op success. */
  async stop(taskId: string): Promise<void> {
    const info = this.registry.get(taskId);
    if (!info) return;
    this.registry.delete(taskId);
    this.persist();
    this.logLifecycle("stopped", taskId, `url=${info.url} pid=${info.pid}`);
    this.emit({ type: "preview", id: taskId, preview: null, at: now() });
    await this.kill(info.pid);
  }

  /** Stop every preview — used on main-server shutdown. */
  async stopAll(): Promise<void> {
    const entries = [...this.registry.entries()];
    this.registry.clear();
    try {
      unlinkSync(this.file);
    } catch {
      /* nothing persisted */
    }
    for (const [, info] of entries) await this.kill(info.pid);
  }

  /**
   * Boot-time cleanup: kill any preview servers a previous (crashed) main
   * server recorded and left running, then drop the registry file. Skipped in
   * preview children (they serve the worktree, never the main registry).
   */
  cleanupOrphans(): void {
    if (process.env[CHILD_ENV] === "1") return;
    if (!existsSync(this.file)) return;
    let payload: RegistryFile | null = null;
    try {
      payload = JSON.parse(readFileSync(this.file, "utf8")) as RegistryFile;
    } catch {
      /* corrupt registry — drop it */
    }
    if (payload) {
      for (const info of Object.values(payload.previews ?? {})) {
        if (isPreviewProcess(info.pid, info.port)) void this.kill(info.pid);
      }
    }
    try {
      unlinkSync(this.file);
    } catch {
      /* ignore */
    }
  }

  // ---- internals ----

  /**
   * Enforce the concurrent cap (#0198): when at `MAX_PREVIEWS` and the task
   * being started isn't already running, terminate the OLDEST running preview
   * (FIFO) before a new one spawns. Logs the eviction with task id + timestamp.
   */
  private async evictIfAtCapacity(startingTaskId: string): Promise<void> {
    if (this.registry.size < MAX_PREVIEWS) return;
    if (this.registry.has(startingTaskId)) return;
    const oldest = [...this.registry.entries()].sort((a, b) =>
      a[1].startedAt < b[1].startedAt ? -1 : a[1].startedAt > b[1].startedAt ? 1 : 0,
    )[0];
    if (!oldest) return;
    const [taskId, info] = oldest;
    this.logLifecycle(
      "evicted",
      taskId,
      `terminated to keep concurrent previews at ${MAX_PREVIEWS} (oldest running; started ${info.startedAt})`,
    );
    await this.stop(taskId);
  }

  /** Best-effort lifecycle log — task id and an ISO-8601 timestamp (#0198). */
  private logLifecycle(action: string, taskId: string, detail?: string): void {
    try {
      const line = `[preview] ${now()} #${taskId} ${action}${detail ? ` — ${detail}` : ""}`;
      if (process.env[CHILD_ENV] === "1") return;
      // Previews are server-owned long-lived children; always mirror to the
      // main server's stderr so lifecycle lands in the server log.
      console.error(line);
    } catch {
      /* logging is best-effort and must never crash the system (#0198) */
    }
  }

  private spawnPreview(
    root: string,
    port: number,
    taskId: string,
  ): { ok: true; pid: number } | { ok: false; error: string } {
    const entry = cliEntry();
    if (!entry) {
      return { ok: false, error: "could not locate the repoos CLI to serve the worktree" };
    }
    let child: ChildProcess;
    try {
      child = spawn(
        process.execPath,
        [entry, "serve", "--port", String(port), "--host", HOST],
        {
          cwd: root,
          stdio: ["ignore", "ignore", "pipe"],
          env: { ...process.env, [CHILD_ENV]: "1" },
        },
      );
    } catch (err) {
      return { ok: false, error: `could not launch preview server: ${(err as Error).message}` };
    }
    const pid = child.pid;
    if (!pid) return { ok: false, error: "could not launch preview server (no pid)" };

    child.stderr?.on("data", (c: Buffer) => {
      for (const line of c.toString("utf8").split("\n")) {
        const l = line.trim();
        if (l) this.bootErrors.set(taskId, l);
      }
    });
    child.on("error", () => {
      this.bootErrors.delete(taskId);
    });
    child.on("exit", () => {
      this.bootErrors.delete(taskId);
      // A preview that dies on its own (crash, external kill) must drop out of
      // the registry so the drawer's Stop control and the SSE state stay true.
      const info = this.registry.get(taskId);
      if (info && info.pid === pid) {
        this.registry.delete(taskId);
        this.persist();
        this.logLifecycle("exited", taskId, `preview process ${pid} exited on its own`);
        this.emit({ type: "preview", id: taskId, preview: null, at: now() });
      }
    });
    return { ok: true, pid };
  }

  /** Graceful SIGTERM, then SIGKILL after a short grace period. */
  private async kill(pid: number): Promise<void> {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return; // already gone
    }
    await sleep(400);
    try {
      process.kill(pid, 0);
    } catch {
      return; // exited on SIGTERM
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }

  /** Persist the registry so a crashed main server's previews can be reaped. */
  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const payload: RegistryFile = {
        mainPid: process.pid,
        previews: Object.fromEntries(this.registry),
      };
      writeFileSync(this.file, JSON.stringify(payload, null, 2));
    } catch {
      /* persistence is best-effort */
    }
  }
}
