/**
 * `repoos status` — one-screen health/orientation snapshot for the
 * repo-as-OS (#0324). Think `git status`: server, build freshness, board,
 * worktrees, tunnel, git — collapsed into one screen so "what is off right
 * now?" never requires knowing which of five commands to run.
 *
 * Must work with the server STOPPED: the serve lockfile, the build marker,
 * `work/*.md` (via buildIndex), and git are read directly. When the server IS
 * up, the picture is enriched from `/api/health` and `/api/tunnel/readiness`
 * — but those calls are best-effort with tight timeouts, never required, and
 * can never make this command hang.
 *
 * `--json` prints the same snapshot machine-readably (shape documented in
 * docs/architecture.md, "repoos status"). Zero new runtime dependencies.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";
import { boardRoot, loadConfig, resolveServePort } from "../core/config.js";
import { buildIndex } from "../core/indexer.js";
import { checkBuildForRoot, readBuildStamp } from "../core/build.js";
import { readTunnelConfig } from "../core/tunnel.js";
import { currentBranch, runGit } from "../core/git.js";
import { countWorktrees, sweepStaleWorktrees } from "../core/worktree-gc.js";
import { isOrphanServeCommand, isPortListening } from "../server/serve-reaper.js";
import { STATUSES, type RepoOSConfig, type Status } from "../core/types.js";
import { c } from "../cli/colors.js";

// ── Snapshot shape (the documented, stable --json contract) ─────────────────

export interface StatusServer {
  /**
   * True when a serve process for THIS repo is actually reachable: the
   * lockfile's PID is alive AND names a repoos serve process AND its port is
   * answering (or /api/health answers with this repo's root). A lock whose
   * PID was recycled by an unrelated process is NOT running — "running" is
   * grounded in the port, not just in /proc existence.
   */
  running: boolean;
  /** Port of the primary serve lock (live first, else most recent), else the probed port. */
  port: number | null;
  /** PID recorded in the primary lock — may name a dead process when running is false. */
  pid: number | null;
  host: string | null;
  /** ISO start time — from the lockfile, or /api/health when the lock is thin. */
  startedAt: string | null;
  startedAtSource: "lockfile" | "health" | null;
  uptimeSeconds: number | null;
  /**
   * Result of probing /api/health on the port:
   *   "ok"          — answered and its root matches this repo
   *   "foreign"     — something answered, but it serves a different root
   *   "unreachable" — nothing answered
   */
  health: "ok" | "foreign" | "unreachable";
  /** The root the health probe reported (when it answered), for the mismatch note. */
  healthRoot: string | null;
  /** Number of serve lockfiles present (a repo may run more than one port). */
  locks: number;
}

export interface StatusBuild {
  /** Same codes as core/build.ts checkBuildForRoot. */
  code: "fresh" | "stale" | "no-marker" | "no-build" | "dev-mode" | "published";
  stale: boolean;
  message: string | null;
  version: string | null;
  buildAt: string | null;
}

export interface StatusActiveTask {
  id: string;
  title: string;
  branch: string;
  worktreePath: string | null;
  /** Branch exists but no usable worktree — the stuck-task signal. */
  worktreeMissing: boolean;
  updatedAt: string | null;
  needsInput: boolean;
}

export interface StatusSnapshot {
  generatedAt: string;
  root: string;
  server: StatusServer;
  build: StatusBuild;
  board: {
    taskCount: number;
    counts: Record<Status, number>;
    active: StatusActiveTask[];
  };
  worktrees: {
    /** Registered worktrees including the main checkout. */
    count: number;
    warnThreshold: number;
    /** What `repoos gc --dry-run` would collect (same sweep, same inputs). */
    leaked: Array<{ branch: string; path: string }>;
    /** What gc would keep, with the reason it is kept. */
    kept: Array<{ branch: string; path: string; reason: string }>;
  };
  tunnel: {
    configured: boolean;
    tunnelName: string | null;
    running: boolean;
    hostnames: string[];
  };
  git: {
    branch: string | null;
    clean: boolean;
    dirtyFiles: number;
    /** True when the reported branch IS `main`. */
    isMainBranch: boolean;
    /** Commits ahead of / behind `main` (null when branch is main or main is missing). */
    ahead: number | null;
    behind: number | null;
  };
}

