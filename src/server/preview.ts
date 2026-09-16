/**
 * Read-only preview servers for review/active tasks.
 *
 * How a task is previewed is pluggable per project (#0362): a repo declares a
 * command and/or named targets in `repoos.toml`'s `[preview]` section, selected
 * by the task's `area`. There is no implicit default (#0370): a project with no
 * `[preview]` config at all gets the same clean "no preview configured" result
 * as one whose config has no target for the task's area.
 *
 * Each preview is a separate process rooted at the task's own git worktree,
 * bound to an OS-assigned ephemeral port (never a hardcoded range). The main
 * server keeps a registry — in memory plus persisted to
 * `<cacheDir>/previews.json` — so previews can be stopped on demand, reaped
 * when a task leaves active/review, torn down on shutdown, and cleaned up at
 * boot when a crashed main server left orphans behind.
 *
 * Zero runtime deps: node:child_process / node:net / node:fs only.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { RepoOSConfig, Status, Task } from "../core/types.js";
import { worktreePathForBranch } from "../core/git.js";
import type { RepoEvent } from "./live-index.js";

export interface PreviewInfo {
  port: number;
  url: string;
  startedAt: string;
  pid: number;
  /**
   * Path polled on the preview URL for readiness (#0362): `/` (or the target's
   * override). Always a project-declared path since #0370 removed the implicit
   * `repoos serve` target.
   */
  readyPath?: string;
  /**
   * Resolved custom command the preview child was started with (#0362), used to
   * identify the process during boot-time orphan cleanup. Every preview now
   * carries one — the implicit `repoos serve` fallback was removed (#0370).
   */
  command?: string;
  /**
   * Human label for which preview target ran (#0362 review): the matched
   * `[[preview.targets]]` name, or "default" for the bare `[preview] command`.
   * Aids debugging on a foreign repo with several configured targets.
   */
  label?: string;
  /**
   * True when the preview child leads its own process group (POSIX custom
   * commands), so stop/reap signals must target the group (`-pid`) to take the
   * shell's whole tree down with it.
   */
  processGroup?: boolean;
}

