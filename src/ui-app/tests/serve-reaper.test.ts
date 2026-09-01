import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawn } from "node:child_process";
import {
  ServeReaper,
  isOrphanRoot,
  isOrphanServeCommand,
  isPortListening,
} from "../../server/serve-reaper.js";
import { shouldReapStrayServeProcesses } from "../../server/server.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import net from "node:net";

/** Bind a bare HTTP server on loopback so the port is genuinely listening. */
function serveOn(port: number): Promise<net.Server> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen({ port, host: "127.0.0.1" }, () => resolve(server));
  });
}

/** Close a server, awaiting the underlying socket release so a port frees promptly. */
function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/**
 * Grab an ephemeral (OS-assigned) port. The probe tests must never hardcode a
 * fixed port: on a busy/shared runner that port could genuinely be occupied by
 * an unrelated process, turning a "no conflict here" expectation into a false
 * positive. Reserving a free port then closing it (and re-binding when a test
 * needs a real listener) removes that flakiness.
 */
function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen({ port: 0, host: "127.0.0.1" }, () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });
}

describe("ServeReaper", () => {
  let tmpDir: string;
  let reaper: ServeReaper;

  beforeEach(() => {
    // Hermetic env: another test file (reload) may set REPOOS_RELOAD, which
    // would make cleanupStale skip reaping and flake these tests.
    delete process.env.REPOOS_RELOAD;
    tmpDir = join(tmpdir(), `repoos-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    reaper = new ServeReaper(tmpDir, ".repoos");
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("registers a serve process with port and host", () => {
    reaper.register(7171, "127.0.0.1");

    const lockPath = join(tmpDir, ".repoos", "serve.lock");
    expect(existsSync(lockPath)).toBe(true);

    const content = JSON.parse(readFileSync(lockPath, "utf8"));
    expect(content.pid).toBe(process.pid);
    expect(content.port).toBe(7171);
    expect(content.host).toBe("127.0.0.1");
    expect(content.startedAt).toBeDefined();
  });

  it("unregisters a serve process", () => {
    reaper.register(7171, "127.0.0.1");
    const lockPath = join(tmpDir, ".repoos", "serve.lock");
    expect(existsSync(lockPath)).toBe(true);

    reaper.unregister();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("keeps the control-plane lock intact when an ephemeral harness closes", () => {
    const lockPath = join(tmpDir, ".repoos", "serve.lock");
    reaper.register(7171, "127.0.0.1");
    const controlLock = readFileSync(lockPath, "utf8");

    // `startServer({ port: 0 })` is used by UI smoke tests and must never
    // claim or remove the lock for a real server rooted at the same checkout.
    const ephemeral = new ServeReaper(tmpDir, ".repoos", false);
    ephemeral.cleanupStale();
    ephemeral.register(49876, "127.0.0.1");
    ephemeral.unregister();

    expect(readFileSync(lockPath, "utf8")).toBe(controlLock);
  });

  it("detects conflict when a live process is registered for the same port", async () => {
    reaper.register(7171, "127.0.0.1");
    const conflict = await reaper.detectConflict(7171, "127.0.0.1");

    expect(conflict).toBeDefined();
    expect(conflict).toContain("Port 7171 is already bound");
    expect(conflict).toContain(String(process.pid));
  });

  it("does not detect conflict for different ports", async () => {
    const taken = await reservePort();
    reaper.register(taken, "127.0.0.1");
    const other = await reservePort();
    const conflict = await reaper.detectConflict(other, "127.0.0.1");

    expect(conflict).toBeNull();
  });

  it("does not detect conflict for different hosts", async () => {
    const taken = await reservePort();
    reaper.register(taken, "127.0.0.1");
    const conflict = await reaper.detectConflict(taken, "0.0.0.0");

    expect(conflict).toBeNull();
  });

  it("detects a live listener even when the lockfile is missing (#0284)", async () => {
    const probePort = await reservePort();
    const server = await serveOn(probePort);

    try {
      // A live process owns probePort but there is NO lockfile — a deleted/corrupt
      // lockfile must not mask the live listener.
      expect(existsSync(join(tmpDir, ".repoos", "serve.lock"))).toBe(false);
      const conflict = await reaper.detectConflict(probePort, "127.0.0.1");
      expect(conflict).toBeDefined();
      expect(conflict).toContain(`Port ${probePort} is already in use`);
      expect(conflict).toContain("lockfile is missing or corrupt");
    } finally {
      await closeServer(server);
    }
  });

  it("detects a live listener even when the lockfile points at a dead PID (#0284)", async () => {
    const probePort = await reservePort();
    const server = await serveOn(probePort);
    mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
    require("node:fs").writeFileSync(
      join(tmpDir, ".repoos", "serve.lock"),
      JSON.stringify({
        pid: 999999999,
        port: probePort,
        host: "127.0.0.1",
        startedAt: new Date().toISOString(),
      }),
    );

    try {
      // The lockfile names a dead PID, but a live process actually holds the
      // port — the stale lockfile must not mask it.
      const conflict = await reaper.detectConflict(probePort, "127.0.0.1");
      expect(conflict).toBeDefined();
      expect(conflict).toContain(`Port ${probePort} is already in use`);
      expect(conflict).toContain("names a dead process on this port");
    } finally {
      await closeServer(server);
    }
  });

  it("reports a present-but-different lockfile honestly (not as missing/stale) (#0284)", async () => {
    const probePort = await reservePort();
    const server = await serveOn(probePort);
    mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
    require("node:fs").writeFileSync(
      join(tmpDir, ".repoos", "serve.lock"),
      JSON.stringify({
        pid: process.pid, // live PID, but for a different endpoint
        port: probePort,
        host: "192.0.2.1",
        startedAt: new Date().toISOString(),
      }),
    );

    try {
      // The lockfile is present and valid but names a different host; the
      // message must not claim it is "missing or corrupt" or "a dead process".
      const conflict = await reaper.detectConflict(probePort, "127.0.0.1");
      expect(conflict).toBeDefined();
      expect(conflict).toContain(`Port ${probePort} is already in use`);
      expect(conflict).toContain("names a different endpoint");
    } finally {
      await closeServer(server);
    }
  });

  it("isPortListening is false when nothing is listening", async () => {
    expect(await isPortListening(1, "127.0.0.1")).toBe(false);
    expect(await isPortListening(0, "127.0.0.1")).toBe(false);
  });

  it("cleans up stale lockfiles without removing current process lockfile", () => {
    // Write a stale lockfile with a fake PID
    const lockPath = join(tmpDir, ".repoos", "serve.lock");
    mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
    // Use a very high PID that's unlikely to exist
    const staleLock = {
      pid: 999999999,
      port: 7171,
      host: "127.0.0.1",
      startedAt: new Date().toISOString(),
    };
    require("node:fs").writeFileSync(lockPath, JSON.stringify(staleLock));

    reaper.cleanupStale();

    // The stale lockfile should be removed
    expect(existsSync(lockPath)).toBe(false);
  });

  it("handles corrupt lockfiles gracefully", () => {
    const lockPath = join(tmpDir, ".repoos", "serve.lock");
    mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
    require("node:fs").writeFileSync(lockPath, "invalid json");

    reaper.cleanupStale();

    // Should remove corrupt lockfile
    expect(existsSync(lockPath)).toBe(false);
  });

  it("handles missing lockfiles gracefully", () => {
    expect(() => reaper.cleanupStale()).not.toThrow();
  });

  it("idempotent unregister", () => {
    reaper.register(7171, "127.0.0.1");
    reaper.unregister();
    expect(() => reaper.unregister()).not.toThrow();
  });

  it("scopes the lockfile by port so servers on different ports don't reap each other", () => {
    mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
    const lock7171 = join(tmpDir, ".repoos", "serve-7171.lock");
    const lock8765 = join(tmpDir, ".repoos", "serve-8765.lock");

    // A live control plane on :7171 (this process, so isProcessAlive is true).
    new ServeReaper(tmpDir, ".repoos", true, 7171).register(7171, "127.0.0.1");
    expect(existsSync(lock7171)).toBe(true);

    // A second control plane booting on :8765 must not touch the :7171 lock.
    const other = new ServeReaper(tmpDir, ".repoos", true, 8765);
    other.cleanupStale();
    expect(existsSync(lock7171)).toBe(true);
    other.register(8765, "127.0.0.1");
    expect(existsSync(lock8765)).toBe(true);
    expect(existsSync(lock7171)).toBe(true);

    // A :7171 restart still reaps its own stale predecessor.
    writeFileSync(
      lock7171,
      JSON.stringify({ pid: 999999999, port: 7171, host: "127.0.0.1", startedAt: "" }),
    );
    new ServeReaper(tmpDir, ".repoos", true, 7171).cleanupStale();
    expect(existsSync(lock7171)).toBe(false);
    expect(existsSync(lock8765)).toBe(true);
  });

  it("skips cleanup when REPOOS_RELOAD=1 (reload replacement mode)", () => {
    // Write a stale lockfile
    const lockPath = join(tmpDir, ".repoos", "serve.lock");
    mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
    const staleLock = {
      pid: 999999999,
      port: 7171,
      host: "127.0.0.1",
      startedAt: new Date().toISOString(),
    };
    require("node:fs").writeFileSync(lockPath, JSON.stringify(staleLock));

    // Simulate reload replacement mode
    const oldEnv = process.env.REPOOS_RELOAD;
    try {
      process.env.REPOOS_RELOAD = "1";

      // Create a reaper and call cleanupStale
      const reaperInReloadMode = new ServeReaper(tmpDir, ".repoos");
      reaperInReloadMode.cleanupStale();

      // Lockfile should still exist because cleanup is skipped in reload mode
      expect(existsSync(lockPath)).toBe(true);
    } finally {
      if (oldEnv === undefined) {
        delete process.env.REPOOS_RELOAD;
      } else {
        process.env.REPOOS_RELOAD = oldEnv;
      }
    }
  });

  it("calls its owner when the served root disappears", () => {
    vi.useFakeTimers();
    try {
      let closed = 0;
      // interval 5ms, default 3 consecutive misses required.
      reaper.watchRoot(() => {
        closed += 1;
      }, 5);

      rmSync(tmpDir, { recursive: true, force: true });
      vi.advanceTimersByTime(5); // miss 1
      vi.advanceTimersByTime(5); // miss 2
      expect(closed).toBe(0);
      vi.advanceTimersByTime(5); // miss 3 → fires
      expect(closed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fire while the root keeps reappearing (debounce) (#0216)", () => {
    // Real timers made this racy under load (#0213): a 5ms polling interval
    // racing 3ms create/delete cycles can have 3 consecutive checks land on a
    // moment the root is gone, spuriously tearing the server down. Fake timers
    // make the exact miss/reset sequence deterministic.
    vi.useFakeTimers();
    try {
      let closed = 0;
      // interval 5ms, needs 3 consecutive misses: a root that flickers back
      // before three checks must never tear the server down.
      reaper.watchRoot(
        () => {
          closed += 1;
        },
        5,
        3,
      );

      // Flicker: each cycle the root is missing for one check, then restored —
      // the miss counter must reset before it ever reaches 3.
      for (let i = 0; i < 3; i++) {
        rmSync(tmpDir, { recursive: true, force: true });
        vi.advanceTimersByTime(5); // miss 1
        mkdirSync(tmpDir, { recursive: true });
        vi.advanceTimersByTime(5); // root present → resets misses
      }
      expect(closed).toBe(0);

      // The real case: the root stays gone — three consecutive misses fire.
      rmSync(tmpDir, { recursive: true, force: true });
      vi.advanceTimersByTime(5); // miss 1
      vi.advanceTimersByTime(5); // miss 2
      expect(closed).toBe(0);
      vi.advanceTimersByTime(5); // miss 3 → fires
      expect(closed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is fully inert for a preview child (REPOOS_PREVIEW_CHILD=1) (#0183)", async () => {
    const lockPath = join(tmpDir, ".repoos", "serve.lock");
    mkdirSync(join(tmpDir, ".repoos"), { recursive: true });

    const oldEnv = process.env.REPOOS_PREVIEW_CHILD;
    try {
      process.env.REPOOS_PREVIEW_CHILD = "1";
      const preview = new ServeReaper(tmpDir, ".repoos");

      // A preview child must never reap whatever the worktree's lockfile holds.
      require("node:fs").writeFileSync(
        lockPath,
        JSON.stringify({
          pid: 999999999,
          port: 12345,
          host: "127.0.0.1",
          startedAt: new Date().toISOString(),
        }),
      );
      preview.cleanupStale();
      expect(existsSync(lockPath)).toBe(true); // not reaped

      // detectConflict never refuses to bind (no false positive on reused ports)
      expect(await preview.detectConflict(12345, "127.0.0.1")).toBeNull();

      // register never writes the lockfile (no cross-preview collision)
      preview.register(54321, "127.0.0.1");
      expect(JSON.parse(require("node:fs").readFileSync(lockPath, "utf8")).port).toBe(12345);
    } finally {
      if (oldEnv === undefined) {
        delete process.env.REPOOS_PREVIEW_CHILD;
      } else {
        process.env.REPOOS_PREVIEW_CHILD = oldEnv;
      }
    }
  });
});

describe("periodic serve reaper ownership (#0216)", () => {
  it("is disabled in preview children, which must never reap their control plane", () => {
    expect(shouldReapStrayServeProcesses({ port: 63096 }, { REPOOS_PREVIEW_CHILD: "1" })).toBe(
      false,
    );
  });

  it("is disabled for ephemeral in-process test servers", () => {
    expect(shouldReapStrayServeProcesses({ port: 0 }, {})).toBe(false);
  });

  it("remains enabled for a normal control-plane server", () => {
    expect(shouldReapStrayServeProcesses({ port: 7171 }, {})).toBe(true);
  });
});

describe("orphaned-root sweep classification (#0216)", () => {
  it("matches the repoos CLI serve shape in compiled and dev form", () => {
    expect(isOrphanServeCommand("/x/repoos/dist/cli/index.js serve --port 42222")).toBe(true);
    expect(isOrphanServeCommand("/x/repoos/src/cli/index.ts serve --port 42222")).toBe(true);
    expect(isOrphanServeCommand("/x/repoos/dist/cli/index.js serve")).toBe(true);
    // A plain test runner or unrelated process is never a candidate.
    expect(isOrphanServeCommand("vitest run")).toBe(false);
    expect(isOrphanServeCommand("/usr/bin/node /x/repoos/dist/cli/index.js")).toBe(false);
    // A different command's subcommand that merely mentions "serve" is not it.
    expect(isOrphanServeCommand("bun run test:serve")).toBe(false);
  });

  it("flags a deleted cwd under the system temp dir, and nothing else", () => {
    const goneUnderTmp = join(tmpdir(), `repoos-autoprev-gone-${Date.now()}`);
    // The dir was never created — a stand-in for a deleted fixture root.
    expect(isOrphanRoot(goneUnderTmp)).toBe(true);

    // An existing temp-dir path is a healthy preview, not an orphan.
    expect(isOrphanRoot(tmpdir())).toBe(false);

    // A deleted path OUTSIDE the temp dir (e.g. a renamed/unmounted repo) is
    // not conclusively an orphan — a sweep must never kill a user's checkout.
    const goneOutsideTmp = join(homedir(), `repoos-missing-${Date.now()}`);
    expect(isOrphanRoot(goneOutsideTmp)).toBe(false);
  });

  it("reaps a real serve-shaped process whose tmpdir root is deleted (#0216)", async () => {
    if (process.platform === "win32") return; // sweep is Unix/Mac only
    const root = join(tmpdir(), `repoos-sweep-live-${Date.now()}`);
    mkdirSync(join(root, "cli"), { recursive: true });
    writeFileSync(join(root, "cli", "index.js"), "setInterval(() => {}, 1000);\n");
    const sweep = new ServeReaper(join(tmpdir(), `repoos-sweep-unused-${Date.now()}`), ".repoos");
    const child = spawn(process.execPath, [join(root, "cli", "index.js"), "serve"], { cwd: root });
    try {
      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolve) => child.once("exit", (code, signal) => resolve({ code, signal })),
      );
      // Give the child time to bind its cwd before the root disappears.
      await new Promise((r) => setTimeout(r, 200));
      rmSync(root, { recursive: true, force: true });

      const reaped = await sweep.cleanupOrphanedRoots();

      expect(reaped).toBeGreaterThanOrEqual(1);
      const outcome = await exited;
      // The sweep's SIGTERM terminated it; the child must not have survived.
      expect(outcome.code ?? outcome.signal).toBeTruthy();
    } finally {
      // The sweep already reaped it; a belt-and-braces kill for failure paths.
      if (child.exitCode === null) child.kill("SIGKILL");
      rmSync(root, { recursive: true, force: true });
    }
  });
});
