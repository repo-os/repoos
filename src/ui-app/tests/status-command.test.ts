/**
 * `repoos status` (#0324): snapshot collection + rendering, with the server
 * DOWN. Fixture repos exercise the real code paths — fake serve lockfiles
 * (live and dead PIDs), stale vs fresh build markers, a merged worktree the
 * gc sweep should count as leaked, and an active task with no worktree.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, worktreesDir } from "../../core/config.js";
import { ensureWorktree } from "../../core/git.js";
import { sweepStaleWorktrees } from "../../core/worktree-gc.js";
import type { RepoOSConfig } from "../../core/types.js";
import {
  collectStatus,
  renderStatus,
  formatUptime,
  formatSince,
  formatRel,
  cmdStatus,
  readServeLocks,
  serverLifecycle,
  serverBuildState,
  serverIdentity,
  restartHint,
  shortHash,
} from "../../commands/status.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const roots: string[] = [];
const lingeringKills: Array<() => void> = [];
afterEach(() => {
  for (const r of roots) {
    rmSync(r, { recursive: true, force: true });
    rmSync(worktreesDir(r), { recursive: true, force: true });
  }
  roots.length = 0;
  for (const kill of lingeringKills) kill();
  lingeringKills.length = 0;
  vi.restoreAllMocks();
});

/** A port that is (almost certainly) not listening — grabbed and released. */
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

/** A PID that has definitely exited. */
function exitedPid(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", "process.exit(0)"]);
    child.on("close", () => resolve(child.pid as number));
  });
}

/** A PID that stays alive running an unrelated (non-serve) process. */
function lingeringPid(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
    child.on("spawn", () => {
      const pid = child.pid as number;
      lingeringKills.push(() => child.kill("SIGKILL"));
      resolve(pid);
    });
  });
}

function taskFile(id: string, title: string, status: string, branch: string | null): string {
  return [
    "---",
    `id: "${id}"`,
    `title: "${title}"`,
    "type: feature",
    `status: ${status}`,
    "priority: p2",
    "area: cli",
    branch ? `branch: ${branch}` : "",
    `created_at: "2026-09-03T10:00:00Z"`,
    `updated_at: "2026-09-03T11:00:00Z"`,
    "---",
    "",
    "Body.",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

interface Fixture {
  root: string;
  config: RepoOSConfig;
  branch: string;
  lockPort: number;
  deadPid: number;
}

/** Full git fixture: two tasks (one active w/o worktree, one done w/ a merged worktree), a dead-PID serve lock, a STALE build marker. */
async function makeGitFixture(): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), "repoos-status-test-"));
  roots.push(root);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "work"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".repoos/\ndist/\nnode_modules/\n");
  writeFileSync(join(root, "src", "app.ts"), "export const app = 1;\n");
  writeFileSync(
    join(root, "dist", ".build-info.json"),
    JSON.stringify({ hash: "definitely-stale", version: "9.9.9-test" }),
  );
  writeFileSync(
    join(root, "work", "0001-active.md"),
    taskFile("0001", "Active task one", "active", "feat/active"),
  );
  writeFileSync(
    join(root, "work", "0002-done.md"),
    taskFile("0002", "Done task", "done", "feat/done"),
  );
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);

  // A merged worktree whose task is `done` → exactly what gc --dry-run collects.
  git(root, ["branch", "feat/done"]);
  const wt = ensureWorktree(root, "feat/done");
  expect(wt.ok).toBe(true);
  git(wt.path, ["commit", "-q", "--allow-empty", "-m", "feat/done work"]);
  git(root, ["merge", "-q", "--no-ff", "-m", "merge feat/done", "feat/done"]);

  // Dead-PID serve lock on a port nothing is listening on.
  const lockPort = await freePort();
  const deadPid = await exitedPid();
  mkdirSync(join(root, ".repoos"), { recursive: true });
  const startedAt = new Date(Date.now() - (3 * 3600 + 42 * 60) * 1000).toISOString();
  writeFileSync(
    join(root, ".repoos", `serve-${lockPort}.lock`),
    JSON.stringify({ pid: deadPid, port: lockPort, host: "127.0.0.1", startedAt }),
  );

  return {
    root,
    config: loadConfig(root),
    branch: git(root, ["branch", "--show-current"]),
    lockPort,
    deadPid,
  };
}