export interface PreviewResult {
  ok: boolean;
  port?: number;
  url?: string;
  /** Readiness path for the started preview, so callers probe the right endpoint. */
  readyPath?: string;
  /** Which preview target ran (#0362 review) — see `PreviewInfo.label`. */
  label?: string;
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
/**
 * Hard cap on concurrently running preview servers (#0198). Lowered to 1
 * (#0271 follow-up) now that previews are on-demand only, not auto-launched:
 * a human starting a second preview means they're done with the first, so
 * FIFO-evicting it is the right behavior, and one process is one fewer thing
 * competing with the control plane (and any reload replacement) for CPU.
 */
const MAX_PREVIEWS = 1;
/** Marks a spawned child so it skips its own boot-time orphan cleanup. */
const CHILD_ENV = "REPOOS_PREVIEW_CHILD";

const now = (): string => new Date().toISOString();

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Default readiness path for a project-declared preview command. */
const DEFAULT_READY_PATH = "/";

/** The preview target resolved for one task (#0362): a project-declared
 *  shell command selected by the task's `area`. */
export type PreviewTarget = {
  kind: "command";
  /** Human label for diagnostics: the target name, or "default". */
  label: string;
  command: string;
  cwd?: string;
  readyPath: string;
  /** How long to wait for this target before giving up (ms). See PreviewTargetConfig.readyTimeoutMs. */
  readyTimeoutMs: number;
};

/** Resolution result: a runnable target, or a clean "nothing configured". */
export type PreviewTargetResolution = PreviewTarget | { kind: "none"; reason: string };

/**
 * The actionable message shown when nothing resolves for a task (#0370). Both
 * "no `[preview]` section at all" and "section present but no area match" reach
 * here, so the user gets the same guidance either way: the task's own `area`,
 * and the minimal `repoos.toml` that would make it resolve.
 */
function noPreviewReason(task: Task, lead: string): string {
  const area = (task.area ?? "").trim();
  const label = area || "(none)";
  // TOML basic-string escape, so an area containing a backslash or quote can't
  // produce a malformed suggested snippet. Message-only; Vue escapes the text.
  const quoted = area.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const snippet = area
    ? [
        "[[preview.targets]]",
        `name = "${quoted}"`,
        `areas = ["${quoted}"]`,
        'command = "bun run dev --port {port} --host {host}"',
      ].join("\n")
    : ["[preview]", 'command = "bun run dev --port {port} --host {host}"'].join("\n");
  return (
    `${lead ? `${lead} ` : ""}No preview configured for area "${label}" (#${task.id}). ` +
    `Add this to repoos.toml:\n\n${snippet}`
  );
}

/**
 * Decide how to preview `task` from the repo's `[preview]` config (#0362).
 *
 * Precedence: a named target whose `areas` include the task's `area` wins; then
 * a default `[preview] command`; then a `none` result with an actionable message
 * (never a spawn failure). A project with no `[preview]` config at all is the
 * same clean `none`, not an implicit RepoOS-board preview (#0370). Exported for
 * tests.
 */
export function resolvePreviewTarget(config: RepoOSConfig, task: Task): PreviewTargetResolution {
  const preview = config.preview;
  const hasTargets = Boolean(preview?.targets?.length);
  const defaultCommand = preview?.command?.trim();
  if (!hasTargets && !defaultCommand) {
    return {
      kind: "none",
      reason: noPreviewReason(task, "This project has no usable [preview] config in repoos.toml."),
    };
  }

  const area = (task.area ?? "").trim();
  if (hasTargets) {
    const match = preview?.targets?.find((t) =>
      t.areas.some((a) => a.trim().toLowerCase() === area.toLowerCase()),
    );
    if (match) {
      return {
        kind: "command",
        label: match.name,
        command: match.command,
        cwd: match.cwd,
        readyPath: match.readyPath ?? DEFAULT_READY_PATH,
        readyTimeoutMs: match.readyTimeoutMs ?? HEALTH_TIMEOUT_MS,
      };
    }
  }
  if (defaultCommand) {
    return {
      kind: "command",
      label: "default",
      command: defaultCommand,
      cwd: preview?.cwd,
      readyPath: preview?.readyPath ?? DEFAULT_READY_PATH,
      readyTimeoutMs: preview?.readyTimeoutMs ?? HEALTH_TIMEOUT_MS,
    };
  }
  return { kind: "none", reason: noPreviewReason(task, "") };
}

/**
 * Resolve a target's `cwd` to an absolute path inside the worktree, or null
 * when it escapes it (absolute, `..`, or otherwise outside `root`). Config is
 * git-tracked and trusted, but a preview must never be spawned outside the
 * task's own worktree.
 */
function resolvePreviewCwd(root: string, sub: string | undefined): string | null {
  if (!sub || !sub.trim()) return root;
  const rel = sub.trim();
  if (isAbsolute(rel)) return null;
  const resolved = resolve(root, rel);
  if (resolved === root) return root;
  const prefix = root.endsWith(sep) ? root : root + sep;
  return resolved.startsWith(prefix) ? resolved : null;
}

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

/**
 * Whether the child responds at `readyPath` within the window. A 2xx/3xx there
 * means it has bound and is serving; the path is `/` by default and can be
 * overridden per target (#0362).
 */
async function waitForReady(url: string, readyPath: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}${readyPath}`);
      if (r.status >= 200 && r.status < 400) return true;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  return false;
}

/**
 * Probe a live preview URL from the trusted server side (#0121): the target's
 * configured readiness path (`/` by default — #0362). A healthy readiness
 * endpoint is enough for a pass. Used when a sandboxed agent cannot open the
 * returned URL itself.
 */
export async function probePreview(
  url: string,
  readyPath: string = DEFAULT_READY_PATH,
): Promise<PreviewProbe> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastError = "preview did not respond";
  while (Date.now() < deadline) {
    let readyStatus = 0;
    try {
      const r = await fetch(`${url}${readyPath}`);
      readyStatus = r.status;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (readyStatus >= 200 && readyStatus < 400) {
      return {
        ok: true,
        detail: `readiness endpoint ${readyPath} responds (HTTP ${readyStatus})`,
      };
    }
    if (readyStatus > 0) {
      return {
        ok: false,
        error: `preview readiness endpoint ${readyPath} returned HTTP ${readyStatus}`,
      };
    }
    await sleep(150);
  }
  return { ok: false, error: lastError };
}

/**
 * True when `info.pid` is a live process that is serving this preview. Every
 * preview is a project-declared command (#0362/#0370), so the recorded resolved
 * command is matched by its binary token and port binding — there is no fixed
 * shape to key on. A registry entry persisted before #0370 has no `command`
 * (it was the removed `repoos serve` fallback); those are matched structurally
 * so a crash across the upgrade still reaps them.
 */
function isPreviewProcess(info: PreviewInfo): boolean {
  const { pid, port } = info;
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
    if (!info.command) {
      return (
        /cli[/\\]index\.(js|ts)/.test(cmd) &&
        cmd.includes("serve") &&
        cmd.includes(`--port ${port}`)
      );
    }
    // The shell may quote the binary, and `ps` may report an absolute path —
    // match on the executable's basename plus the exact port binding.
    const first =
      info.command
        .trim()
        .split(/\s+/)[0]
        ?.replace(/^['"]|['"]$/g, "") ?? "";
    const binary = basename(first);
    return cmd.includes(`--port ${port}`) || (Boolean(binary) && cmd.includes(binary));
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
   * Start a preview for a task: resolve its preview target from `[preview]`
   * config (#0362), allocate an ephemeral port, spawn the project-declared
   * command rooted at the worktree, and wait for it to come up. Returns
   * `{ ok, port, url }` or a human-readable error.
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
        error:
          "Preview servers are read-only; only the main RepoOS control plane can start previews",
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
    if (existing) {
      return { ok: true, port: existing.port, url: existing.url, readyPath: existing.readyPath };
    }
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

    // Decide how to preview this task (#0362): a project-declared command
    // selected by area. A task whose area matches no configured target — or a
    // project with no `[preview]` config at all (#0370) — returns a clear
    // "nothing configured" result instead of spawning (and failing) something.
    const target = resolvePreviewTarget(this.config, task);
    if (target.kind === "none") {
      this.logLifecycle("start-skipped", task.id, target.reason);
      return { ok: false, error: target.reason };
    }

    // Enforce the concurrent-preview cap (#0198): before launching a new
    // preview, free a slot if at capacity by terminating the oldest running
    // preview (FIFO). A task that already has a preview is a no-op elsewhere.
    await this.evictIfAtCapacity(task.id);

    let port: number;
    try {
      port = await reservePort();
    } catch {
      this.logLifecycle(
        "start-failed",
        task.id,
        "could not allocate an ephemeral port for the preview",
      );
      return { ok: false, error: "could not allocate an ephemeral port for the preview" };
    }

    const spawned = this.spawnPreview(root, port, task.id, target);
    if (!spawned.ok) {
      this.logLifecycle("start-failed", task.id, spawned.error);
      return { ok: false, error: spawned.error };
    }
    const { pid } = spawned;

    const url = `http://${HOST}:${port}`;
    if (!(await waitForReady(url, target.readyPath, target.readyTimeoutMs))) {
      void this.kill(pid, spawned.processGroup);
      const diag = this.bootErrors.get(task.id);
      this.bootErrors.delete(task.id);
      const error = `preview server for #${task.id} did not become ready${diag ? ` — ${diag}` : ""}`;
      this.logLifecycle("start-failed", task.id, error);
      return { ok: false, error };
    }

