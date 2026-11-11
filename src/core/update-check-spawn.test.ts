import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * The real detached-spawn path (`spawnDetachedUpdateCheckRefresh`) is never
 * reached by `update-check.test.ts`, which injects `spawnDetachedRefresh`. A
 * spawn failure emits an async `error` event; without a listener Node turns it
 * into an unhandled error that crashes the user's command (review pass 2, bug
 * 2). These tests mock `node:child_process` so the failure is deterministic and
 * assert the CLI never dies.
 */

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { REPOOS_UPDATE_CHECK_CHILD, prefetchCliUpdateCheck } from "./update-check.js";

/** A fake ChildProcess: enough of EventEmitter + unref for the refresh path. */
function fakeChild(): EventEmitter & { unref: () => void } {
  const child = new EventEmitter() as EventEmitter & { unref: () => void };
  child.unref = () => {};
  return child;
}

describe("spawnDetachedUpdateCheckRefresh (real spawn path)", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "repoos-update-spawn-"));
    spawnMock.mockReset();
    delete process.env[REPOOS_UPDATE_CHECK_CHILD];
  });

  afterEach(() => {
    delete process.env[REPOOS_UPDATE_CHECK_CHILD];
    rmSync(home, { recursive: true, force: true });
  });

  function prefetch(): void {
    prefetchCliUpdateCheck({
      home: () => home,
      now: () => 1_700_000_000_000,
      installRoot: () => "/opt/standalone/repoos",
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
    });
  }

  it("contains an async spawn error (ENOENT) instead of crashing", () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    expect(() => prefetch()).not.toThrow();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    // A listener must be attached, or this emit becomes unhandled.
    expect(child.listenerCount("error")).toBeGreaterThan(0);
    child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
  });

  it("contains a synchronous throw from spawn", () => {
    spawnMock.mockImplementation(() => {
      throw new Error("EACCES");
    });
    expect(() => prefetch()).not.toThrow();
  });

  it("does not spawn from inside the refresh child itself", () => {
    process.env[REPOOS_UPDATE_CHECK_CHILD] = "1";
    expect(() => prefetch()).not.toThrow();
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
