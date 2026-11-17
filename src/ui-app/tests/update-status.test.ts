import type { ServerResponse } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

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

import {
  getUpdateStatus,
  isRestartSupervised,
  resetUpdateStatusCacheForTests,
  restartInstalledUpgrade,
  setRestartHelperForTests,
  spawnHandRunRestartHelper,
} from "../../server/routes/info.js";

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
    let repoRoot = process.cwd();
    while (!existsSync(join(repoRoot, "package.json")) && repoRoot !== resolve(repoRoot, ".."))
      repoRoot = resolve(repoRoot, "..");
    const current = (
      JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
        version: string;
      }
    ).version;
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
    const offenders = scan(join(repoRoot, "src"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return exactVersion.some((literal) => source.includes(literal));
      })
      .map((file) => file.replace(`${repoRoot}/`, ""));
    expect(offenders).toEqual([]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetUpdateStatusCacheForTests();
    setRestartHelperForTests(null);
    mocks.readInstallVersion.mockReturnValue("999.0.0");
    mocks.detectSupervisor.mockReturnValue({ kind: "none" });
  });

  it.each([
    [{ kind: "none" }, false],
    [
      {
        kind: "external",
        info: { platform: "launchd", job: "x", manualCommand: "launchctl kickstart x" },
      },
      true,
    ],
    [
      {
        kind: "external",
        info: { platform: "systemd", job: "x", manualCommand: "systemctl restart x" },
      },
      true,
    ],
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

  it("reuses the supervisor result and reason from its ten-second cache", () => {
    mocks.detectSupervisor.mockReturnValue({
      kind: "uncertain",
      reason: "launchctl lookup timed out",
    });
    const first = responseCapture();
    const second = responseCapture();
    getUpdateStatus(context(), {} as never, first.res, {});
    getUpdateStatus(context(), {} as never, second.res, {});
    expect(mocks.detectSupervisor).toHaveBeenCalledTimes(1);
    expect(first.body()).toMatchObject({
      supervisorKind: "uncertain",
      supervisorReason: "launchctl lookup timed out",
    });
    expect(second.body()).toMatchObject({
      supervisorKind: "uncertain",
      supervisorReason: "launchctl lookup timed out",
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
        ["restart", "--force", "--root", "/fake/project", "--port", "7123"],
        expect.objectContaining({
          cwd: "/fake/project",
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    });
  });

  it("surfaces a non-zero helper exit and its captured refusal output", async () => {
    const child = new EventEmitter() as EventEmitter & {
      unref: () => void;
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.unref = vi.fn();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const started = spawnHandRunRestartHelper("/fake/project", 7123, {
      binary: () => ({ bin: "bun", needsCliEntry: false }),
      spawn: (() => {
        queueMicrotask(() => child.emit("spawn"));
        return child;
      }) as never,
    });
    await expect(started).resolves.toEqual({ ok: true });
    child.stderr.emit("data", "Could not determine how this server is supervised");
    child.emit("exit", 1, null);
    const capture = responseCapture();
    getUpdateStatus(context(), {} as never, capture.res, {});
    expect(capture.body().restartFailure).toContain(
      "Could not determine how this server is supervised",
    );
  });

  it("returns 503 with a manual command when helper spawning fails", async () => {
    setRestartHelperForTests(async () => ({ ok: false, reason: "EACCES" }));
    const capture = responseCapture();
    await restartInstalledUpgrade(
      context(),
      { url: "/", method: "POST" } as never,
      capture.res,
      {},
    );
    expect(capture.status()).toBe(503);
    expect(capture.body()).toMatchObject({
      state: "manual",
      reason: "EACCES",
      command: "repoos restart --root /fake/project --port 7123",
    });
  });

  it("returns 202 for a hand-run restart only after the helper spawns", async () => {
    setRestartHelperForTests(async () => ({ ok: true }));
    const capture = responseCapture();
    await restartInstalledUpgrade(
      context(),
      { url: "/", method: "POST" } as never,
      capture.res,
      {},
    );
    expect(capture.status()).toBe(202);
    expect(capture.body()).toEqual({ state: "restarting" });
  });

  it("waits for hand-run servers when requested to restart when idle", async () => {
    const helper = vi.fn(async () => ({ ok: true as const }));
    setRestartHelperForTests(helper);
    const capture = responseCapture();
    const request = Readable.from([Buffer.from(JSON.stringify({ whenIdle: true }))]) as Readable & {
      url: string;
      method: string;
    };
    request.url = "/";
    request.method = "POST";
    await restartInstalledUpgrade(context(), request as never, capture.res, {});
    expect(capture.status()).toBe(202);
    expect(capture.body()).toEqual({ state: "waiting-for-idle" });
    expect(helper).not.toHaveBeenCalled();
  });

  it("does not promise an automatic restart when supervisor detection is uncertain", async () => {
    mocks.detectSupervisor.mockReturnValue({ kind: "uncertain", reason: "permission denied" });
    const status = responseCapture();
    getUpdateStatus(context(), {} as never, status.res, {});
    expect(status.body()).toMatchObject({ supervised: false, supervisorKind: "uncertain" });
    const capture = responseCapture();
    await restartInstalledUpgrade(
      context(),
      { url: "/", method: "POST" } as never,
      capture.res,
      {},
    );
    expect(capture.status()).toBe(503);
    expect(capture.body().command).toContain("repoos restart --root /fake/project --port 7123");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("keeps the supervised restart route on the helper path", async () => {
    setRestartHelperForTests(async () => ({ ok: true }));
    mocks.detectSupervisor.mockReturnValue({
      kind: "external",
      info: { platform: "launchd", job: "external", manualCommand: "launchctl kickstart external" },
    });
    const status = responseCapture();
    getUpdateStatus(context(), {} as never, status.res, {});
    expect(status.body().supervised).toBe(true);
    const capture = responseCapture();
    await restartInstalledUpgrade(
      context(),
      { url: "/", method: "POST" } as never,
      capture.res,
      {},
    );
    expect(capture.status()).toBe(202);
    expect(capture.body()).toEqual({ state: "restarting" });
  });

  it("returns 503 rather than starting an unscoped helper without the actual port", async () => {
    const capture = responseCapture();
    await restartInstalledUpgrade(
      {
        config: { root: "/fake/project" },
        servePort: 0,
        index: { snapshot: () => ({ tasks: [] }) },
        runner: { running: () => [{ id: "agent" }] },
        reviews: { runningCount: () => 0 },
        closeOutLock: { closingOut: () => false },
        logger: { system: vi.fn() },
      } as never,
      { url: "/", method: "POST" } as never,
      capture.res,
      {},
    );
    expect(capture.status()).toBe(503);
    expect(capture.body().reason).toMatch(/bound port is unavailable/);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
