import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readInstallVersion: vi.fn(() => "0.5.83"),
  detectSupervisor: vi.fn(),
}));
vi.mock("../../commands/upgrade.js", () => ({
  installRoot: () => "/fake/install",
  readInstallVersion: mocks.readInstallVersion,
}));
vi.mock("../../core/supervisor-detect.js", () => ({ detectSupervisor: mocks.detectSupervisor }));

import { getUpdateStatus, restartInstalledUpgrade } from "../../server/routes/info.js";

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

function request(body: unknown = {}): Readable {
  return Readable.from([JSON.stringify(body)]) as Readable;
}

describe("installed upgrade status and restart route", () => {
  beforeEach(() => {
    mocks.readInstallVersion.mockReturnValue("0.5.83");
    mocks.detectSupervisor.mockReturnValue({ kind: "none" });
  });

  it("reports a fake newer installed version and active agent count", () => {
    const capture = responseCapture();
    getUpdateStatus(context(), {} as never, capture.res, {});
    expect(capture.status()).toBe(200);
    expect(capture.body()).toMatchObject({
      restartPending: true,
      runningVersion: expect.any(String),
      installedVersion: "0.5.83",
      activeWork: { agents: 1, checks: 0 },
      supervised: false,
    });
  });

  it("refuses to restart without a supervisor and includes the manual command", async () => {
    const capture = responseCapture();
    await restartInstalledUpgrade(context(), request() as never, capture.res, {});
    expect(capture.status()).toBe(409);
    expect(capture.body()).toMatchObject({ state: "manual", command: expect.any(String) });
  });
});
