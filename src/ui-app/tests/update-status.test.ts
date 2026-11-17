import type { ServerResponse } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const mocks = vi.hoisted(() => ({
  readInstallVersion: vi.fn(() => "999.0.0"),
  detectSupervisor: vi.fn(),
  spawn: vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = vi.fn();
    queueMicrotask(() => child.emit("spawn"));
    return child;
  }),
}));
vi.mock("../../commands/upgrade.js", () => ({
  installRoot: () => "/fake/install",
  readInstallVersion: mocks.readInstallVersion,
}));
vi.mock("../../core/supervisor-detect.js", () => ({ detectSupervisor: mocks.detectSupervisor }));

import { getUpdateStatus, isRestartSupervised, resetUpdateStatusCacheForTests, restartInstalledUpgrade, spawnHandRunRestartHelper } from "../../server/routes/info.js";

function context() {
  return {
    config: { root: "/fake/project" },
    servePort: 7123,
    index: { snapshot: () => ({ tasks: [] }) },
    runner: { running: () => [{ id: "agent" }] },
    reviews: { runningCount: () => 0 },
    closeOutLock: { closingOut: () => false },
    logger: { system: vi.fn() },
  } as never;
}

function responseCapture() {
  let statusCode = 0;
  let payload = "";
  const res = {
    writeHead: (code: number) => (statusCode = code),
    end: (body = "") => (payload = String(body)),
  } as unknown as ServerResponse;
  return { res, status: () => statusCode, body: () => JSON.parse(payload) };
}

describe("installed upgrade status and restart route", () => {
  it("does not hardcode the current package version in test fixtures", () => {
    const current = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string })
      .version;
    const exactVersion = [`"${current}"`, `'${current}'`];
    const scan = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        return entry.isDirectory()
          ? scan(path)
          : entry.isFile() && entry.name.endsWith(".test.ts")
            ? [path]
            : [];
      });
    const offenders = scan("src")
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return exactVersion.some((literal) => source.includes(literal));
      })
      .map((file) => file.replace(`${process.cwd()}/`, ""));
    expect(offenders).toEqual([]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetUpdateStatusCacheForTests();
    mocks.readInstallVersion.mockReturnValue("999.0.0");
    mocks.detectSupervisor.mockReturnValue({ kind: "none" });
  });

  it.each([
    [{ kind: "none" }, false],
    [{ kind: "external", info: { platform: "launchd", job: "x", manualCommand: "launchctl kickstart x" } }, true],
    [{ kind: "external", info: { platform: "systemd", job: "x", manualCommand: "systemctl restart x" } }, true],
    [{ kind: "managed", job: "com.repoos.serve.test" }, true],
  ] as const)("classifies supervisor state %#", (result, expected) => {
    expect(isRestartSupervised(result)).toBe(expected);
  });

  it("reports a fake newer installed version and active agent count", () => {
    const capture = responseCapture();
    getUpdateStatus(context(), {} as never, capture.res, {});
    expect(capture.status()).toBe(200);
    expect(capture.body()).toMatchObject({
      restartPending: true,
      runningVersion: expect.any(String),
      installedVersion: "999.0.0",
      activeWork: { agents: 1, checks: 0 },
      supervised: false,
    });
  });

  it("starts a detached CLI helper for a hand-run server", () => {
    return spawnHandRunRestartHelper("/fake/project", 7123, {
      binary: () => ({ bin: "bun", needsCliEntry: false }),
      spawn: mocks.spawn as never,
    }).then((result) => {
      expect(result).toEqual({ ok: true });
      expect(mocks.spawn).toHaveBeenCalledWith(
      "bun",
      ["restart", "--force", "--port", "7123"],
      expect.objectContaining({ cwd: "/fake/project", detached: true, stdio: "ignore" }),
      );
    });
  });

  it("returns 503 with a manual command when helper spawning fails", async () => {
    mocks.spawn.mockImplementationOnce(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void };
      child.unref = vi.fn();
      queueMicrotask(() => child.emit("error", Object.assign(new Error("EACCES"), { message: "EACCES" })));
      return child;
    });
    const capture = responseCapture();
    await restartInstalledUpgrade(context(), { url: "/", method: "POST" } as never, capture.res, {});
    expect(capture.status()).toBe(503);
    expect(capture.body()).toMatchObject({ state: "manual", reason: "EACCES", command: "repoos restart" });
  });

  it("returns 202 for a hand-run restart only after the helper spawns", async () => {
    const capture = responseCapture();
    await restartInstalledUpgrade(context(), { url: "/", method: "POST" } as never, capture.res, {});
    expect(capture.status()).toBe(202);
    expect(capture.body()).toEqual({ state: "restarting" });
  });

  it("keeps the supervised restart route on the helper path", async () => {
    mocks.detectSupervisor.mockReturnValue({ kind: "external", info: { platform: "launchd", job: "external", manualCommand: "launchctl kickstart external" } });
    const capture = responseCapture();
    await restartInstalledUpgrade(context(), { url: "/", method: "POST" } as never, capture.res, {});
    expect(capture.status()).toBe(202);
    expect(capture.body()).toEqual({ state: "restarting" });
    expect(mocks.spawn).toHaveBeenCalled();
  });

  it("returns 503 rather than starting an unscoped helper without the actual port", async () => {
    const capture = responseCapture();
    await restartInstalledUpgrade({
      config: { root: "/fake/project" },
      servePort: 0,
      index: { snapshot: () => ({ tasks: [] }) },
      runner: { running: () => [{ id: "agent" }] },
      reviews: { runningCount: () => 0 },
      closeOutLock: { closingOut: () => false },
      logger: { system: vi.fn() },
    } as never, { url: "/", method: "POST" } as never, capture.res, {});
    expect(capture.status()).toBe(503);
    expect(capture.body().reason).toMatch(/bound port is unavailable/);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