/** Mirror of core/build.ts hashSrcDir, so the fixture can write a FRESH marker. */
function srcHash(root: string): string {
  const hash = createHash("sha256");
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        walk(full);
      } else if (e.isFile()) files.push(full);
    }
  };
  walk(join(root, "src"));
  files.sort();
  for (const f of files) {
    hash.update(f.slice(root.length + 1));
    hash.update(readFileSync(f));
  }
  hash.update(`\0REPOOS_SHIP=${process.env.REPOOS_SHIP === "1" ? "1" : "0"}`);
  return hash.digest("hex");
}

describe("formatUptime / formatSince / formatRel", () => {
  it("formats uptimes the way the spec example reads", () => {
    expect(formatUptime(0)).toBe("0s");
    expect(formatUptime(42_000)).toBe("42s");
    expect(formatUptime((5 * 60 + 7) * 1000)).toBe("5m 07s");
    expect(formatUptime((3 * 3600 + 42 * 60) * 1000)).toBe("3h 42m");
    expect(formatUptime((2 * 24 * 3600 + 4 * 3600) * 1000)).toBe("2d 4h");
  });

  it("renders a same-day since-time as HH:MM and older ones with the date", () => {
    const now = new Date(2026, 8, 4, 10, 0);
    expect(formatSince(new Date(2026, 8, 4, 14, 2).toISOString(), now)).toBe("14:02");
    expect(formatSince(new Date(2026, 8, 2, 14, 2).toISOString(), now)).toBe("Sep 2 14:02");
    expect(formatSince("not-a-date", now)).toBe("?");
  });

  it("renders relative activity stamps", () => {
    const now = new Date(2026, 8, 4, 10, 0, 0);
    expect(formatRel(new Date(now.getTime() - 41_000).toISOString(), now)).toBe("41s ago");
    expect(formatRel(new Date(now.getTime() - 5 * 60_000).toISOString(), now)).toBe("5m ago");
    expect(formatRel(new Date(now.getTime() - 3 * 3600_000).toISOString(), now)).toBe("3h 00m ago");
    expect(formatRel(new Date(now.getTime() - 2 * 24 * 3600_000).toISOString(), now)).toBe(
      "2d ago",
    );
    expect(formatRel(null, now)).toBe("?");
  });
});

