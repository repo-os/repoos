import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { ServeReaper, isOrphanRoot, isOrphanServeCommand } from "../../server/serve-reaper.js";
import { shouldReapStrayServeProcesses } from "../../server/server.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

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

  it("detects conflict when a live process is registered for the same port", () => {
    reaper.register(7171, "127.0.0.1");
    const conflict = reaper.detectConflict(7171, "127.0.0.1");

    expect(conflict).toBeDefined();
    expect(conflict).toContain("Port 7171 is already bound");
    expect(conflict).toContain(String(process.pid));
  });

  it("does not detect conflict for different ports", () => {
    reaper.register(7171, "127.0.0.1");
    const conflict = reaper.detectConflict(7172, "127.0.0.1");

    expect(conflict).toBeNull();
  });

  it("does not detect conflict for different hosts", () => {
    reaper.register(7171, "127.0.0.1");
    const conflict = reaper.detectConflict(7171, "0.0.0.0");

    expect(conflict).toBeNull();
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

  it("calls its owner when the served root disappears", async () => {
    let closed = 0;
    reaper.watchRoot(() => { closed += 1; }, 5);

    rmSync(tmpDir, { recursive: true, force: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(closed).toBe(1);
  });

  it("does not fire while the root keeps reappearing (debounce) (#0216)", async () => {
    let closed = 0;
    // interval 50ms, needs 3 consecutive misses: a root that flickers back
    // before three checks must never tear the server down.
    // The timing gap between rm/mkdir must be wide enough that the interval
    // always lands while the directory state is stable — otherwise Node's
    // event loop can batch the interval check between rm and mkdir within the
    // same cycle, counting a false miss.
    reaper.watchRoot(() => { closed += 1; }, 50, 3);

    rmSync(tmpDir, { recursive: true, force: true });
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      mkdirSync(tmpDir, { recursive: true });
      await new Promise((resolve) => setTimeout(resolve, 30));
      rmSync(tmpDir, { recursive: true, force: true });
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed).toBe(0);

    // The real case: the root stays gone — three consecutive misses fire.
    rmSync(tmpDir, { recursive: true, force: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(closed).toBe(1);
  });

  it("is fully inert for a preview child (REPOOS_PREVIEW_CHILD=1) (#0183)", () => {
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
      expect(preview.detectConflict(12345, "127.0.0.1")).toBeNull();

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
    expect(shouldReapStrayServeProcesses({ port: 63096 }, { REPOOS_PREVIEW_CHILD: "1" })).toBe(false);
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
      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
        child.once("exit", (code, signal) => resolve({ code, signal })),
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
