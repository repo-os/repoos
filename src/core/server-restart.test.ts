import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pidOwnership,
  restartRepoServer,
  restartSupervisorUnit,
  waitForServerRestart,
  type RestartRepoServerOptions,
} from "./server-restart.js";
import type { LocatedServer } from "./server-locate.js";

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

/** Zeroed in-flight work so tests never make a real /api/health call. */
const noWork = {
  engineers: 0,
  reviews: 0,
  freeformRuns: 0,
  devTargets: 0,
  previews: 0,
};

/** `restartRepoServer` with a hermetic `cancelledWork` probe unless overridden. */
function restart(root: string, opts: RestartRepoServerOptions = {}) {
  return restartRepoServer(root, { cancelledWork: async () => noWork, ...opts });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("restartRepoServer", () => {
  const root = "/projects/demo";

  it("refuses when server belongs to another user", async () => {
    const result = await restart(root, {
      locate: async () => server({ pid: 42 }),
      verifyPid: () => true,
      ownership: () => ({ uid: 999, canSignal: false, otherUser: true }),
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/another user/i);
  });

  it("warns with the full set of in-flight work before stop", async () => {
    const warned = vi.fn();
    await restart(root, {
      locate: async () => server({ pid: 10 }),
      verifyPid: () => true,
      classify: async () => "managed-service",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 2,
      }),
      cancelledWork: async () => ({
        engineers: 2,
        reviews: 1,
        freeformRuns: 0,
        devTargets: 0,
        previews: 3,
      }),
      restartManaged: async () => ({ ok: true }),
      wait: async () => ({ ok: true, pid: 11, version: "0.5.82" }),
      onBeforeStop: warned,
    });
    expect(warned).toHaveBeenCalledWith({
      cancelled: { engineers: 2, reviews: 1, freeformRuns: 0, devTargets: 0, previews: 3 },
      path: "managed-service",
    });
  });

  it("managed-service restart succeeds when health returns a new pid", async () => {
    const result = await restart(root, {
      locate: async () => server({ pid: 20 }),
      classify: async () => "managed-service",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 0,
      }),
      restartManaged: async () => ({ ok: true }),
      verifyPid: () => true,
      wait: async () => ({ ok: true, pid: 21, version: "0.5.82" }),
    });
    expect(result.ok).toBe(true);
    expect(result.path).toBe("managed-service");
    expect(result.newPid).toBe(21);
  });

  it("restarts a detected supervisor directly and reports the healthy replacement", async () => {
    const stop = vi.fn();
    const restartSupervisor = vi.fn(() => ({ ok: true }));
    const info = {
      platform: "systemd" as const,
      job: "com.repoos.serve.demo",
      manualCommand: "systemctl --user restart com.repoos.serve.demo.service",
    };
    const result = await restart(root, {
      locate: async () => server({ pid: 31 }),
      classify: async () => "supervisor",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({ ok: true, root, serverVersion: "0.5.80", activeEngineers: 0 }),
      supervisorInfo: () => info,
      restartSupervisor,
      stop,
      verifyPid: () => true,
      wait: async () => ({ ok: true, pid: 32, version: "0.5.82" }),
    });
    expect(restartSupervisor).toHaveBeenCalledWith(info);
    expect(stop).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, path: "supervisor", oldPid: 31, newPid: 32 });
    expect(result.newVersion).toBe("0.5.82");
  });

  it("surfaces supervisor restart failures without signalling the server", async () => {
    const stop = vi.fn();
    const info = {
      platform: "systemd" as const,
      job: "com.repoos.serve.demo",
      manualCommand: "systemctl --user restart com.repoos.serve.demo.service",
    };
    const result = await restart(root, {
      locate: async () => server({ pid: 31 }),
      classify: async () => "supervisor",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({ ok: true, root, serverVersion: "0.5.80", activeEngineers: 0 }),
      supervisorInfo: () => info,
      restartSupervisor: () => ({ ok: false, error: "systemctl exited 1" }),
      stop,
      verifyPid: () => true,
    });
    expect(result).toMatchObject({
      ok: false,
      path: "supervisor",
      message: /Failed to restart systemd unit com\.repoos\.serve\.demo: systemctl exited 1/,
      manualCommand: info.manualCommand,
    });
    expect(stop).not.toHaveBeenCalled();
  });

  it("an uncertain supervisor refuses and says kill only stops the server", async () => {
    const stop = vi.fn();
    const result = await restart(root, {
      locate: async () => server({ pid: 33 }),
      classify: async () => "refuse-supervised-unknown",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({ ok: true, root, serverVersion: "0.5.80", activeEngineers: 0 }),
      stop,
      verifyPid: () => true,
    });
    expect(result.ok).toBe(false);
    expect(stop).not.toHaveBeenCalled();
    expect(result.manualCommand).toMatch(/^kill \d+ {3}# this only stops it/);
    expect(result.manualCommand).not.toMatch(/kill \d+ &&/);
  });

  it("supervisor reports its restart command when the new server does not return", async () => {
    const info = {
      platform: "launchd" as const,
      job: "org.repoos.serve.kamrai",
      manualCommand: "launchctl kickstart -k system/org.repoos.serve.kamrai",
    };
    const result = await restart(root, {
      locate: async () => server({ pid: 30 }),
      classify: async () => "supervisor",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 0,
      }),
      supervisorInfo: () => info,
      restartSupervisor: () => ({ ok: true }),
      stop: () => {},
      verifyPid: () => true,
      wait: async () => ({
        ok: false,
        pid: null,
        version: null,
        reason: "timed out",
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.path).toBe("supervisor");
    expect(result.manualCommand).toContain("kickstart");
  });

  it("builds direct, shell-free restart argv for systemd and launchd", () => {
    const execFile = vi.fn(() => "");
    expect(
      restartSupervisorUnit(
        {
          platform: "systemd",
          job: "com.repoos.serve.demo",
          manualCommand: "systemctl --user restart com.repoos.serve.demo.service",
        },
        execFile as never,
      ),
    ).toEqual({ ok: true });
    expect(execFile).toHaveBeenLastCalledWith(
      "systemctl",
      ["--user", "restart", "com.repoos.serve.demo.service"],
      expect.any(Object),
    );

    expect(
      restartSupervisorUnit(
        {
          platform: "launchd",
          job: "org.repoos.serve.demo",
          manualCommand: "launchctl kickstart -k gui/501/org.repoos.serve.demo",
        },
        execFile as never,
      ),
    ).toEqual({ ok: true });
    expect(execFile).toHaveBeenLastCalledWith(
      "launchctl",
      ["kickstart", "-k", "gui/501/org.repoos.serve.demo"],
      expect.any(Object),
    );
  });

  it("hand-run succeeds when spawn and health return a new pid", async () => {
    const result = await restart(root, {
      locate: async () => server({ pid: 50, serveFlags: ["--preview-overrides"] }),
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
      spawn: () => ({ ok: true }),
      verifyPid: () => true,
      wait: async () => ({ ok: true, pid: 51, version: "0.5.82" }),
    });
    expect(result.ok).toBe(true);
    expect(result.path).toBe("hand-run");
    expect(result.newPid).toBe(51);
  });

  it("hand-run fails cleanly when spawn fails after stop", async () => {
    const result = await restart(root, {
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

  it("refuses an uncertain supervisor and prints a manual command", async () => {
    const result = await restart(root, {
      locate: async () => server({ pid: 60 }),
      classify: async () => "refuse-supervised-unknown",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 0,
      }),
      verifyPid: () => true,
    });
    expect(result.ok).toBe(false);
    expect(result.oldPid).toBe(60);
    expect(result.manualCommand).toMatch(/kill 60 /);
  });

  it("hand-run aborts before spawning when the old pid will not exit", async () => {
    const spawn = vi.fn(() => ({ ok: true }) as const);
    const result = await restart(root, {
      locate: async () => server({ pid: 70 }),
      classify: async () => "hand-run",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 0,
      }),
      stop: () => {},
      waitPidGone: async () => false,
      spawn,
      verifyPid: () => true,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/did not exit/i);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("keeps the old flags when restarting a hand-run server", async () => {
    let spawnedFlags: readonly string[] = [];
    const result = await restart(root, {
      locate: async () => server({ pid: 80, serveFlags: ["--preview-overrides"] }),
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
      spawn: (_root, _port, _host, flags = []) => {
        spawnedFlags = flags;
        return { ok: true };
      },
      verifyPid: () => true,
      wait: async () => ({ ok: true, pid: 81, version: "0.5.82" }),
    });
    expect(result.ok).toBe(true);
    expect(spawnedFlags).toEqual(["--preview-overrides"]);
  });

  it("reads the old flags from the process BEFORE stopping it when the lock has none", async () => {
    let alive = true;
    let spawnedFlags: readonly string[] = [];
    const result = await restart(root, {
      // Registry-located: no serveFlags on the located server.
      locate: async () => server({ pid: 90, serveFlags: [], source: "registry" }),
      classify: async () => "hand-run",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({ ok: true, root, serverVersion: "0.5.80", activeEngineers: 0 }),
      // The flags are only readable while the pid is alive (as with `ps`).
      resolveServeFlags: () => (alive ? ["--preview-overrides", "--quiet"] : []),
      stop: () => {
        alive = false;
      },
      waitPidGone: async () => true,
      spawn: (_root, _port, _host, flags = []) => {
        spawnedFlags = flags;
        return { ok: true };
      },
      verifyPid: () => true,
      wait: async () => ({ ok: true, pid: 91, version: "0.5.82" }),
    });
    expect(result.ok).toBe(true);
    expect(spawnedFlags).toEqual(["--preview-overrides", "--quiet"]);
  });

  it("refuses to signal a pid that does not verify, even when /api/health answers", async () => {
    const stop = vi.fn();
    const result = await restart(root, {
      locate: async () => server({ pid: 77 }),
      verifyPid: () => false,
      classify: async () => "hand-run",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({ ok: true, root, serverVersion: "0.5.80", activeEngineers: 0 }),
      stop,
    });
    expect(result.ok).toBe(false);
    expect(stop).not.toHaveBeenCalled();
  });

  it("reports the cancelled in-flight work on a successful restart", async () => {
    const result = await restart(root, {
      locate: async () => server({ pid: 90 }),
      classify: async () => "hand-run",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({ ok: true, root, serverVersion: "0.5.80", activeEngineers: 1 }),
      cancelledWork: async () => ({
        engineers: 1,
        reviews: 2,
        freeformRuns: 0,
        devTargets: 1,
        previews: 3,
      }),
      stop: () => {},
      waitPidGone: async () => true,
      spawn: () => ({ ok: true }),
      verifyPid: () => true,
      wait: async () => ({ ok: true, pid: 91, version: "0.5.82" }),
    });
    expect(result.ok).toBe(true);
    expect(result.cancelled).toEqual({
      engineers: 1,
      reviews: 2,
      freeformRuns: 0,
      devTargets: 1,
      previews: 3,
    });
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