describe("collectStatus — server stopped", () => {
  it("classifies a healthy listener without a serve lock as unmanaged", () => {
    expect(serverLifecycle(true, 0)).toBe("unmanaged");
    expect(serverLifecycle(true, 1)).toBe("managed");
    expect(serverLifecycle(false, 1)).toBe("stopped");
  });

  it("reports the dead lockfile, stale build, board, leak and git facts without crashing", async () => {
    const fx = await makeGitFixture();
    const s = await collectStatus(fx.config, { probeTimeoutMs: 300 });

    // server: dead PID, no /api/health → stopped, but the lock's facts survive
    expect(s.server.running).toBe(false);
    expect(s.server.lifecycle).toBe("stopped");
    expect(s.server.health).toBe("unreachable");
    expect(s.server.pid).toBe(fx.deadPid);
    expect(s.server.port).toBe(fx.lockPort);
    expect(s.server.host).toBe("127.0.0.1");
    expect(s.server.locks).toBe(1);
    expect(s.server.startedAt).toBeTruthy();
    expect(s.server.startedAtSource).toBe("lockfile");
    expect(s.server.uptimeSeconds).not.toBeNull();
    expect(s.server.uptimeSeconds as number).toBeGreaterThan(3 * 3600 + 40 * 60);
    expect(s.server.uptimeSeconds as number).toBeLessThan(3 * 3600 + 44 * 60);

    // build: marker hash ≠ src/ hash → stale, unmissable
    expect(s.build.stale).toBe(true);
    expect(s.build.code).toBe("stale");
    expect(s.build.message).toContain("Stale build");
    expect(s.build.version).toBe("9.9.9-test");

    // board
    expect(s.board.taskCount).toBe(2);
    expect(s.board.counts.active).toBe(1);
    expect(s.board.counts.done).toBe(1);
    expect(s.board.active).toHaveLength(1);
    const active = s.board.active[0];
    expect(active.id).toBe("0001");
    expect(active.branch).toBe("feat/active");
    expect(active.worktreePath).toBeNull();
    expect(active.worktreeMissing).toBe(true); // branch with no worktree → flagged
    expect(active.updatedAt).toBe("2026-09-03T11:00:00Z");
    expect(active.needsInput).toBe(false);

    // worktrees: main + 1 registered; the merged done-task worktree is leaked
    expect(s.worktrees.count).toBe(2);
    expect(s.worktrees.warnThreshold).toBeGreaterThan(0);
    expect(s.worktrees.leaked.map((w) => w.branch)).toEqual(["feat/done"]);

    // leak count matches what `repoos gc --dry-run` would report (same sweep)
    const gcReport = sweepStaleWorktrees(fx.config, { mode: "full", dryRun: true });
    expect(s.worktrees.leaked.length).toBe(gcReport.removedWorktrees.length);

    // tunnel: nothing configured in the fixture
    expect(s.tunnel.configured).toBe(false);
    expect(s.tunnel.running).toBe(false);
    expect(s.tunnel.hostnames).toEqual([]);

    // git: the fixture's main checkout, clean
    expect(s.git.branch).toBe(fx.branch);
    expect(s.git.clean).toBe(true);
    expect(s.git.dirtyFiles).toBe(0);
    expect(s.git.isMainBranch).toBe(fx.branch === "main");
  });

  it("reports a FRESH build when the marker hash matches src/", async () => {
    const fx = await makeGitFixture();
    writeFileSync(
      join(fx.root, "dist", ".build-info.json"),
      JSON.stringify({ hash: srcHash(fx.root), version: "1.2.3-fixture" }),
    );
    const s = await collectStatus(fx.config, { probeTimeoutMs: 300 });
    expect(s.build.stale).toBe(false);
    expect(s.build.code).toBe("fresh");
    expect(s.build.message).toBeNull();
    expect(s.build.version).toBe("1.2.3-fixture");
  });

  it("picks the NEWEST dead lock as primary when several dead locks exist", async () => {
    const fx = await makeGitFixture();
    // A second, OLDER dead lock on a different port.
    const olderPort = await freePort();
    const olderPid = await exitedPid();
    writeFileSync(
      join(fx.root, ".repoos", `serve-${olderPort}.lock`),
      JSON.stringify({
        pid: olderPid,
        port: olderPort,
        host: "127.0.0.1",
        startedAt: "2026-09-01T00:00:00Z", // strictly older than the fixture's lock
      }),
    );
    const s = await collectStatus(fx.config, { probeTimeoutMs: 300 });
    // Primary = the NEWER lock (the fixture's), not readdirSync order.
    expect(s.server.pid).toBe(fx.deadPid);
    expect(s.server.port).toBe(fx.lockPort);

    const order = readServeLocks(fx.root, fx.config.cacheDir);
    expect(order).toHaveLength(2);
    expect(order[0].pid).toBe(fx.deadPid);
    expect(Date.parse(order[0].startedAt as string)).toBeGreaterThan(
      Date.parse(order[1].startedAt as string),
    );
  });

  it("does NOT report running when the lock's live PID was recycled by an unrelated process", async () => {
    const fx = await makeGitFixture();
    // Rewrite the lock with a LIVE pid that is NOT a repoos serve process —
    // the OS recycled the serve process's PID into something unrelated.
    const recycled = await lingeringPid();
    writeFileSync(
      join(fx.root, ".repoos", `serve-${fx.lockPort}.lock`),
      JSON.stringify({
        pid: recycled,
        port: fx.lockPort,
        host: "127.0.0.1",
        startedAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    const s = await collectStatus(fx.config, { probeTimeoutMs: 300 });
    // PID is alive but is not a serve process, and the port is dead → stopped.
    expect(s.server.running).toBe(false);
    expect(s.server.health).toBe("unreachable");
    expect(s.server.pid).toBe(recycled);
  });

  it("works with no lockfile and no git at all (brand-new repo, server down)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-status-bare-"));
    roots.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(
      join(root, "dist", ".build-info.json"),
      JSON.stringify({ hash: srcHash(root), version: "0.0.0-bare" }),
    );
    writeFileSync(
      join(root, "work", "0100-only.md"),
      taskFile("0100", "Only task", "active", null),
    );
    const port = await freePort();
    const s = await collectStatus(loadConfig(root), { probeTimeoutMs: 300, probePort: port });

    expect(s.server.running).toBe(false);
    expect(s.server.locks).toBe(0);
    expect(s.server.lifecycle).toBe("stopped");
    expect(s.server.pid).toBeNull();
    expect(s.server.port).toBe(port); // probed port reported back even with no lock
    expect(s.server.health).toBe("unreachable");
    expect(s.server.startedAt).toBeNull();
    expect(s.server.uptimeSeconds).toBeNull();
    expect(s.build.code).toBe("fresh");
    expect(s.board.taskCount).toBe(1);
    expect(s.board.active[0].worktreeMissing).toBe(false); // no branch yet — not a missing worktree
    expect(s.git.branch).toBeNull();
    expect(s.worktrees.count).toBe(0);
  });
});