export interface CollectStatusOptions {
  /** Overrides "now" — for tests. */
  now?: Date;
  /** /api/health fetch timeout in ms (default 800 — a status command must never hang). */
  probeTimeoutMs?: number;
  /** Overrides the probed port (lockfile → default derivation) — for hermetic tests. */
  probePort?: number;
}

// ── Collection ───────────────────────────────────────────────────────────────

interface ServeLockEntry {
  file: string;
  pid: number;
  port: number | null;
  host: string | null;
  startedAt: string | null;
  alive: boolean;
}

/** EPERM means "alive but not ours" — still alive. */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
  // kill -0 only proves SOME process owns the PID — after OS PID recycling it
  // may be an unrelated process that has nothing to do with this repo's
  // server. Verify the command line has the repoos serve shape (the same
  // matcher ServeReaper's orphan sweep uses) before trusting it. If `ps`
  // itself fails, keep the existence verdict: collectStatus independently
  // cross-checks the port before believing "running".
  if (process.platform === "win32") return true;
  try {
    const cmdline = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!cmdline) return false; // gone between kill(0) and ps
    return isOrphanServeCommand(cmdline);
  } catch {
    return true;
  }
}

/** startedAt as a comparable number (missing/unparsable sorts oldest). */
function lockStartedMs(l: ServeLockEntry): number {
  const t = Date.parse(l.startedAt ?? "");
  return Number.isFinite(t) ? t : 0;
}

/**
 * Read every `.repoos/serve[-<port>].lock`. Locks are scoped per port (see
 * ServeReaper), so there can legitimately be more than one; they are ordered
 * live-first, then newest-first by `startedAt`, so the primary is the one
 * that matters. Exported for tests.
 */
export function readServeLocks(root: string, cacheDir: string): ServeLockEntry[] {
  let files: string[];
  try {
    files = readdirSync(join(root, cacheDir)).filter((f) => /^serve(?:-\d+)?\.lock$/.test(f));
  } catch {
    return [];
  }
  const out: ServeLockEntry[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(root, cacheDir, file), "utf8")) as {
        pid?: unknown;
        port?: unknown;
        host?: unknown;
        startedAt?: unknown;
      };
      const pid = typeof raw.pid === "number" && Number.isInteger(raw.pid) ? raw.pid : 0;
      const alive = pid > 0 && pid !== process.pid && pidAlive(pid);
      out.push({
        file,
        pid,
        port: typeof raw.port === "number" ? raw.port : null,
        host: typeof raw.host === "string" ? raw.host : null,
        startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
        alive,
      });
    } catch {
      /* corrupt lockfile — ignore; `repoos serve`'s reaper will clean it up */
    }
  }
  out.sort((a, b) => Number(b.alive) - Number(a.alive) || lockStartedMs(b) - lockStartedMs(a));
  return out;
}

interface HealthProbe {
  state: "ok" | "foreign" | "unreachable";
  root: string | null;
  version: string | null;
  serverStartedAt: string | null;
}

async function probeHealth(port: number, root: string, timeoutMs: number): Promise<HealthProbe> {
  const miss: HealthProbe = {
    state: "unreachable",
    root: null,
    version: null,
    serverStartedAt: null,
  };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return miss;
    const body = (await res.json()) as {
      ok?: unknown;
      root?: unknown;
      version?: unknown;
      serverStartedAt?: unknown;
    };
    if (body.ok !== true || typeof body.root !== "string") return miss;
    return {
      state: body.root === root ? "ok" : "foreign",
      root: body.root,
      version: typeof body.version === "string" ? body.version : null,
      serverStartedAt: typeof body.serverStartedAt === "string" ? body.serverStartedAt : null,
    };
  } catch {
    return miss;
  }
}

