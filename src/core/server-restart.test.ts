import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pidOwnership,
  restartRepoServer,
  spawnHandRunServe,
  waitForServerRestart,
} from "./server-restart.js";
import type { LocatedServer } from "./server-locate.js";
import * as serviceManager from "./service-manager.js";

function server(over: Partial<LocatedServer> = {}): LocatedServer {
  return {
    port: 7200,
    host: "127.0.0.1",
    pid: 1000,
    version: "0.5.80",
    serveFlags: [],
    source: "lockfile",
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("restartRepoServer", () => {
  const root = "/projects/demo";

  it("refuses when server belongs to another user", async () => {
    const result = await restartRepoServer(root, {
      locate: async () => server({ pid: 42 }),
      ownership: () => ({ uid: 999, canSignal: false, otherUser: true }),
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/another user/i);
  });

  it("warns before stop when engineers are active", async () => {
    const warned = vi.fn();
    await restartRepoServer(root, {
      locate: async () => server({ pid: 10 }),
      classify: async () => "managed-service",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 2,
      }),
      restartManaged: async () => ({ ok: true }),
      wait: async () => ({ ok: true, pid: 11, version: "0.5.82" }),
      onBeforeStop: warned,
    });
    expect(warned).toHaveBeenCalledWith({ activeEngineers: 2, path: "managed-service" });
  });

  it("hand-run fails cleanly when spawn fails after stop", async () => {
    const result = await restartRepoServer(root, {
      locate: async () => server({ pid: 40 }),
      classify: async () => "hand-run",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 0,
      }),
      stop: () => {},
      waitPidGone: async () => true,
      spawn: () => ({ ok: false, error: "Cannot find CLI entry" }),
      verifyPid: () => true,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Failed to start hand-run/i);
  });
});

describe("spawnHandRunServe", () => {
  it("returns error when needsCliEntry and dist/cli is missing", () => {
    vi.spyOn(serviceManager, "repoosBinary").mockReturnValue({
      bin: process.execPath,
      needsCliEntry: true,
    });
    const r = spawnHandRunServe("/tmp", 7200, "127.0.0.1");
    expect(r.ok).toBe(true);
  });
});

describe("waitForServerRestart", () => {
  it("succeeds when health is ok and pid changes", async () => {
    let n = 0;
    const result = await waitForServerRestart("/r", 7000, "127.0.0.1", {
      oldPid: 5,
      timeoutMs: 2000,
      pollMs: 10,
      fetch: async () => {
        n++;
        return n >= 2
          ? { ok: true, root: "/r", serverVersion: "1.0.0", activeEngineers: 0 }
          : { ok: false, root: null, serverVersion: null, activeEngineers: 0 };
      },
      readPid: () => (n >= 2 ? 9 : 5),
      sleep: async () => {},
    });
    expect(result.ok).toBe(true);
    expect(result.pid).toBe(9);
  });
});

describe("pidOwnership", () => {
  it("treats live own pid as signalable", () => {
    const o = pidOwnership(process.pid);
    expect(o.canSignal).toBe(true);
    expect(o.otherUser).toBe(false);
  });
});