describe("renderStatus", () => {
  it("prints the stale build unmissably, plus stopped server and missing-worktree flags", async () => {
    const fx = await makeGitFixture();
    const s = await collectStatus(fx.config, { probeTimeoutMs: 300 });
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    renderStatus(s, new Date("2026-09-04T10:00:00Z"));
    const out = lines.join("\n");
    expect(out).toContain("Stale build");
    expect(out).toContain("bun run build");
    expect(out).toContain("stopped");
    expect(out).toContain(`port ${fx.lockPort}`);
    expect(out).toContain(`pid ${fx.deadPid}`);
    expect(out).toContain("last lock"); // dead lock's facts are the diagnostic
    expect(out).toContain("#0001");
    expect(out).toContain("worktree missing");
    expect(out).toContain("leaked");
    expect(out).toContain("not configured");
    expect(out).toContain(fx.branch);
    // header line comes first
    expect(lines[1]).toContain("RepoOS status");

    // the running rendering (what `repoos status` shows with a live server):
    // port, PID and a human-readable uptime derived from the lockfile startedAt
    const live = { ...s, server: { ...s.server, running: true } };
    const liveLines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      liveLines.push(args.map(String).join(" "));
    });
    renderStatus(live, new Date(s.server.startedAt as string));
    const liveOut = liveLines.join("\n");
    expect(liveOut).toContain("● running");
    expect(liveOut).toContain(`port ${fx.lockPort}`);
    expect(liveOut).toContain(`pid ${fx.deadPid}`);
    // uptime baked into the snapshot from the lockfile startedAt (~3h42m)
    expect(liveOut).toContain("up 3h 42m (since");
  });

  it("prints no stale banner when the build is fresh", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-status-fresh-"));
    roots.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(
      join(root, "dist", ".build-info.json"),
      JSON.stringify({ hash: srcHash(root), version: "0.0.0-fresh" }),
    );
    const s = await collectStatus(loadConfig(root), { probeTimeoutMs: 300 });
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    renderStatus(s);
    const out = lines.join("\n");
    expect(out).not.toContain("Stale build");
    expect(out).toContain("fresh");
    expect(out).toContain("stopped");
  });

  it("warns unmissably when the running server predates the installed CLI", async () => {
    const fx = await makeGitFixture();
    const s = await collectStatus(fx.config, { probeTimeoutMs: 300 });
    // A live server reporting an older build than this CLI.
    const live: typeof s = {
      ...s,
      server: {
        ...s.server,
        running: true,
        version: "0.5.60",
        buildHash: "1111111111111111",
        buildAt: "2026-10-01T19:23:00Z",
      },
      cli: { version: "0.5.66", buildHash: "abcdef0123456789", buildAt: null },
    };
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    renderStatus(live, new Date("2026-10-07T10:00:00Z"));
    const out = lines.join("\n");
    expect(out).toContain("server is older than the installed CLI");
    expect(out).toContain("v0.5.60 → v0.5.66");
    expect(out).toContain("restart to pick up fixes");
    expect(out).toContain("repoos serve"); // hand-run default hint
    // the server line names the running build, not just the port/pid (it may
    // wrap across the narrow row, so check the two tokens independently)
    expect(out).toContain("v0.5.60 (build");
    expect(out).toContain("1111111)");
  });

  it("uses the managed-service restart hint when the server is an installed service", async () => {
    const fx = await makeGitFixture();
    const s = await collectStatus(fx.config, { probeTimeoutMs: 300 });
    const live: typeof s = {
      ...s,
      server: {
        ...s.server,
        running: true,
        managedService: true,
        version: "0.5.60",
        buildHash: "1111111111111111",
      },
      cli: { version: "0.5.66", buildHash: "abcdef0123456789", buildAt: null },
    };
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    renderStatus(live);
    const out = lines.join("\n");
    expect(out).toContain("server is older than the installed CLI");
    expect(out).toContain("repoos service restart");
    expect(out).toContain("managed service");
  });

  it("prints no stale-server banner when the server matches the CLI", async () => {
    const fx = await makeGitFixture();
    const s = await collectStatus(fx.config, { probeTimeoutMs: 300 });
    const live: typeof s = {
      ...s,
      server: {
        ...s.server,
        running: true,
        version: "0.5.66",
        buildHash: "abcdef0123456789",
      },
      cli: { version: "0.5.66", buildHash: "abcdef0123456789", buildAt: null },
    };
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    renderStatus(live);
    expect(lines.join("\n")).not.toContain("server is older than the installed CLI");
  });
});

