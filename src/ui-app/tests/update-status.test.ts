import type { ServerResponse } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readInstallVersion: vi.fn(() => "999.0.0"),
  detectSupervisor: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
}));
vi.mock("../../commands/upgrade.js", () => ({
  installRoot: () => "/fake/install",
  readInstallVersion: mocks.readInstallVersion,
}));
vi.mock("../../core/supervisor-detect.js", () => ({ detectSupervisor: mocks.detectSupervisor }));

import { getUpdateStatus, spawnHandRunRestartHelper } from "../../server/routes/info.js";

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
    mocks.readInstallVersion.mockReturnValue("999.0.0");
    mocks.detectSupervisor.mockReturnValue({ kind: "none" });
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
    const result = spawnHandRunRestartHelper("/fake/project", 7123, {
      binary: () => ({ bin: "bun", needsCliEntry: false }),
      spawn: mocks.spawn as never,
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.spawn).toHaveBeenCalledWith(
      "bun",
      ["restart", "--force", "--port", "7123"],
      expect.objectContaining({ cwd: "/fake/project", detached: true, stdio: "ignore" }),
    );
  });
});
