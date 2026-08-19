/**
 * #0246 regression test: the founding admin account must only be claimable
 * by the operator-configured `bootstrapAdmin` email. Before this fix, the
 * handler only checked that zero users existed yet — any email submitted to
 * the endpoint became the admin, which is a landgrab on a fresh instance
 * exposed over a public tunnel.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig } from "../../core/types";
import type { RouteContext } from "../../server/routes/types";
import { bootstrapAdmin } from "../../server/routes/auth";
import { resetAuthStoreInstance } from "../../core/auth-store";

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

function makeCtx(root: string, bootstrapAdminEmail: string | undefined): RouteContext {
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
      bootstrapAdmin: bootstrapAdminEmail,
      emailProvider: { type: "resend", apiKey: "key", fromAddress: "a@b.com" },
    },
  };
  return {
    config,
    index: null as unknown as RouteContext["index"],
    reviews: null as unknown as RouteContext["reviews"],
    runner: null as unknown as RouteContext["runner"],
    previews: null as unknown as RouteContext["previews"],
    cto: null as unknown as RouteContext["cto"],
    repoos: null as unknown as RouteContext["repoos"],
    emitEvent: () => {},
    closeOutLock: null as unknown as RouteContext["closeOutLock"],
    rootLock: null as unknown as RouteContext["rootLock"],
    jobCoordinator: null as unknown as RouteContext["jobCoordinator"],
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

describe("bootstrapAdmin route", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-bootstrap-"));
    resetAuthStoreInstance();
  });

  afterEach(() => {
    resetAuthStoreInstance();
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects an email that doesn't match the configured bootstrap admin", async () => {
    const ctx = makeCtx(root, "owner@example.com");
    const { res, fake } = makeRes();
    await bootstrapAdmin(ctx, makeReq({ email: "attacker@evil.com" }), res, {});
    expect(fake.status).toBe(403);
    expect(fake.payload).toMatchObject({ error: expect.any(String) });
    expect(fake.headers["Set-Cookie"]).toBeUndefined();
  });

  it("accepts the configured bootstrap admin email (case-insensitive)", async () => {
    const ctx = makeCtx(root, "owner@example.com");
    const { res, fake } = makeRes();
    await bootstrapAdmin(ctx, makeReq({ email: "Owner@Example.com" }), res, {});
    expect(fake.status).toBe(200);
    expect(fake.payload).toMatchObject({ ok: true, email: "owner@example.com", role: "admin" });
    expect(fake.headers["Set-Cookie"]).toBeDefined();
  });

  it("fails closed when no bootstrap admin email is configured", async () => {
    const ctx = makeCtx(root, undefined);
    const { res, fake } = makeRes();
    await bootstrapAdmin(ctx, makeReq({ email: "anyone@example.com" }), res, {});
    expect(fake.status).toBe(400);
  });

  it("refuses a second bootstrap once a user already exists", async () => {
    const ctx = makeCtx(root, "owner@example.com");
    const first = makeRes();
    await bootstrapAdmin(ctx, makeReq({ email: "owner@example.com" }), first.res, {});
    expect(first.fake.status).toBe(200);

    const second = makeRes();
    await bootstrapAdmin(ctx, makeReq({ email: "owner@example.com" }), second.res, {});
    expect(second.fake.status).toBe(400);
  });
});