describe("stale-server helpers (#0701)", () => {
  /** A minimal StatusServer with only the fields the helpers read. */
  function srv(over: Partial<Parameters<typeof serverBuildState>[0]> = {}) {
    return {
      lifecycle: "managed" as const,
      running: true,
      port: 7171,
      pid: 42,
      host: "127.0.0.1",
      startedAt: null,
      startedAtSource: null,
      uptimeSeconds: null,
      version: null,
      buildHash: null,
      buildAt: null,
      managedService: false,
      buildState: "unknown" as const,
      health: "ok" as const,
      healthRoot: null,
      locks: 1,
      ...over,
    };
  }
  const cliOf = (
    over: Partial<{
      version: string | null;
      buildHash: string | null;
      buildAt: string | null;
    }> = {},
  ) => ({
    version: "0.5.66",
    buildHash: "abcdef0123456789",
    buildAt: "2026-10-01T19:23:00Z",
    ...over,
  });

  it("shortHash trims a sha to 7 chars and passes null through", () => {
    expect(shortHash("abcdef0123456789")).toBe("abcdef0");
    expect(shortHash(null)).toBeNull();
  });

  describe("serverBuildState", () => {
    it("is same when the server's build hash matches the CLI's", () => {
      const s = srv({ buildHash: "abcdef0123456789" });
      expect(serverBuildState(s, cliOf())).toBe("same");
    });

    it("is stale when the hashes differ — a restart would pick up fixes", () => {
      const s = srv({ buildHash: "1111111111111111" });
      expect(serverBuildState(s, cliOf())).toBe("stale");
    });

    it("is unknown while the server is not running, even with a build hash", () => {
      const s = srv({ running: false, buildHash: "1111111111111111" });
      expect(serverBuildState(s, cliOf())).toBe("unknown");
    });

    it("falls back to build timestamps when no hashes are reported", () => {
      const older = srv({ buildAt: "2026-10-01T19:23:00Z" });
      const newer = srv({ buildAt: "2026-10-07T00:00:00Z" });
      const cliNoHash = cliOf({ buildHash: null, buildAt: "2026-10-06T00:00:00Z" });
      expect(serverBuildState(older, cliNoHash)).toBe("stale");
      expect(serverBuildState(newer, cliNoHash)).toBe("same");
    });

    it("falls back to the version string, then to unknown when nothing compares", () => {
      const s = srv({ version: "0.5.60" });
      expect(serverBuildState(s, cliOf({ buildHash: null, buildAt: null }))).toBe("stale");
      const same = srv({ version: "0.5.66" });
      expect(serverBuildState(same, cliOf({ buildHash: null, buildAt: null }))).toBe("same");
      const nothing = srv({ version: null });
      expect(serverBuildState(nothing, cliOf({ buildHash: null, buildAt: null }))).toBe("unknown");
    });
  });

  describe("serverIdentity", () => {
    it("prints version + short hash", () => {
      expect(serverIdentity(srv({ version: "0.5.66", buildHash: "abcdef0123456789" }))).toBe(
        "v0.5.66 (build abcdef0)",
      );
    });
    it("degrades to the version alone without a hash", () => {
      expect(serverIdentity(srv({ version: "0.5.66" }))).toBe("v0.5.66");
    });
    it("says version unknown when the server reports nothing", () => {
      expect(serverIdentity(srv())).toBe("version unknown");
    });
  });

  describe("restartHint", () => {
    it("uses `repoos service restart` for a managed service", () => {
      expect(restartHint(srv({ managedService: true }))).toBe("repoos service restart");
    });
    it("uses `repoos serve` for a hand-run server", () => {
      expect(restartHint(srv({ managedService: false }))).toBe("repoos serve");
    });
  });
});

