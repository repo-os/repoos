import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ServeReaper } from "../../server/serve-reaper.js";
import { existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
