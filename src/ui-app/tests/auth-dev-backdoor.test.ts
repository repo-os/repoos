/**
 * Dev backdoor OTP (see AGENTS.md "verify with a browser probe"): lets a
 * developer or agent log into a real managed preview with a memorized code
 * instead of a real emailed OTP. Must never work in production, even if the
 * env var somehow ends up set there.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig } from "../../core/types";
import type { RouteContext } from "../../server/routes/types";
import { verifyOtp } from "../../server/routes/auth";
import { getAuthStore, resetAuthStoreInstance } from "../../core/auth-store";

function makeReq(body: unknown): IncomingMessage {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  const req = {
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    [Symbol.asyncIterator]: async function* () {
      yield data;
    },
  };
  return req as unknown as IncomingMessage;
}

interface FakeRes {
  status: number;
  payload: unknown;
  headers: Record<string, string>;
}

function makeRes(): { res: ServerResponse; fake: FakeRes } {
  const fake: FakeRes = { status: 0, payload: undefined, headers: {} };
  const res = {
    setHeader(name: string, value: string) {
      fake.headers[name] = value;
    },
    writeHead(code: number) {
      fake.status = code;
    },
    end(p: string) {
      fake.payload = JSON.parse(p);
    },
  };
  return { res: res as unknown as ServerResponse, fake };
}

function makeCtx(root: string, devBackdoorCode: string | undefined): RouteContext {
  const config: RepoOSConfig = {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    auth: {
      enabled: true,
      emailProvider: { type: "resend", apiKey: "key", fromAddress: "a@b.com" },
      ...(devBackdoorCode ? { devBackdoorCode } : {}),
    },
  };
  return {
    config,
    index: null as unknown as RouteContext["index"],
    indexReady: Promise.resolve(),
    reviews: null as unknown as RouteContext["reviews"],
    runner: null as unknown as RouteContext["runner"],
    previews: null as unknown as RouteContext["previews"],
    cto: null as unknown as RouteContext["cto"],
    repoos: null as unknown as RouteContext["repoos"],
    emitEvent: () => {},
    closeOutLock: null as unknown as RouteContext["closeOutLock"],
    rootLock: null as unknown as RouteContext["rootLock"],
    jobCoordinator: null as unknown as RouteContext["jobCoordinator"],
    reportedStages: {},
    triggerJobProcessing: () => {},
    pendingReview: new Set<string>(),
    uiDir: null,
    reload: null,
    logger: {
      task: () => {},
      system: () => {},
      agent: () => {},
      getTaskLogs: () => [],
      getAgentLogs: () => [],
      getSystemLogs: () => [],
    } as unknown as RouteContext["logger"],
    onServerStatusChange: () => {},
    syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
  };
}

describe("dev backdoor OTP", () => {
  let root: string;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-backdoor-"));
    resetAuthStoreInstance();
    getAuthStore(root)!.upsertUser("dev@example.com", "member", null);
  });

  afterEach(() => {
    resetAuthStoreInstance();
    rmSync(root, { recursive: true, force: true });
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("logs in an allowlisted user with the configured backdoor code", async () => {
    process.env.NODE_ENV = "development";
    const ctx = makeCtx(root, "999999");
    const { res, fake } = makeRes();
    await verifyOtp(ctx, makeReq({ email: "dev@example.com", code: "999999" }), res, {});
    expect(fake.status).toBe(200);
    expect(fake.payload).toMatchObject({ ok: true, email: "dev@example.com" });
    expect(fake.headers["Set-Cookie"]).toBeDefined();
  });

  it("rejects a wrong code even when a backdoor code is configured", async () => {
    process.env.NODE_ENV = "development";
    const ctx = makeCtx(root, "999999");
    const { res, fake } = makeRes();
    await verifyOtp(ctx, makeReq({ email: "dev@example.com", code: "000000" }), res, {});
    expect(fake.status).toBe(401);
  });

  it("never accepts the backdoor code when NODE_ENV is production", async () => {
    process.env.NODE_ENV = "production";
    const ctx = makeCtx(root, "999999");
    const { res, fake } = makeRes();
    await verifyOtp(ctx, makeReq({ email: "dev@example.com", code: "999999" }), res, {});
    expect(fake.status).toBe(401);
  });

  it("does nothing when no backdoor code is configured", async () => {
    process.env.NODE_ENV = "development";
    const ctx = makeCtx(root, undefined);
    const { res, fake } = makeRes();
    await verifyOtp(ctx, makeReq({ email: "dev@example.com", code: "999999" }), res, {});
    expect(fake.status).toBe(401);
  });
});