describe("status --json shape", () => {
  it("emits the documented, stable top-level shape", async () => {
    const fx = await makeGitFixture();
    const s = await collectStatus(fx.config, { probeTimeoutMs: 300 });
    const parsed = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "board",
      "build",
      "cli",
      "generatedAt",
      "git",
      "root",
      "server",
      "tunnel",
      "worktrees",
    ]);
    expect(Object.keys(parsed.server as object).sort()).toEqual([
      "buildAt",
      "buildHash",
      "buildState",
      "health",
      "healthRoot",
      "host",
      "lifecycle",
      "locks",
      "managedService",
      "pid",
      "port",
      "running",
      "startedAt",
      "startedAtSource",
      "uptimeSeconds",
      "version",
    ]);
    expect(Object.keys(parsed.cli as object).sort()).toEqual(["buildAt", "buildHash", "version"]);
    expect(Object.keys(parsed.build as object).sort()).toEqual([
      "applicable",
      "buildAt",
      "code",
      "message",
      "stale",
      "version",
    ]);
    expect(Object.keys(parsed.board as object).sort()).toEqual(["active", "counts", "taskCount"]);
    expect(Object.keys((parsed.board as { active: object[] }).active[0] as object).sort()).toEqual([
      "branch",
      "id",
      "needsInput",
      "title",
      "updatedAt",
      "worktreeMissing",
      "worktreePath",
    ]);
    expect(Object.keys(parsed.worktrees as object).sort()).toEqual([
      "count",
      "kept",
      "leaked",
      "warnThreshold",
    ]);
    expect(Object.keys(parsed.tunnel as object).sort()).toEqual([
      "configured",
      "hostnames",
      "running",
      "tunnelName",
    ]);
    expect(Object.keys(parsed.git as object).sort()).toEqual([
      "ahead",
      "behind",
      "branch",
      "clean",
      "dirtyFiles",
      "isMainBranch",
    ]);
  });

  it("cmdStatus --json prints exactly one JSON document (end-to-end over the live board)", async () => {
    const lines: string[] = [];
    const errLines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errLines.push(args.map(String).join(" "));
    });
    await cmdStatus(["--json"]);
    // stdout must be a single parseable JSON document; human notes go to stderr
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "board",
      "build",
      "cli",
      "generatedAt",
      "git",
      "root",
      "server",
      "tunnel",
      "worktrees",
    ]);
  });
});
