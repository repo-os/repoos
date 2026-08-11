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

/** Registry persisted between main-server runs (for orphan cleanup at boot). */
interface RegistryFile {
  mainPid: number;
  previews: Record<string, PreviewInfo>;
}

const PREVIEW_STATES: readonly Status[] = ["active", "review"];
const HOST = "127.0.0.1";
const HEALTH_TIMEOUT_MS = 10_000;
const BUILD_TIMEOUT_MS = 240_000;
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

  constructor(config: RepoOSConfig, emit: (e: RepoEvent) => void) {
    this.config = config;
    this.emit = emit;
    this.file = join(config.root, config.cacheDir, "previews.json");
  }

  get(taskId: string): PreviewInfo | null {
    return this.registry.get(taskId) ?? null;
  }

  /**
   * Start a preview for a task: rebuild the worktree if stale, allocate an
   * ephemeral port, spawn a `repoos serve` rooted at the worktree, and wait
   * for it to come up. Returns `{ ok, port, url }` or a human-readable error.
   */
  async start(task: Task): Promise<PreviewResult> {
    if (!PREVIEW_STATES.includes(task.status)) {
      return {
        ok: false,
        error: `Only active or review tasks can be previewed (#${task.id} is ${task.status})`,
      };
    }
    const existing = this.registry.get(task.id);
    if (existing) return { ok: true, port: existing.port, url: existing.url };
    if (!task.branch) {
      return { ok: false, error: `Task #${task.id} has no branch to preview` };
    }
    const root = worktreePathForBranch(this.config.root, task.branch);
    if (!root) {
      return { ok: false, error: `No git worktree exists for branch "${task.branch}"` };
    }

    const build = ensureFreshBuild(root);
    if (!build.ok) return { ok: false, error: build.error };

    let port: number;
    try {
      port = await reservePort();
    } catch {
      return { ok: false, error: "could not allocate an ephemeral port for the preview" };
    }

    const spawned = this.spawnPreview(root, port, task.id);
    if (!spawned.ok) return { ok: false, error: spawned.error };
    const { pid } = spawned;

    if (!(await waitForHealth(`http://${HOST}:${port}`, HEALTH_TIMEOUT_MS))) {
      void this.kill(pid);
      const diag = this.bootErrors.get(task.id);
      this.bootErrors.delete(task.id);
      return {
        ok: false,
        error: `preview server for #${task.id} did not become ready${diag ? ` — ${diag}` : ""}`,
      };
    }

    const info: PreviewInfo = {
      port,
      url: `http://${HOST}:${port}`,
      startedAt: now(),
      pid,
    };
    this.registry.set(task.id, info);
    this.persist();
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