    const info: PreviewInfo = {
      port,
      url,
      startedAt: now(),
      pid,
      readyPath: target.readyPath,
      label: target.label,
      ...(spawned.command ? { command: spawned.command } : {}),
      ...(spawned.processGroup ? { processGroup: true } : {}),
    };
    this.registry.set(task.id, info);
    this.persist();
    this.logLifecycle(
      "started",
      task.id,
      `target=${info.label} url=${info.url} pid=${info.pid} port=${info.port}`,
    );
    this.emit({
      type: "preview",
      id: task.id,
      preview: { port: info.port, url: info.url, startedAt: info.startedAt },
      at: now(),
    });
    return {
      ok: true,
      port: info.port,
      url: info.url,
      readyPath: target.readyPath,
      label: info.label,
    };
  }

  /** Stop a task's preview. Idempotent: stopping nothing is a no-op success. */
  async stop(taskId: string): Promise<void> {
    const info = this.registry.get(taskId);
    if (!info) return;
    this.registry.delete(taskId);
    this.persist();
    this.logLifecycle(
      "stopped",
      taskId,
      `target=${info.label ?? "?"} url=${info.url} pid=${info.pid}`,
    );
    this.emit({ type: "preview", id: taskId, preview: null, at: now() });
    await this.kill(info.pid, info.processGroup);
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
    for (const [, info] of entries) await this.kill(info.pid, info.processGroup);
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
        if (isPreviewProcess(info)) void this.kill(info.pid, info.processGroup);
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
    target: PreviewTarget,
  ):
    | { ok: true; pid: number; command?: string; processGroup?: boolean }
    | { ok: false; error: string } {
    const cwd = resolvePreviewCwd(root, target.cwd);
    if (!cwd) {
      return {
        ok: false,
        error: `preview target cwd "${target.cwd}" is not inside the task's worktree`,
      };
    }
    const resolvedCommand = target.command
      .replaceAll("{port}", String(port))
      .replaceAll("{host}", HOST);
    // Own process group (POSIX) so a shell command's whole tree — the shell
    // plus whatever it spawns — can be torn down with one signal.
    const processGroup = process.platform !== "win32";
    let child: ChildProcess;
    try {
      child = spawn(resolvedCommand, {
        cwd,
        shell: true,
        detached: processGroup,
        stdio: ["ignore", "ignore", "pipe"],
        env: { ...process.env, [CHILD_ENV]: "1", PORT: String(port), HOST },
      });
    } catch (err) {
      return { ok: false, error: `could not launch preview command: ${(err as Error).message}` };
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
    return { ok: true, pid, command: resolvedCommand, processGroup };
  }

  /** Graceful SIGTERM, then SIGKILL after a short grace period. */
  private async kill(pid: number, processGroup = false): Promise<void> {
    const signal = (sig: NodeJS.Signals): boolean => {
      try {
        process.kill(processGroup ? -pid : pid, sig);
        return true;
      } catch {
        return false;
      }
    };
    if (!signal("SIGTERM")) return; // already gone
    await sleep(400);
    try {
      process.kill(processGroup ? -pid : pid, 0);
    } catch {
      return; // exited on SIGTERM
    }
    signal("SIGKILL");
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
