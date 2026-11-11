import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectSupervisor,
  parseLaunchctlPidPrint,
  parseSystemdPidStatus,
  pidOwnership,
  restartRepoServer,
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

describe("parseLaunchctlPidPrint", () => {
  it("extracts label and manual kickstart command", () => {
    const out = `
pid = 1234
domain = gui/501
label = "org.repoos.serve.kamrai"
`;
    expect(parseLaunchctlPidPrint(out)).toEqual({
      platform: "launchd",
      job: "org.repoos.serve.kamrai",
      manualCommand: "launchctl kickstart -k gui/501/org.repoos.serve.kamrai",
    });
  });
});

describe("parseSystemdPidStatus", () => {
  it("rejects user@ session units", () => {
    const out = `● user@501.service - User Manager for UID 501`;
    expect(parseSystemdPidStatus(out)).toBeNull();
  });

  it("uses systemctl without --user for system units", () => {
    const out = `● org.repoos.serve.kamrai.service - RepoOS
   Loaded: loaded (/etc/systemd/system/org.repoos.serve.kamrai.service)`;
    expect(parseSystemdPidStatus(out)?.manualCommand).toBe(
      "systemctl restart org.repoos.serve.kamrai.service",
    );
  });
});

describe("detectSupervisor", () => {
  it("returns uncertain when launchctl fails and ppid is 1", () => {
    const execFile = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === "launchctl") throw new Error("permission denied");
      if (cmd === "ps") return "1\n";
      return "";
    });
    const r = detectSupervisor(99, execFile as never);
    expect(r.kind).toBe("uncertain");
  });
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

  it("refuses stale pid without health or cmdline proof", async () => {
    const result = await restartRepoServer(root, {
      locate: async () => server(),
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: false,
        root: null,
        serverVersion: null,
        activeEngineers: 0,
      }),
      verifyPid: () => false,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not a verified repoos serve/i);
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

  it("restarts a managed service and waits for health", async () => {
    let waited = false;
    const result = await restartRepoServer(root, {
      locate: async () => server({ pid: 10 }),
      classify: async () => "managed-service",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 0,
      }),
      restartManaged: async () => ({ ok: true }),
      wait: async () => {
        waited = true;
        return { ok: true, pid: 11, version: "0.5.82" };
      },
    });
    expect(waited).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      path: "managed-service",
      oldPid: 10,
      newPid: 11,
      newVersion: "0.5.82",
    });
  });

  it("uses supervisor respawn for external supervision", async () => {
    const stop = vi.fn();
    const result = await restartRepoServer(root, {
      locate: async () => server({ pid: 20 }),
      classify: async () => "external-supervisor",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 0,
      }),
      stop,
      wait: async () => ({ ok: true, pid: 21, version: "0.5.82" }),
      supervisor: () => ({
        platform: "launchd",
        job: "org.repoos.serve.kamrai",
        manualCommand: "launchctl kickstart -k gui/501/org.repoos.serve.kamrai",
      }),
    });
    expect(stop).toHaveBeenCalledWith(20);
    expect(result.ok).toBe(true);
    expect(result.path).toBe("external-supervisor");
  });

  it("fails with manual command when supervisor never respawns", async () => {
    const result = await restartRepoServer(root, {
      locate: async () => server({ pid: 30 }),
      classify: async () => "external-supervisor",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 0,
      }),
      stop: () => {},
      wait: async () => ({
        ok: false,
        pid: null,
        version: null,
        reason: "timed out",
      }),
      supervisor: () => ({
        platform: "launchd",
        job: "org.repoos.serve.kamrai",
        manualCommand: "launchctl kickstart -k gui/501/org.repoos.serve.kamrai",
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.manualCommand).toContain("kickstart");
  });

  it("hand-run stops, waits for exit, spawns with stored flags", async () => {
    const stop = vi.fn();
    const spawn = vi.fn();
    const result = await restartRepoServer(root, {
      locate: async () =>
        server({ pid: 40, host: "127.0.0.1", serveFlags: ["--preview-overrides"] }),
      classify: async () => "hand-run",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 0,
      }),
      stop,
      spawn,
      verifyPid: () => true,
      wait: async () => ({ ok: true, pid: 41, version: "0.5.82" }),
    });
    expect(stop).toHaveBeenCalledWith(40);
    expect(spawn).toHaveBeenCalledWith(root, 7200, "127.0.0.1", ["--preview-overrides"]);
    expect(result.ok).toBe(true);
    expect(result.path).toBe("hand-run");
  });

  it("refuses hand-run spawn when pid does not exit", async () => {
    const spawn = vi.fn();
    const result = await restartRepoServer(root, {
      locate: async () => server({ pid: 50 }),
      classify: async () => "hand-run",
      ownership: () => ({ uid: 1000, canSignal: true, otherUser: false }),
      health: async () => ({
        ok: true,
        root,
        serverVersion: "0.5.80",
        activeEngineers: 0,
      }),
      stop: () => {},
      spawn,
      verifyPid: () => true,
      waitPidGone: async () => false,
      wait: async () => ({ ok: false, pid: null, version: null }),
    });
    expect(spawn).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/did not exit/i);
  });
});

describe("classifyRestartPath integration", () => {
  it("prefers managed service only when status is running", async () => {
    vi.spyOn(serviceManager, "getServiceStatus").mockResolvedValue({
      status: "running",
    } as never);
    const { classifyRestartPath } = await import("./server-restart.js");
    expect(await classifyRestartPath("/repo", server())).toBe("managed-service");
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