/** pgrep for a running cloudflared tunnel process — same shape tunnel status uses. */
function tunnelProcessRunning(): boolean {
  try {
    return (
      execFileSync("pgrep", ["-f", "cloudflared.*tunnel.*run"], {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() !== ""
    );
  } catch {
    return false;
  }
}

/** launchd/systemd service state for cloudflared — same shape tunnel status uses. */
function tunnelServiceRunning(): boolean {
  try {
    if (process.platform === "darwin") {
      const out = execFileSync("launchctl", ["list"], {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out
        .split("\n")
        .some((line) => line.includes("com.cloudflare.cloudflared") && /^\s*\d+\s+/.test(line));
    }
    if (process.platform === "linux") {
      return (
        execFileSync("systemctl", ["is-active", "cloudflared"], {
          encoding: "utf8",
          timeout: 2000,
          stdio: ["ignore", "pipe", "ignore"],
        }).trim() === "active"
      );
    }
  } catch {
    /* service manager unavailable */
  }
  return false;
}

function readVersionFromMarker(root: string): string | null {
  try {
    const info = JSON.parse(readFileSync(join(root, "dist", ".build-info.json"), "utf8")) as {
      version?: unknown;
    };
    return typeof info.version === "string" && info.version ? info.version : null;
  } catch {
    return null;
  }
}

/**
 * Build the full snapshot. Everything is fail-soft: a missing lockfile, a dead
 * server, an unreadable marker, or absent git degrade the matching section —
 * never crash the command.
 */
export async function collectStatus(
  config: RepoOSConfig,
  opts: CollectStatusOptions = {},
): Promise<StatusSnapshot> {
  const now = opts.now ?? new Date();
  const root = config.root;
  const timeoutMs = opts.probeTimeoutMs ?? 800;

  // ── server ──
  const locks = readServeLocks(root, config.cacheDir);
  // The primary lock is live-first, then most recent — its facts are reported
  // even when dead, because "lockfile names pid X, which is gone" is exactly
  // the diagnostic a stopped-but-should-be-running repo needs.
  const primary = locks[0] ?? null;
  const primaryAlive = primary?.alive ?? false;
  // Probe the live lock's port; else a stale lock's port (the "lock is dead —
  // is anything still on it?" diagnostic); else this repo's default port.
  const probePort = opts.probePort ?? primary?.port ?? resolveServePort(root, config);
  const health = await probeHealth(probePort, root, timeoutMs);
  // Ground "running" in the port: when /api/health is unreachable, check
  // whether anything is actually listening before trusting the lock's
  // (possibly recycled) live PID.
  const portActive =
    health.state !== "unreachable" || (await isPortListening(probePort, "127.0.0.1"));
  const running = primaryAlive ? portActive : health.state === "ok";

  let startedAt = primary?.startedAt ?? null;
  let startedAtSource: "lockfile" | "health" | null = startedAt ? "lockfile" : null;
  if (!startedAt && health.state === "ok" && health.serverStartedAt) {
    // Thin lockfile — fall back to /api/health, as the spec asks.
    startedAt = health.serverStartedAt;
    startedAtSource = "health";
  }
  const uptimeMs = startedAt !== null ? Math.max(0, now.getTime() - Date.parse(startedAt)) : null;
  const server: StatusServer = {
    running,
    port: primary?.port ?? probePort,
    pid: primary?.pid ?? null,
    host: primary?.host ?? null,
    startedAt,
    startedAtSource,
    uptimeSeconds: uptimeMs !== null && Number.isFinite(uptimeMs) ? uptimeMs / 1000 : null,
    health: health.state,
    healthRoot: health.root,
    locks: locks.length,
  };

  // ── build ──
  const check = checkBuildForRoot(root);
  const build: StatusBuild = {
    code: check.code,
    stale: check.stale,
    message: check.message,
    version: readVersionFromMarker(root) ?? health.version,
    buildAt: readBuildStamp(root),
  };

  // ── board ──
  const idx = buildIndex(config);
  const active: StatusActiveTask[] = idx.tasks
    .filter((t) => t.status === "active")
    .map((t) => {
      const wt = t.git.worktreePath;
      const missing = !!t.branch && (!wt || !existsSync(wt));
      return {
        id: t.id,
        title: t.title,
        branch: t.branch,
        worktreePath: wt,
        worktreeMissing: missing,
        updatedAt: t.updated_at,
        needsInput: t.needsInput,
      };
    });

  // ── worktrees ──
  // Same sweep `repoos gc --dry-run` runs, fed the index we already built so
  // the board is only walked once. The counts therefore match gc by
  // construction, not by coincidence.
  const gc = sweepStaleWorktrees(config, { mode: "full", dryRun: true, tasks: idx.tasks });
  const worktrees = {
    count: countWorktrees(root),
    warnThreshold: config.worktreeWarnThreshold ?? 20,
    leaked: gc.removedWorktrees.map((w) => ({ branch: w.branch, path: w.path })),
    kept: gc.keptDirty.map((k) => ({ branch: k.branch, path: k.path, reason: k.reason })),
  };

  // ── tunnel ──
  const tunnelCfg = readTunnelConfig(root);
  const configured = !!tunnelCfg.tunnelId;
  let tunnelRunning = false;
  let hostnames = Object.values(tunnelCfg.apps)
    .map((a) => a.hostname)
    .sort();
  if (configured) {
    tunnelRunning = tunnelProcessRunning() || tunnelServiceRunning();
    if (health.state === "ok") {
      // Server is up — prefer its readiness view (same data, live). Best
      // effort only: on auth-protected servers this endpoint 401s (the CLI
      // has no session), and the local answer below is identical to what
      // `repoos tunnel status` computes, so nothing is lost.
      try {
        const res = await fetch(`http://127.0.0.1:${probePort}/api/tunnel/readiness`, {
          signal: AbortSignal.timeout(Math.max(timeoutMs, 2000)),
        });
        if (res.ok) {
          const body = (await res.json()) as {
            running?: unknown;
            publishedHostnames?: unknown;
          };
          if (typeof body.running === "boolean") tunnelRunning = body.running;
          if (Array.isArray(body.publishedHostnames)) {
            hostnames = body.publishedHostnames
              .filter((h): h is string => typeof h === "string")
              .sort();
          }
        }
      } catch {
        /* readiness is enrichment only — local answer stands */
      }
    }
  }

  // ── git (the main checkout — the repo-as-OS itself) ──
  const branch = currentBranch(root);
  let clean = true;
  let dirtyFiles = 0;
  let ahead: number | null = null;
  let behind: number | null = null;
  if (branch) {
    const st = await runGit(root, ["status", "--porcelain"], 4000);
    if (st.status === 0) {
      dirtyFiles = st.stdout.split("\n").filter((l) => l.trim() !== "").length;
      clean = dirtyFiles === 0;
    }
    if (branch !== "main") {
      const [a, b] = await Promise.all([
        runGit(root, ["rev-list", "--count", `main..${branch}`], 4000),
        runGit(root, ["rev-list", "--count", `${branch}..main`], 4000),
      ]);
      ahead = a.status === 0 ? Number(a.stdout.trim()) || 0 : null;
      behind = b.status === 0 ? Number(b.stdout.trim()) || 0 : null;
    }
  }

  return {
    generatedAt: now.toISOString(),
    root,
    server,
    build,
    board: {
      taskCount: idx.taskCount,
      counts: idx.counts,
      active,
    },
    worktrees,
    tunnel: {
      configured,
      tunnelName: configured ? tunnelCfg.name : null,
      running: tunnelRunning,
      hostnames,
    },
    git: {
      branch,
      clean,
      dirtyFiles,
      isMainBranch: branch === "main",
      ahead,
      behind,
    },
  };
}

// ── Formatting helpers ───────────────────────────────────────────────────────

/** "42s" | "5m 07s" | "3h 42m" | "2d 4h" */
export function formatUptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Local "14:02" on the same day, else "Sep 2 14:02". */
export function formatSince(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? hm : `${MONTHS[d.getMonth()]} ${d.getDate()} ${hm}`;
}

/** "41s ago" | "5m ago" | "3h 02m ago" | "2d ago" — for last-activity stamps. */
export function formatRel(iso: string | null, now: Date): string {
  if (!iso) return "?";
  const ms = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "?";
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ── Rendering ────────────────────────────────────────────────────────────────

const LABEL = 10;

function row(label: string, text: string): void {
  console.log("  " + c.dim(label.padEnd(LABEL)) + text);
}

function sub(text: string): void {
  console.log("  " + " ".repeat(LABEL) + text);
}

export function renderStatus(s: StatusSnapshot, now: Date = new Date()): void {
  console.log("");
  console.log("  " + c.bold(c.cyan("RepoOS status")) + c.dim(" — " + basename(s.root)));
  console.log(c.dim("  " + s.root));

  // Stale build FIRST and loud — per AGENTS.md it is the #1 time-waster in
  // this repo; it must never read as a quiet footnote.
  if (s.build.stale && s.build.message) {
    console.log("");
    for (const line of s.build.message.split("\n")) {
      console.log(c.bold(c.yellow("  ⚠ " + line.trim())));
    }
  }

  console.log("");

  // server
  const sv = s.server;
  if (sv.running) {
    const bits: string[] = [];
    if (sv.port !== null) bits.push(`port ${sv.port}`);
    if (sv.pid !== null) bits.push(`pid ${sv.pid}`);
    if (sv.startedAt) {
      bits.push(
        `up ${formatUptime((sv.uptimeSeconds ?? 0) * 1000)} (since ${formatSince(sv.startedAt, now)})`,
      );
    } else {
      bits.push("start time unknown");
    }
    row("server", c.green("● running") + c.dim(" · ") + bits.join(c.dim(" · ")));
    if (sv.health === "foreign") {
      sub(
        c.yellow(
          `⚠ port ${sv.port} answers, but it serves ${sv.healthRoot ?? "a different repo"} — wrong port?`,
        ),
      );
    } else if (sv.health === "unreachable") {
      sub(
        c.yellow(
          `⚠ port ${sv.port} is listening but /api/health is not answering — the server may be hung`,
        ),
      );
    } else if (sv.pid === null) {
      sub(c.dim("no serve lockfile — live via /api/health; restart `repoos serve` to restore it"));
    }
    if (sv.locks > 1) sub(c.dim(`+ ${sv.locks - 1} more serve lock(s) — check other ports`));
  } else {
    let line = c.red("○ stopped") + c.dim(" — no live serve process for this repo");
    if (sv.pid !== null) {
      line +=
        "\n" +
        " ".repeat(LABEL) +
        c.dim(
          `last lock: pid ${sv.pid}` +
            (sv.port !== null ? ` · port ${sv.port}` : "") +
            (sv.startedAt ? ` · started ${formatSince(sv.startedAt, now)}` : ""),
        );
    }
    if (sv.health === "foreign") {
      line +=
        "\n" +
        " ".repeat(LABEL) +
        c.yellow(
          `⚠ but port ${sv.port} is answering for ${sv.healthRoot ?? "another repo"} — wrong port?`,
        );
    }
    row("server", line);
  }

  // build
  const buildBits = [
    s.build.stale ? c.yellow("● stale") : c.green("● fresh"),
    s.build.version ? c.dim("repoos v" + s.build.version) : c.dim("version unknown"),
    s.build.buildAt
      ? c.dim("built " + formatSince(s.build.buildAt, now))
      : c.dim("build time unknown"),
  ];
  row("build", buildBits.join(c.dim(" · ")));
  if (s.build.code === "no-build" || s.build.code === "published") {
    sub(c.dim("(no dist build — source checkout)"));
  }

  // board
  const counts = STATUSES.map((st) => `${st} ${s.board.counts[st] ?? 0}`).join(c.dim(" · "));
  row("board", c.bold(String(s.board.taskCount)) + c.dim(" tasks · ") + counts);
  for (const t of s.board.active) {
    const flags: string[] = [];
    if (t.needsInput) flags.push(c.yellow("waiting for you"));
    if (t.worktreeMissing) flags.push(c.red("⚠ worktree missing"));
    console.log(
      "\n" +
        "    " +
        c.dim("#" + t.id) +
        "  " +
        truncate(t.title, 60) +
        c.dim("  · updated " + formatRel(t.updatedAt, now)) +
        (flags.length ? "  " + flags.join(c.dim(" · ")) : ""),
    );
    sub(c.dim("branch   ") + (t.branch ? c.cyan(truncate(t.branch, 80)) : c.dim("— none yet")));
    sub(
      c.dim("worktree ") +
        (t.worktreePath && !t.worktreeMissing
          ? c.dim(truncate(t.worktreePath, 100))
          : t.worktreeMissing
            ? c.red("missing")
            : c.dim("none")),
    );
  }
  if (s.board.active.length === 0) sub(c.dim("nothing active"));

  // worktrees
  const threshold = s.worktrees.warnThreshold;
  const wtBits = [`${s.worktrees.count} registered`];
  if (threshold > 0) wtBits.push(`advisory ceiling ${threshold}`);
  const leaked = s.worktrees.leaked;
  const leakText =
    leaked.length === 0
      ? c.dim("no leaks")
      : c.yellow(`${leaked.length} leaked — run `) + c.cyan("repoos gc --dry-run");
  row("worktrees", wtBits.join(c.dim(" · ")) + c.dim(" · ") + leakText);
  for (const w of leaked)
    sub(c.yellow("leaked ") + c.cyan(w.branch || "(detached)") + c.dim("  " + w.path));
  for (const k of s.worktrees.kept) {
    sub(c.dim("kept    ") + c.cyan(k.branch || "(detached)") + c.dim(`  — ${k.reason}`));
  }

  // tunnel
  if (!s.tunnel.configured) {
    row(
      "tunnel",
      c.dim("not configured") + c.dim("  (") + c.cyan("repoos tunnel setup") + c.dim(")"),
    );
  } else {
    const state = s.tunnel.running ? c.green("running") : c.yellow("not running");
    const hosts = s.tunnel.hostnames.length
      ? `${s.tunnel.hostnames.length} published: ${s.tunnel.hostnames.join(", ")}`
      : "no hostnames published";
    row(
      "tunnel",
      c.cyan(s.tunnel.tunnelName ?? "tunnel") + c.dim(" · ") + state + c.dim(" · " + hosts),
    );
  }

  // git
  if (!s.git.branch) {
    row("git", c.dim("not a git repository"));
  } else {
    const bits = [c.cyan(s.git.branch)];
    bits.push(
      s.git.clean
        ? c.green("clean")
        : c.yellow(`dirty (${s.git.dirtyFiles} file${s.git.dirtyFiles === 1 ? "" : "s"})`),
    );
    if (!s.git.isMainBranch && (s.git.ahead !== null || s.git.behind !== null)) {
      bits.push(c.dim(`↑${s.git.ahead ?? "?"} ↓${s.git.behind ?? "?"} vs main`));
    }
    row("git", bits.join(c.dim(" · ")));
  }

  console.log("");
}

// ── Command entry ────────────────────────────────────────────────────────────

/** `repoos status [--json]` */
export async function cmdStatus(argv: string[]): Promise<void> {
  const asJson = argv.includes("--json");
  try {
    const { root, fromWorktree } = boardRoot();
    if (fromWorktree) {
      // stderr so `--json` stdout stays machine-clean — same note list/gc print.
      console.error(
        c.yellow("  ⚠ ") +
          c.dim("running from inside a linked worktree — reporting the MAIN checkout (") +
          c.cyan(root) +
          c.dim(")"),
      );
    }
    const config = loadConfig(root);
    const snapshot = await collectStatus(config);
    if (asJson) {
      console.log(JSON.stringify(snapshot, null, 2));
    } else {
      renderStatus(snapshot);
    }
  } catch (e) {
    console.error(c.red("  repoos status failed: ") + (e as Error).message);
    process.exitCode = 1;
  }
}
